import { describe, expect, it } from "vitest";
import { createApiProjectActivityRepository } from "./api-project-activity-repository";
import { createApiProjectDirectory } from "./api-project-directory-repository";
import { createApiProjectWorkflowDraftRepository } from "./api-project-workflow-drafts";
import { err, fakeApi, json } from "./test-support";

/* Contract fakes (not live evidence) for the P2 gap-closure wiring: workflow drafts, project activity, manual status (D9). */

const P = "p1";
const W = "6f1c2b8e-3d4a-4b5c-9d6e-7f8091a2b3c4";
const member = (id: string) => ({ id, actorId: "a-" + id, displayName: "Sara " + id, state: "ACTIVE", role: "OWNER", memberRole: null, generation: 1 });

describe("live workflow drafts", () => {
  const version = {
    workflowId: W,
    version: 2,
    name: "Delivery",
    createdAt: "2026-11-01T00:00:00.000Z",
    states: [{ id: "s-todo", label: "To do", status: "OPEN" }, { id: "s-done", label: "Shipped", status: "DONE" }],
    edges: [{ id: "e1", fromStateId: "s-todo", toStateId: "s-done", requiresApproval: true, approvers: [{ accessId: "m1", generation: 1 }] }],
  };
  const drafts = (open: unknown[] = []) =>
    fakeApi((call, parts) => {
      if (parts[2] === "workflows" && parts.length === 3) return json({ items: [{ id: W, name: "Delivery", currentVersion: 2, revision: 7 }], nextCursor: null });
      if (parts[2] === "workflows") return json(version);
      if (parts[2] === "workflow-drafts" && parts[4] === "publish-preview") return json({ id: "d1", revision: 2, preservesExistingBindings: true, removedStates: [{ version: 2, stateId: "s-todo", taskCount: 3 }] });
      if (parts[2] === "workflow-drafts" && call.method === "GET") return json({ items: open, nextCursor: null });
      if (parts[2] === "workflow-drafts" && call.method === "POST" && parts.length === 3)
        return json({ id: call.body.id, workflowId: W, baseRevision: 7, definition: call.body.definition, state: "DRAFT", revision: 1, publishedVersion: null, createdByActorId: "a-m1", createdAt: "x", updatedAt: "x" }, 201);
      if (parts[2] === "workflow-drafts") return json({ ...(open[0] as object), state: parts[4] === "publish" ? "PUBLISHED" : "DISCARDED" });
      if (parts[2] === "views") return json({ kind: "LIST", items: [], nextCursor: null, dependencies: [] });
      return err(404);
    });

  it("starts a draft from the published statuses: kept state ids and approval edges, new ids for base / new rows, server validation rules", async () => {
    const api = drafts();
    const repo = createApiProjectWorkflowDraftRepository(api.client);
    expect(await repo.draft(P)).toBeNull();
    const kept = `${W}:2:s-todo`;
    const done = `${W}:2:s-done`;
    const draft = await repo.saveDraft(P, {
      statuses: [
        { id: kept, name: "To do", category: "todo" },
        { id: done, name: "Shipped", category: "done" },
        { id: "status-1", name: "Review", category: "review" },
      ],
      transitions: { [kept]: [done, "status-1"], "status-1": [done] },
    });
    const post = api.calls.find((call) => call.method === "POST")!;
    const body = post.body as { workflowId: string; baseRevision: number; definition: { states: { id: string; label: string; status: string }[]; edges: { id: string; requiresApproval: boolean }[] } };
    expect([body.workflowId, body.baseRevision, Boolean(post.key)]).toEqual([W, 7, true]);
    expect(body.definition.states.map((state) => [state.id === "s-todo" || state.id === "s-done" ? state.id : "new", state.label, state.status])).toEqual([
      ["s-todo", "To do", "OPEN"],
      ["s-done", "Shipped", "DONE"],
      ["new", "Review", "IN_PROGRESS"],
    ]);
    expect(body.definition.edges.find((edge) => edge.id === "e1")).toMatchObject({ requiresApproval: true });
    expect(draft).toMatchObject({ version: 3, basedOn: 2 });
    expect(draft.statuses.map((status) => status.id.startsWith("draft:") ? "draft" : status.id)).toEqual([kept, done, "draft"]);
    await expect(repo.saveDraft(P, { statuses: [{ id: kept, name: "To do", category: "todo" }], transitions: {} })).rejects.toMatchObject({ code: "invalid", message: "needs-done" });
    await expect(repo.saveDraft(P, { statuses: [{ id: kept, name: "A", category: "done" }, { id: done, name: "a", category: "done" }], transitions: {} })).rejects.toMatchObject({ message: "status-names" });
  });

  it("preview lists removed states with pinned task counts; publish / discard use the draft revision and key; moving tasks is refused", async () => {
    const open = { id: "d1", workflowId: W, baseRevision: 7, definition: { name: "Delivery", states: [{ id: "s-done", label: "Done", status: "DONE" }], edges: [] }, state: "DRAFT", revision: 2, publishedVersion: null, createdByActorId: "a-m1", createdAt: "x", updatedAt: "x" };
    const api = drafts([open]);
    const repo = createApiProjectWorkflowDraftRepository(api.client);
    const preview = await repo.previewPublish(P);
    expect(preview.removed).toEqual([{ status: { id: `${W}:2:s-todo`, name: "To do", category: "todo" }, tasks: 3 }]);
    expect(preview.renamed).toEqual([{ statusId: `${W}:2:s-done`, from: "Shipped", to: "Done" }]);
    await expect(repo.publish(P, { [`${W}:2:s-todo`]: `${W}:2:s-done` })).rejects.toMatchObject({ code: "unsupported" });
    expect(api.writes()).toEqual([]);
    await repo.publish(P, {}).catch(() => undefined);
    await repo.discardDraft(P);
    expect(api.calls.filter((call) => call.method === "POST").map((call) => [call.path, call.ifMatch, Boolean(call.key)])).toEqual([
      [`/projects/${P}/workflow-drafts/d1/publish`, '"2"', true],
      [`/projects/${P}/workflow-drafts/d1/discard`, '"2"', true],
    ]);
  });
});

describe("live project activity", () => {
  it("shows task status / completion events with a visible title only; actors from the roster", async () => {
    const event = (id: string, kind: string, over: Record<string, unknown> = {}) => ({
      id, actorId: "a-m1", action: "task.update", entityType: "TASK", entityId: "t1", at: "2026-11-14T09:00:00.000Z", target: { id: "t1", title: "Design" }, changes: [], kind, ...over,
    });
    const api = fakeApi((_call, parts) => {
      if (parts[2] === "members") return json({ items: [member("m1")], nextCursor: null });
      if (parts[2] === "activity")
        return json({
          items: [
            event("a1", "TASK_STATUS", { changes: [{ field: "status", from: "OPEN", to: "IN_PROGRESS" }] }),
            event("a2", "TASK_COMPLETED", { actorId: "a-gone", changes: [{ field: "status", from: "IN_PROGRESS", to: "DONE" }] }),
            event("a3", "TASK_STATUS", { target: { id: "t9", title: null } }),
            event("a4", "STATUS_NOTE", { entityType: "PROJECT" }),
            event("a5", "MILESTONE_REACHED", { entityType: "MILESTONE" }),
          ],
          nextCursor: null,
        });
      return err(404);
    });
    const list = await createApiProjectActivityRepository(api.client).list(P, { limit: 6 });
    expect(api.calls.find((call) => call.path.endsWith("/activity"))!.query.limit).toBe("6");
    expect(list).toEqual([
      { id: "a1", kind: "moved", actor: { id: "m1", name: "Sara m1", initials: "SM" }, at: "2026-11-14T09:00:00.000Z", task: "Design", status: "base:IN_PROGRESS" },
      { id: "a2", kind: "completed", actor: { id: "a-gone", name: "", initials: "" }, at: "2026-11-14T09:00:00.000Z", task: "Design" },
    ]);
  });
});

describe("live project status (D9)", () => {
  it("summary health stays Unknown: the status is manual and the computed advisory /health is not read", async () => {
    const api = fakeApi((_call, parts) => {
      if (parts[3] === "me") return json({ accessId: "m1", actorId: "a-m1", role: "OWNER", state: "ACTIVE", generation: 1, scope: "FULL", projectState: "ACTIVE", capabilities: [] });
      if (parts[2] === "health") return json({ state: "AT_RISK", advisory: true, asOf: "x", reasons: [], observed: {} });
      if (parts[2] === "metadata") return json({ id: P, key: "APL", color: null, startDate: null, endDate: null, statusNote: null, revision: 1 });
      if (parts[2] === "dashboard") return json({ progress: { completedTasks: 0, eligibleTasks: 0, percent: null } });
      if (parts[0] === "me" || parts[2] === "members" || parts[2] === "components" || parts[2] === "register-items") return json({ items: [], nextCursor: null });
      if (parts.length === 2) return json({ id: P, title: "Apollo", description: null, state: "ACTIVE", updatedAt: "2026-11-14T09:00:00.000Z", spaceId: "s1" });
      return err(404);
    });
    const access = await createApiProjectDirectory(api.client).access(P);
    expect(access.status === "ok" ? access.project.health : "not-ok").toBeNull();
    expect(api.calls.some((call) => call.path.endsWith("/health"))).toBe(false);
  });
});
