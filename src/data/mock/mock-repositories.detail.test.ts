import { describe, expect, it } from "vitest";
import { RepositoryError } from "../repositories";
import { createMockRepositories } from "./mock-repositories";

describe("mock tasks · P06 detail (checklist, notes, links)", () => {
  it("serves the board's subtasks, notes, activity and links for t-ui-design", async () => {
    const task = await createMockRepositories().tasks.get("t-ui-design");
    expect(task?.checklist).toHaveLength(5);
    expect(task?.subtasks).toEqual({ done: 3, total: 5 });
    expect(task?.notes).toHaveLength(1);
    expect(task?.activity?.[0]?.kind).toBe("subtaskDone");
    expect(task?.links?.map((link) => link.kind)).toEqual(["blockedBy", "blocks", "file"]);
  });

  it("a checklist patch keeps the summary in step and gives new items ids", async () => {
    const { tasks } = createMockRepositories();
    const before = (await tasks.get("t-ui-design"))!;
    const checklist = [...before.checklist!.map((item) => ({ ...item, done: true })), { title: "Ship it", done: false }];
    const after = await tasks.update("t-ui-design", { checklist });
    expect(after.subtasks).toEqual({ done: 5, total: 6 });
    expect(after.checklist?.[5]?.id).toMatch(/^st-/);
    await expect(tasks.update("t-ui-design", { checklist: [{ title: " ", done: false }] })).rejects.toBeInstanceOf(RepositoryError);
    expect((await tasks.get("t-ui-design"))?.subtasks).toEqual({ done: 5, total: 6 });
  });

  it("addNote appends a stamped note and rejects an empty one", async () => {
    const { tasks } = createMockRepositories();
    const task = await tasks.addNote("t-ui-design", "  Try a warmer mint  ");
    expect(task.notes?.at(-1)).toMatchObject({ body: "Try a warmer mint" });
    expect(task.notes?.at(-1)?.createdAt).toMatch(/T/);
    await expect(tasks.addNote("t-ui-design", "   ")).rejects.toBeInstanceOf(RepositoryError);
  });

  it("refreshes a dependency from the task it names", async () => {
    const { tasks } = createMockRepositories({
      fixtures: {
        tasks: [
          { id: "a", title: "A", scope: "personal", priority: null, energy: null, durationMinutes: null, date: null, time: null, status: "open",
            links: [{ id: "l", kind: "blockedBy", taskId: "b", title: "stale", done: true }] },
          { id: "b", title: "B", scope: "personal", priority: null, energy: null, durationMinutes: null, date: null, time: null, status: "open" },
        ],
      },
    });
    expect((await tasks.get("a"))?.links?.[0]).toMatchObject({ title: "B", done: false });
  });
});
