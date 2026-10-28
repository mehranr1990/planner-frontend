import { describe, expect, it } from "vitest";
import type { Goal, Habit, MoodEntry, Task } from "@/data/domain";
import { IRAN_WEEK } from "@/lib/dates/week";
import {
  averageMood,
  carryCounts,
  focusMinutes,
  goalsWeek,
  habitsWeek,
  moodLevel,
  nextWeekPlan,
  reviewAvailability,
  reviewWeekDays,
  storyTone,
  suggestWins,
  weekTasks,
} from "./weekly";

// Sat 18 Mehr 1405 = 2026-10-10 … Fri 24 Mehr = 2026-10-16; today Tue 2026-10-13.
const DAYS = reviewWeekDays("1405-07-18", IRAN_WEEK)!;
const TODAY = "2026-10-13";

const task = (id: string, extra: Partial<Task>): Task => ({
  id,
  title: id,
  scope: "personal",
  priority: null,
  energy: null,
  durationMinutes: 60,
  date: null,
  time: null,
  status: "open",
  ...extra,
});

describe("weekly review domain", () => {
  it("resolves the week from a Jalali param (any day of it) and rejects junk", () => {
    expect(DAYS[0]).toBe("2026-10-10");
    expect(DAYS[6]).toBe("2026-10-16");
    expect(reviewWeekDays("1405-07-21", IRAN_WEEK)).toEqual(DAYS);
    expect(reviewWeekDays("nope", IRAN_WEEK)).toBeNull();
  });

  it("unlocks after three days and otherwise names the review day", () => {
    expect(reviewAvailability(DAYS, TODAY, 4)).toEqual({ status: "open" });
    expect(reviewAvailability(DAYS, "2026-10-11", 4)).toEqual({ status: "too-early", firstReviewDay: "2026-10-15" });
    expect(reviewAvailability(DAYS, "2026-10-01", 4).status).toBe("too-early");
  });

  it("splits completed and unfinished tasks and folds routes into carry counts", () => {
    const tasks = [
      task("done", { status: "done", completedAt: "2026-10-11T10:00:00+03:30", date: "2026-10-11" }),
      task("old-done", { status: "done", completedAt: "2026-10-01T10:00:00+03:30" }),
      task("open-a", { date: "2026-10-12" }),
      task("open-b", { date: "2026-10-13" }),
      task("future", { date: "2026-10-15" }),
    ];
    const { completed, unfinished } = weekTasks(tasks, DAYS, TODAY);
    expect(completed.map((t) => t.id)).toEqual(["done"]);
    expect(unfinished.map((t) => t.id)).toEqual(["open-a", "open-b"]);
    expect(carryCounts(1, unfinished, { "open-a": { to: "this-week" } })).toEqual({
      planned: 3,
      completed: 1,
      moved: 1,
      overdue: 1,
      inbox: 0,
      dropped: 0,
    });
  });

  it("reduces habits, mood and focus to plain numbers", () => {
    const habit = (id: string, doneDays: string[]): Habit => ({ id, title: id, pinned: false, doneDays, restWeekdays: [] });
    const week = habitsWeek([habit("a", DAYS.slice(0, 4)), habit("b", [DAYS[0]!])], DAYS, TODAY);
    expect(week).toMatchObject({ kept: 1, total: 2 });
    expect(week.rate).toBeCloseTo(5 / 7);
    const moods = [3, 4, 5].map((mood, i) => ({ day: DAYS[i]!, mood, energy: "medium", at: "" }) as MoodEntry);
    expect(averageMood(moods, DAYS)).toBe(4);
    expect(averageMood(moods, ["2020-01-01"])).toBeNull();
    expect(moodLevel(3.6)).toBe(4);
    expect(focusMinutes([{ sessionsCompleted: 2, cycle: 1 }, null], 25)).toBe(50);
    expect(storyTone({ doneRatio: 0.9, mood: 4 })).toBe("good");
    expect(storyTone({ doneRatio: 0.2, mood: 2 })).toBe("hard");
    expect(storyTone({ doneRatio: null, mood: null })).toBe("mixed");
  });

  it("suggests milestones and kept streaks before tasks, and measures goal deltas", () => {
    const goal: Goal = {
      id: "g",
      title: "Launch",
      progress: 0.5,
      status: "on-track",
      nextStep: null,
      nextStepDay: null,
      milestones: [
        { id: "m1", title: "Alpha", dueDay: null, doneDay: "2026-10-11" },
        { id: "m2", title: "Beta", dueDay: "2026-12-01", doneDay: null },
      ],
    };
    const streak: Habit = { id: "h", title: "Read", pinned: false, doneDays: DAYS.slice(0, 4), restWeekdays: [] };
    const wins = suggestWins([task("low", { priority: "low" }), task("urgent", { priority: "urgent" })], [goal], [streak], DAYS, TODAY);
    expect(wins.map((win) => win.id)).toEqual(["milestone:m1", "habit:h", "task:urgent", "task:low"]);
    const [row] = goalsWeek([goal], DAYS, TODAY);
    expect(row).toMatchObject({ delta: 0.5, delayed: false });
    expect(row!.next?.id).toBe("m2");
  });

  it("builds next week's strip with Thursday half and Friday off", () => {
    const tasks = [task("planned", { date: "2026-10-17", durationMinutes: 90 }), task("carry", { date: "2026-10-12", durationMinutes: 30 })];
    const plan = nextWeekPlan(DAYS, tasks, { carry: "2026-10-17" }, { workMinutes: 480, defaultDuration: 30, week: IRAN_WEEK });
    expect(plan.map((day) => day.kind)).toEqual(["work", "work", "work", "work", "work", "half", "weekend"]);
    expect(plan[0]).toMatchObject({ day: "2026-10-17", loadMinutes: 120, placed: ["carry"], capacityMinutes: 480 });
    expect(plan[5]!.capacityMinutes).toBe(240);
    expect(plan[6]!.capacityMinutes).toBe(0);
  });
});
