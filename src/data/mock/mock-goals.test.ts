import { describe, expect, it } from "vitest";
import { createMockRepositories } from "./mock-repositories";

describe("mock goals repository (P11)", () => {
  it("lists by lifecycle and archives / restores", async () => {
    const { goals } = createMockRepositories();
    expect((await goals.list()).map((goal) => goal.id)).toEqual([
      "g-launch-planner-v1",
      "g-run-100km",
      "g-emergency-fund",
      "g-read-12-books",
    ]);
    expect(await goals.list("completed")).toHaveLength(3);
    await goals.setLifecycle("g-run-100km", "archived");
    expect((await goals.list("archived")).map((goal) => goal.id)).toContain("g-run-100km");
    await goals.setLifecycle("g-run-100km", "active");
    expect((await goals.list()).map((goal) => goal.id)).toContain("g-run-100km");
    const done = await goals.setLifecycle("g-run-100km", "completed");
    expect(done).toMatchObject({ progress: 1, completedDay: "2026-10-13" });
  });

  it("creates with milestones, validates and updates; a measure drives progress", async () => {
    const { goals } = createMockRepositories();
    await expect(goals.create({ title: "  " })).rejects.toMatchObject({ code: "invalid" });
    const goal = await goals.create({
      title: "Ship a book",
      area: "Writing",
      dueDay: "2026-12-01",
      milestones: [
        { title: "Outline", dueDay: "2026-10-20" },
        { title: "Draft", dueDay: null },
      ],
    });
    expect(goal).toMatchObject({ lifecycle: "active", progress: 0, nextStep: "Draft" });
    expect(goal.milestones?.map((item) => item.title)).toEqual(["Outline", "Draft"]);
    expect((await goals.list())[0]!.id).toBe(goal.id);
    const measured = await goals.update(goal.id, { measure: { current: 3, target: 12, unit: "chapters" }, area: null });
    expect(measured.progress).toBe(0.25);
    expect(measured.area).toBeUndefined();
    await expect(goals.update("nope", { title: "x" })).rejects.toMatchObject({ code: "not-found" });
  });

  it("adds and reaches milestones; progress follows the reached share", async () => {
    const { goals } = createMockRepositories();
    const added = await goals.addMilestone("g-launch-planner-v1", { title: "Polish", dueDay: null }, 4);
    expect(added.milestones?.map((item) => item.title)).toEqual(["Brief", "Research", "Design", "Development", "Polish", "Beta"]);
    const reached = await goals.setMilestoneDone("g-launch-planner-v1", "m-development", true);
    expect(reached.milestones?.find((item) => item.id === "m-development")?.doneDay).toBe("2026-10-13");
    expect(reached.progress).toBeCloseTo(0.67, 2);
    expect(reached.nextStep).toBe("Beta");
    await expect(goals.setMilestoneDone("g-launch-planner-v1", "nope", true)).rejects.toMatchObject({ code: "not-found" });
  });

  it("links tasks both ways: create / update with goalId, renamed goals rename the tasks", async () => {
    const repos = createMockRepositories();
    const before = await repos.goals.tasks("g-launch-planner-v1");
    expect(before.length).toBeGreaterThan(0);
    const task = await repos.tasks.create({ title: "Plan: Beta", goalId: "g-launch-planner-v1" });
    expect(task).toMatchObject({ goalId: "g-launch-planner-v1", goalTitle: "Launch Planner v1" });
    await expect(repos.tasks.create({ title: "x", goalId: "nope" })).rejects.toMatchObject({ code: "not-found" });
    await repos.goals.update("g-launch-planner-v1", { title: "Launch Planner 1.0" });
    expect((await repos.tasks.get(task.id))?.goalTitle).toBe("Launch Planner 1.0");
    const linked = await repos.goals.tasks("g-launch-planner-v1");
    expect(linked).toHaveLength(before.length + 1);
    expect(linked.findIndex((item) => item.status === "done")).not.toBe(0);
    await repos.tasks.update(task.id, { goalId: null });
    expect((await repos.tasks.get(task.id))?.goalId).toBeUndefined();
  });
});
