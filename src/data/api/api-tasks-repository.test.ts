import { describe, expect, it } from "vitest";
import { createApiClient } from "@/api/client";
import { createApiTasksRepository, localInstant, localParts } from "./api-tasks-repository";

/*
 * A small in-memory fake of the Phase 0/1 task contract: quoted ETags per
 * revision, If-Match enforcement (409), labels by listing filter, checklist
 * writes returning { task, item }, soft delete + restore.
 */
type Row = Record<string, unknown> & { id: string; revision: number; deletedAt: string | null; status: string };

function fakeBackend() {
  const tasks = new Map<string, Row>();
  const labels = new Map<string, { id: string; name: string; revision: number; createdAt: string; updatedAt: string }>();
  const taskLabels = new Map<string, Set<string>>();
  const checklist = new Map<string, { id: string; taskId: string; title: string; completed: boolean; position: number; createdAt: string; updatedAt: string }[]>();
  const calls: { method: string; path: string; headers: Headers; body: unknown }[] = [];
  let seq = 0;
  let conflictNext = false;
  // Productivity has its own revision (separate ETag) per task; notes are linked by taskId.
  const productivity = new Map<string, { revision: number; estimatedMinutes: number | null }>();
  const notes: { id: string; taskId: string; title: string; content: { format: string; version: number; content: string }; createdAt: string }[] = [];
  let failProductivityPatch = false;
  const now = "2026-11-03T10:00:00.000Z";
  const json = (body: unknown, status = 200, etag?: string) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...(etag ? { ETag: etag } : {}) } });
  const err = (status: number) => json({ error: { code: "CONFLICT", message: "x", requestId: "6f1c2b8e-3d4a-4b5c-9d6e-7f8091a2b3c4" } }, status);
  const tag = (row: Row) => `"${row.revision}"`;
  const bump = (row: Row) => {
    row.revision += 1;
    row.updatedAt = now;
  };
  const page = (items: unknown[]) => ({ items, nextCursor: null });

  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: url.pathname + url.search, headers, body });
    const parts = url.pathname.replace("/api/v1/", "").split("/");
    const guard = (row: Row) => {
      if (conflictNext) {
        conflictNext = false;
        bump(row); // someone else wrote meanwhile
        return err(409);
      }
      return headers.get("If-Match") === tag(row) ? null : err(409);
    };

    if (parts[0] === "labels" && method === "GET") return json(page([...labels.values()]));
    // Every list load reads the recurrence series first (Phase 02); this fake has none.
    if (parts[0] === "task-recurrences" && parts.length === 1 && method === "GET") return json(page([]));
    if (parts[0] === "notes" && method === "GET") return json(page(notes.filter((note) => note.taskId === url.searchParams.get("taskId"))));
    if (parts[0] === "notes" && method === "POST") {
      const note = { id: `n${++seq}`, ...body, createdAt: now };
      notes.push(note);
      return json(note, 201, '"1"');
    }
    if (parts[0] === "labels" && method === "POST") {
      const label = { id: `l${++seq}`, name: body.name, revision: 1, createdAt: now, updatedAt: now };
      labels.set(label.id, label);
      return json(label, 201, '"1"');
    }
    if (parts[0] !== "tasks") return err(404);
    if (parts.length === 1 && method === "GET") {
      const labelId = url.searchParams.get("labelId");
      const rows = [...tasks.values()].filter((row) => !row.deletedAt && (!labelId || taskLabels.get(row.id)?.has(labelId)));
      return json(page(rows));
    }
    if (parts.length === 1 && method === "POST") {
      const id = `t${++seq}`;
      const row: Row = {
        id, spaceId: "s", createdByUserId: "u", description: null, status: "OPEN", priority: "NONE", parentTaskId: null,
        plannedStartAt: null, dueAt: null, scheduledDate: null, completedAt: null, createdAt: now, updatedAt: now,
        revision: 1, deletedAt: null, restoreUntil: null, ...body,
      };
      tasks.set(id, row);
      return json(row, 201, tag(row));
    }
    const row = tasks.get(parts[1]!);
    if (!row) return err(404);
    const sub = parts[2];
    if (!sub && method === "GET") return json(row, 200, tag(row));
    if (sub === "checklist-items" && method === "GET") return json(page(checklist.get(row.id) ?? []));
    if (sub === "labels" && method === "GET") return json(page([...(taskLabels.get(row.id) ?? [])].map((id) => labels.get(id))));
    if (sub === "attachments" && method === "GET") return json(page([]));
    if (sub === "productivity") {
      const p = productivity.get(row.id) ?? { revision: 1, estimatedMinutes: null };
      productivity.set(row.id, p);
      const out = () => json({ taskId: row.id, revision: p.revision, estimatedMinutes: p.estimatedMinutes, important: null, urgent: null, quadrant: "UNCLASSIFIED" }, 200, `"p${p.revision}"`);
      if (method === "GET") return out();
      if (failProductivityPatch) return err(503);
      if (headers.get("If-Match") !== `"p${p.revision}"`) return err(409);
      p.revision += 1;
      p.estimatedMinutes = body.estimatedMinutes;
      return out();
    }
    const conflict = guard(row);
    if (conflict) return conflict;
    bump(row);
    if (!sub && method === "PATCH") Object.assign(row, body);
    else if (!sub && method === "DELETE") Object.assign(row, { deletedAt: now, restoreUntil: now });
    else if (sub === "restore") Object.assign(row, { deletedAt: null, restoreUntil: null });
    else if (sub === "complete") Object.assign(row, { status: "DONE", completedAt: now });
    else if (sub === "reopen") Object.assign(row, { status: "OPEN", completedAt: null });
    else if (sub === "labels") {
      const set = taskLabels.get(row.id) ?? new Set();
      if (method === "PUT") set.add(parts[3]!);
      else set.delete(parts[3]!);
      taskLabels.set(row.id, set);
    } else if (sub === "checklist-items") {
      const items = checklist.get(row.id) ?? [];
      if (method === "POST") items.push({ id: `c${++seq}`, taskId: row.id, title: body.title, completed: false, position: body.position ?? items.length, createdAt: now, updatedAt: now });
      else if (method === "PATCH") Object.assign(items.find((item) => item.id === parts[3])!, body);
      else if (method === "DELETE") items.splice(items.findIndex((item) => item.id === parts[3]), 1);
      checklist.set(row.id, items);
      return json(method === "POST" ? { task: row, item: items.at(-1) } : { task: row }, method === "POST" ? 201 : 200, tag(row));
    }
    return json(row, 200, tag(row));
  };
  return { fetchImpl, calls, tasks, notes, conflictOnce: () => (conflictNext = true), failDuration: () => (failProductivityPatch = true) };
}

function setup() {
  const backend = fakeBackend();
  const client = createApiClient({ origin: "http://api.test", fetch: backend.fetchImpl });
  const repo = createApiTasksRepository(client, { today: () => "2026-11-03", fallback: { listAreas: async () => [] } });
  const writes = () => backend.calls.filter((call) => call.method !== "GET");
  return { backend, repo, writes };
}

describe("device-zone time mapping (Asia/Tehran in tests)", () => {
  it("round-trips a local day + time through a UTC instant", () => {
    expect(localInstant("2026-11-03", "09:30")).toBe("2026-11-03T06:00:00.000Z");
    expect(localParts("2026-11-03T06:00:00.000Z")).toEqual({ day: "2026-11-03", time: "09:30" });
  });
});

describe("createApiTasksRepository", () => {
  it("creates with an Idempotency-Key and maps day, time, deadline and priority", async () => {
    const { repo, backend } = setup();
    const task = await repo.create({ title: " Plan ", date: "2026-11-03", time: "09:30", priority: "high", deadline: "2026-11-05", durationMinutes: 30 });
    const [post] = backend.calls.filter((call) => call.method === "POST");
    expect(post!.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(post!.body).toEqual({
      title: "Plan",
      priority: "HIGH",
      scheduledDate: "2026-11-03",
      plannedStartAt: "2026-11-03T06:00:00.000Z",
      dueAt: localInstant("2026-11-05", "23:59"),
    });
    expect(task).toMatchObject({ title: "Plan", date: "2026-11-03", time: "09:30", priority: "high", deadline: "2026-11-05", durationMinutes: 30, status: "open" });
  });

  it("lists root tasks only and fetches detail for the ETag before the first write", async () => {
    const { repo, backend, writes } = setup();
    const { id } = await repo.create({ title: "A" });
    const fresh = createApiTasksRepository(createApiClient({ origin: "http://api.test", fetch: backend.fetchImpl }), {
      today: () => "2026-11-03",
      fallback: { listAreas: async () => [] },
    });
    expect((await fresh.list({ view: "all" })).map((task) => task.title)).toEqual(["A"]);
    expect(backend.calls.find((call) => call.path.startsWith("/api/v1/tasks?"))!.path).toContain("rootOnly=true");
    await fresh.update(id, { title: "B" });
    const patch = writes().at(-1)!;
    expect(patch.headers.get("If-Match")).toBe('"1"');
    expect(patch.body).toEqual({ title: "B" });
    expect(backend.calls.some((call) => call.method === "GET" && call.path === `/api/v1/tasks/${id}`)).toBe(true);
  });

  it("on 409 refetches and re-sends the same change once with the fresh ETag", async () => {
    const { repo, backend, writes } = setup();
    const { id } = await repo.create({ title: "A" });
    backend.conflictOnce();
    const task = await repo.update(id, { priority: "urgent" });
    const patches = writes().filter((call) => call.method === "PATCH");
    expect(patches.map((call) => call.headers.get("If-Match"))).toEqual(['"1"', '"2"']);
    expect(patches[1]!.body).toEqual({ priority: "URGENT" });
    expect(task.priority).toBe("urgent");
  });

  it("completes and reopens through the action routes", async () => {
    const { repo, writes } = setup();
    const { id } = await repo.create({ title: "A" });
    expect((await repo.setDone(id, true)).status).toBe("done");
    expect((await repo.setDone(id, false)).status).toBe("open");
    expect(writes().slice(-2).map((call) => call.path)).toEqual([`/api/v1/tasks/${id}/complete`, `/api/v1/tasks/${id}/reopen`]);
  });

  it("syncs labels by name (creates missing labels) and checklist items with the Task revision", async () => {
    const { repo, writes } = setup();
    const { id } = await repo.create({ title: "A", labels: ["Work"] });
    let task = await repo.update(id, { labels: ["Home"], checklist: [{ title: "one", done: false }, { title: "two", done: false }] });
    expect(task.labels).toEqual(["Home"]);
    expect(task.checklist?.map((item) => item.title)).toEqual(["one", "two"]);
    expect(task.subtasks).toEqual({ done: 0, total: 2 });
    const [one, two] = task.checklist!;
    task = await repo.update(id, { checklist: [{ ...two!, done: true }] });
    expect(task.checklist).toEqual([{ id: two!.id, title: "two", done: true }]);
    // Every Task-scoped write carried the ETag of the revision before it.
    const scoped = writes().filter((call) => call.path.startsWith(`/api/v1/tasks/${id}`));
    scoped.forEach((call, index) => expect(call.headers.get("If-Match")).toBe(`"${index + 1}"`));
    expect(writes().some((call) => call.method === "DELETE" && call.path.endsWith(`/checklist-items/${one!.id}`))).toBe(true);
    expect((await repo.get(id))!.labels).toEqual(["Home"]);
  });

  it("keeps a new checklist item that is already ticked (create, then PATCH completed)", async () => {
    const { repo, writes } = setup();
    const { id } = await repo.create({ title: "A" });
    const task = await repo.update(id, { checklist: [{ title: "done already", done: true }] });
    expect(task.subtasks).toEqual({ done: 1, total: 1 });
    expect(writes().slice(-2).map((call) => [call.method, call.body])).toEqual([
      ["POST", { title: "done already", position: 0 }],
      ["PATCH", { completed: true }],
    ]);
  });

  it("soft-deletes and restores within the window", async () => {
    const { repo, backend } = setup();
    const { id } = await repo.create({ title: "A" });
    const { restore } = await repo.remove([id]);
    expect(await repo.list({ view: "all" })).toEqual([]);
    await repo.restore(restore);
    expect((await repo.list({ view: "all" })).map((task) => task.id)).toEqual([id]);
    expect(backend.calls.find((call) => call.path.endsWith("/restore"))!.headers.get("If-Match")).toBe('"2"');
  });

  it("rejects invalid input without calling the API", async () => {
    const { repo, writes } = setup();
    await expect(repo.create({ title: "  " })).rejects.toMatchObject({ code: "invalid" });
    await expect(repo.create({ title: "x", time: "09:00" })).rejects.toMatchObject({ code: "invalid" });
    expect(writes()).toHaveLength(0);
  });

  it("persists duration on the productivity resource with its own ETag and reloads it", async () => {
    const { repo, backend, writes } = setup();
    const { id } = await repo.create({ title: "A", durationMinutes: 30 });
    const fresh = createApiTasksRepository(createApiClient({ origin: "http://api.test", fetch: backend.fetchImpl }), {
      today: () => "2026-11-03",
      fallback: { listAreas: async () => [] },
    });
    expect((await fresh.list({ view: "all" }))[0]!.durationMinutes).toBe(30);
    await fresh.update(id, { durationMinutes: 45 });
    const patches = writes().filter((call) => call.path.endsWith("/productivity"));
    expect(patches.map((call) => [call.headers.get("If-Match"), call.body])).toEqual([
      ['"p1"', { estimatedMinutes: 30 }],
      ['"p2"', { estimatedMinutes: 45 }],
    ]);
    expect((await repo.get(id))!.durationMinutes).toBe(45);
  });

  it("adds notes as server Notes linked by taskId (Idempotency-Key, first-line title) without touching the description", async () => {
    const { repo, backend, writes } = setup();
    const { id } = await repo.update((await repo.create({ title: "A" })).id, { description: "keep me" });
    const task = await repo.addNote(id, "  First line\nmore detail ");
    const post = writes().at(-1)!;
    expect(post.path).toBe("/api/v1/notes");
    expect(post.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(post.body).toEqual({
      title: "First line",
      content: { format: "MARKDOWN", version: 1, content: "First line\nmore detail" },
      taskId: id,
    });
    expect(task.notes?.map((note) => note.body)).toEqual(["First line\nmore detail"]);
    expect(task.description).toBe("keep me");
    expect(writes().filter((call) => call.method === "PATCH" && call.path === `/api/v1/tasks/${id}`)).toHaveLength(1);
    expect((await repo.get(id))!.notes).toHaveLength(1);
    expect(backend.notes).toHaveLength(1);
  });

  it("refuses fields the API cannot store, writing nothing", async () => {
    const { repo, writes } = setup();
    const { id } = await repo.create({ title: "A" });
    const before = writes().length;
    for (const patch of [{ energy: "high" as const }, { area: { id: "a", name: "Work" } }, { project: "P" }, { scope: "team" as const }, { goalId: "g1" }]) {
      await expect(repo.update(id, patch)).rejects.toMatchObject({ code: "unsupported" });
    }
    await expect(repo.create({ title: "B", energy: "low" })).rejects.toMatchObject({ code: "unsupported" });
    // Repeat is supported since Phase 02 (api-tasks-recurrence.test.ts); manual order needs Day plans (Phase 03), absent here.
    await expect(repo.reorder({ ids: [id] })).rejects.toMatchObject({ code: "unsupported" });
    expect(writes()).toHaveLength(before);
  });

  it("reports a partial save when the task is created but its duration is not", async () => {
    const { repo, backend } = setup();
    backend.failDuration();
    const error = await repo.create({ title: "A", durationMinutes: 20, labels: ["Work"] }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "partial", failed: ["duration"] });
    expect((error as { task: { title: string; labels: string[] } }).task).toMatchObject({ title: "A", labels: ["Work"] });
    expect(backend.tasks.size).toBe(1);
  });
});
