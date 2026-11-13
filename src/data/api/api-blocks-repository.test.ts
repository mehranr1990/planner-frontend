import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "@/api/client";
import { APP_TIME_ZONE, setPlannerTimeZone } from "@/lib/dates/zone";
import type { Task } from "../domain";
import { RepositoryError } from "../repositories";
import { createApiBlocksRepository } from "./api-blocks-repository";
import { withBlockFollow } from "./api-task-block-follow";
import type { ApiTasksRepository } from "./api-tasks-repository";

/* Fake of the Calendar contract: views (paged), time blocks and events with an ETag per revision, If-Match on writes. */
interface Row {
  id: string;
  kind: "EVENT" | "TIME_BLOCK";
  revision: number;
  title: string;
  taskId: string | null;
  taskDisposition: string | null;
  seriesId: string | null;
  status: string;
  localStart: string;
  localEnd: string;
  deleted?: boolean;
}

const DAY = "2026-11-04";
// Asia/Tehran is UTC+03:30 all year.
const utc = (local: string) => new Date(Date.parse(`${local}:00Z`) - 210 * 60_000).toISOString();

function fake(pageSize = 100) {
  const rows = new Map<string, Row>();
  const calls: { method: string; path: string; query: URLSearchParams; ifMatch: string | null; key: string | null; body: Record<string, unknown> }[] = [];
  let conflictOnce = false;
  let dropOnce = false;
  let gapOnce = false;
  let seq = 0;
  const json = (body: unknown, status = 200, etag?: string) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...(etag ? { ETag: etag } : {}) } });
  const err = (status: number, details?: unknown[]) =>
    json({ error: { code: "X", message: "x", requestId: "6f1c2b8e-3d4a-4b5c-9d6e-7f8091a2b3c4", ...(details ? { details } : {}) } }, status);
  const schedule = (row: Row) => ({ kind: "TIMED", timezone: "Asia/Tehran", localStart: row.localStart, localEnd: row.localEnd, startAt: utc(row.localStart), endAt: utc(row.localEnd) });
  const resource = (row: Row) => ({ id: row.id, revision: row.revision, title: row.title, status: row.status, taskId: row.taskId, taskDisposition: row.taskDisposition, deletedAt: null, schedule: schedule(row) });
  const viewItem = (row: Row) => ({
    identity: row.seriesId ? `${row.seriesId}:${row.localStart}` : row.id,
    resourceId: row.id,
    seriesId: row.seriesId,
    kind: row.kind,
    title: row.title,
    status: row.status,
    taskId: row.taskId,
    taskDisposition: row.taskDisposition,
    schedule: schedule(row),
  });
  const applySchedule = (row: Row, body: Record<string, unknown>) => {
    const next = body.schedule as { localStart: string; localEnd: string } | undefined;
    if (next) Object.assign(row, { localStart: next.localStart, localEnd: next.localEnd });
  };
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
    const key = headers.get("Idempotency-Key");
    calls.push({ method, path: url.pathname, query: url.searchParams, ifMatch: headers.get("If-Match"), key, body });
    const [, , , , collection, id] = url.pathname.split("/"); // /api/v1/calendar/{collection}/{id}
    const live = [...rows.values()].filter((row) => !row.deleted);
    if (method === "GET" && collection === "views") {
      const offset = Number(url.searchParams.get("cursor") ?? 0);
      const page = live.slice(offset, offset + pageSize);
      return json({ items: page.map(viewItem), nextCursor: offset + pageSize < live.length ? String(offset + pageSize) : null });
    }
    if (method === "GET" && !id) return json({ items: live.filter((row) => row.kind === "TIME_BLOCK").map(resource), nextCursor: null });
    if (method === "POST") {
      if (gapOnce) {
        gapOnce = false;
        return err(400, [{ code: "DST_GAP", path: "schedule.localStart", message: "gap" }]);
      }
      // Idempotency receipt: the same key returns the first result.
      const replay = receipts.get(key!);
      if (replay) return json(resource(replay), 201, `"${replay.revision}"`);
      const row: Row = {
        id: `b${++seq}`,
        kind: "TIME_BLOCK",
        revision: 1,
        title: body.title,
        taskId: body.taskId ?? null,
        taskDisposition: body.taskId ? "READY" : null,
        seriesId: null,
        status: "ACTIVE",
        localStart: "",
        localEnd: "",
      };
      applySchedule(row, body);
      rows.set(row.id, row);
      receipts.set(key!, row);
      if (dropOnce) {
        dropOnce = false;
        throw new TypeError("network");
      }
      return json(resource(row), 201, `"${row.revision}"`);
    }
    const row = rows.get(id!);
    if (!row || row.deleted) return err(404);
    if (method === "GET") return json(resource(row), 200, `"${row.revision}"`);
    if (conflictOnce) {
      conflictOnce = false;
      row.revision += 1;
      return err(409);
    }
    if (headers.get("If-Match") !== `"${row.revision}"`) return err(409);
    row.revision += 1;
    if (method === "DELETE") {
      row.deleted = true;
      return new Response(null, { status: 204 });
    }
    applySchedule(row, body);
    return json(resource(row), 200, `"${row.revision}"`);
  };
  const receipts = new Map<string, Row>();
  const add = (row: Partial<Row> & { id: string }) =>
    rows.set(row.id, {
      kind: "TIME_BLOCK",
      revision: 1,
      title: row.id,
      taskId: null,
      taskDisposition: null,
      seriesId: null,
      status: "ACTIVE",
      localStart: `${DAY}T09:00`,
      localEnd: `${DAY}T10:00`,
      ...row,
    });
  return { fetchImpl, calls, rows, add, conflict: () => (conflictOnce = true), drop: () => (dropOnce = true), gap: () => (gapOnce = true) };
}

function fakeTasks() {
  const byId = new Map<string, Task>([["t1", { id: "t1", title: "Write report", status: "open", date: DAY, time: null, durationMinutes: 45 } as Task]]);
  return {
    get: vi.fn(async (id: string) => byId.get(id) ?? null),
    peek: vi.fn((id: string) => byId.get(id)),
    revisionOf: vi.fn(() => 7),
    update: vi.fn(async (id: string) => byId.get(id)!),
    setDone: vi.fn(async (id: string, done: boolean) => ({ ...byId.get(id)!, status: done ? "done" : "open" }) as Task),
  };
}

function setup(pageSize?: number, tasks = fakeTasks()) {
  const backend = fake(pageSize);
  const client = createApiClient({ origin: "http://api.test", fetch: backend.fetchImpl });
  return { backend, tasks, blocks: createApiBlocksRepository(client, { tasks: tasks as unknown as ApiTasksRepository }) };
}
const writes = <T extends { method: string }>(calls: T[]) => calls.filter((call) => call.method !== "GET");

afterEach(() => setPlannerTimeZone(APP_TIME_ZONE));

describe("Calendar blocks (live adapter)", () => {
  it("reads the day view in the planner zone, follows the cursor and maps kinds", async () => {
    const { blocks, backend } = setup(2);
    backend.add({ id: "e1", kind: "EVENT", title: "Standup", localStart: `${DAY}T11:00`, localEnd: `${DAY}T11:30` });
    backend.add({ id: "b1", taskId: "t1", taskDisposition: "READY", title: "server title" });
    backend.add({ id: "b2", taskId: "t9", taskDisposition: "COMPLETED", title: "Done thing", localStart: `${DAY}T08:00`, localEnd: `${DAY}T08:30` });
    backend.add({ id: "b3", taskId: "t8", taskDisposition: "DELETED" });
    backend.add({ id: "b4", status: "CANCELED" });

    const day = await blocks.listForDay(DAY);

    const reads = backend.calls.filter((call) => call.path.endsWith("/views"));
    expect(reads).toHaveLength(3);
    expect(Object.fromEntries(reads[0]!.query)).toEqual({ from: DAY, to: "2026-11-05", timezone: "Asia/Tehran", limit: "100" });
    expect(reads[1]!.query.get("cursor")).toBe("2");
    // Start order; the deleted Task's block and the canceled block are hidden.
    expect(day.map((block) => block.id)).toEqual(["b2", "b1", "e1"]);
    expect(day[0]).toMatchObject({ kind: "task", taskId: "t9", done: true, title: "Done thing" });
    // A loaded Task's title wins over the block's copy.
    expect(day[1]).toMatchObject({ kind: "task", taskId: "t1", done: false, title: "Write report", start: utc(`${DAY}T09:00`) });
    expect(day[2]).toMatchObject({ kind: "event", title: "Standup" });
    expect(day[2]!.taskId).toBeUndefined();
  });

  it("schedules a task: one POST with Idempotency-Key and the Task revision, then the Task follows", async () => {
    const { blocks, backend, tasks } = setup();

    const block = await blocks.schedule("t1", { day: DAY, start: "14:00" });

    const [post] = writes(backend.calls);
    expect(writes(backend.calls)).toHaveLength(1);
    expect(post).toMatchObject({ method: "POST", path: "/api/v1/calendar/time-blocks" });
    expect(post!.key).toBeTruthy();
    expect(post!.body).toEqual({
      title: "Write report",
      schedule: { kind: "TIMED", timezone: "Asia/Tehran", localStart: `${DAY}T14:00`, localEnd: `${DAY}T14:45` },
      taskId: "t1",
      taskRevision: 7,
    });
    expect(tasks.update).toHaveBeenCalledWith("t1", { date: DAY, time: "14:00", durationMinutes: 45 });
    expect(block).toMatchObject({ id: "b1", kind: "task", taskId: "t1", start: `${DAY}T14:00:00+03:30`, end: `${DAY}T14:45:00+03:30` });
  });

  it("re-sends a lost create with the same key and body (no duplicate block)", async () => {
    const { blocks, backend } = setup();
    backend.drop();

    await blocks.schedule("t1", { day: DAY, start: "14:00" });

    const posts = writes(backend.calls);
    expect(posts).toHaveLength(2);
    expect(posts[1]!.key).toBe(posts[0]!.key);
    expect(posts[1]!.body).toEqual(posts[0]!.body);
    expect(backend.rows.size).toBe(1);
  });

  it("moves the task's existing block instead of creating a second one", async () => {
    const { blocks, backend } = setup();
    backend.add({ id: "b1", taskId: "t1", taskDisposition: "READY", revision: 3 });

    await blocks.schedule("t1", { day: "2026-11-05", start: "08:15", durationMinutes: 30 });

    const [patch] = writes(backend.calls);
    expect(writes(backend.calls)).toHaveLength(1);
    expect(patch).toMatchObject({ method: "PATCH", path: "/api/v1/calendar/time-blocks/b1", ifMatch: '"3"' });
    expect(patch!.body).toEqual({ schedule: { kind: "TIMED", timezone: "Asia/Tehran", localStart: "2026-11-05T08:15", localEnd: "2026-11-05T08:45" } });
  });

  it("moves an event with its own ETag; 409 refetches and re-sends once", async () => {
    const { blocks, backend, tasks } = setup();
    backend.add({ id: "e1", kind: "EVENT", revision: 2 });
    await blocks.listForDay(DAY);
    backend.conflict();

    const moved = await blocks.move("e1", { day: DAY, start: "16:00" });

    const patches = writes(backend.calls);
    expect(patches.map((call) => [call.path, call.ifMatch])).toEqual([
      ["/api/v1/calendar/events/e1", '"2"'],
      ["/api/v1/calendar/events/e1", '"3"'],
    ]);
    // Length kept (60 min); an event never touches a Task.
    expect(patches[1]!.body).toEqual({ schedule: { kind: "TIMED", timezone: "Asia/Tehran", localStart: `${DAY}T16:00`, localEnd: `${DAY}T17:00` } });
    expect(tasks.update).not.toHaveBeenCalled();
    expect(moved).toMatchObject({ id: "e1", kind: "event", start: `${DAY}T16:00:00+03:30` });
  });

  it("refuses a recurring occurrence, a placement that leaves the day and an unknown block, without writing", async () => {
    const { blocks, backend } = setup();
    backend.add({ id: "e1", kind: "EVENT", seriesId: "s1" });
    backend.add({ id: "b1" });
    const day = await blocks.listForDay(DAY);
    const occurrence = day.find((block) => block.id !== "b1")!;

    await expect(blocks.move(occurrence.id, { day: DAY, start: "12:00" })).rejects.toMatchObject({ code: "unsupported" });
    await expect(blocks.move("b1", { day: DAY, start: "23:30" })).rejects.toMatchObject({ code: "invalid" });
    await expect(blocks.move("nope", { day: DAY, start: "12:00" })).rejects.toMatchObject({ code: "not-found" });
    expect(writes(backend.calls)).toHaveLength(0);
  });

  it("reports a DST gap as invalid input", async () => {
    const { blocks, backend } = setup();
    backend.gap();
    await expect(blocks.schedule("t1", { day: DAY, start: "02:30" })).rejects.toMatchObject({ code: "invalid" });
  });

  it("reports partial when the block saved but the Task did not follow", async () => {
    const tasks = fakeTasks();
    tasks.update.mockRejectedValueOnce(new Error("offline"));
    const { blocks, backend } = setup(undefined, tasks);

    await expect(blocks.schedule("t1", { day: DAY, start: "14:00" })).rejects.toMatchObject({ code: "partial", failed: ["time"] });
    expect(backend.rows.size).toBe(1);
  });

  it("unschedules only task blocks: DELETE with If-Match, then the Task loses its time", async () => {
    const { blocks, backend, tasks } = setup();
    backend.add({ id: "b1", taskId: "t1", taskDisposition: "READY", revision: 4 });
    backend.add({ id: "e1", kind: "EVENT" });
    await blocks.listForDay(DAY);

    await expect(blocks.unschedule("e1")).rejects.toMatchObject({ code: "forbidden" });
    await blocks.unschedule("b1");

    expect(writes(backend.calls).map((call) => [call.method, call.path, call.ifMatch])).toEqual([["DELETE", "/api/v1/calendar/time-blocks/b1", '"4"']]);
    expect(tasks.update).toHaveBeenCalledWith("t1", { time: null });
    expect((await blocks.listForDay(DAY)).map((block) => block.id)).toEqual(["e1"]);
  });

  it("done goes through the Task; events cannot be marked done", async () => {
    const { blocks, backend, tasks } = setup();
    backend.add({ id: "b1", taskId: "t1", taskDisposition: "READY" });
    backend.add({ id: "e1", kind: "EVENT" });
    await blocks.listForDay(DAY);

    expect(await blocks.setDone("b1", true)).toMatchObject({ id: "b1", done: true });
    expect(tasks.setDone).toHaveBeenCalledWith("t1", true);
    await expect(blocks.setDone("e1", true)).rejects.toMatchObject({ code: "unsupported" });
    expect(writes(backend.calls)).toHaveLength(0);
  });

  it("snapshot + restore put a rescheduled task and its block back", async () => {
    const { blocks, backend, tasks } = setup();
    backend.add({ id: "b1", taskId: "t1", taskDisposition: "READY" });
    await blocks.listForDay(DAY);
    const snapshot = await blocks.snapshot({ taskIds: ["t1"] });
    expect(snapshot.tasks).toEqual([{ id: "t1", date: DAY, time: null, durationMinutes: 45 }]);
    expect(snapshot.blocks.map((block) => block.id)).toEqual(["b1"]);

    await blocks.move("b1", { day: "2026-11-06", start: "15:00" });
    tasks.update.mockClear();
    await blocks.restore(snapshot);

    expect(backend.rows.get("b1")).toMatchObject({ localStart: `${DAY}T09:00`, localEnd: `${DAY}T10:00` });
    expect(tasks.update).toHaveBeenCalledWith("t1", { date: DAY, time: null, durationMinutes: 45 });
  });
});

describe("Task ⇄ block follow (D5)", () => {
  const task = (patch: Partial<Task>) => ({ id: "t1", title: "Write report", status: "open", date: DAY, time: "09:00", durationMinutes: 60, ...patch }) as Task;

  it("moves and resizes the task's own block with If-Match; an unchanged block is not written", async () => {
    const { blocks, backend } = setup();
    backend.add({ id: "b1", taskId: "t1", taskDisposition: "READY" });
    backend.add({ id: "b2", taskId: "t2", taskDisposition: "READY", localStart: `${DAY}T12:00`, localEnd: `${DAY}T13:00` });

    await blocks.followTask(task({}));
    expect(writes(backend.calls)).toHaveLength(0);

    await blocks.followTask(task({ date: "2026-11-06", time: "14:30", durationMinutes: 45 }));
    const [patch] = writes(backend.calls);
    expect(patch).toMatchObject({ method: "PATCH", path: "/api/v1/calendar/time-blocks/b1", ifMatch: '"1"' });
    expect(patch!.body).toEqual({ schedule: { kind: "TIMED", timezone: "Asia/Tehran", localStart: "2026-11-06T14:30", localEnd: "2026-11-06T15:15" } });
    // The other task's block is never touched.
    expect(backend.rows.get("b2")).toMatchObject({ revision: 1, localStart: `${DAY}T12:00` });
  });

  it("keeps the block's length when the task has none, and recovers from a 409 once", async () => {
    const { blocks, backend } = setup();
    backend.add({ id: "b1", taskId: "t1", taskDisposition: "READY" });
    backend.conflict();
    await blocks.followTask(task({ time: "16:00", durationMinutes: null }));
    expect(writes(backend.calls).map((call) => call.ifMatch)).toEqual(['"1"', '"2"']);
    expect(backend.rows.get("b1")).toMatchObject({ localStart: `${DAY}T16:00`, localEnd: `${DAY}T17:00` });
  });

  it("removes the block when the task loses its time or date; no block is a no-op", async () => {
    const { blocks, backend } = setup();
    await blocks.followTask(task({ time: null }));
    expect(writes(backend.calls)).toHaveLength(0);

    backend.add({ id: "b1", taskId: "t1", taskDisposition: "READY" });
    await blocks.followTask(task({ time: null }));
    expect(writes(backend.calls).map((call) => call.method)).toEqual(["DELETE"]);
    expect(backend.rows.get("b1")!.deleted).toBe(true);

    backend.add({ id: "b3", taskId: "t1", taskDisposition: "READY" });
    await blocks.followTask(task({ date: null, time: null }));
    expect(backend.rows.get("b3")!.deleted).toBe(true);
  });

  it("the tasks wrapper follows only schedule edits and reports a block left behind as partial", async () => {
    const saved = task({ time: "11:00" });
    const inner = {
      update: vi.fn(async () => saved),
      bulkUpdate: vi.fn(async (ids: readonly string[]) => ids.map((id) => ({ ...saved, id }))),
      peek: vi.fn((id: string) => ({ ...saved, id })),
    };
    const follow = vi.fn<(task: Task) => Promise<void>>(async () => {});
    const tasks = withBlockFollow(inner as unknown as ApiTasksRepository, follow);

    await tasks.update("t1", { title: "x" });
    expect(follow).not.toHaveBeenCalled();
    expect(await tasks.update("t1", { time: "11:00" })).toBe(saved);
    expect(follow).toHaveBeenCalledWith(saved);

    follow.mockRejectedValueOnce(new Error("offline"));
    await expect(tasks.update("t1", { date: DAY })).rejects.toMatchObject({ code: "partial", failed: ["time"], task: saved });

    follow.mockClear();
    follow.mockImplementation(async (item) => {
      if (item.id === "t2") throw new Error("offline");
    });
    await expect(tasks.bulkUpdate(["t1", "t2", "t3"], { date: DAY })).rejects.toMatchObject({ code: "partial", failedIds: ["t2"] });
    expect(follow).toHaveBeenCalledTimes(3);

    // Tasks the server refused keep their blocks; the saved ones still follow.
    follow.mockReset();
    inner.bulkUpdate.mockRejectedValueOnce(new RepositoryError("partial", "x", { failedIds: ["t2"] }));
    await expect(tasks.bulkUpdate(["t1", "t2"], { time: null })).rejects.toMatchObject({ code: "partial", failedIds: ["t2"] });
    expect(follow.mock.calls.map(([item]) => item.id)).toEqual(["t1"]);
  });
});
