import { describe, expect, it } from "vitest";
import type { Task, TimeBlock } from "@/data/domain";
import { sampleDays } from "@/fixtures/personal";
import { RepositoryError } from "../repositories";
import { createMockRepositories } from "./mock-repositories";

const { today, tomorrow, yesterday } = sampleDays;

const ids = (items: readonly { id: string }[]) => items.map((item) => item.id);

const task = (id: string, patch: Partial<Task> = {}): Task => ({
  id,
  title: id,
  scope: "personal",
  priority: null,
  energy: null,
  durationMinutes: null,
  date: null,
  time: null,
  status: "open",
  ...patch,
});

const rejects = async (promise: Promise<unknown>, code: RepositoryError["code"]) => {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(RepositoryError);
  expect((error as RepositoryError).code).toBe(code);
};

describe("mock tasks · query (filters, search, sort, counts)", () => {
  const { tasks } = createMockRepositories();

  it("derives the tab counts from the fixtures", async () => {
    expect(await tasks.counts()).toEqual({ today: 9, upcoming: 7, all: 28, completed: 9 });
  });

  it("counts follow filters and search", async () => {
    expect(await tasks.counts({ filters: { areaIds: ["health"] } })).toEqual({ today: 0, upcoming: 2, all: 2, completed: 0 });
    expect(await tasks.counts({ search: "bill" })).toMatchObject({ today: 1, completed: 1 });
  });

  it("filters a view by area, energy and priority", async () => {
    const personal = await tasks.list({ view: "today", filters: { areaIds: ["personal"], energies: ["low", "medium"] } });
    expect(ids(personal)).toEqual(["t-check-in-notes", "t-plan-weekend-trip"]);
    expect(ids(await tasks.list({ view: "upcoming", filters: { priorities: ["urgent"] } }))).toEqual(["t-renew-car-insurance"]);
  });

  it("filters by context (scope), labels, undated and recurring", async () => {
    expect(ids(await tasks.list({ view: "today", filters: { scopes: ["project"] } }))).toEqual(["t-reply-katy-brief"]);
    expect(ids(await tasks.list({ view: "all", filters: { labels: ["design"] } }))).toEqual(["t-ui-design"]);
    expect(ids(await tasks.list({ view: "all", filters: { hasDate: false } }))).toEqual([
      "t-learn-figma-variables",
      "t-gift-for-sara",
      "t-repaint-balcony",
      "t-book-museum-day",
      "t-sort-photo-backups",
    ]);
    expect((await tasks.list({ view: "all", filters: { recurring: true } })).every((item) => item.recurring)).toBe(true);
  });

  it("searches title, project, area and label, in Persian digits too", async () => {
    expect(ids(await tasks.list({ view: "all", search: "BILLS" }))).toEqual(
      expect.arrayContaining(["t-pay-electricity-bill", "t-pay-phone-bill"]),
    );
    expect(ids(await tasks.list({ view: "all", search: "habit-linked" }))).toEqual(["t-read-30-pages"]);
    expect(ids(await tasks.list({ view: "all", search: "social" }))).toEqual(["t-gift-for-sara", "t-book-museum-day"]);
    expect(ids(await tasks.list({ view: "all", search: "۵ km" }))).toEqual(["t-5km-run"]);
  });

  it("sorts: smart puts overdue first; priority; duration; created", async () => {
    const smart = await tasks.list({ view: "today", sort: "smart" });
    expect(smart[0]?.id).toBe("t-pay-electricity-bill");
    expect(ids(await tasks.list({ view: "upcoming", sort: "priority" }))[0]).toBe("t-renew-car-insurance");
    const durations = (await tasks.list({ view: "all", sort: "duration" })).map((item) => item.durationMinutes ?? Infinity);
    expect(durations).toEqual([...durations].sort((a, b) => a - b));
    expect((await tasks.list({ view: "completed", sort: "smart" }))[0]?.id).toBe("t-deep-work");
  });

  it("without a sort the legacy order is unchanged", async () => {
    expect(ids(await tasks.list({ view: "today" }))[0]).toBe("t-pay-electricity-bill");
    expect(ids(await tasks.list({ view: "all" })).at(-1)).toBe("t-sort-photo-backups");
  });

  it("lists areas by name, and tasks carry their goal title", async () => {
    expect((await tasks.listAreas()).map((area) => area.id)).toEqual(["finance", "health", "home", "learning", "personal", "social"]);
    expect((await tasks.get("t-ui-design"))?.goalTitle).toBe("Launch Planner v1");
    expect((await tasks.get("t-water-plants"))?.goalTitle).toBeUndefined();
  });
});

describe("mock tasks · create", () => {
  it("creates a task with defaults, order and createdAt from the planner clock", async () => {
    const repo = createMockRepositories();
    const created = await repo.tasks.create({ title: "  Call mom  ", date: tomorrow, time: "18:00", durationMinutes: 15, priority: "high" });
    expect(created).toMatchObject({
      title: "Call mom",
      scope: "personal",
      priority: "high",
      energy: null,
      date: tomorrow,
      time: "18:00",
      durationMinutes: 15,
      status: "open",
      createdAt: "2026-10-13T14:35:00+03:30",
    });
    expect(created.id).toMatch(/^t-new-/);
    // A time never makes a block: that is blocks.schedule.
    expect(ids(await repo.blocks.listForDay(tomorrow))).not.toContain(created.id);
    expect(await repo.tasks.get(created.id)).toEqual(created);
  });

  it("orders each new task after the last", async () => {
    const repo = createMockRepositories({ fixtures: { tasks: [task("a", { order: 4 })] } });
    const first = await repo.tasks.create({ title: "first" });
    const second = await repo.tasks.create({ title: "second" });
    expect([first.order, second.order]).toEqual([5, 6]);
  });

  it("keeps area, project, labels, deadline and recurring", async () => {
    const repo = createMockRepositories();
    const created = await repo.tasks.create({
      title: "x",
      area: { id: "home", name: "stale" },
      project: "Bills",
      labels: ["a"],
      deadline: tomorrow,
      recurring: true,
      scope: "project",
    });
    expect(created).toMatchObject({ area: { id: "home", name: "Home" }, project: "Bills", labels: ["a"], deadline: tomorrow, recurring: true, scope: "project" });
  });

  it("rejects an empty title, a bad day, time or duration, and a time without a date", async () => {
    const { tasks } = createMockRepositories();
    await rejects(tasks.create({ title: "   " }), "invalid");
    await rejects(tasks.create({ title: "x", date: "2026-13-01" }), "invalid");
    await rejects(tasks.create({ title: "x", date: today, time: "25:00" }), "invalid");
    await rejects(tasks.create({ title: "x", date: today, durationMinutes: 0 }), "invalid");
    await rejects(tasks.create({ title: "x", time: "09:00" }), "invalid");
    expect(await tasks.counts()).toMatchObject({ all: 28 });
  });
});

describe("mock tasks · update keeps blocks in step", () => {
  const block = async (repo: ReturnType<typeof createMockRepositories>, id: string): Promise<TimeBlock | undefined> =>
    (await repo.blocks.listForDay(today)).find((item) => item.id === id);

  it("edits plain fields, clearing with null", async () => {
    const repo = createMockRepositories();
    const updated = await repo.tasks.update("t-ui-design", {
      title: "  UI polish ",
      priority: "low",
      energy: null,
      project: null,
      labels: [],
      area: { id: "health", name: "x" },
      deadline: tomorrow,
    });
    expect(updated).toMatchObject({ title: "UI polish", priority: "low", energy: null, area: { id: "health", name: "Health" }, deadline: tomorrow });
    expect(updated.project).toBeUndefined();
    expect(updated.labels).toBeUndefined();
  });

  it("a new time moves the block; a new duration resizes it; the title and scope follow", async () => {
    const repo = createMockRepositories();
    await repo.tasks.update("t-ui-design", { time: "15:00", durationMinutes: 60, title: "UI", scope: "project" });
    expect(await block(repo, "ui-design")).toMatchObject({
      start: "2026-10-13T15:00:00+03:30",
      end: "2026-10-13T16:00:00+03:30",
      title: "UI",
      scope: "project",
    });
    expect(await repo.tasks.get("t-ui-design")).toMatchObject({ time: "15:00", durationMinutes: 60 });
  });

  it("a new date moves the block to that day at the same time", async () => {
    const repo = createMockRepositories();
    await repo.tasks.update("t-ui-design", { date: tomorrow });
    expect(await block(repo, "ui-design")).toBeUndefined();
    const moved = (await repo.blocks.listForDay(tomorrow)).find((item) => item.id === "ui-design");
    expect(moved).toMatchObject({ start: "2026-10-14T14:00:00+03:30", end: "2026-10-14T16:00:00+03:30" });
  });

  it("no time, or no date, removes the block", async () => {
    const repo = createMockRepositories();
    await repo.tasks.update("t-ui-design", { time: null });
    expect(await block(repo, "ui-design")).toBeUndefined();
    expect(await repo.tasks.get("t-ui-design")).toMatchObject({ date: today, time: null });

    const other = createMockRepositories();
    await other.tasks.update("t-deep-work", { date: null });
    expect(await block(other, "deep-work")).toBeUndefined();
    expect(await other.tasks.get("t-deep-work")).toMatchObject({ date: null, time: null });
  });

  it("a time on a task without a block stays task-only", async () => {
    const repo = createMockRepositories();
    await repo.tasks.update("t-review-october-expenses", { time: "18:30" });
    expect(await repo.tasks.get("t-review-october-expenses")).toMatchObject({ time: "18:30" });
    expect((await repo.blocks.listForDay(today)).some((item) => item.taskId === "t-review-october-expenses")).toBe(false);
  });

  it("rejects bad patches and changes nothing", async () => {
    const repo = createMockRepositories();
    const before = await repo.tasks.get("t-ui-design");
    // The block would run past midnight, after the title was already applied.
    await rejects(repo.tasks.update("t-ui-design", { title: "changed", time: "23:30" }), "invalid");
    await rejects(repo.tasks.update("t-ui-design", { title: " " }), "invalid");
    await rejects(repo.tasks.update("t-review-october-expenses", { date: null, time: "09:00" }), "invalid");
    await rejects(repo.tasks.update("t-undated-time", {}), "not-found");
    expect(await repo.tasks.get("t-ui-design")).toEqual(before);
    expect(await block(repo, "ui-design")).toMatchObject({ start: "2026-10-13T14:00:00+03:30" });
  });
});

describe("mock tasks · done, reorder, remove, restore, bulk", () => {
  it("setDone completes and reopens a task and cascades to its block", async () => {
    const repo = createMockRepositories();
    const done = await repo.tasks.setDone("t-ui-design", true);
    expect(done).toMatchObject({ status: "done", completedAt: "2026-10-13T14:35:00+03:30" });
    expect((await repo.blocks.listForDay(today)).find((item) => item.id === "ui-design")?.done).toBe(true);
    const reopened = await repo.tasks.setDone("t-ui-design", false);
    expect(reopened.status).toBe("open");
    expect(reopened.completedAt).toBeUndefined();
    expect((await repo.blocks.listForDay(today)).find((item) => item.id === "ui-design")?.done).toBe(false);
    await rejects(repo.tasks.setDone("nope", true), "not-found");
  });

  it("a task without a block just changes status", async () => {
    const repo = createMockRepositories();
    expect((await repo.tasks.setDone("t-plan-weekend-trip", true)).status).toBe("done");
  });

  it("reorder gives unordered tasks ascending order after every ordered one", async () => {
    const repo = createMockRepositories({ fixtures: { tasks: [task("a"), task("b"), task("c"), task("d", { order: 7 })] } });
    await repo.tasks.reorder({ ids: ["c", "a", "b"] });
    const orders = Object.fromEntries((await repo.tasks.list()).map((item) => [item.id, item.order]));
    expect(orders).toEqual({ a: 9, b: 10, c: 8, d: 7 });
    expect(ids(await repo.tasks.list({ view: "all", sort: "manual" }))).toEqual(["d", "c", "a", "b"]);
  });

  it("reorder reuses the same slots when every task is ordered", async () => {
    const repo = createMockRepositories({
      fixtures: { tasks: [task("a", { order: 1 }), task("b", { order: 5 }), task("c", { order: 9 }), task("z", { order: 6 })] },
    });
    await repo.tasks.reorder({ ids: ["c", "a", "b"] });
    const orders = Object.fromEntries((await repo.tasks.list()).map((item) => [item.id, item.order]));
    expect(orders).toEqual({ c: 1, a: 5, b: 9, z: 6 });
    await rejects(repo.tasks.reorder({ ids: ["a", "a"] }), "invalid");
    await rejects(repo.tasks.reorder({ ids: ["a", "ghost"] }), "not-found");
  });

  it("remove deletes tasks with their blocks and restore puts both back", async () => {
    const repo = createMockRepositories();
    const before = await repo.tasks.list({ view: "all" });
    const blocksBefore = await repo.blocks.listForDay(today);
    const { restore } = await repo.tasks.remove(["t-ui-design", "t-deep-work", "t-sort-photo-backups"]);
    expect(await repo.tasks.get("t-ui-design")).toBeNull();
    expect((await repo.blocks.listForDay(today)).map((item) => item.id)).not.toContain("ui-design");
    expect(await repo.tasks.counts()).toMatchObject({ all: 25 });
    await repo.tasks.restore(restore);
    expect(await repo.tasks.list({ view: "all" })).toEqual(before);
    expect(await repo.blocks.listForDay(today)).toEqual(blocksBefore);
    // Restoring twice adds nothing.
    await repo.tasks.restore(restore);
    expect(await repo.tasks.counts()).toMatchObject({ all: 28 });
  });

  it("remove rejects unknown ids and deletes nothing", async () => {
    const repo = createMockRepositories();
    await rejects(repo.tasks.remove(["t-ui-design", "ghost"]), "not-found");
    expect(await repo.tasks.get("t-ui-design")).not.toBeNull();
  });

  it("removed tasks drop out of the day's priorities and return with a restore", async () => {
    const repo = createMockRepositories();
    const { restore } = await repo.tasks.remove(["t-ui-design"]);
    expect((await repo.plan.priorities(today)).map((item) => item.id)).not.toContain("t-ui-design");
    await repo.tasks.restore(restore);
    expect((await repo.plan.priorities(today))[0]?.id).toBe("t-ui-design");
  });

  it("bulkUpdate applies one patch to every task, all or nothing", async () => {
    const repo = createMockRepositories();
    const updated = await repo.tasks.bulkUpdate(["t-review-october-expenses", "t-plan-weekend-trip"], { priority: "urgent", date: tomorrow });
    expect(updated.map((item) => [item.priority, item.date])).toEqual([
      ["urgent", tomorrow],
      ["urgent", tomorrow],
    ]);
    // 23:30 does not fit the 2h block of UI design, so the whole batch is refused.
    const before = await repo.tasks.get("t-ui-design");
    await rejects(repo.tasks.bulkUpdate(["t-water-plants", "t-ui-design"], { time: "23:30" }), "invalid");
    expect(await repo.tasks.get("t-ui-design")).toEqual(before);
    expect((await repo.tasks.get("t-water-plants"))?.time).toBe("10:30");
    await rejects(repo.tasks.bulkUpdate(["t-water-plants", "ghost"], { priority: "low" }), "not-found");
    expect((await repo.tasks.get("t-water-plants"))?.priority).toBeNull();
  });

  it("completing yesterday's overdue task keeps views consistent", async () => {
    const repo = createMockRepositories();
    await repo.tasks.setDone("t-pay-electricity-bill", true);
    expect(await repo.tasks.counts()).toMatchObject({ today: 8, completed: 10 });
    expect((await repo.tasks.get("t-pay-electricity-bill"))?.date).toBe(yesterday);
  });
});
