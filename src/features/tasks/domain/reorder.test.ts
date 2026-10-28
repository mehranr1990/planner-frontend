import { describe, expect, it } from "vitest";
import { sortTasks, filterTasks } from "@/data/task-query";
import { personalFixtures, sampleDays } from "@/fixtures/personal";
import { groupTasks, type TaskGroup } from "./group";
import { moveInList, planDrop } from "./reorder";

const { today, tomorrow } = sampleDays;
const WORK = { start: "09:00", end: "17:00" };

function groupsFor(tab: "today" | "upcoming" | "all", mode: Parameters<typeof groupTasks>[1]["mode"]): TaskGroup[] {
  const tasks = sortTasks(filterTasks(personalFixtures.tasks, { view: tab, day: today }, { today }), "smart", today);
  return groupTasks(tasks, { mode, day: today });
}

const plan = (taskId: string, groupId: string, index: number, groups: TaskGroup[], basis?: "completed") =>
  planDrop({ taskId, groups, target: { groupId, index }, day: today, workHours: WORK, ...(basis ? { basis } : {}) });

describe("moveInList", () => {
  it("moves an id to an index counted without it, clamped", () => {
    expect(moveInList(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
    expect(moveInList(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(moveInList(["a", "b", "c"], "b", 99)).toEqual(["a", "c", "b"]);
    expect(moveInList(["a", "b"], "x", 1)).toEqual(["a", "x", "b"]);
  });
});

describe("planDrop · time of day", () => {
  const groups = groupsFor("today", "time");

  it("within a group it is a manual order of the whole group", () => {
    expect(plan("t-review-october-expenses", "unscheduled", 2, groups)).toEqual({
      kind: "reorder",
      ids: ["t-reply-katy-brief", "t-plan-weekend-trip", "t-review-october-expenses"],
    });
  });

  it("dropping where it already is changes nothing", () => {
    expect(plan("t-reply-katy-brief", "unscheduled", 0, groups)).toEqual({ kind: "none", reason: "unchanged" });
  });

  it("into another window sets a time inside it", () => {
    expect(plan("t-ui-design", "evening", 0, groups)).toMatchObject({
      kind: "move",
      id: "t-ui-design",
      patch: { time: "18:00" },
      orderIds: ["t-ui-design", "t-read-30-pages"],
    });
    expect(plan("t-read-30-pages", "morning", 1, groups)).toMatchObject({ patch: { time: "09:00" } });
    expect(plan("t-read-30-pages", "afternoon", 0, groups)).toMatchObject({ patch: { time: "14:00" } });
  });

  it("keeps a time that is already inside the window, changing only the date", () => {
    const late = { ...personalFixtures.tasks.find((item) => item.id === "t-pay-electricity-bill")!, time: "09:30" };
    const rows = groupTasks([late, personalFixtures.tasks.find((item) => item.id === "t-deep-work")!], { mode: "time", day: today });
    expect(rows.map((group) => group.id)).toEqual(["overdue", "morning"]);
    expect(plan(late.id, "morning", 1, rows)).toMatchObject({ kind: "move", patch: { date: today } });
    expect(plan(late.id, "morning", 1, rows)).not.toHaveProperty("patch.time");
  });

  it("an overdue task dropped into a window is moved to today", () => {
    expect(plan("t-pay-electricity-bill", "afternoon", 0, groups)).toMatchObject({
      kind: "move",
      patch: { date: today, time: "14:00" },
    });
  });

  it("into Unscheduled clears the time; Overdue is not a target", () => {
    expect(plan("t-ui-design", "unscheduled", 0, groups)).toMatchObject({ kind: "move", patch: { time: null } });
    expect(plan("t-ui-design", "overdue", 0, groups)).toEqual({ kind: "none", reason: "overdue" });
    expect(plan("t-pay-electricity-bill", "unscheduled", 0, groups)).toMatchObject({ patch: { date: today } });
  });

  it("unknown tasks or groups do nothing; completed rows are not rearranged", () => {
    expect(plan("ghost", "morning", 0, groups)).toEqual({ kind: "none", reason: "unknown" });
    expect(plan("t-ui-design", "nowhere", 0, groups)).toEqual({ kind: "none", reason: "unknown" });
    expect(plan("t-ui-design", "morning", 0, groups, "completed")).toEqual({ kind: "none", reason: "completed" });
  });
});

describe("planDrop · other groupings", () => {
  it("date sets the date, keeping the time", () => {
    const groups = groupsFor("upcoming", "date");
    expect(plan("t-haircut", "date:2026-10-14", 0, groups)).toMatchObject({ kind: "move", patch: { date: tomorrow } });
  });

  it("area sets the area, a context group sets the context and clears the area", () => {
    const groups = groupsFor("all", "area");
    expect(plan("t-water-plants", "area:health", 0, groups)).toMatchObject({
      patch: { area: { id: "health", name: "Health" } },
    });
    expect(plan("t-water-plants", "scope:project", 0, groups)).toMatchObject({ patch: { area: null, scope: "project" } });
  });

  it("priority sets the priority", () => {
    const groups = groupsFor("all", "priority");
    expect(plan("t-water-plants", "priority:urgent", 0, groups)).toMatchObject({ patch: { priority: "urgent" } });
    expect(plan("t-ui-design", "priority:none", 0, groups)).toMatchObject({ patch: { priority: null } });
  });

  it("none only ever reorders", () => {
    const groups = groupsFor("all", "none");
    const first = groups[0]!.tasks[0]!.id;
    expect(plan(first, "all", 3, groups)).toMatchObject({ kind: "reorder" });
  });
});
