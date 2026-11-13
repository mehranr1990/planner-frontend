import { describe, expect, it } from "vitest";
import { createMockProjects } from "./mock-projects";

const respond = <T>(value: T) => Promise.resolve(structuredClone(value));

describe("mock project board (PJ-03 / PJ-06)", () => {
  it("counts tasks per status and serves WIP limits with the published workflow", async () => {
    const { projectTasks, workflows } = createMockProjects({ respond });
    const counts = await projectTasks.countByStatus("website-redesign");
    expect(counts.done).toBe(24);
    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(41);
    const workflow = await workflows.published("website-redesign");
    expect(workflow.wipLimits).toEqual({ "in-progress": 5, "in-review": 3 });
  });

  it("transition checks revision, workflow and sets completedAt on done", async () => {
    const { projectTasks } = createMockProjects({ respond });
    await expect(projectTasks.transition("website-redesign", "api-integration", "in-review", 9)).rejects.toMatchObject({ code: "conflict" });
    await expect(projectTasks.transition("website-redesign", "api-integration", "done", 1)).rejects.toMatchObject({
      code: "invalid",
      message: "transition",
    });
    const review = await projectTasks.transition("website-redesign", "api-integration", "in-review", 1);
    expect(review.statusId).toBe("in-review");
    const done = await projectTasks.transition("website-redesign", "api-integration", "done", review.revision);
    expect(done.completedAt).toBeTruthy();
  });

  it("refuses moves past a WIP limit unless a Manager+ confirms", async () => {
    const { projectTasks } = createMockProjects({ respond });
    const counts = await projectTasks.countByStatus("website-redesign");
    // Fill In review up to its limit (3) with To do → In progress → In review moves.
    const todo = (await projectTasks.list("website-redesign", { filters: { statusIds: ["todo"] } })).tasks;
    let filled = counts["in-review"] ?? 0;
    for (const task of todo) {
      if (filled >= 3) break;
      const active = await projectTasks.transition("website-redesign", task.id, "in-progress", task.revision, { exceedWip: true });
      await projectTasks.transition("website-redesign", task.id, "in-review", active.revision);
      filled += 1;
    }
    const next = (await projectTasks.list("website-redesign", { filters: { statusIds: ["in-progress"] } })).tasks[0]!;
    await expect(projectTasks.transition("website-redesign", next.id, "in-review", next.revision)).rejects.toMatchObject({
      message: "wip-limit",
    });
    const moved = await projectTasks.transition("website-redesign", next.id, "in-review", next.revision, { exceedWip: true });
    expect(moved.statusId).toBe("in-review");
  });

  it("reorder is Manager+ and keeps the other tasks in place", async () => {
    const { projectTasks } = createMockProjects({ respond });
    const before = (await projectTasks.list("website-redesign", { filters: { statusIds: ["todo"] } })).tasks.map(
      (task) => task.id,
    );
    const reversed = [...before].reverse();
    await projectTasks.reorder("website-redesign", reversed);
    const after = (await projectTasks.list("website-redesign", { filters: { statusIds: ["todo"] } })).tasks.map(
      (task) => task.id,
    );
    expect(after).toEqual(reversed);
  });
});
