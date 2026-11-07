import { describe, expect, it } from "vitest";
import { createMockProjects } from "./mock-projects";
import type { ProjectMember, ProjectTask } from "../project-domain";
import { computeWorkloadGrid, monthPeriods, weekPeriods, weekStartOf } from "./mock-project-workload";

const respond = <T>(value: T) => Promise.resolve(structuredClone(value));

describe("mock workload grid (PJ-11, D13)", () => {
  it("weeks start Saturday; rows carry capacity from Members and skip Viewers", async () => {
    expect(weekStartOf("2026-10-13")).toBe("2026-10-10");
    const store = createMockProjects({ respond });
    const grid = await store.workload.byWeek("website-redesign", { from: "2026-10-13", weeks: 6 });
    expect(grid.weeks[0]).toBe("2026-10-10");
    expect(grid.weeks).toHaveLength(6);
    expect(grid.rows.map((row) => row.person.id)).not.toContain("kamran");
    const kian = grid.rows.find((row) => row.person.id === "kian")!;
    expect(kian.capacity).toBe(32);
    expect(kian.cells).toHaveLength(6);
    const total = grid.rows.reduce((sum, row) => sum + row.cells.reduce((s, cell) => s + cell.hours, 0), 0);
    expect(total).toBeGreaterThan(0);
    expect(grid.unassigned).toHaveLength(6);
  });

  it("Members get only their own row; Viewers are refused", async () => {
    const store = createMockProjects({ respond });
    const member = await store.workload.byWeek("website-redesign", { from: "2026-10-13", weeks: 6 }, { previewRole: "member" });
    expect(member.rows.map((row) => row.person.id)).toEqual(["me"]);
    await expect(
      store.workload.byWeek("website-redesign", { from: "2026-10-13", weeks: 6 }, { previewRole: "viewer" }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("workload periods and task count (PJ-11 switches)", () => {
  const person = (id: string) => ({ id, name: id, initials: id.slice(0, 2).toUpperCase() });
  const workflow = {
    statuses: [
      { id: "todo", category: "todo" },
      { id: "done", category: "done" },
    ],
  } as unknown as Parameters<typeof computeWorkloadGrid>[0]["workflow"];
  const task = (id: string, due: string | null, estimateHours: number | null, assignees: string[], statusId = "todo") =>
    ({
      id,
      title: id,
      statusId,
      due,
      estimateHours,
      assignees: assignees.map((assignee) => ({ person: person(assignee), state: "accepted" })),
    }) as unknown as ProjectTask;
  const members = [
    { person: person("kian"), role: "member", capacityHours: 28 },
    { person: person("sara"), role: "member", capacityHours: null },
  ] as unknown as ProjectMember[];

  it("Jalali months: Mehr (30 days) and Aban (30 days) from 1 Mehr 1405 = 23 Sep 2026", () => {
    const months = monthPeriods("2026-10-13", 2, "jalali");
    expect(months[0]).toEqual({ start: "2026-09-23", end: "2026-10-22", weeks: 30 / 7 });
    expect(months[1]).toMatchObject({ start: "2026-10-23", end: "2026-11-21" });
  });

  it("Gregorian months follow the Gregorian calendar", () => {
    const months = monthPeriods("2026-10-13", 2, "gregorian");
    expect(months[0]).toEqual({ start: "2026-10-01", end: "2026-10-31", weeks: 31 / 7 });
    expect(months[1]).toEqual({ start: "2026-11-01", end: "2026-11-30", weeks: 30 / 7 });
    expect(weekPeriods("2026-10-13", 2).map((p) => p.start)).toEqual(["2026-10-10", "2026-10-17"]);
  });

  it("month hours sum the spread estimate; capacity scales by weeks of the month", () => {
    // 20 days across Gregorian Oct/Nov: 10 Oct days + 10 Nov days, 40h → 20h each.
    const tasks = [task("a", "2026-11-10", 40, ["kian"])];
    const grid = computeWorkloadGrid({
      periods: monthPeriods("2026-10-13", 2, "gregorian"),
      unit: "month",
      tasks,
      workflow,
      members,
      startOf: () => "2026-10-22",
    });
    expect(grid.unit).toBe("month");
    const kian = grid.rows.find((row) => row.person.id === "kian")!;
    expect(kian.cells.map((cell) => cell.hours)).toEqual([20, 20]);
    expect(kian.capacity! * grid.periods[0]!.weeks).toBeCloseTo(124);
  });

  it("task count counts open assigned tasks per period, incl. unestimated; done tasks and unassigned stay out of rows", () => {
    const tasks = [
      task("a", "2026-10-15", 8, ["kian"]),
      task("b", "2026-10-16", null, ["kian", "sara"]),
      task("c", "2026-10-16", 4, ["kian"], "done"),
      task("d", "2026-10-25", 6, []),
      task("e", "2026-10-26", null, []),
    ];
    const grid = computeWorkloadGrid({ periods: weekPeriods("2026-10-13", 3), tasks, workflow, members, startOf: () => null });
    const kian = grid.rows.find((row) => row.person.id === "kian")!;
    const sara = grid.rows.find((row) => row.person.id === "sara")!;
    expect(kian.cells.map((cell) => cell.count)).toEqual([2, 0, 0]);
    expect(kian.cells[0]!.hours).toBe(8);
    expect(kian.cells[0]!.tasks.find((entry) => entry.taskId === "b")!.hours).toBeNull();
    expect(sara.cells[0]!.count).toBe(1);
    expect(sara.cells[0]!.hours).toBe(0);
    expect(kian.unestimated).toBe(1);
    expect(grid.unassigned[2]).toEqual({ tasks: 1, hours: 6, count: 2 });
  });
});
