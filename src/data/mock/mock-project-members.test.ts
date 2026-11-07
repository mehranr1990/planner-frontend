import { describe, expect, it } from "vitest";
import { isTaskDone } from "./mock-project-work";
import { createMockProjects } from "./mock-projects";

const respond = <T>(value: T) => Promise.resolve(structuredClone(value));

describe("mock members (PJ-13)", () => {
  it("never removes or demotes the Owner; Managers manage only people below them", async () => {
    const store = createMockProjects({ respond });
    await expect(store.members.remove("website-redesign", "sara")).rejects.toMatchObject({ code: "invalid" });
    await expect(store.members.setRole("website-redesign", "sara", "admin")).rejects.toMatchObject({ code: "invalid" });
    await expect(store.members.setRole("website-redesign", "kian", "admin")).rejects.toMatchObject({ code: "forbidden" });
    expect(await store.members.setRole("website-redesign", "kian", "viewer")).toMatchObject({ role: "viewer" });
  });

  it("remove turns open tasks Unassigned and updates the summary; leave drops the project", async () => {
    const store = createMockProjects({ respond });
    const before = await store.members.removalPreview("website-redesign", "kian");
    expect(before.openTasks).toBeGreaterThan(0);
    await store.members.remove("website-redesign", "kian");
    const workflow = store.work.workflow("website-redesign");
    const openKian = (store.work.tasks.get("website-redesign") ?? []).filter(
      (task) => !isTaskDone(task, workflow) && task.assignees.some((assignee) => assignee.person.id === "kian"),
    );
    expect(openKian).toHaveLength(0);
    expect((await store.members.list("website-redesign")).some((member) => member.person.id === "kian")).toBe(false);
    expect((await store.projects.access("website-redesign")).status).toBe("ok");
    await store.members.leave("website-redesign");
    expect((await store.projects.access("website-redesign")).status).toBe("not-available");
  });

  it("capacity and guest grants need Manager+ and valid values", async () => {
    const store = createMockProjects({ respond });
    expect((await store.members.setCapacity("website-redesign", "kian", 28)).capacityHours).toBe(28);
    await expect(store.members.setCapacity("website-redesign", "kian", 500)).rejects.toMatchObject({ code: "invalid" });
    await expect(
      store.grants.set("website-redesign", { personId: "kian", taskIds: [], expires: "2026-12-01" }),
    ).rejects.toMatchObject({ code: "invalid" });
    const grant = await store.grants.set("website-redesign", { personId: "ava", taskIds: ["icon-set"], expires: "2026-12-01" });
    expect(grant.taskIds).toEqual(["icon-set"]);
  });
});
