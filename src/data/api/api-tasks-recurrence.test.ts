import { describe, expect, it } from "vitest";
import { createApiClient } from "@/api/client";
import { RepositoryError } from "../repositories";
import { createApiTasksRepository } from "./api-tasks-repository";

/*
 * Phase 02 fake: tasks + WEEKLY series with client-driven catch-up (occurrence
 * tasks copy the master; the master is hidden from lists), ENTIRE_SERIES
 * endDate edits that cancel later pending occurrences, and POST /tasks/bulk
 * with per-item APPLIED/REJECTED results.
 */
type Row = Record<string, unknown> & { id: string; revision: number; title: string; status: string; scheduledDate: string | null; deletedAt: string | null };

function fake() {
  const now = "2026-10-13T08:00:00.000Z";
  const tasks = new Map<string, Row>();
  const masters = new Set<string>();
  const seriesMap = new Map<string, Record<string, unknown> & { id: string; revision: number; definition: Record<string, unknown> & { startDate: string; endDate: string | null }; masterTaskId: string; scannedThrough: string | null; retiredAt: null }>();
  const occurrences: { id: string; seriesId: string; taskId: string; localDate: string; state: string; revision: number }[] = [];
  const calls: { method: string; path: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const bulkPlan: Record<string, "CONFLICT" | "NOT_FOUND"> = {};
  let seq = 0;
  const json = (body: unknown, status = 200, etag?: string) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...(etag ? { ETag: etag } : {}) } });
  const err = (status: number) => json({ error: { code: "CONFLICT", message: "x", requestId: "6f1c2b8e-3d4a-4b5c-9d6e-7f8091a2b3c4" } }, status);
  const page = (items: unknown[]) => ({ items, nextCursor: null });
  const newTask = (fields: Partial<Row>): Row => {
    const row: Row = {
      id: `t${++seq}`, spaceId: "s", createdByUserId: "u", title: "", description: null, status: "OPEN", priority: "NONE",
      parentTaskId: null, plannedStartAt: null, dueAt: null, scheduledDate: null, completedAt: null, createdAt: now,
      updatedAt: now, revision: 1, deletedAt: null, restoreUntil: null, ...fields,
    } as Row;
    tasks.set(row.id, row);
    return row;
  };
  const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ method, path: url.pathname, headers, body });
    const parts = url.pathname.replace("/api/v1/", "").split("/");

    if (parts[0] === "labels") return json(page([]));
    if (parts[0] === "notes") return json(page([]));
    if (parts[0] === "task-recurrences") {
      const s = parts[1] ? seriesMap.get(parts[1]) : undefined;
      if (!parts[1] && method === "GET") return json(page([...seriesMap.values()]));
      if (!parts[1] && method === "POST") {
        const master = tasks.get(body.taskId as string)!;
        if (body.taskRevision !== master.revision) return err(409);
        const created = { id: `s${++seq}`, masterTaskId: master.id, definition: body.definition, revision: 1, scannedThrough: null, retiredAt: null };
        seriesMap.set(created.id, created as never);
        masters.add(master.id);
        return json(created, 201, '"1"');
      }
      if (!s) return err(404);
      if (parts[2] === "catch-up") {
        let day = s.scannedThrough ? addDays(s.scannedThrough, 1) : s.definition.startDate;
        const items = [];
        for (; day <= (body.through as string); day = addDays(day, 1)) {
          const weekly = (Date.parse(day) - Date.parse(s.definition.startDate)) % (7 * 86_400_000) === 0;
          if (!weekly || (s.definition.endDate && day > s.definition.endDate)) continue;
          const master = tasks.get(s.masterTaskId)!;
          const task = newTask({ title: master.title, scheduledDate: day, priority: master.priority });
          const occurrence = { id: `o${++seq}`, seriesId: s.id, taskId: task.id, localDate: day, state: "PENDING", revision: 1 };
          occurrences.push(occurrence);
          items.push(occurrence);
        }
        s.scannedThrough = body.through as string;
        return json({ items, nextCursor: null, scannedThrough: s.scannedThrough });
      }
      if (parts[2] === "occurrences") return json(page(occurrences.filter((o) => o.seriesId === s.id)));
      if (method === "GET") return json(s, 200, `"${s.revision}"`);
      if (method === "PATCH") {
        if (headers.get("If-Match") !== `"${s.revision}"`) return err(409);
        s.definition = body.definition as never;
        s.revision += 1;
        for (const o of occurrences) {
          if (o.seriesId === s.id && o.state === "PENDING" && s.definition.endDate && o.localDate > s.definition.endDate) {
            o.state = "CANCELED";
            tasks.get(o.taskId)!.status = "CANCELED";
          }
        }
        return json({ series: s, successor: null, occurrence: null }, 200, `"${s.revision}"`);
      }
    }
    if (parts[0] !== "tasks") return err(404);
    if (parts[1] === "bulk") {
      const items = (body.items as { id: string; revision: number; patch: Record<string, unknown> }[]).map((item, index) => {
        const row = tasks.get(item.id);
        const planned = bulkPlan[item.id];
        if (planned) {
          delete bulkPlan[item.id];
          return { index, status: "REJECTED", error: { code: planned, message: "x" } };
        }
        if (!row || row.revision !== item.revision) return { index, status: "REJECTED", error: { code: "CONFLICT", message: "x" } };
        Object.assign(row, item.patch);
        row.revision += 1;
        return { index, status: "APPLIED", task: row };
      });
      return json({ items, succeeded: items.filter((i) => i.status === "APPLIED").length, failed: items.filter((i) => i.status !== "APPLIED").length });
    }
    if (parts.length === 1 && method === "GET") return json(page([...tasks.values()].filter((t) => !masters.has(t.id) && t.status !== "CANCELED")));
    if (parts.length === 1 && method === "POST") {
      const row = newTask(body as Partial<Row>);
      return json(row, 201, `"${row.revision}"`);
    }
    const row = tasks.get(parts[1]!);
    if (!row) return err(404);
    const sub = parts[2];
    if (sub === "productivity") return json({ taskId: row.id, revision: 1, estimatedMinutes: null, important: null, urgent: null, quadrant: "UNCLASSIFIED" }, 200, '"p1"');
    if (sub) return json(page([]));
    if (method === "GET") return json(row, 200, `"${row.revision}"`);
    if (headers.get("If-Match") !== `"${row.revision}"`) return err(409);
    Object.assign(row, body);
    row.revision += 1;
    return json(row, 200, `"${row.revision}"`);
  };
  return { fetchImpl, calls, tasks, occurrences, bulkPlan, find: (m: string, p: RegExp) => calls.filter((c) => c.method === m && p.test(c.path)) };
}

function setup() {
  const backend = fake();
  const repo = createApiTasksRepository(createApiClient({ origin: "http://api.test", fetch: backend.fetchImpl }), {
    today: () => "2026-10-13",
    fallback: { listAreas: async () => [] },
  });
  return { backend, repo };
}

describe("recurrence (repeat weekly)", () => {
  it("creates a WEEKLY series in the device zone with the task revision, catches up and shows the occurrence", async () => {
    const { repo, backend } = setup();
    const task = await repo.create({ title: "Water plants", date: "2026-10-13", recurring: true });
    const [post] = backend.find("POST", /^\/api\/v1\/task-recurrences$/);
    expect(post!.body).toMatchObject({
      taskRevision: 1,
      definition: { version: 1, startDate: "2026-10-13", endDate: null, timezone: "Asia/Tehran", rule: { kind: "WEEKLY", interval: 1 }, exclusionDates: [] },
    });
    const master = post!.body.taskId as string;
    expect(backend.find("POST", /catch-up$/)[0]!.body).toEqual({ through: "2026-10-20" });
    expect(task.id).not.toBe(master);
    expect(task).toMatchObject({ title: "Water plants", date: "2026-10-13", recurring: true });
    // The hidden master resolves to its current occurrence (an open detail page keeps working).
    expect((await repo.get(master))?.id).toBe(task.id);
    const listed = await repo.list({ view: "all" });
    expect(listed.map((t) => [t.date, t.recurring])).toEqual([["2026-10-13", true], ["2026-10-20", true]]);
  });

  it("turns repeat off after this occurrence (ENTIRE_SERIES endDate, series If-Match), keeping the visible task", async () => {
    const { repo, backend } = setup();
    const task = await repo.create({ title: "Review", date: "2026-10-13", recurring: true });
    const updated = await repo.update(task.id, { recurring: false });
    const [patch] = backend.find("PATCH", /^\/api\/v1\/task-recurrences\//);
    expect(patch!.headers.get("If-Match")).toBe('"1"');
    expect(patch!.body).toMatchObject({ scope: "ENTIRE_SERIES", definition: { endDate: "2026-10-13", rule: { kind: "WEEKLY", interval: 1 } } });
    expect(updated.id).toBe(task.id);
    expect(updated.recurring).toBeFalsy();
    expect((await repo.list({ view: "all" })).map((t) => t.date)).toEqual(["2026-10-13"]);
  });

  it("turning repeat on for an existing task uses its current revision and returns the occurrence", async () => {
    const { repo, backend } = setup();
    const { id } = await repo.create({ title: "Plan", date: "2026-10-14" });
    await repo.update(id, { title: "Plan week" });
    const shown = await repo.update(id, { recurring: true });
    expect(backend.find("POST", /^\/api\/v1\/task-recurrences$/)[0]!.body).toMatchObject({ taskId: id, taskRevision: 2 });
    expect(shown).toMatchObject({ title: "Plan week", date: "2026-10-14", recurring: true });
    expect(shown.id).not.toBe(id);
  });
});

describe("bulk updates (POST /tasks/bulk)", () => {
  it("sends one request with revisions and an Idempotency-Key, retries CONFLICT once, reports the rest", async () => {
    const { repo, backend } = setup();
    const ids = [];
    for (const title of ["a", "b", "c"]) ids.push((await repo.create({ title })).id);
    await repo.list({ view: "all" });
    backend.bulkPlan[ids[1]!] = "CONFLICT";
    backend.bulkPlan[ids[2]!] = "NOT_FOUND";
    const error = await repo.bulkUpdate(ids, { priority: "high" }).catch((e: unknown) => e);
    const bulks = backend.find("POST", /\/tasks\/bulk$/);
    expect(bulks).toHaveLength(2);
    expect(bulks[0]!.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(bulks[1]!.headers.get("Idempotency-Key")).not.toBe(bulks[0]!.headers.get("Idempotency-Key"));
    expect(bulks[0]!.body.items).toEqual(ids.map((id) => ({ id, revision: 1, action: "PATCH", patch: { priority: "HIGH" } })));
    expect(bulks[1]!.body.items).toEqual([{ id: ids[1], revision: 1, action: "PATCH", patch: { priority: "HIGH" } }]);
    expect(error).toBeInstanceOf(RepositoryError);
    expect(error).toMatchObject({ code: "partial", failedIds: [ids[2]] });
    expect([...backend.tasks.values()].filter((t) => t.priority === "HIGH").map((t) => t.id)).toEqual([ids[0], ids[1]]);
  });

  it("uses per-task updates when the change needs follow-up resources", async () => {
    const { repo, backend } = setup();
    const { id } = await repo.create({ title: "a" });
    await repo.bulkUpdate([id], { durationMinutes: 30 });
    expect(backend.find("POST", /\/tasks\/bulk$/)).toHaveLength(0);
    expect(backend.find("PATCH", /\/productivity$/)).toHaveLength(1);
  });
});
