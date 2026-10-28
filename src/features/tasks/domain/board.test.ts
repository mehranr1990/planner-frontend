import { describe, expect, it } from "vitest";
import type { Task } from "@/data/domain";
import { boardIds, boardTomorrow, buildBoard, columnDefaults, overloadMinutes, planBoardDrop } from "./board";

const WORK = { start: "09:00", end: "17:00" };
const TUE = "2026-10-20";
const THU = "2026-10-22";

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

const ids = (items: readonly { id: string }[]) => items.map((item) => item.id);

const tasks = [
  task("late", { date: "2026-10-18", durationMinutes: 10 }),
  task("today", { date: TUE, time: "14:00", durationMinutes: 120 }),
  task("tomorrow", { date: "2026-10-21", durationMinutes: 30 }),
  task("thu", { date: THU }),
  task("fri", { date: "2026-10-23" }),
  task("next", { date: "2026-10-27" }),
  task("someday"),
  task("doneToday", { date: TUE, status: "done", completedAt: "2026-10-20T08:00:00Z" }),
  task("doneOld", { date: "2026-10-18", status: "done", completedAt: "2026-10-18T08:00:00Z" }),
];

describe("board horizon", () => {
  const model = buildBoard(tasks, { mode: "horizon", day: TUE, workHours: WORK });
  const column = (id: string) => model.columns.find((item) => item.id === id)!;

  it("sorts tasks into Today (overdue pinned) · Tomorrow · This week · Later + Done today", () => {
    expect(ids(column("today").overdue)).toEqual(["late"]);
    expect(ids(column("today").tasks)).toEqual(["today"]);
    expect(column("today")).toMatchObject({ count: 2, totalMinutes: 130, capacityMinutes: 480 });
    expect(ids(column("tomorrow").tasks)).toEqual(["tomorrow"]);
    expect(ids(column("week").tasks)).toEqual(["thu", "fri"]);
    expect(column("week")).toMatchObject({ day: THU, untilDay: THU });
    expect(ids(column("later").tasks)).toEqual(["next", "someday"]);
    expect(ids(model.done.tasks)).toEqual(["doneToday"]);
    expect(boardIds(model, false)).toEqual(["late", "today", "tomorrow", "thu", "fri", "next", "someday"]);
  });

  it("Tomorrow on a Thursday skips Friday to Saturday", () => {
    expect(boardTomorrow(TUE)).toBe("2026-10-21");
    expect(boardTomorrow(THU)).toBe("2026-10-24");
    const thursday = buildBoard(tasks, { mode: "horizon", day: THU, workHours: WORK });
    const tomorrow = thursday.columns.find((item) => item.id === "tomorrow")!;
    expect(tomorrow.day).toBe("2026-10-24");
    expect(tomorrow.capacityMinutes).toBe(480);
    const drop = planBoardDrop({ taskId: "someday", model: thursday, target: { columnId: "tomorrow", index: 0 }, day: THU, workHours: WORK });
    expect(drop).toEqual({ kind: "move", id: "someday", patch: { date: "2026-10-24" } });
    // No working day left this week: This week takes no drop.
    expect(planBoardDrop({ taskId: "someday", model: thursday, target: { columnId: "week", index: 0 }, day: THU, workHours: WORK })).toEqual({
      kind: "none",
      reason: "closed",
    });
  });

  it("plans drops: reschedule keeps the time, Later clears the date, Done completes, same column reorders", () => {
    const plan = (taskId: string, columnId: string, index = 0) => planBoardDrop({ taskId, model, target: { columnId, index }, day: TUE, workHours: WORK });
    expect(plan("today", "tomorrow")).toEqual({ kind: "move", id: "today", patch: { date: "2026-10-21" } });
    expect(plan("late", "today")).toEqual({ kind: "move", id: "late", patch: { date: TUE } });
    expect(plan("tomorrow", "later")).toEqual({ kind: "move", id: "tomorrow", patch: { date: null } });
    expect(plan("thu", "done")).toEqual({ kind: "complete", id: "thu" });
    expect(plan("fri", "week", 0)).toEqual({ kind: "reorder", ids: ["fri", "thu"] });
    expect(plan("thu", "week", 0)).toEqual({ kind: "none", reason: "unchanged" });
    expect(plan("missing", "week")).toEqual({ kind: "none", reason: "unknown" });
  });

  it("measures overload against capacity", () => {
    expect(overloadMinutes({ totalMinutes: 550, capacityMinutes: 420 })).toBe(130);
    expect(overloadMinutes({ totalMinutes: 100, capacityMinutes: 420 })).toBe(0);
    expect(overloadMinutes({ totalMinutes: 100 })).toBe(0);
  });
});

describe("board time of day and status", () => {
  it("groups today's tasks by window and sets a window time on drop", () => {
    const model = buildBoard(tasks, { mode: "time", day: TUE, workHours: WORK });
    expect(ids(model.columns.find((item) => item.id === "morning")!.overdue)).toEqual(["late"]);
    expect(ids(model.columns.find((item) => item.id === "afternoon")!.tasks)).toEqual(["today"]);
    expect(planBoardDrop({ taskId: "today", model, target: { columnId: "evening", index: 0 }, day: TUE, workHours: WORK })).toEqual({
      kind: "move",
      id: "today",
      patch: { time: "18:00" },
    });
    expect(planBoardDrop({ taskId: "late", model, target: { columnId: "unscheduled", index: 0 }, day: TUE, workHours: WORK })).toEqual({
      kind: "move",
      id: "late",
      patch: { date: TUE },
    });
  });

  it("plans and unplans by status", () => {
    const model = buildBoard(tasks, { mode: "status", day: TUE, workHours: WORK });
    expect(ids(model.columns.find((item) => item.id === "planned")!.tasks)).toEqual(["today"]);
    expect(planBoardDrop({ taskId: "today", model, target: { columnId: "todo", index: 0 }, day: TUE, workHours: WORK })).toEqual({
      kind: "move",
      id: "today",
      patch: { time: null },
    });
    expect(planBoardDrop({ taskId: "someday", model, target: { columnId: "planned", index: 0 }, day: TUE, workHours: WORK })).toEqual({
      kind: "move",
      id: "someday",
      patch: { time: "09:00", date: TUE },
    });
  });
});

describe("column defaults", () => {
  it("gives an added task the column's day and window", () => {
    const horizon = buildBoard([], { mode: "horizon", day: TUE, workHours: WORK });
    const time = buildBoard([], { mode: "time", day: TUE, workHours: WORK });
    expect(columnDefaults(horizon.columns[1]!, TUE, WORK)).toEqual({ date: "2026-10-21", time: null });
    expect(columnDefaults(horizon.columns[3]!, TUE, WORK)).toEqual({ date: null, time: null });
    expect(columnDefaults(time.columns[2]!, TUE, WORK)).toEqual({ date: TUE, time: "18:00" });
    expect(columnDefaults(horizon.done, TUE, WORK)).toBeNull();
  });
});
