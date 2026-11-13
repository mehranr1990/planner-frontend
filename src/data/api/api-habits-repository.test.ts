import { describe, expect, it } from "vitest";
import { ApiHttpError } from "@/api/errors";
import { createApiHabitsRepository } from "./api-habits-repository";
import { err, fakeApi, json } from "./test-support";

/* Fake of the Habits contract: habit revision ETag, entries with habitRevision + own revision, one checkbox / skip per date. */
const TODAY = "2026-11-12"; // a Thursday
const NOW = "2026-11-12T08:00:00.000Z";

interface FakeHabit {
  id: string;
  revision: number;
  title: string;
  type: "CHECKBOX" | "QUANTITY";
  unit: string;
  target: string;
  status: "ACTIVE" | "ARCHIVED";
  rule: Record<string, unknown>;
  startDate: string;
}
interface FakeEntry {
  id: string;
  habitId: string;
  revision: number;
  kind: string;
  state: "RECORDED" | "VOID";
  localDate: string;
  value: string | null;
}

function setup() {
  const habits: FakeHabit[] = [];
  const entries: FakeEntry[] = [];
  let conflictOnce = false;
  let pageSize = 100;
  const view = (h: FakeHabit) => {
    const schedule = { id: `s-${h.id}`, habitId: h.id, revision: h.revision, effectiveFrom: h.startDate, timezone: "Asia/Tehran", target: h.target, status: h.status, schedule: { version: 1, startDate: h.startDate, rule: h.rule }, createdAt: NOW };
    return { id: h.id, spaceId: "s", createdByUserId: "u", revision: h.revision, createdAt: NOW, updatedAt: NOW, title: h.title, type: h.type, unit: h.unit, purpose: "GENERIC", currentSchedule: schedule, latestSchedule: schedule };
  };
  const entryView = (e: FakeEntry) => ({ ...e, revisionId: `${e.id}-r${e.revision}`, scheduleId: `s-${e.habitId}`, previousRevisionId: null, timezone: "Asia/Tehran", recordedTimezone: "Asia/Tehran", recordedAt: NOW, actorUserId: "u", current: true });

  const api = fakeApi((call, [root, id, sub, entryId]) => {
    if (root !== "habits") return err(404);
    const { method, body } = call;
    if (!id) {
      if (method === "GET") {
        const start = Number(call.query.cursor ?? 0);
        const next = start + pageSize < habits.length ? String(start + pageSize) : null;
        return json({ items: habits.slice(start, start + pageSize).map(view), nextCursor: next });
      }
      const habit: FakeHabit = { id: `h${habits.length + 1}`, revision: 1, title: body.title as string, type: body.type as FakeHabit["type"], unit: body.unit as string, target: body.target as string, status: "ACTIVE", rule: (body.schedule as { rule: Record<string, unknown> }).rule, startDate: (body.schedule as { startDate: string }).startDate };
      habits.push(habit);
      return json(view(habit), 201, '"1"');
    }
    const habit = habits.find((h) => h.id === id);
    if (!habit) return err(404);
    if (method !== "GET" && conflictOnce) {
      conflictOnce = false;
      habit.revision += 1;
      return err(409);
    }
    if (!sub) {
      if (method === "GET") return json(view(habit), 200, `"${habit.revision}"`);
      if (call.ifMatch !== `"${habit.revision}"`) return err(409);
      habit.revision += 1;
      if (method === "DELETE") habit.status = "ARCHIVED";
      else {
        if (body.title) habit.title = body.title as string;
        if (body.target) habit.target = body.target as string;
        if (body.status) habit.status = body.status as FakeHabit["status"];
        if (body.schedule) habit.rule = (body.schedule as { rule: Record<string, unknown> }).rule;
      }
      return json(view(habit), 200, `"${habit.revision}"`);
    }
    if (sub !== "entries") return err(404);
    const own = entries.filter((e) => e.habitId === id);
    if (method === "GET") return json({ items: own.filter((e) => e.localDate >= call.query.from! && e.localDate < call.query.to!).map(entryView), nextCursor: null });
    if (body.habitRevision !== habit.revision) return err(409);
    if (method === "POST") {
      const kind = body.action === "SKIP" ? "SKIP" : habit.type;
      const day = own.filter((e) => e.localDate === body.localDate && e.state === "RECORDED");
      if ((kind !== "QUANTITY" && day.some((e) => e.kind === kind)) || (kind === "SKIP" && day.length)) return err(409);
      if (kind !== "SKIP" && day.some((e) => e.kind === "SKIP")) return err(409);
      const entry: FakeEntry = { id: `e${entries.length + 1}`, habitId: id, revision: 1, kind, state: "RECORDED", localDate: body.localDate as string, value: kind === "SKIP" ? null : ((body.value as string) ?? "1") };
      entries.push(entry);
      return json(entryView(entry), 201, '"1"');
    }
    const entry = own.find((e) => e.id === entryId);
    if (!entry) return err(404);
    if (call.ifMatch !== `"${entry.revision}"`) return err(409);
    entry.revision += 1;
    if (body.void) entry.state = "VOID";
    if (body.value) entry.value = body.value as string;
    return json(entryView(entry), 200, `"${entry.revision}"`);
  });
  const repo = createApiHabitsRepository(api.client, { today: () => TODAY });
  return { ...api, repo, habits, entries, conflict: () => (conflictOnce = true), pageSize: (n: number) => (pageSize = n) };
}

describe("live Habits adapter", () => {
  it("creates a checkbox habit: DAILY / COUNT, Idempotency-Key, zone and start day", async () => {
    const { repo, calls } = setup();
    const habit = await repo.create({ title: " Read ", icon: "leaf", area: null, restWeekdays: [], target: null, timeOfDay: "anytime", preferredTime: null, reminder: null });
    expect(habit).toMatchObject({ id: "h1", title: "Read", pinned: true, doneDays: [], restWeekdays: [], startDay: TODAY, target: null });
    expect(calls[0]!.key).toBeTruthy();
    expect(calls[0]!.body).toMatchObject({ title: "Read", type: "CHECKBOX", unit: "COUNT", target: "1", schedule: { version: 1, startDate: TODAY, rule: { kind: "DAILY" } } });
  });

  it("maps rest weekdays to ISO WEEKDAYS and a target to QUANTITY with a unit code", async () => {
    const { repo, calls } = setup();
    const habit = await repo.create({ title: "Pages", restWeekdays: [5, 0], target: { amount: 20, unit: "pages" } });
    expect(calls[0]!.body).toMatchObject({ type: "QUANTITY", unit: "PAGES", target: "20", schedule: { rule: { kind: "WEEKDAYS", weekdays: [1, 2, 3, 4, 6] } } });
    expect(habit).toMatchObject({ restWeekdays: [0, 5], target: { amount: 20, unit: "pages" } });
  });

  it("refuses what the API cannot store, before any request", async () => {
    const { repo, calls } = setup();
    await expect(repo.create({ title: "x", reminder: { time: "20:00", ifNotDone: true } })).rejects.toMatchObject({ code: "unsupported" });
    await expect(repo.create({ title: "x", icon: "book" })).rejects.toMatchObject({ code: "unsupported" });
    await expect(repo.create({ title: "x", target: { amount: 8, unit: "لیوان" } })).rejects.toMatchObject({ code: "unsupported" });
    await expect(repo.create({ title: " " })).rejects.toMatchObject({ code: "invalid" });
    await expect(repo.create({ title: "x", restWeekdays: [0, 1, 2, 3, 4, 5, 6] })).rejects.toMatchObject({ code: "invalid" });
    expect(calls).toHaveLength(0);
  });

  it("lists active habits with days from recorded entries (paged, half-open 366-date range)", async () => {
    const { repo, calls, entries, pageSize } = setup();
    await repo.create({ title: "A" });
    await repo.create({ title: "B", target: { amount: 8, unit: "glasses" } });
    await repo.create({ title: "C" });
    await repo.setArchived("h3", true);
    entries.push(
      { id: "x1", habitId: "h1", revision: 1, kind: "CHECKBOX", state: "RECORDED", localDate: "2026-11-10", value: "1" },
      { id: "x2", habitId: "h1", revision: 2, kind: "CHECKBOX", state: "VOID", localDate: "2026-11-11", value: "1" },
      { id: "x3", habitId: "h1", revision: 1, kind: "SKIP", state: "RECORDED", localDate: "2026-11-09", value: null },
      { id: "x4", habitId: "h2", revision: 1, kind: "QUANTITY", state: "RECORDED", localDate: "2026-11-10", value: "5" },
      { id: "x5", habitId: "h2", revision: 1, kind: "QUANTITY", state: "RECORDED", localDate: "2026-11-10", value: "3.5" },
      { id: "x6", habitId: "h2", revision: 1, kind: "QUANTITY", state: "RECORDED", localDate: "2026-11-11", value: "2" },
    );
    pageSize(2);
    calls.length = 0;
    const list = await repo.list();
    expect(list.map((h) => h.id)).toEqual(["h1", "h2"]);
    expect(list[0]).toMatchObject({ pinned: true, doneDays: ["2026-11-10"], skippedDays: ["2026-11-09"] });
    expect(list[1]).toMatchObject({ pinned: false, doneDays: ["2026-11-10"], amounts: { "2026-11-10": 8.5, "2026-11-11": 2 } });
    expect(calls.filter((c) => c.path === "/habits").map((c) => c.query.cursor)).toEqual([undefined, "2"]);
    expect(calls.find((c) => c.path === "/habits/h1/entries")!.query).toMatchObject({ from: "2025-11-12", to: "2026-11-13" });
  });

  it("checks and unchecks a day: POST with habitRevision, void with the entry's If-Match", async () => {
    const { repo, calls, writes } = setup();
    await repo.create({ title: "A" });
    calls.length = 0;
    expect((await repo.setDone("h1", TODAY, true)).doneDays).toEqual([TODAY]);
    expect(calls.at(-1)).toMatchObject({ method: "POST", path: "/habits/h1/entries", body: { habitRevision: 1, localDate: TODAY } });
    expect(calls.at(-1)!.key).toBeTruthy();
    await repo.setDone("h1", TODAY, true); // already done: nothing sent
    expect(writes()).toHaveLength(1);
    expect((await repo.setDone("h1", TODAY, false)).doneDays).toEqual([]);
    expect(calls.at(-1)).toMatchObject({ method: "PATCH", path: "/habits/h1/entries/e1", ifMatch: '"1"', body: { habitRevision: 1, void: true } });
    expect((await repo.setDone("h1", TODAY, true)).doneDays).toEqual([TODAY]); // a new logical entry after the void
  });

  it("skips a done day (void first), then clears the mark; rest days are refused", async () => {
    const { repo, writes } = setup();
    await repo.create({ title: "A" });
    await repo.setDone("h1", TODAY, true);
    const skipped = await repo.setDayMark("h1", TODAY, "skip");
    expect(skipped).toMatchObject({ doneDays: [], skippedDays: [TODAY] });
    expect(writes().slice(-2)).toEqual(["PATCH /habits/h1/entries/e1", "POST /habits/h1/entries"]);
    expect(await repo.setDayMark("h1", TODAY, null)).toMatchObject({ doneDays: [], skippedDays: [] });
    const before = writes().length;
    await expect(repo.setDayMark("h1", TODAY, "rest")).rejects.toMatchObject({ code: "unsupported" });
    expect(writes()).toHaveLength(before);
  });

  it("logs an amount as the day's total; the full target marks the day done", async () => {
    const { repo, calls, entries } = setup();
    await repo.create({ title: "Water", target: { amount: 8, unit: "glasses" } });
    expect(await repo.logAmount("h1", TODAY, 3)).toMatchObject({ doneDays: [], amounts: { [TODAY]: 3 } });
    expect(calls.at(-1)!.body).toMatchObject({ habitRevision: 1, localDate: TODAY, value: "3" });
    entries.push({ id: "extra", habitId: "h1", revision: 1, kind: "QUANTITY", state: "RECORDED", localDate: TODAY, value: "1" });
    await repo.list();
    expect(await repo.logAmount("h1", TODAY, 8)).toMatchObject({ doneDays: [TODAY], amounts: { [TODAY]: 8 } });
    expect(entries.filter((e) => e.state === "RECORDED").map((e) => e.value)).toEqual(["8"]);
    expect((await repo.setDone("h1", "2026-11-11", true)).amounts).toMatchObject({ "2026-11-11": 8 });
    await expect(repo.logAmount("h1", TODAY, -1)).rejects.toMatchObject({ code: "invalid" });
  });

  it("a stale habit revision reloads and repeats the intent once", async () => {
    const { repo, writes, conflict, habits } = setup();
    await repo.create({ title: "A" });
    conflict();
    expect((await repo.setDone("h1", TODAY, true)).doneDays).toEqual([TODAY]);
    expect(writes().slice(-2)).toEqual(["POST /habits/h1/entries", "POST /habits/h1/entries"]);
    conflict();
    expect((await repo.update("h1", { title: "B" })).title).toBe("B");
    expect(habits[0]!.title).toBe("B");
  });

  it("edits title, days and target amount; type and unit changes are refused", async () => {
    const { repo, calls } = setup();
    await repo.create({ title: "Pages", target: { amount: 20, unit: "pages" } });
    calls.length = 0;
    const habit = await repo.update("h1", { title: "Pages", icon: "leaf", area: null, restWeekdays: [5], target: { amount: 25, unit: "pages" }, timeOfDay: "anytime", preferredTime: null, reminder: null });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "PATCH", path: "/habits/h1", ifMatch: '"1"', body: { target: "25", schedule: { startDate: TODAY, rule: { kind: "WEEKDAYS", weekdays: [1, 2, 3, 4, 6, 7] } } } });
    expect(calls[0]!.body).not.toHaveProperty("title");
    expect(habit).toMatchObject({ restWeekdays: [5], target: { amount: 25, unit: "pages" } });
    await expect(repo.update("h1", { target: null })).rejects.toMatchObject({ code: "unsupported" });
    await expect(repo.update("h1", { target: { amount: 25, unit: "km" } })).rejects.toMatchObject({ code: "unsupported" });
    expect(calls).toHaveLength(1);
  });

  it("archives with DELETE + If-Match and restores with status ACTIVE", async () => {
    const { repo, calls } = setup();
    await repo.create({ title: "A" });
    expect((await repo.setArchived("h1", true)).archived).toBe(true);
    expect(calls.at(-1)).toMatchObject({ method: "DELETE", path: "/habits/h1", ifMatch: '"1"' });
    expect(await repo.list()).toEqual([]);
    expect((await repo.setArchived("h1", false)).archived).toBe(false);
    expect(calls.at(-1)).toMatchObject({ method: "PATCH", path: "/habits/h1", ifMatch: '"2"', body: { status: "ACTIVE" } });
  });

  it("maps 404 to not-found and lets other failures through", async () => {
    const { repo } = setup();
    await expect(repo.setDone("nope", TODAY, true)).rejects.toMatchObject({ code: "not-found" });
    const down = createApiHabitsRepository(fakeApi(() => err(503)).client, { today: () => TODAY });
    await expect(down.list()).rejects.toBeInstanceOf(ApiHttpError);
  });
});
