import { describe, expect, it } from "vitest";
import { createMockProjects } from "./mock-projects";
import { computeAnalytics, weekStart } from "./mock-project-reports";

const respond = <T>(value: T) => Promise.resolve(structuredClone(value));

describe("mock reports (PJ-12)", () => {
  it("weeks start Monday (en) or Saturday (fa); counts follow the SPEC definitions", async () => {
    expect(weekStart("2026-10-13", 1)).toBe("2026-10-12");
    expect(weekStart("2026-10-13", 6)).toBe("2026-10-10");
    const store = createMockProjects({ respond });
    const summary = await store.reports.summary("website-redesign", { range: "4w", weekStartsOn: 1 });
    expect(summary.weeks).toHaveLength(4);
    expect(summary.kpis).toMatchObject({ done: 24, total: 41, overdue: 2 });
    expect(summary.doneCumulative.at(-1)).toBe(24);
    expect(summary.byStatus.reduce((sum, entry) => sum + entry.count, 0)).toBe(41);
  });

  it("Members get only their own assignee row, Viewers none, guests are refused", async () => {
    const store = createMockProjects({ respond });
    const member = await store.reports.summary("website-redesign", { range: "all", weekStartsOn: 6 }, { previewRole: "member" });
    expect(member.byAssignee.every((entry) => entry.person.id === "me")).toBe(true);
    const viewer = await store.reports.summary("website-redesign", { range: "all", weekStartsOn: 6 }, { previewRole: "viewer" });
    expect(viewer.byAssignee).toEqual([]);
    await expect(
      store.reports.summary("website-redesign", { range: "all", weekStartsOn: 6 }, { previewRole: "guest" }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
  it("burn-up scope counts a task from the week it was created (no creation instant = every week)", () => {
    const task = (id: string, createdAt?: string) => ({
      id, projectId: "p1", title: id, statusId: "s-open", phaseId: null, milestoneId: null, assignees: [], priority: null, due: null,
      estimateHours: null, blockedBy: [], subtasks: null, commentCount: null, revision: 1, ...(createdAt ? { createdAt } : {}),
    });
    const summary = computeAnalytics({
      tasks: [task("old"), task("new", "2026-11-12T09:00:00.000Z")],
      workflow: { version: 1, statuses: [{ id: "s-open", name: "Open", category: "todo" }], transitions: {} },
      role: "owner",
      range: "4w",
      weekStartsOn: 6,
      projectStart: "2026-10-01",
      today: "2026-11-14",
      now: "2026-11-14T10:00:00.000Z",
    });
    expect(summary.scope).toEqual([1, 1, 2, 2]);
  });
});
