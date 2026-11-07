import { describe, expect, it } from "vitest";
import { createMockProjects } from "./mock-projects";

const respond = <T>(value: T) => Promise.resolve(structuredClone(value));

describe("mock project tasks (PJ-02)", () => {
  it("lists with server counts per view pill and per-task can flags", async () => {
    const { projectTasks } = createMockProjects({ respond });
    const list = await projectTasks.list("website-redesign");
    expect(list.tasks).toHaveLength(41);
    expect(list.counts).toEqual({ all: 41, mine: 5, unassigned: 3, overdue: 2, completed: 24 });
    expect(list.tasks[0]!.can).toEqual({ edit: true, status: true, assign: true, delete: false });
    const mine = await projectTasks.list("website-redesign", { view: "mine", filters: { milestoneIds: ["beta"] } });
    expect(mine.tasks.map((task) => task.id)).toEqual(["api-integration", "payment-errors-copy", "error-states"]);
  });

  it("guests only see tasks shared with them; viewers can't change anything", async () => {
    const { projectTasks } = createMockProjects({ respond });
    const guest = await projectTasks.list("website-redesign", {}, { previewRole: "guest" });
    expect(guest.tasks.every((task) => task.assignees.some((assignee) => assignee.person.id === "me"))).toBe(true);
    const viewer = await projectTasks.list("website-redesign", {}, { previewRole: "viewer" });
    expect(viewer.tasks[0]!.can).toEqual({ edit: false, status: false, assign: false, delete: false });
  });

  it("update checks the revision (409) and the workflow transitions", async () => {
    const { projectTasks } = createMockProjects({ respond });
    await expect(projectTasks.update("api-integration", { statusId: "in-review" }, 7)).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(projectTasks.update("api-integration", { statusId: "done" }, 1)).rejects.toMatchObject({
      code: "invalid",
    });
    const moved = await projectTasks.update("api-integration", { statusId: "in-review" }, 1);
    expect(moved).toMatchObject({ statusId: "in-review", revision: 2 });
  });

  it("creates with a pending assignment and bulk updates without silent partials", async () => {
    const { projectTasks } = createMockProjects({ respond });
    const created = await projectTasks.create("website-redesign", {
      title: "Fix login",
      phaseId: "build",
      assigneeId: "kian",
    });
    expect(created.assignees[0]).toMatchObject({ state: "pending", person: { id: "kian" } });
    const result = await projectTasks.bulkUpdate("website-redesign", ["api-integration", "icon-set"], {
      statusId: "done",
    });
    // Neither In progress nor To do may jump to Done: both refused, nothing applied.
    expect(result.updated).toEqual([]);
    expect(result.failedIds).toEqual(["api-integration", "icon-set"]);
    await expect(projectTasks.remove(["icon-set"])).rejects.toMatchObject({ code: "forbidden" });
  });
});
