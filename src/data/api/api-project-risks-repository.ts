import { newIdempotencyKey, type ApiClient } from "@/api/client";
import { riskProbabilityLevel, type ProjectPerson, type ProjectRisk, type RiskCloseReason, type RiskHistoryEntry, type RiskStatus, type TaskComment } from "../project-domain";
import type { RiskRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { invalid, mapErrors, pageAll, retryOnConflict, revisionTag, unsupported } from "./api-shared";
import { conflictAware, personOf, projectRoster, projectsClient, type ApiProjectMember, type ProjectsClient, type ProjectsData } from "./api-project-shared";

/*
 * PJ-09 / PJ-16 risk register in live mode (owner gap closure 2026-11-14)
 * over `register-items` (RISK / ISSUE). Mapped truthfully:
 * - severity LOW…CRITICAL = the four levels; status OPEN / MITIGATING, and
 *   RESOLVED / CLOSED = closed; owner = membership (blank when unset or gone);
 *   raised by = the creating actor; updatedAt = the last history entry.
 * - P2 gap closure: register code, mitigation checklist (title / done),
 *   close reason + note, the issue a risk was converted into, comments
 *   (target REGISTER_ITEM, the shared comment model).
 * - Probability (PB-13, owner decision 2026-11-19): the exact 0–100 integer
 *   is kept as `probabilityPercent` and edited as-is; `probability` is its
 *   band (Low 0–33 · Medium 34–66 · High 67–100). A bare band is refused on
 *   write (it has no exact value).
 * - Not served → left out, never derived: the "watching" status, blocked task count (0 = no chip), checklist person / dates,
 *   review date, trigger, linked milestone / tasks, the issue's link back.
 * - Writes need `work.manage` (PUT with If-Match = item revision, one 409
 *   retry on a fresh read only when the user's change still applies).
 *   Checklist ticks = POST checklist UPDATE (revision + key); close = POST
 *   close {reason (the UI reason key), note} (revision); resolve = close with
 *   reason "resolved" and the resolution as note; convert = POST convert
 *   {targetKind ISSUE} (revision + key) — the source risk keeps its status
 *   (server rule) and the new issue is returned. Linking a checklist row to a
 *   task is refused.
 */

type ApiItem = ProjectsData<"/api/v1/projects/{projectId}/register-items", "get">["items"][number];
type ApiComment = ProjectsData<"/api/v1/projects/{projectId}/content/{targetKind}/{targetId}/comments", "get">["items"][number];
type ApiHistory = ProjectsData<"/api/v1/projects/{projectId}/register-items/{itemId}/history", "get">["items"][number];

const PAGE = 100;
const READS = 8;
const BLANK: ProjectPerson = { id: "", name: "", initials: "" };

const REASONS: readonly RiskCloseReason[] = ["mitigated", "not-happened", "accepted", "transferred", "became-issue", "resolved"];
const reasonOf = (reason: string | undefined): RiskCloseReason | undefined => REASONS.find((candidate) => candidate === reason);

const statusOf = (status: ApiItem["status"]): RiskStatus => (status === "OPEN" ? "open" : status === "MITIGATING" ? "mitigating" : "closed");
const ownerOf = (roster: readonly ApiProjectMember[], owner: ApiItem["owner"]): ProjectPerson => (owner ? personOf(roster, owner.accessId) : BLANK);
const byActor = (roster: readonly ApiProjectMember[], actorId: string): ProjectPerson => {
  const member = roster.find((candidate) => candidate.actorId === actorId);
  return member ? personOf(roster, member.id) : BLANK;
};

const history = (api: ProjectsClient, projectId: string, itemId: string) =>
  pageAll<ApiHistory>(
    async (after) =>
      (await api.request("get", "/api/v1/projects/{projectId}/register-items/{itemId}/history", { path: { projectId, itemId }, query: { limit: PAGE, after } })).data,
  );

function toRisk(item: ApiItem, roster: readonly ApiProjectMember[], updatedAt: string): ProjectRisk {
  const status = statusOf(item.status);
  return {
    id: item.id,
    code: item.code ?? null,
    kind: item.kind === "RISK" ? "risk" : "issue",
    title: item.title,
    severity: item.severity.toLowerCase() as ProjectRisk["severity"],
    status,
    open: status !== "closed",
    owner: ownerOf(roster, item.owner),
    raisedBy: byActor(roster, item.createdByActorId),
    raisedAt: item.createdAt,
    updatedAt,
    blocksTasks: 0,
    ...(item.kind === "RISK" && item.probability !== null ? { probability: riskProbabilityLevel(item.probability), probabilityPercent: item.probability } : {}),
    ...(item.mitigation ? { mitigation: item.mitigation } : {}),
    ...(item.checklist ? { checklist: [...item.checklist].sort((a, b) => a.position - b.position).map((row) => ({ id: row.id, text: row.title, done: row.completed })) } : {}),
    ...(item.convertedIssueId ? { issueId: item.convertedIssueId } : {}),
    ...(status === "closed" && reasonOf(item.closeReason) ? { closeReason: reasonOf(item.closeReason) } : {}),
    ...(status === "closed" && item.closeNote ? { closeNote: item.closeNote } : {}),
    commentCount: 0,
    revision: item.revision,
  };
}

/** One history line per changed field (severity / status / owner); the first entry is the creation. */
function toHistory(entries: readonly ApiHistory[], roster: readonly ApiProjectMember[]): RiskHistoryEntry[] {
  const lines: RiskHistoryEntry[] = [];
  for (const entry of entries) {
    const actor = byActor(roster, entry.actorId);
    const before = entry.before as Partial<ApiItem> | null;
    const after = entry.after as Partial<ApiItem>;
    if (!before) {
      lines.push({ id: `${entry.id}:created`, at: entry.createdAt, actor, field: "created" });
      continue;
    }
    if (before.severity !== after.severity && after.severity)
      lines.push({ id: `${entry.id}:severity`, at: entry.createdAt, actor, field: "severity", from: before.severity?.toLowerCase(), to: after.severity.toLowerCase() });
    if (before.status !== after.status && after.status)
      lines.push({ id: `${entry.id}:status`, at: entry.createdAt, actor, field: "status", from: before.status ? statusOf(before.status) : undefined, to: statusOf(after.status) });
    if (after.closeReason && before.closeReason !== after.closeReason)
      lines.push({ id: `${entry.id}:closed`, at: entry.createdAt, actor, field: "closed", to: after.closeReason });
    if (after.convertedIssueId && !before.convertedIssueId) lines.push({ id: `${entry.id}:converted`, at: entry.createdAt, actor, field: "converted" });
    if ((before.owner?.accessId ?? null) !== (after.owner?.accessId ?? null))
      lines.push({
        id: `${entry.id}:owner`,
        at: entry.createdAt,
        actor,
        field: "owner",
        from: before.owner ? ownerOf(roster, before.owner).name : undefined,
        to: after.owner ? ownerOf(roster, after.owner).name : undefined,
      });
  }
  return lines.sort((a, b) => b.at.localeCompare(a.at));
}

export function createApiProjectRiskRepository(client: ApiClient): RiskRepository {
  const api = projectsClient(client);

  const read = async (projectId: string, itemId: string) => {
    const { data } = await api.request("get", "/api/v1/projects/{projectId}/register-items/{itemId}", { path: { projectId, itemId } });
    if (data.retiredAt) throw new RepositoryError("not-found", "Not found");
    return data;
  };
  const lastChange = async (projectId: string, item: ApiItem) =>
    (await history(api, projectId, item.id)).reduce((max, entry) => (entry.createdAt > max ? entry.createdAt : max), item.createdAt);

  /** The current item, refused as "conflict" when the caller's revision is stale. */
  const current = async (projectId: string, riskId: string, revision: number) => {
    const [item, roster] = await Promise.all([read(projectId, riskId), projectRoster(api, projectId)]);
    if (item.revision !== revision) throw new RepositoryError("conflict", "Changed elsewhere");
    return { item, roster };
  };
  const answer = async (projectId: string, item: ApiItem, roster: readonly ApiProjectMember[]) => toRisk(item, roster, await lastChange(projectId, item));
  const closeWith = (projectId: string, riskId: string, reason: string, note: string | null, revision: number) =>
    mapErrors(async () => {
      const { item, roster } = await current(projectId, riskId, revision);
      const { data } = await conflictAware(() =>
        api.request("post", "/api/v1/projects/{projectId}/register-items/{itemId}/close", {
          path: { projectId, itemId: riskId },
          header: { "If-Match": revisionTag(item.revision) },
          body: { reason, note },
        }),
      );
      return answer(projectId, data, roster);
    });

  return {
    list: (projectId, options = {}) =>
      mapErrors(async () => {
        const [items, roster] = await Promise.all([
          pageAll<ApiItem>(
            async (after) =>
              (
                await api.request("get", "/api/v1/projects/{projectId}/register-items", {
                  path: { projectId },
                  query: { limit: PAGE, after, ...(options.kind ? { kind: options.kind === "risk" ? "RISK" : "ISSUE" } : {}) },
                })
              ).data,
          ),
          projectRoster(api, projectId),
        ]);
        const live = items.filter((item) => !item.retiredAt && (options.open === undefined || (statusOf(item.status) !== "closed") === options.open));
        const risks: ProjectRisk[] = [];
        for (let at = 0; at < live.length; at += READS)
          risks.push(...(await Promise.all(live.slice(at, at + READS).map(async (item) => toRisk(item, roster, await lastChange(projectId, item))))));
        return risks;
      }),
    // No register item links to a milestone.
    byMilestone: () => mapErrors(async () => null),
    get: (projectId, riskId) =>
      mapErrors(async () => {
        const [item, roster] = await Promise.all([read(projectId, riskId), projectRoster(api, projectId)]);
        return toRisk(item, roster, await lastChange(projectId, item));
      }),
    history: (projectId, riskId) =>
      mapErrors(async () => {
        const [entries, roster] = await Promise.all([history(api, projectId, riskId), projectRoster(api, projectId)]);
        return toHistory(entries, roster);
      }),
    update: (projectId, riskId, patch, revision) =>
      mapErrors(async () => {
        if (patch.probability !== undefined) unsupported("Projects API: register probability is an exact 0–100 value, not a band");
        const percent = patch.probabilityPercent;
        if (percent !== undefined && (!Number.isInteger(percent) || percent < 0 || percent > 100)) invalid("Probability must be a whole number from 0 to 100");
        if (patch.status === "watching") unsupported("Projects API: register items have no watching status");
        const roster = await projectRoster(api, projectId);
        const owner = patch.ownerId !== undefined ? roster.find((member) => member.id === patch.ownerId) : undefined;
        if (patch.ownerId !== undefined && !owner) throw new RepositoryError("not-found", "Not found");
        let current = await read(projectId, riskId);
        if (current.revision !== revision) throw new RepositoryError("conflict", "Changed elsewhere");
        const send = async () =>
          (
            await api.request("put", "/api/v1/projects/{projectId}/register-items/{itemId}", {
              path: { projectId, itemId: riskId },
              header: { "If-Match": revisionTag(current.revision) },
              body: {
                kind: current.kind,
                title: patch.title ?? current.title,
                description: current.description,
                severity: patch.severity ? (patch.severity.toUpperCase() as ApiItem["severity"]) : current.severity,
                probability: percent !== undefined && current.kind === "RISK" ? percent : current.probability,
                owner: owner ? { accessId: owner.id, generation: owner.generation } : current.owner,
                mitigation: patch.mitigation ?? current.mitigation,
                status: patch.status === "open" ? "OPEN" : patch.status === "mitigating" ? "MITIGATING" : current.status,
              },
            })
          ).data;
        const saved = await conflictAware(() => retryOnConflict(send, async () => (current = await read(projectId, riskId))));
        return toRisk(saved, roster, await lastChange(projectId, saved));
      }),
    comments: (projectId, riskId) =>
      mapErrors(async (): Promise<TaskComment[]> => {
        const target = { projectId, targetKind: "REGISTER_ITEM" as const, targetId: riskId };
        const [list, roster] = await Promise.all([
          pageAll<ApiComment>(async (after) => (await api.request("get", "/api/v1/projects/{projectId}/content/{targetKind}/{targetId}/comments", { path: target, query: { limit: PAGE, after } })).data),
          projectRoster(api, projectId),
        ]);
        return list
          .filter((comment) => comment.deletedAt === null)
          .map((comment) => ({ id: comment.id, author: byActor(roster, comment.createdByActorId), at: comment.createdAt, body: comment.body }))
          .sort((a, b) => a.at.localeCompare(b.at));
      }),
    addComment: (projectId, riskId, body) =>
      mapErrors(async (): Promise<TaskComment> => {
        if (!body.trim()) invalid("body");
        const { data } = await api.request("post", "/api/v1/projects/{projectId}/comments", {
          path: { projectId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { id: crypto.randomUUID(), body: body.trim(), target: { kind: "REGISTER_ITEM", id: riskId } },
        });
        return { id: data.id, author: byActor(await projectRoster(api, projectId), data.createdByActorId), at: data.createdAt, body: data.body };
      }),
    setChecklistItem: (projectId, riskId, itemId, patch, revision) =>
      mapErrors(async () => {
        if (patch.taskId !== undefined) unsupported("Projects API: a checklist row cannot link a task");
        const { item, roster } = await current(projectId, riskId, revision);
        if (!item.checklist?.some((row) => row.id === itemId)) throw new RepositoryError("not-found", "Not found");
        const { data } = await conflictAware(() =>
          api.request("post", "/api/v1/projects/{projectId}/register-items/{itemId}/checklist", {
            path: { projectId, itemId: riskId },
            header: { "If-Match": revisionTag(item.revision), "Idempotency-Key": newIdempotencyKey() },
            body: { kind: "UPDATE", id: itemId, ...(patch.done !== undefined ? { completed: patch.done } : {}) },
          }),
        );
        return answer(projectId, data, roster);
      }),
    close: (projectId, riskId, { reason, note }, revision) => closeWith(projectId, riskId, reason, note?.trim() || null, revision),
    resolve: (projectId, riskId, resolution, revision) =>
      resolution.trim() ? closeWith(projectId, riskId, "resolved", resolution.trim(), revision) : mapErrors(async () => invalid("resolution")),
    convert: (projectId, riskId, revision) =>
      mapErrors(async () => {
        const { item, roster } = await current(projectId, riskId, revision);
        if (item.kind !== "RISK") invalid("not-a-risk");
        const { data } = await conflictAware(() =>
          api.request("post", "/api/v1/projects/{projectId}/register-items/{itemId}/convert", {
            path: { projectId, itemId: riskId },
            header: { "If-Match": revisionTag(item.revision), "Idempotency-Key": newIdempotencyKey() },
            body: { id: crypto.randomUUID(), targetKind: "ISSUE" },
          }),
        );
        if (!data.convertedIssueId) throw new RepositoryError("not-found", "Not found");
        return answer(projectId, await read(projectId, data.convertedIssueId), roster);
      }),
  };
}
