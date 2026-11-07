import { describe, expect, it } from "vitest";
import { createMockProjects } from "./mock-projects";
import { weekStart } from "./mock-project-reports";

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
});
