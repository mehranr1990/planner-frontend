import { describe, expect, it } from "vitest";
import { createApiProjectMilestoneRepository } from "./api-project-milestones-repository";
import { err, fakeApi, json } from "./test-support";

/* Contract fake: phases and milestones from `components/{kind}`; unserved facts stay null; PJ-08 rows from the visible tasks. */

const P = "p1";
const component = (id: string, title: string, position: number, over: Record<string, unknown> = {}) => ({
  id, title, position, revision: 1, phaseId: null, targetDate: null, completed: false, ...over,
});
const viewItem = (id: string, status: string) => ({
  id, task: { id, title: id, status, priority: "NONE", revision: 1, deletedAt: null, completedAt: status === "DONE" ? "2026-11-10T09:00:00.000Z" : null },
  schedule: { id, revision: 1, plannedStartAt: null, dueAt: null, scheduledDate: null }, estimatedMinutes: null, workflow: { binding: null },
});

function project(phases: unknown[] = [component("ph2", "Build", 2), component("ph1", "Plan", 1, { completed: true })]) {
  return fakeApi((call, parts) => {
    if (parts[3] === "phases" && call.method === "GET") return json({ items: phases, nextCursor: null });
    if (parts[3] === "milestones" && call.method === "GET")
      return json({
        items: [component("m1", "Beta", 1, { revision: 4, phaseId: "ph2", targetDate: "2026-11-20", completed: null }), component("m2", "Later", 2, { completed: true })],
        nextCursor: null,
      });
    if (parts[3] === "sections") return json({ items: [component("s1", "Build · default", 1, { phaseId: "ph2" })], nextCursor: null });
    if (parts[2] === "views") return json({ kind: "LIST", items: [viewItem("t1", "OPEN"), viewItem("t2", "DONE"), viewItem("t3", "OPEN")], nextCursor: null, dependencies: [] });
    if (parts[2] === "members") return json({ items: [], nextCursor: null });
    if (parts[4] === "association") return json({ id: parts[3], sectionId: parts[3] === "t3" ? null : "s1", milestoneId: parts[3] === "t3" ? null : "m1", revision: 1 });
    if (parts[4] === "assignments") return json({ items: [], nextCursor: null });
    if (call.method === "PATCH") return json({ ...component(parts[4]!, String(call.body.title ?? "x"), Number(call.body.position ?? 1)), revision: 5 });
    return err(404);
  });
}

describe("live project phases and milestones", () => {
  it("lists components in position order with null dates / progress / open-task counts", async () => {
    const api = project();
    const repo = createApiProjectMilestoneRepository(api.client, { today: () => "2026-11-14" });
    expect(await repo.listPhases(P)).toEqual([
      { id: "ph1", name: "Plan", start: null, end: null, progress: null, done: true, behindDays: null },
      { id: "ph2", name: "Build", start: null, end: null, progress: null, done: false, behindDays: null },
    ]);
    expect(await repo.listMilestones(P)).toEqual([
      { id: "m1", title: "Beta", due: "2026-11-20", phaseId: "ph2", done: false, tasksLeft: null, revision: 4 },
      { id: "m2", title: "Later", due: null, phaseId: null, done: true, tasksLeft: null, revision: 1 },
    ]);
  });

  it("PJ-08 rows count the visible tasks per phase / milestone and apply the SPEC status rule", async () => {
    const repo = createApiProjectMilestoneRepository(project().client, { today: () => "2026-11-14" });
    expect((await repo.phaseRows(P)).map((row) => [row.phase.id, row.tasksDone, row.tasksTotal])).toEqual([["ph1", 0, 0], ["ph2", 1, 2]]);
    // m1: due in 6 days with half its tasks done → not behind (needs < 50 %) → the earliest open = Next; m2 done = Reached.
    expect((await repo.milestoneRows(P)).map((row) => [row.milestone.id, row.status, row.tasksDone, row.tasksTotal])).toEqual([
      ["m1", "next", 1, 2],
      ["m2", "reached", 0, 0],
    ]);
  });

  it("renames with If-Match and reorders phases above every current position", async () => {
    const api = project([component("a", "A", 1), component("b", "B", 2), component("c", "C", 3)]);
    const repo = createApiProjectMilestoneRepository(api.client, { today: () => "2026-11-14" });
    await expect(repo.updateMilestone(P, "m1", { title: "Beta 2" }, 3)).rejects.toMatchObject({ code: "conflict" });
    await repo.updateMilestone(P, "m1", { title: " Beta 2 " }, 4);
    const rename = api.calls.find((call) => call.method === "PATCH")!;
    expect([rename.path, rename.ifMatch, rename.body]).toEqual([`/projects/${P}/components/milestones/m1`, '"4"', { title: "Beta 2" }]);
    await repo.reorderPhases(P, ["a", "c", "b"]);
    const moves = api.calls.filter((call) => call.method === "PATCH" && call.path.includes("/phases/")).map((call) => [call.path.split("/").pop(), call.body.position]);
    expect(moves).toEqual([["c", 5], ["b", 6]]);
    await expect(repo.reorderPhases(P, ["a", "b"])).rejects.toMatchObject({ code: "invalid" });
  });
});
