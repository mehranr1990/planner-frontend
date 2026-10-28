import { describe, expect, it } from "vitest";
import type { Task } from "@/data/domain";
import { sampleDays, sampleHabits } from "@/fixtures/personal";
import type { DayBlock } from "@/features/my-day/domain/day-blocks";
import { habitStreak, streakWeek } from "./habits";
import { liveSlot, todayRatio } from "./live-slot";

const read = sampleHabits.find((habit) => habit.id === "h-read")!;

function block(id: string, start: number, end: number, kind: DayBlock["kind"] = "task"): DayBlock {
  return { id, title: id, scope: "personal", kind, done: false, energy: null, priority: null, startMinutes: start, endMinutes: end, durationMinutes: end - start };
}

const task = (id: string, durationMinutes: number | null) => ({ id, durationMinutes }) as Task;

describe("habit streak", () => {
  it("counts back from yesterday while today is open, skipping rest Fridays (P01: 11 day streak)", () => {
    expect(habitStreak(read, sampleDays.today)).toBe(11);
    expect(habitStreak({ ...read, doneDays: [...read.doneDays, sampleDays.today] }, sampleDays.today)).toBe(12);
    expect(habitStreak({ doneDays: [], restWeekdays: [] }, sampleDays.today)).toBe(0);
  });

  it("lays the week out Saturday → Friday with today open, upcoming days and the rest day", () => {
    expect(streakWeek(read, sampleDays.today).map((day) => day.state)).toEqual([
      "done",
      "done",
      "done",
      "today-open",
      "upcoming",
      "upcoming",
      "rest",
    ]);
  });
});

describe("live slot", () => {
  const base = { blocks: [], taskCount: 5, openToday: 3, unscheduled: [], freeMinutes: 420 };

  it("is first run with no data at all", () => {
    expect(liveSlot({ ...base, taskCount: 0, nowMinutes: 600 })).toEqual({ kind: "first-run" });
  });

  it("is live while a block runs, even in the evening", () => {
    expect(liveSlot({ ...base, blocks: [block("a", 1080, 1200)], nowMinutes: 1100 })).toEqual({ kind: "live" });
  });

  it("suggests shutdown after 18:00 with open tasks, unless dismissed", () => {
    const blocks = [block("a", 600, 660)];
    expect(liveSlot({ ...base, blocks, nowMinutes: 1100 })).toEqual({ kind: "evening", openCount: 3 });
    expect(liveSlot({ ...base, blocks, nowMinutes: 1100, dismissed: new Set(["evening"]) })).toEqual({ kind: "live" });
  });

  it("is morning when nothing is planned yet", () => {
    expect(liveSlot({ ...base, blocks: [block("gym", 1035, 1095, "routine")], nowMinutes: 480 })).toEqual({
      kind: "morning",
      openCount: 3,
      freeMinutes: 420,
    });
  });

  it("offers the first task that fits a free gap", () => {
    const next = block("call", 990, 1020);
    const slot = liveSlot({ ...base, blocks: [block("a", 600, 660), next], nowMinutes: 965, unscheduled: [task("long", 60), task("katy", 20)] });
    expect(slot).toMatchObject({ kind: "gap", gapMinutes: 25, next: { id: "call" }, fit: { id: "katy" } });
  });

  it("weights tasks and habits together for the ring (6/9 + 3/5 = 64%)", () => {
    expect(Math.round(todayRatio({ done: 6, total: 9 }, { done: 3, total: 5 }) * 100)).toBe(64);
    expect(todayRatio({ done: 0, total: 0 }, { done: 0, total: 0 })).toBe(0);
  });
});
