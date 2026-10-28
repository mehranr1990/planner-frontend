import { describe, expect, it } from "vitest";
import type { Task } from "@/data/domain";
import { sortTasks, filterTasks } from "@/data/task-query";
import { personalFixtures, sampleDays } from "@/fixtures/personal";
import { IRAN_WEEK } from "@/lib/dates/week";
import { dayCapacityMinutes, groupedIds, groupTasks, relativeDay } from "./group";
import { defaultTimeForWindow, timeInWindow, timeWindowOf, windowOfMinutes, windowOfTime } from "./time-of-day";

const { today, tomorrow, yesterday, friday } = sampleDays;
const WORK = { start: "09:00", end: "17:00" };

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

/** A view of the sample fixtures, sorted the way the list asks for it. */
function view(tab: "today" | "upcoming" | "all" | "completed"): Task[] {
  return sortTasks(filterTasks(personalFixtures.tasks, { view: tab, day: today }, { today }), "smart", today, tab);
}

describe("time-of-day windows", () => {
  it("Morning is before 12:00, Afternoon 12:00 to 17:00, Evening after 17:00", () => {
    expect(windowOfMinutes(11 * 60 + 59)).toBe("morning");
    expect(windowOfMinutes(12 * 60)).toBe("afternoon");
    expect(windowOfMinutes(17 * 60)).toBe("afternoon");
    expect(windowOfMinutes(17 * 60 + 1)).toBe("evening");
    expect(windowOfTime(null)).toBeNull();
    expect(windowOfTime("bad")).toBeNull();
    expect(timeInWindow("09:00", "morning")).toBe(true);
    expect(timeInWindow("09:00", "evening")).toBe(false);
  });

  it("puts an open task dated before the day in Overdue, whatever its time", () => {
    expect(timeWindowOf(task("a", { date: yesterday, time: "09:00" }), today)).toBe("overdue");
    expect(timeWindowOf(task("b", { date: yesterday, time: "09:00", status: "done" }), today)).toBe("morning");
    expect(timeWindowOf(task("c", { date: today }), today)).toBe("unscheduled");
    expect(timeWindowOf(task("d"), today)).toBe("unscheduled");
  });

  it("drops into a window at 09:00 / 14:00 / 18:00, following the work hours", () => {
    expect(defaultTimeForWindow("morning", WORK)).toBe("09:00");
    expect(defaultTimeForWindow("afternoon", WORK)).toBe("14:00");
    expect(defaultTimeForWindow("evening", WORK)).toBe("18:00");
    expect(defaultTimeForWindow("morning", { start: "08:30", end: "20:00" })).toBe("08:30");
    expect(defaultTimeForWindow("evening", { start: "08:30", end: "20:00" })).toBe("20:00");
    expect(defaultTimeForWindow("morning", { start: "13:00", end: "21:00" })).toBe("09:00");
  });
});

describe("relativeDay", () => {
  it("names yesterday, today and tomorrow only", () => {
    expect(relativeDay(yesterday, today)).toBe("yesterday");
    expect(relativeDay(today, today)).toBe("today");
    expect(relativeDay(tomorrow, today)).toBe("tomorrow");
    expect(relativeDay(friday, today)).toBeNull();
  });
});

describe("groupTasks · time of day (the Today list)", () => {
  const groups = groupTasks(view("today"), { mode: "time", day: today });

  it("runs Overdue, Morning, Afternoon, Evening, Unscheduled and omits empty groups", () => {
    expect(groups.map((group) => group.id)).toEqual(["overdue", "morning", "afternoon", "evening", "unscheduled"]);
    expect(groups.map((group) => group.count)).toEqual([1, 2, 2, 1, 3]);
    expect(ids(groups[0]!.tasks)).toEqual(["t-pay-electricity-bill"]);
    expect(ids(groups[1]!.tasks)).toEqual(["t-deep-work", "t-water-plants"]);
    expect(ids(groups[2]!.tasks)).toEqual(["t-ui-design", "t-check-in-notes"]);
    expect(ids(groups[3]!.tasks)).toEqual(["t-read-30-pages"]);
  });

  it("counts done tasks but sums only open durations", () => {
    const morning = groups[1]!;
    expect(morning).toMatchObject({ openCount: 0, doneCount: 2, totalMinutes: 0, doneMinutes: 125 });
    const afternoon = groups[2]!;
    expect(afternoon).toMatchObject({ openCount: 2, totalMinutes: 165 });
    expect(groups[4]).toMatchObject({ totalMinutes: 20 + 30 + 65 });
  });

  it("leaves a window out when nothing is in it", () => {
    const only = groupTasks([task("x", { date: today, time: "09:00" })], { mode: "time", day: today });
    expect(only.map((group) => group.id)).toEqual(["morning"]);
    expect(groupTasks([], { mode: "time", day: today })).toEqual([]);
  });

  it("lists the ids in the order rows appear", () => {
    expect(groupedIds(groups)).toHaveLength(9);
    expect(groupedIds(groups)[0]).toBe("t-pay-electricity-bill");
  });
});

describe("groupTasks · date (the Upcoming list)", () => {
  const groups = groupTasks(view("upcoming"), {
    mode: "date",
    day: today,
    week: IRAN_WEEK,
    workHours: WORK,
    weekendMarkers: true,
  });

  it("groups by day with Tomorrow first, a Friday weekend header and a later day after it", () => {
    expect(groups.map((group) => group.id)).toEqual([
      "date:2026-10-14",
      "date:2026-10-15",
      "date:2026-10-16",
      "date:2026-10-17",
    ]);
    expect(groups[0]).toMatchObject({ label: { type: "date", day: tomorrow, relative: "tomorrow" }, count: 4, totalMinutes: 40 + 90 + 20 + 10 });
    expect(groups[1]).toMatchObject({ count: 2, weekend: false });
    expect(ids(groups[1]!.tasks)).toEqual(["t-haircut", "t-renew-car-insurance"]);
  });

  it("marks the empty Friday as weekend with no capacity, and gives work days capacity", () => {
    expect(groups[2]).toMatchObject({ day: friday, weekend: true, count: 0, capacityMinutes: 0 });
    expect(groups[0]!.capacityMinutes).toBe(480);
    // Thursday is a half day in Iran.
    expect(groups[1]!.capacityMinutes).toBe(240);
    expect(groups[3]).toMatchObject({ label: { type: "date", day: "2026-10-17", relative: null } });
  });

  it("adds no markers without the option, or when there is nothing to list", () => {
    const plain = groupTasks(view("upcoming"), { mode: "date", day: today });
    expect(plain.map((group) => group.day)).toEqual([tomorrow, "2026-10-15", "2026-10-17"]);
    expect(groupTasks([], { mode: "date", day: today, weekendMarkers: true })).toEqual([]);
    expect(groups[0]!.capacityMinutes).toBeDefined();
    expect(plain[0]!.capacityMinutes).toBeUndefined();
  });

  it("puts undated tasks last under a no-date group", () => {
    const mixed = groupTasks([task("u"), task("d", { date: tomorrow })], { mode: "date", day: today });
    expect(mixed.map((group) => group.id)).toEqual(["date:2026-10-14", "date:none"]);
    expect(mixed[1]).toMatchObject({ day: null, label: { type: "date", day: null, relative: null } });
  });

  it("dayCapacityMinutes follows the week config and the work hours", () => {
    expect(dayCapacityMinutes(tomorrow, IRAN_WEEK, WORK)).toBe(480);
    expect(dayCapacityMinutes(friday, IRAN_WEEK, WORK)).toBe(0);
    expect(dayCapacityMinutes(tomorrow, IRAN_WEEK, { start: "10:00", end: "09:00" })).toBe(0);
  });
});

describe("groupTasks · date for the Completed list", () => {
  const groups = groupTasks(view("completed"), { mode: "date", day: today, basis: "completed" });

  it("groups by completion day, newest first: Today 2, Yesterday 4, then earlier days", () => {
    expect(groups.map((group) => [group.day, group.count])).toEqual([
      [today, 2],
      [yesterday, 4],
      [sampleDays.sunday, 2],
      [sampleDays.saturday, 1],
    ]);
    expect(groups[0]!.label).toEqual({ type: "date", day: today, relative: "today" });
    expect(groups[1]!.label).toEqual({ type: "date", day: yesterday, relative: "yesterday" });
    expect(ids(groups[0]!.tasks)).toEqual(["t-deep-work", "t-water-plants"]);
  });

  it("collapses days older than a week by default", () => {
    const old = groupTasks([task("o", { status: "done", completedAt: "2026-09-20T10:00:00+03:30" })], {
      mode: "date",
      day: today,
      basis: "completed",
    });
    expect(old[0]!.collapsedByDefault).toBe(true);
    expect(groups.every((group) => !group.collapsedByDefault)).toBe(true);
  });
});

describe("groupTasks · area, priority, none", () => {
  const all = view("all");

  it("area: by name, then context fallbacks, then no area", () => {
    const groups = groupTasks(all, { mode: "area", day: today });
    expect(groups.map((group) => group.id)).toEqual([
      "area:finance",
      "area:health",
      "area:home",
      "area:learning",
      "area:personal",
      "area:social",
      "scope:project",
    ]);
    expect(groups.find((group) => group.id === "scope:project")).toMatchObject({
      label: { type: "scope", scope: "project" },
      count: 2,
      area: null,
      scope: "project",
    });
    const noArea = groupTasks([task("n")], { mode: "area", day: today });
    expect(noArea[0]).toMatchObject({ id: "area:none", label: { type: "area", area: null } });
  });

  it("priority: urgent to low, then none", () => {
    const groups = groupTasks(all, { mode: "priority", day: today });
    expect(groups.map((group) => group.id)).toEqual(["priority:urgent", "priority:high", "priority:medium", "priority:low", "priority:none"]);
    expect(groups[0]!.priority).toBe("urgent");
  });

  it("none: one group of everything, absent when empty", () => {
    const groups = groupTasks(all, { mode: "none", day: today });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: "all", kind: "none", count: all.length });
    expect(groupTasks([], { mode: "none", day: today })).toEqual([]);
  });
});
