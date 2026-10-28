import { describe, expect, it } from "vitest";
import type { Task } from "@/data/domain";
import { personalFixtures, sampleDays } from "@/fixtures/personal";
import { todayProgress } from "./progress";
import { overdueDays, taskWhen } from "./when";

const { today, yesterday, tomorrow, sunday, friday } = sampleDays;

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

describe("todayProgress", () => {
  it("counts the Today view: dated today plus open overdue, as the Today badge does", () => {
    const progress = todayProgress(personalFixtures.tasks, today);
    expect(progress).toEqual({
      total: 9,
      done: 2,
      open: 7,
      // 10m overdue + 120 + 20 + 45 + 40 + 30 + 65 open minutes
      minutesLeft: 10 + 120 + 20 + 45 + 40 + 30 + 65,
      completedMinutes: 125,
      allDone: false,
    });
  });

  it("reads a six-of-nine day like the board", () => {
    const tasks = Array.from({ length: 9 }, (_, index) =>
      task(`t${index}`, {
        date: today,
        durationMinutes: index < 6 ? 30 : [100, 80, 55][index - 6]!,
        status: index < 6 ? "done" : "open",
      }),
    );
    const progress = todayProgress(tasks, today);
    expect([progress.done, progress.total, progress.minutesLeft]).toEqual([6, 9, 235]); // 3h 55m left
  });

  it("is all done only when something exists and nothing is open; durations may be missing", () => {
    expect(todayProgress([], today).allDone).toBe(false);
    const done = todayProgress([task("a", { date: today, status: "done" })], today);
    expect(done).toMatchObject({ allDone: true, minutesLeft: 0, completedMinutes: 0 });
    expect(todayProgress([task("b", { date: tomorrow })], today).total).toBe(0);
  });
});

describe("taskWhen", () => {
  const ctx = { day: today };

  it("overdue: yesterday by name, a weekday within a week, a date beyond, with the overdue tone", () => {
    expect(taskWhen(task("a", { date: yesterday }), ctx)).toEqual({ kind: "relative", relative: "yesterday", tone: "overdue" });
    expect(taskWhen(task("b", { date: "2026-10-09" }), ctx)).toEqual({ kind: "weekday", day: "2026-10-09", tone: "overdue" });
    expect(taskWhen(task("c", { date: "2026-09-01" }), ctx)).toEqual({ kind: "date", day: "2026-09-01", tone: "overdue" });
  });

  it("today: the time, else Today", () => {
    expect(taskWhen(task("a", { date: today, time: "09:00" }), ctx)).toEqual({ kind: "time", time: "09:00" });
    expect(taskWhen(task("b", { date: today }), ctx)).toEqual({ kind: "relative", relative: "today" });
  });

  it("another day: the time when there is one, else the weekday", () => {
    expect(taskWhen(task("a", { date: tomorrow, time: "09:30" }), ctx)).toEqual({ kind: "time", time: "09:30" });
    expect(taskWhen(task("b", { date: "2026-10-15" }), ctx)).toEqual({ kind: "weekday", day: "2026-10-15" });
    expect(taskWhen(task("c", { date: friday }), ctx)).toEqual({ kind: "weekday", day: friday });
    expect(taskWhen(task("d", { date: "2026-11-20" }), ctx)).toEqual({ kind: "date", day: "2026-11-20" });
    expect(taskWhen(task("e", { date: tomorrow }), ctx)).toEqual({ kind: "relative", relative: "tomorrow" });
    expect(taskWhen(task("f"), ctx)).toEqual({ kind: "none" });
  });

  it("completed rows read their completion day: the time today, the weekday earlier", () => {
    const now = { day: today, basis: "completed" as const };
    expect(taskWhen(task("a", { time: "09:00", date: today, status: "done", completedAt: "2026-10-13T11:00:00+03:30" }), now)).toEqual({
      kind: "time",
      time: "09:00",
    });
    expect(
      taskWhen(task("b", { date: sunday, status: "done", completedAt: "2026-10-12T17:40:00+03:30" }), now),
    ).toEqual({ kind: "relative", relative: "yesterday" });
    expect(taskWhen(task("c", { date: sunday, status: "done", completedAt: "2026-10-11T10:00:00+03:30" }), now)).toEqual({
      kind: "weekday",
      day: sunday,
    });
  });

  it("overdueDays counts whole days past, open tasks only", () => {
    expect(overdueDays(task("a", { date: yesterday }), today)).toBe(1);
    expect(overdueDays(task("b", { date: "2026-10-10" }), today)).toBe(3);
    expect(overdueDays(task("c", { date: yesterday, status: "done" }), today)).toBe(0);
    expect(overdueDays(task("d", { date: today }), today)).toBe(0);
  });
});
