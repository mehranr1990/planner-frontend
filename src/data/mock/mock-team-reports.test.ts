import { describe, expect, it } from "vitest";
import { createMockTeams } from "./mock-teams";

const respond = <T,>(value: T) => Promise.resolve(structuredClone(value));
const OPEN: Record<string, string> = { "website-redesign": "Website Redesign", "planner-app": "Planner App", "mobile-onboarding": "Mobile Onboarding" };
const make = () =>
  createMockTeams({
    respond,
    findProject: (id) => (OPEN[id] ? { id, name: OPEN[id]!, percent: 50, health: "on-track", lifecycle: "active" } : undefined),
  });

describe("mock teamReportRepo (TM-12)", () => {
  it("12 weeks end with the live current week; KPIs are plain ratios with their denominators", async () => {
    const report = await make().teamReports.summary("design", "12w");
    expect(report.weeks).toHaveLength(12);
    expect(report.weeks.at(-1)).toMatchObject({ weekNumber: 42, planned: 18, done: 11, current: true });
    expect(report.weeks[0]!.weekNumber).toBe(31);
    expect(report.planned).toBe(report.weeks.reduce((sum, week) => sum + week.planned, 0));
    expect(report.capacityBooked).toBeGreaterThan(0);
    expect(report).not.toHaveProperty("byPerson");
  });

  it("names only openable projects; Other projects only for Lead/Admin", async () => {
    const store = make();
    const member = await store.teamReports.summary("design", "12w");
    expect(member.mix.projects.map((item) => item.name)).toEqual(["Website Redesign", "Planner App"]);
    expect(member.mix.other).toBeNull();
    const lead = await store.teamReports.summary("mobile", "12w");
    expect(lead.mix.projects.map((item) => item.name)).toEqual(["Mobile Onboarding"]);
    expect(lead.mix.other).toBe(9);
  });

  it("4 weeks and the current Jalali quarter (from 1 Mehr)", async () => {
    const store = make();
    expect((await store.teamReports.summary("design", "4w")).weeks.map((week) => week.weekNumber)).toEqual([39, 40, 41, 42]);
    expect((await store.teamReports.summary("design", "quarter")).weeks[0]!.week).toBe("2026-09-19");
  });
});
