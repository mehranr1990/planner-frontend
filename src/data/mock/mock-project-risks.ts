import { projectPeople } from "@/fixtures/projects";
import { sampleRiskComments, sampleRiskHistory } from "@/fixtures/project-risks";
import type { ProjectRisk, RiskHistoryEntry, TaskComment } from "../project-domain";
import type { RiskRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";
import type { ProjectWorkStore } from "./mock-project-work";

/*
 * PJ-09 / PJ-16 risk & issue register for the mock adapter (riskRepo).
 * Lives on the shared work store, so linked high risks keep driving the
 * PJ-08 "At risk" milestone status and the PJ-01 Risks tab. Every write
 * checks the revision (If-Match → "conflict") and appends to the audit
 * history (never deleted). Rights are enforced by the UI capabilities for
 * now (DECISIONS: exact capability matrix is OPEN).
 */

export interface MockRisksOptions {
  respond<T>(value: T): Promise<T>;
  now: string;
}

const people = Object.values(projectPeople);

export function createMockRisks(store: ProjectWorkStore, { respond, now }: MockRisksOptions): RiskRepository {
  const history = new Map(Object.entries(structuredClone(sampleRiskHistory)).map(([id, list]) => [id, [...list]]));
  const comments = new Map(Object.entries(structuredClone(sampleRiskComments)).map(([id, list]) => [id, [...list]]));
  let seq = 0;
  const me = projectPeople.me;

  const locate = (riskId: string): { list: ProjectRisk[]; index: number; projectId: string } => {
    for (const [projectId, list] of store.risks) {
      const index = list.findIndex((risk) => risk.id === riskId);
      if (index >= 0) return { list, index, projectId };
    }
    throw new RepositoryError("not-found", `No risk ${riskId}`);
  };

  const audit = (riskId: string, entry: Omit<RiskHistoryEntry, "id" | "at" | "actor">) => {
    const list = history.get(riskId) ?? [];
    list.push({ id: `h-new-${++seq}`, at: now, actor: me, ...entry });
    history.set(riskId, list);
  };

  /** Applies `change` to a fresh copy after the If-Match check, bumps the revision, stores it. */
  const write = (riskId: string, revision: number, change: (risk: ProjectRisk) => ProjectRisk) => {
    const { list, index } = locate(riskId);
    const current = list[index]!;
    if (current.revision !== revision) throw new RepositoryError("conflict", "Risk changed");
    const next = { ...change(structuredClone(current)), revision: current.revision + 1, updatedAt: now };
    next.open = next.status !== "closed";
    list[index] = next;
    return next;
  };

  return {
    list: (projectId, { open, kind } = {}) =>
      respond(
        (store.risks.get(projectId) ?? []).filter(
          (risk) =>
            (open === undefined || risk.open === open) &&
            (kind === undefined || risk.kind === kind) &&
            !(kind === "risk" && risk.closeReason === "became-issue"),
        ),
      ),
    byMilestone: (projectId, milestoneId) =>
      respond(
        (store.risks.get(projectId) ?? []).find(
          (risk) => risk.kind === "risk" && risk.open && risk.milestoneId === milestoneId,
        ) ?? null,
      ),
    async get(riskId) {
      const { list, index } = locate(riskId);
      return respond(list[index]!);
    },
    async history(riskId) {
      locate(riskId);
      return respond([...(history.get(riskId) ?? [])].reverse());
    },
    async comments(riskId) {
      locate(riskId);
      return respond(comments.get(riskId) ?? []);
    },
    async addComment(riskId, body) {
      const text = body.trim();
      if (!text) throw new RepositoryError("invalid", "Empty comment");
      const { list, index } = locate(riskId);
      const comment: TaskComment = { id: `rc-new-${++seq}`, author: me, at: now, body: text };
      comments.set(riskId, [...(comments.get(riskId) ?? []), comment]);
      list[index] = { ...list[index]!, commentCount: list[index]!.commentCount + 1 };
      return respond(comment);
    },
    async update(riskId, patch, revision) {
      if (patch.title !== undefined && !patch.title.trim()) throw new RepositoryError("invalid", "Title required");
      const owner = patch.ownerId ? people.find((person) => person.id === patch.ownerId) : undefined;
      if (patch.ownerId && !owner) throw new RepositoryError("invalid", "Unknown owner");
      const saved = write(riskId, revision, (risk) => {
        const fields = ["severity", "probability", "status"] as const;
        for (const field of fields) {
          const value = patch[field];
          if (value !== undefined && value !== risk[field]) {
            audit(riskId, { field, from: risk[field], to: value });
            Object.assign(risk, { [field]: value });
          }
        }
        if (owner && owner.id !== risk.owner.id) {
          audit(riskId, { field: "owner", from: risk.owner.name, to: owner.name });
          risk.owner = owner;
        }
        if (patch.title !== undefined) risk.title = patch.title.trim();
        if (patch.mitigation !== undefined) risk.mitigation = patch.mitigation;
        return risk;
      });
      return respond(saved);
    },
    async setChecklistItem(riskId, itemId, patch, revision) {
      const saved = write(riskId, revision, (risk) => {
        const item = risk.checklist?.find((candidate) => candidate.id === itemId);
        if (!item) throw new RepositoryError("not-found", `No checklist item ${itemId}`);
        if (patch.done !== undefined) {
          item.done = patch.done;
          if (patch.done) {
            item.person = me;
            item.doneOn = now.slice(0, 10);
          } else delete item.doneOn;
        }
        if (patch.taskId !== undefined) item.taskId = patch.taskId;
        return risk;
      });
      return respond(saved);
    },
    async close(riskId, { reason, note }, revision) {
      const saved = write(riskId, revision, (risk) => {
        if (risk.status === "closed") throw new RepositoryError("invalid", "Already closed");
        audit(riskId, { field: "closed", from: risk.status, to: reason });
        risk.status = "closed";
        risk.closeReason = reason;
        if (note?.trim()) risk.closeNote = note.trim();
        return risk;
      });
      return respond(saved);
    },
    async resolve(riskId, resolution, revision) {
      if (!resolution.trim()) throw new RepositoryError("invalid", "Resolution note required");
      const saved = write(riskId, revision, (risk) => {
        if (risk.kind !== "issue") throw new RepositoryError("invalid", "Only issues are resolved");
        audit(riskId, { field: "closed", from: risk.status, to: "resolved" });
        risk.status = "closed";
        risk.closeReason = "resolved";
        risk.closeNote = resolution.trim();
        return risk;
      });
      return respond(saved);
    },
    async convert(riskId, revision) {
      const { list, projectId } = locate(riskId);
      const source = list.find((risk) => risk.id === riskId)!;
      if (source.kind !== "risk" || !source.open) throw new RepositoryError("invalid", "Only open risks convert");
      if (source.revision !== revision) throw new RepositoryError("conflict", "Risk changed");
      const issues = (store.risks.get(projectId) ?? []).filter((risk) => risk.kind === "issue").length;
      const code = `I-${String(issues + 1).padStart(2, "0")}`;
      const issue: ProjectRisk = {
        id: `issue-${riskId}`,
        code,
        kind: "issue",
        title: source.title,
        severity: source.severity,
        status: "open",
        open: true,
        owner: source.owner,
        raisedBy: me,
        raisedAt: now,
        updatedAt: now,
        blocksTasks: source.blocksTasks,
        milestoneId: source.milestoneId,
        taskIds: source.taskIds,
        fromRiskId: source.id,
        fromRiskCode: source.code,
        commentCount: 0,
        revision: 1,
      };
      write(riskId, revision, (risk) => {
        audit(riskId, { field: "converted", from: risk.code, to: code });
        risk.status = "closed";
        risk.closeReason = "became-issue";
        risk.issueId = issue.id;
        risk.issueCode = code;
        return risk;
      });
      list.push(issue);
      history.set(issue.id, [{ id: `h-new-${++seq}`, at: now, actor: me, field: "converted", from: source.code, to: code }]);
      return respond(issue);
    },
  };
}

