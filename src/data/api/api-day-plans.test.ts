import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "@/api/client";
import { getPlannerNow, getPlannerToday } from "../clock";
import { setPlannerTimeZone, APP_TIME_ZONE } from "@/lib/dates/zone";
import { createDayPlans } from "./api-day-plans";
import { createApiPlanRepository } from "./api-plan-repository";
import type { ApiTasksRepository } from "./api-tasks-repository";

/* Fake of the Day plan contract: Day ETag per revision, 404 for a missing day, POST creates, items, PATCH taskIds, move. */
function fake() {
  const days = new Map<string, { revision: number; items: { taskId: string; position: number; plannedMinutes: number | null; task: Record<string, unknown> }[] }>();
  const calls: { method: string; path: string; ifMatch: string | null; body: Record<string, unknown> }[] = [];
  let conflictOnce = false;
  const now = "2026-11-04T00:00:00.000Z";
  const json = (body: unknown, status = 200, etag?: string) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...(etag ? { ETag: etag } : {}) } });
  const err = (status: number) => json({ error: { code: "X", message: "x", requestId: "6f1c2b8e-3d4a-4b5c-9d6e-7f8091a2b3c4" } }, status);
  const view = (date: string) => {
    const d = days.get(date)!;
    return {
      id: `d-${date}`, spaceId: "s", createdByUserId: "u", revision: d.revision, createdAt: now, updatedAt: now, localDate: date, timezone: "Asia/Tehran",
      items: d.items.map((i) => ({ id: `i-${i.taskId}`, taskId: i.taskId, position: i.position, plannedMinutes: i.plannedMinutes, selectedTaskRevision: 1, revision: 1, createdAt: now, updatedAt: now, disposition: "READY", task: i.task })),
      blockedItems: [],
    };
  };
  const task = (id: string, status = "OPEN") => ({ id, revision: 1, title: `T ${id}`, status, dueAt: null, scheduledDate: null, deleted: false, isMaster: false, occurrenceState: null });
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ method, path: url.pathname, ifMatch: headers.get("If-Match"), body });
    const [, , , , , date, sub, taskId, action] = url.pathname.split("/"); // /api/v1/planning/days/{date}/items/{taskId}/move
    const day = days.get(date!);
    if (method === "GET") return day ? json(view(date!), 200, `"${day.revision}"`) : err(404);
    if (method === "POST" && !sub) {
      if (day) return err(409);
      days.set(date!, { revision: 1, items: [] });
      return json(view(date!), 201, '"1"');
    }
    if (!day) return err(404);
    if (conflictOnce) {
      conflictOnce = false;
      day.revision += 1;
      return err(409);
    }
    if (headers.get("If-Match") !== `"${day.revision}"`) return err(409);
    day.revision += 1;
    if (method === "PUT") day.items.push({ taskId: taskId!, position: body.position ?? day.items.length, plannedMinutes: body.plannedMinutes, task: task(taskId!) });
    if (method === "PATCH") (body.taskIds as string[]).forEach((id, position) => (day.items.find((i) => i.taskId === id)!.position = position));
    if (method === "DELETE") day.items = day.items.filter((i) => i.taskId !== taskId);
    if (action === "move") {
      const item = day.items.find((i) => i.taskId === taskId)!;
      day.items = day.items.filter((i) => i !== item);
      const target = days.get(body.targetDate) ?? { revision: 0, items: [] };
      if (body.targetRevision !== target.revision) return err(409);
      target.revision += 1;
      target.items.push({ ...item, position: target.items.length });
      days.set(body.targetDate, target);
      return json({ source: view(date!), target: view(body.targetDate) }, 200, `"${day.revision}"`);
    }
    return json(view(date!), 200, `"${day.revision}"`);
  };
  return { fetchImpl, calls, days, task, conflict: () => (conflictOnce = true) };
}

const setup = () => {
  const backend = fake();
  return { backend, plans: createDayPlans(createApiClient({ origin: "http://api.test", fetch: backend.fetchImpl })) };
};
const writes = <T extends { method: string }>(calls: T[]) => calls.filter((c) => c.method !== "GET");

describe("Day plans", () => {
  it("reads a missing day as null without creating it", async () => {
    const { plans, backend } = setup();
    expect(await plans.get("2026-11-04")).toBeNull();
    expect(writes(backend.calls)).toHaveLength(0);
  });

  it("selects a task by creating the Day on demand, then PUT with Day If-Match, task revision and planned minutes", async () => {
    const { plans, backend } = setup();
    await plans.select("2026-11-04", "t1", 3, 45);
    expect(writes(backend.calls).map((c) => [c.method, c.path, c.ifMatch, c.body])).toEqual([
      ["POST", "/api/v1/planning/days/2026-11-04", null, {}],
      ["PUT", "/api/v1/planning/days/2026-11-04/items/t1", '"1"', { taskRevision: 3, plannedMinutes: 45 }],
    ]);
    await plans.select("2026-11-04", "t1", 3, 45);
    expect(writes(backend.calls)).toHaveLength(2); // already planned: no write
  });

  it("orders with the chosen tasks first and the rest after; a 409 refetches and re-sends once", async () => {
    const { plans, backend } = setup();
    for (const id of ["a", "b", "c"]) await plans.select("2026-11-04", id, 1, null);
    backend.conflict();
    const plan = await plans.order("2026-11-04", [{ taskId: "c", taskRevision: 1, plannedMinutes: null }]);
    const patches = writes(backend.calls).filter((c) => c.method === "PATCH");
    expect(patches.map((c) => c.body)).toEqual([{ taskIds: ["c", "a", "b"] }, { taskIds: ["c", "a", "b"] }]);
    expect(patches[1]!.ifMatch).toBe('"5"');
    expect([...plan.items].sort((x, y) => x.position - y.position).map((i) => i.taskId)).toEqual(["c", "a", "b"]);
  });

  it("moves a planned task (targetRevision 0 for a day without a plan) and removes the reference when undated", async () => {
    const { plans, backend } = setup();
    await plans.select("2026-11-04", "t1", 1, 30);
    await plans.move("2026-11-04", "2026-11-05", "t1", 2);
    const move = writes(backend.calls).find((c) => c.path.endsWith("/move"))!;
    expect(move.body).toEqual({ targetDate: "2026-11-05", targetRevision: 0, taskRevision: 2 });
    expect(move.ifMatch).toBe('"2"');
    expect(backend.days.get("2026-11-05")!.items.map((i) => i.taskId)).toEqual(["t1"]);
    await plans.move("2026-11-05", null, "t1", 2);
    expect(writes(backend.calls).at(-1)).toMatchObject({ method: "DELETE", path: "/api/v1/planning/days/2026-11-05/items/t1" });
    // Not planned on that day: nothing to move.
    const before = writes(backend.calls).length;
    await plans.move("2026-11-04", "2026-11-06", "t1", 2);
    expect(writes(backend.calls)).toHaveLength(before);
  });
});

describe("plan priorities", () => {
  it("are the first three active task items in plan order; block priorities are refused", async () => {
    const { plans, backend } = setup();
    for (const id of ["a", "b", "c", "d"]) await plans.select("2026-11-04", id, 1, 15);
    backend.days.get("2026-11-04")!.items[1]!.task = backend.task("b", "CANCELED");
    const tasks = {
      peek: (id: string) => ({ id, title: `Task ${id}`, time: id === "a" ? "09:00" : null, durationMinutes: 15 }),
      get: async () => null,
      revisionOf: () => 1,
    } as unknown as ApiTasksRepository;
    const repo = createApiPlanRepository(plans, tasks, { focusToday: vi.fn(), recordFocusSessions: vi.fn() });
    const top = await repo.priorities("2026-11-04");
    expect(top.map((p) => [p.rank, p.id, p.title, p.time])).toEqual([[1, "a", "Task a", "09:00"], [2, "c", "Task c", null], [3, "d", "Task d", null]]);
    await expect(repo.setPriorities("2026-11-04", [{ kind: "block", id: "x" }])).rejects.toMatchObject({ code: "unsupported" });
  });
});

describe("live clock", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    setPlannerTimeZone(APP_TIME_ZONE);
  });

  it("mock mode keeps the sample day; live mode uses the real date in the account zone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T05:30:00Z")); // 09:00 Tehran, 21:30 previous day in Los Angeles
    expect(getPlannerToday()).toBe("2026-10-13");
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "live");
    expect(getPlannerToday()).toBe("2026-11-04");
    expect(getPlannerNow()).toBe("2026-11-04T05:30:00.000Z");
    setPlannerTimeZone("America/Los_Angeles");
    expect(getPlannerToday()).toBe("2026-11-03");
    expect(setPlannerTimeZone("Not/AZone")).toBe(false);
  });
});
