import { describe, expect, it } from "vitest";
import { createMockProjects } from "./mock-projects";

const respond = <T>(value: T) => Promise.resolve(structuredClone(value));

describe("mock project work (PJ-01)", () => {
  it("counts the status-card KPIs on the server side", async () => {
    const { projects } = createMockProjects({ respond });
    expect(await projects.summary("website-redesign")).toMatchObject({
      milestonesDone: 3,
      milestonesTotal: 6,
      nextMilestone: { id: "beta", due: "2026-11-11" },
      overdueTasks: 2,
      oldestOverdueDays: 4,
      openRisks: 4,
      highRisks: 2,
      openTasks: 17,
    });
  });

  it("lists my pending assignments and accepted open tasks", async () => {
    const { assignments } = createMockProjects({ respond });
    const mine = await assignments.listMine("website-redesign");
    expect(mine.pending.map((task) => task.id)).toEqual(["payment-errors-copy", "checkout-qa-pass"]);
    expect(mine.open.map((task) => task.id)).toEqual(["api-integration", "design-qa-handoff", "error-states"]);
  });

  it("accepts with the current revision, rejects a stale one (409), and declines with a reason", async () => {
    const store = createMockProjects({ respond });
    const accepted = await store.assignments.accept("payment-errors-copy", 1);
    expect(accepted.assignees[0]).toMatchObject({ state: "accepted" });
    expect(accepted.revision).toBe(2);
    await expect(store.assignments.decline("checkout-qa-pass", { reason: "other", revision: 9 })).rejects.toMatchObject(
      {
        code: "conflict",
      },
    );
    const declined = await store.assignments.decline("checkout-qa-pass", {
      reason: "no-capacity",
      note: "Full",
      revision: 1,
    });
    expect(declined.assignees[0]).toMatchObject({ state: "declined", reason: "no-capacity", note: "Full" });
    // "n for you" follows: 3 → 2 (the declined one leaves).
    const directory = await store.projects.listAccessible();
    expect(directory.projects.find((project) => project.id === "website-redesign")?.forYou).toBe(2);
  });

  it("hides team load without the capability and returns open risks", async () => {
    const store = createMockProjects({ respond });
    expect(await store.workload.week("website-redesign")).toHaveLength(4);
    expect((await store.risks.list("website-redesign", { open: true })).map((risk) => risk.id)).toEqual([
      "payment-api-delay",
      "legal-copy",
      "consent-events",
      "qa-capacity",
      "sandbox-keys",
      "staging-deploy",
    ]);
    expect(await store.milestones.listPhases("planner-app")).toEqual([]);
  });
});
