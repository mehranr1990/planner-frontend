import { describe, expect, it } from "vitest";
import { createApiProjectWorkInsights } from "./api-project-work-insights";
import { createApiProjectRiskRepository } from "./api-project-risks-repository";
import { createApiProjectRepositories } from "./api-project-repositories";
import { err, fakeApi, json } from "./test-support";

/* Contract fakes (not live evidence): workload / analytics from the visible task list, the risk register, the role-default access policy. */

const P = "p1";
const member = (id: string, role: string | null) => ({
  id, spaceId: "s1", scopeId: "sc", actorId: "a-" + id, memberRole: role === "OWNER" ? null : role, role, state: "ACTIVE", generation: 1, revision: 2, displayName: "Sara " + id,
});
const viewItem = (id: string, status: string, due: string | null, minutes: number | null, completedAt: string | null = null) => ({
  id,
  task: { id, title: id, status, priority: "NONE", revision: 1, deletedAt: null, completedAt },
  schedule: { id, revision: 1, plannedStartAt: null, dueAt: due ? `${due}T20:00:00.000Z` : null, scheduledDate: null },
  estimatedMinutes: minutes,
  workflow: { binding: null },
});
const me = (role: string, accessId = "m1") => ({ accessId, actorId: "a-" + accessId, role, state: "ACTIVE", generation: 1, scope: "FULL", projectState: "ACTIVE", capabilities: [] });

function work(role = "OWNER", accessId = "m1") {
  return fakeApi((_call, parts) => {
    if (parts[3] === "me") return json(me(role, accessId));
    if (parts[2] === "members") return json({ items: [member("m1", "OWNER"), member("m2", "MEMBER")], nextCursor: null });
    if (parts[2] === "views")
      return json({
        kind: "LIST",
        items: [
          // Sat 2026-11-14 week: t1 8h for m2 due Thu, t2 unestimated for m1, t3 canceled (no load), t4 done last week.
          viewItem("t1", "OPEN", "2026-11-19", 480),
          viewItem("t2", "IN_PROGRESS", "2026-11-18", null),
          viewItem("t3", "CANCELED", "2026-11-18", 600),
          viewItem("t4", "DONE", "2026-11-10", 120, "2026-11-09T10:00:00.000Z"),
        ],
        nextCursor: null,
        dependencies: [],
      });
    if (parts[3] === "sections") return json({ items: [], nextCursor: null });
    if (parts[4] === "association") return json({ id: parts[3], sectionId: null, milestoneId: null, revision: 1 });
    if (parts[4] === "assignments")
      return json({ items: [{ id: "as-" + parts[3], recipientAccessId: parts[3] === "t2" ? "m1" : "m2", decision: "ACCEPTED", endedAt: null, createdAt: "2026-11-01T00:00:00.000Z", createdByActorId: "a-m1" }], nextCursor: null });
    if (parts[2] === "metadata") return json({ id: P, key: "APL", color: null, startDate: "2026-10-31", endDate: null, statusNote: null, revision: 1 });
    return err(404);
  });
}

describe("live project workload and analytics (computed from the visible tasks)", () => {
  it("workload: estimates spread to the assignees' week, canceled tasks carry no load, capacity unknown", async () => {
    const insights = createApiProjectWorkInsights(work().client, { today: () => "2026-11-14", now: () => "2026-11-14T10:00:00.000Z" });
    const grid = await insights.workload.byPeriod(P, { from: "2026-11-14", unit: "week", count: 1, calendar: "gregorian" });
    expect(grid.weeks).toEqual(["2026-11-14"]);
    const rows = Object.fromEntries(grid.rows.map((row) => [row.person.id, row]));
    expect(rows.m2!.cells[0]).toMatchObject({ hours: 8, count: 1 });
    expect(rows.m2!.capacity).toBeNull();
    expect(rows.m1!.cells[0]).toMatchObject({ hours: 0, count: 1 });
    expect(rows.m1!.unestimated).toBe(1);
    expect(await insights.workload.week(P)).toEqual([{ person: rows.m2!.person, hours: 8, capacity: null }]);
  });

  it("workload: a Member sees only their own row; a Viewer is refused", async () => {
    const own = await createApiProjectWorkInsights(work("MEMBER", "m2").client, { today: () => "2026-11-14" }).workload.byWeek(P, { from: "2026-11-14", weeks: 1 });
    expect(own.rows.map((row) => row.person.id)).toEqual(["m2"]);
    expect(own.unassigned).toEqual([]);
    await expect(
      createApiProjectWorkInsights(work("VIEWER", "m3").client, { today: () => "2026-11-14" }).workload.byWeek(P, { from: "2026-11-14", weeks: 1 }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("analytics: counts of the visible tasks; cycle time unknown (no first In progress instant)", async () => {
    const insights = createApiProjectWorkInsights(work().client, { today: () => "2026-11-14", now: () => "2026-11-14T10:00:00.000Z" });
    const summary = await insights.reports.summary(P, { range: "4w", weekStartsOn: 6 });
    expect(summary.kpis).toMatchObject({ done: 1, total: 4, onTime: 1, doneWithDue: 1, cycleMedianDays: null, cycleSample: 0, overdue: 0 });
    expect(summary.weeks).toHaveLength(4);
    expect(summary.throughput).toEqual([0, 0, 1, 0]);
    expect(summary.byAssignee).toEqual([{ person: expect.objectContaining({ id: "m2" }), done: 1 }]);
  });
});

describe("live project risk register", () => {
  const item = (over: Record<string, unknown> = {}) => ({
    id: "r1", projectId: P, kind: "RISK", title: "Vendor late", description: "d", severity: "HIGH", probability: 70, owner: { accessId: "m2", generation: 1 },
    mitigation: "Second vendor", status: "MITIGATING", revision: 3, createdByActorId: "a-m1", createdAt: "2026-11-01T08:00:00.000Z", retiredAt: null, ...over,
  });
  const register = () =>
    fakeApi((call, parts) => {
      if (parts[2] === "members") return json({ items: [member("m1", "OWNER"), member("m2", "MEMBER")], nextCursor: null });
      if (parts[4] === "history")
        return json({
          items: [
            { id: "h1", itemId: "r1", actorId: "a-m1", revision: 1, before: null, after: item({ status: "OPEN" }), createdAt: "2026-11-01T08:00:00.000Z" },
            { id: "h2", itemId: "r1", actorId: "a-m2", revision: 3, before: item({ status: "OPEN" }), after: item(), createdAt: "2026-11-05T08:00:00.000Z" },
          ],
          nextCursor: null,
        });
      if (parts[2] === "register-items" && call.method === "PUT") return json(item({ ...call.body, revision: 4 }));
      if (parts[2] === "register-items" && parts.length === 4) return json(item());
      if (parts[2] === "register-items") return json({ items: [item(), item({ id: "r2", status: "CLOSED" }), item({ id: "r3", retiredAt: "2026-11-02T00:00:00.000Z" })], nextCursor: null });
      return err(404);
    });

  it("maps served fields only (no code, no 3-level probability) with updatedAt from the history", async () => {
    const repo = createApiProjectRiskRepository(register().client);
    const open = await repo.list(P, { open: true });
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ id: "r1", code: null, kind: "risk", severity: "high", status: "mitigating", open: true, mitigation: "Second vendor", updatedAt: "2026-11-05T08:00:00.000Z", blocksTasks: 0, revision: 3 });
    expect(open[0]!.probability).toBeUndefined();
    expect(open[0]!.owner.id).toBe("m2");
    expect(open[0]!.raisedBy.id).toBe("m1");
    expect((await repo.history(P, "r1")).map((line) => [line.field, line.from, line.to])).toEqual([["status", "open", "mitigating"], ["created", undefined, undefined]]);
  });

  it("update = full PUT with If-Match keeping unserved-by-UI fields; probability / close / comments are refused without a request", async () => {
    const api = register();
    const repo = createApiProjectRiskRepository(api.client);
    await repo.update(P, "r1", { severity: "critical", status: "open", ownerId: "m1" }, 3);
    const put = api.calls.find((call) => call.method === "PUT")!;
    expect(put.ifMatch).toBe('"3"');
    expect(put.body).toEqual({ kind: "RISK", title: "Vendor late", description: "d", severity: "CRITICAL", probability: 70, owner: { accessId: "m1", generation: 1 }, mitigation: "Second vendor", status: "OPEN" });
    const writes = api.writes().length;
    await expect(repo.update(P, "r1", { probability: "low" }, 3)).rejects.toMatchObject({ code: "unsupported" });
    await expect(repo.close(P, "r1", { reason: "mitigated" }, 3)).rejects.toMatchObject({ code: "unsupported" });
    await expect(repo.addComment(P, "r1", "x")).rejects.toMatchObject({ code: "unsupported" });
    expect(api.writes()).toHaveLength(writes);
  });
});

describe("live project access policy (role defaults)", () => {
  it("reads the role defaults and publishes with If-Match on the version shown, export limits unchanged", async () => {
    const policy = {
      roleDefaults: { OWNER: ["task.read"], ADMIN: ["task.read"], MANAGER: ["task.read"], MEMBER: ["task.read"], VIEWER: ["task.read"] },
      exportMaxRecords: 5000,
      exportMaxBytes: 1048576,
      version: 2,
    };
    const api = fakeApi((call, parts) => {
      if (parts[2] === "access-policy" && call.method === "PUT") return json({ ...call.body, version: 3 }, 200, '"3"');
      if (parts[2] === "access-policy") return json(policy, 200, '"2"');
      return err(404);
    });
    const { settings } = createApiProjectRepositories(api.client, { today: () => "2026-11-14" });
    const read = await settings.rolePolicy!(P);
    expect(read.roleDefaults.viewer).toEqual(["task.read"]);
    await expect(settings.setRolePolicy!(P, read.roleDefaults, 1)).rejects.toMatchObject({ code: "conflict" });
    const saved = await settings.setRolePolicy!(P, { ...read.roleDefaults, member: ["task.read", "task.create"] }, 2);
    const put = api.calls.find((call) => call.method === "PUT")!;
    expect([put.ifMatch, put.body.exportMaxRecords, (put.body.roleDefaults as Record<string, string[]>).MEMBER]).toEqual(['"2"', 5000, ["task.read", "task.create"]]);
    expect(saved.version).toBe(3);
    // The mock-only toggles stay refused in live mode (never faked).
    await expect(settings.access(P)).rejects.toMatchObject({ code: "unsupported" });
  });
});
