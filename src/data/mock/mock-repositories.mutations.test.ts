import { describe, expect, it } from "vitest";
import type { Task } from "@/data/domain";
import { personalFixtures, sampleDays } from "@/fixtures/personal";
import { RepositoryError } from "../repositories";
import { createMockRepositories } from "./mock-repositories";

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

describe("mock unscheduled tasks (My Day card)", () => {
  const { tasks } = createMockRepositories();

  it("today: the board's four rows, overdue first", async () => {
    const today = await tasks.listUnscheduled({ day: sampleDays.today, range: "today" });
    expect(today.map((item) => item.title)).toEqual([
      "Pay electricity bill",
      "Reply to Katy’s brief",
      "Review October expenses",
      "Plan weekend trip",
    ]);
    expect(today.reduce((sum, item) => sum + (item.durationMinutes ?? 0), 0)).toBe(10 + 20 + 30 + 65);
  });

  it("overdue is dated before the day; week runs after it to the end of the Saturday-first week", async () => {
    expect(ids(await tasks.listUnscheduled({ day: sampleDays.today, range: "overdue" }))).toEqual(["t-pay-electricity-bill"]);
    // Tue 13 → the week ends Fri 16: Thursday's insurance and Wednesday's dentist call are in it.
    expect(ids(await tasks.listUnscheduled({ day: sampleDays.today, range: "week" }))).toEqual([
      "t-renew-car-insurance",
      "t-call-dentist",
    ]);
  });

  it("leaves out tasks that carry a time and tasks with a block that day", async () => {
    const all = ids(await tasks.listUnscheduled({ day: sampleDays.today, range: "today" }));
    expect(all).not.toContain("t-check-in-notes");
    expect(all).not.toContain("t-ui-design");
  });

  it("week follows the config's first day", async () => {
    const week = { weekStartsOn: 0 as const, workDays: [0, 1, 2, 3, 4] as const, halfDays: [], weekendDays: [5, 6] as const };
    const repo = createMockRepositories({
      fixtures: { tasks: [task("sat", { date: "2026-10-17" }), task("next-sun", { date: "2026-10-25" })] },
    });
    // A Sunday-first week containing Tue 13 ends Sat 17.
    expect(ids(await repo.tasks.listUnscheduled({ day: sampleDays.today, range: "week", week }))).toEqual(["sat"]);
  });

  it("orders by priority, then deadline, then title", async () => {
    const repo = createMockRepositories({
      fixtures: {
        today: "2026-01-01",
        tasks: [
          task("b-late", { date: "2026-01-01", priority: "high", deadline: "2026-01-09", title: "B" }),
          task("a-none", { date: "2026-01-01", priority: "high", title: "A" }),
          task("c-soon", { date: "2026-01-01", priority: "high", deadline: "2026-01-02", title: "C" }),
          task("urgent", { date: "2026-01-01", priority: "urgent", title: "Z" }),
        ],
      },
    });
    expect(ids(await repo.tasks.listUnscheduled({ day: "2026-01-01", range: "today" }))).toEqual([
      "urgent",
      "c-soon",
      "b-late",
      "a-none",
    ]);
  });
});

describe("mock blocks mutations", () => {
  it("schedule creates a task block and syncs the task", async () => {
    const repo = createMockRepositories();
    const block = await repo.blocks.schedule("t-review-october-expenses", { day: sampleDays.today, start: "18:30" });
    expect(block).toMatchObject({
      title: "Review October expenses",
      kind: "task",
      taskId: "t-review-october-expenses",
      start: "2026-10-13T18:30:00+03:30",
      end: "2026-10-13T19:00:00+03:30",
    });
    expect(await repo.tasks.get("t-review-october-expenses")).toMatchObject({
      date: sampleDays.today,
      time: "18:30",
      durationMinutes: 30,
    });
    expect(ids(await repo.blocks.listForDay(sampleDays.today)).at(-1)).toBe(block.id);
    expect(ids(await repo.tasks.listUnscheduled({ day: sampleDays.today, range: "today" }))).not.toContain(
      "t-review-october-expenses",
    );
  });

  it("moves an existing task block instead of duplicating it, across days", async () => {
    const repo = createMockRepositories();
    const first = await repo.blocks.schedule("t-plan-weekend-trip", { day: sampleDays.today, start: "18:30" });
    const second = await repo.blocks.schedule("t-plan-weekend-trip", {
      day: sampleDays.tomorrow,
      start: "09:00",
      durationMinutes: 45,
    });
    expect(second.id).toBe(first.id);
    expect(ids(await repo.blocks.listForDay(sampleDays.today))).not.toContain(first.id);
    expect(ids(await repo.blocks.listForDay(sampleDays.tomorrow))).toContain(first.id);
    expect(await repo.tasks.get("t-plan-weekend-trip")).toMatchObject({
      date: sampleDays.tomorrow,
      time: "09:00",
      durationMinutes: 45,
    });
  });

  it("rejects unknown tasks and placements that leave the day, leaving nothing behind", async () => {
    const repo = createMockRepositories();
    await expect(repo.blocks.schedule("t-nope", { day: sampleDays.today, start: "10:00" })).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(repo.blocks.schedule("t-plan-weekend-trip", { day: sampleDays.today, start: "23:30" })).rejects.toMatchObject({
      code: "invalid",
    });
    await expect(repo.blocks.schedule("t-plan-weekend-trip", { day: sampleDays.today, start: "25:00" })).rejects.toBeInstanceOf(
      RepositoryError,
    );
    expect(await repo.blocks.listForDay(sampleDays.today)).toHaveLength(7);
    expect((await repo.tasks.get("t-plan-weekend-trip"))?.time).toBeNull();
  });

  it("move shifts and resizes any block; task blocks sync their task", async () => {
    const repo = createMockRepositories();
    const moved = await repo.blocks.move("ui-design", { day: sampleDays.today, start: "18:30", durationMinutes: 90 });
    expect(moved).toMatchObject({ start: "2026-10-13T18:30:00+03:30", end: "2026-10-13T20:00:00+03:30" });
    expect(await repo.tasks.get("t-ui-design")).toMatchObject({ time: "18:30", durationMinutes: 90 });

    // An event keeps its length when none is given.
    const call = await repo.blocks.move("client-call", { day: sampleDays.tomorrow, start: "10:00" });
    expect(call).toMatchObject({ start: "2026-10-14T10:00:00+03:30", end: "2026-10-14T10:30:00+03:30" });
    await expect(repo.blocks.move("nope", { day: sampleDays.today, start: "10:00" })).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("a block can end exactly at midnight and stays on its own day", async () => {
    const repo = createMockRepositories();
    const block = await repo.blocks.move("gym", { day: sampleDays.today, start: "23:00", durationMinutes: 60 });
    expect(block.end).toBe("2026-10-14T00:00:00+03:30");
    expect(ids(await repo.blocks.listForDay(sampleDays.tomorrow))).not.toContain("gym");
  });

  it("unschedule removes a task block and keeps the task's date; other kinds are refused", async () => {
    const repo = createMockRepositories();
    await repo.blocks.unschedule("ui-design");
    expect(ids(await repo.blocks.listForDay(sampleDays.today))).not.toContain("ui-design");
    expect(await repo.tasks.get("t-ui-design")).toMatchObject({ date: sampleDays.today, time: null });
    expect(ids(await repo.tasks.listUnscheduled({ day: sampleDays.today, range: "today" }))).toContain("t-ui-design");
    await expect(repo.blocks.unschedule("client-call")).rejects.toMatchObject({ code: "forbidden" });
    await expect(repo.blocks.unschedule("lunch")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("setDone cascades to the task with the planner clock, and undoing clears it", async () => {
    const repo = createMockRepositories();
    const done = await repo.blocks.setDone("ui-design", true);
    expect(done.done).toBe(true);
    expect(await repo.tasks.get("t-ui-design")).toMatchObject({
      status: "done",
      completedAt: "2026-10-13T14:35:00+03:30",
    });
    await repo.blocks.setDone("ui-design", false);
    const reopened = await repo.tasks.get("t-ui-design");
    expect(reopened?.status).toBe("open");
    expect(reopened?.completedAt).toBeUndefined();
    // An event has no task to cascade to.
    expect((await repo.blocks.setDone("client-call", true)).done).toBe(true);
  });

  it("stores are per instance: one adapter's changes never reach another or the fixtures", async () => {
    const one = createMockRepositories();
    const two = createMockRepositories();
    await one.blocks.setDone("ui-design", true);
    await one.blocks.unschedule("ui-design");
    const other = await two.blocks.listForDay(sampleDays.today);
    expect(ids(other)).toContain("ui-design");
    expect(other.find((block) => block.id === "ui-design")?.done).toBeUndefined();
    expect(personalFixtures.blocks.find((block) => block.id === "ui-design")?.done).toBeUndefined();
    expect(personalFixtures.tasks.find((item) => item.id === "t-ui-design")?.time).toBe("14:00");
  });

  it("completion stamps follow a fixture `today`", async () => {
    const repo = createMockRepositories({
      fixtures: {
        today: "2026-01-05",
        tasks: [task("t", { date: "2026-01-05", time: "10:00", durationMinutes: 30 })],
        blocks: [
          { id: "b", title: "T", start: "2026-01-05T10:00:00+03:30", end: "2026-01-05T10:30:00+03:30", scope: "personal", kind: "task", taskId: "t" },
        ],
      },
    });
    await repo.blocks.setDone("b", true);
    expect((await repo.tasks.get("t"))?.completedAt).toBe("2026-01-05T14:35:00+03:30");
  });
});

describe("mock plan repository", () => {
  it("resolves the board's three priorities", async () => {
    const { plan } = createMockRepositories();
    expect(await plan.priorities(sampleDays.today)).toEqual([
      { rank: 1, kind: "task", id: "t-ui-design", title: "UI design · My Day screen", scope: "personal", time: "14:00", durationMinutes: 120, energy: "high" },
      { rank: 2, kind: "block", id: "gym", title: "Gym", scope: "personal", time: "17:15", durationMinutes: 60, energy: "medium" },
      { rank: 3, kind: "task", id: "t-review-october-expenses", title: "Review October expenses", scope: "personal", time: null, durationMinutes: 30, energy: "medium" },
    ]);
    expect(await plan.priorities(sampleDays.tomorrow)).toEqual([]);
  });

  it("setPriorities replaces, validates and follows later changes", async () => {
    const repo = createMockRepositories();
    const saved = await repo.plan.setPriorities(sampleDays.tomorrow, [
      { kind: "task", id: "t-call-dentist" },
      { kind: "block", id: "finish-finance-report" },
    ]);
    expect(saved.map((item) => item.rank)).toEqual([1, 2]);
    await repo.blocks.move("finish-finance-report", { day: sampleDays.tomorrow, start: "13:00" });
    expect((await repo.plan.priorities(sampleDays.tomorrow))[1]?.time).toBe("13:00");

    await expect(repo.plan.setPriorities(sampleDays.today, [])).resolves.toEqual([]);
    const four = ["t-ui-design", "t-call-dentist", "t-plan-weekend-trip", "t-deep-work"].map((id) => ({ kind: "task" as const, id }));
    await expect(repo.plan.setPriorities(sampleDays.today, four)).rejects.toMatchObject({ code: "invalid" });
    await expect(
      repo.plan.setPriorities(sampleDays.today, [
        { kind: "task", id: "t-ui-design" },
        { kind: "task", id: "t-ui-design" },
      ]),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(repo.plan.setPriorities(sampleDays.today, [{ kind: "task", id: "nope" }])).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("reports the day's focus sessions, none on other days", async () => {
    const { plan } = createMockRepositories();
    expect(await plan.focusToday(sampleDays.today)).toEqual({ sessionsCompleted: 2, cycle: 1 });
    expect(await plan.focusToday(sampleDays.tomorrow)).toEqual({ sessionsCompleted: 0, cycle: 1 });
  });

  it("records finished focus cycles on the day and rejects bad input", async () => {
    const { plan } = createMockRepositories();
    expect(await plan.recordFocusSessions(sampleDays.today, { count: 2, cycle: 3 })).toEqual({ sessionsCompleted: 4, cycle: 3 });
    expect(await plan.focusToday(sampleDays.today)).toEqual({ sessionsCompleted: 4, cycle: 3 });
    expect(await plan.recordFocusSessions(sampleDays.tomorrow, { count: 1, cycle: 2 })).toEqual({ sessionsCompleted: 1, cycle: 2 });
    await expect(plan.recordFocusSessions(sampleDays.today, { count: 0, cycle: 1 })).rejects.toMatchObject({ code: "invalid" });
    await expect(plan.recordFocusSessions("nope", { count: 1, cycle: 1 })).rejects.toMatchObject({ code: "invalid" });
  });
});
