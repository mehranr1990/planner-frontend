import type { ApiClient } from "@/api/client";
import type { ProjectPerson, ProjectRisk, RiskHistoryEntry, RiskStatus } from "../project-domain";
import type { RiskRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { mapErrors, pageAll, retryOnConflict, revisionTag, unsupported } from "./api-shared";
import { conflictAware, personOf, projectRoster, projectsClient, type ApiProjectMember, type ProjectsClient, type ProjectsData } from "./api-project-shared";

/*
 * PJ-09 / PJ-16 risk register in live mode (owner gap closure 2026-11-14)
 * over `register-items` (RISK / ISSUE). Mapped truthfully:
 * - severity LOW…CRITICAL = the four levels; status OPEN / MITIGATING, and
 *   RESOLVED / CLOSED = closed; owner = membership (blank when unset or gone);
 *   raised by = the creating actor; updatedAt = the last history entry.
 * - Not served → left out, never derived: register code (null), the 3-level
 *   probability (the API keeps 0–100 and no approved mapping exists), the
 *   "watching" status, blocked task count (0 = no chip), checklist, review
 *   date, trigger, linked milestone / tasks, close reason, risk → issue link.
 * - Writes need `work.manage` (PUT with If-Match = item revision, one 409
 *   retry on a fresh read only when the user's change still applies). Close /
 *   resolve (reason and note have no field), convert, checklist and comments
 *   (comments cannot target a register item) are refused, never faked.
 */

type ApiItem = ProjectsData<"/api/v1/projects/{projectId}/register-items", "get">["items"][number];
type ApiHistory = ProjectsData<"/api/v1/projects/{projectId}/register-items/{itemId}/history", "get">["items"][number];

const PAGE = 100;
const READS = 8;
const BLANK: ProjectPerson = { id: "", name: "", initials: "" };

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
    code: null,
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
    ...(item.mitigation ? { mitigation: item.mitigation } : {}),
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

  const refuse = (what: string) => () => mapErrors(async () => unsupported(`Projects API: ${what}`));

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
        if (patch.probability !== undefined) unsupported("Projects API: register probability is 0–100; no approved 3-level mapping");
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
                probability: current.probability,
                owner: owner ? { accessId: owner.id, generation: owner.generation } : current.owner,
                mitigation: patch.mitigation ?? current.mitigation,
                status: patch.status === "open" ? "OPEN" : patch.status === "mitigating" ? "MITIGATING" : current.status,
              },
            })
          ).data;
        const saved = await conflictAware(() => retryOnConflict(send, async () => (current = await read(projectId, riskId))));
        return toRisk(saved, roster, await lastChange(projectId, saved));
      }),
    comments: refuse("comments cannot target a register item"),
    addComment: refuse("comments cannot target a register item"),
    setChecklistItem: refuse("register items have no mitigation checklist"),
    close: refuse("register items have no close reason or note"),
    resolve: refuse("register items have no resolution note"),
    convert: refuse("register items have no risk → issue conversion"),
  };
}
