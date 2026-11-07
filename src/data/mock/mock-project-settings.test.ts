import { describe, expect, it } from "vitest";
import { createMockProjects } from "./mock-projects";
import { parseCsv } from "./mock-project-settings";

const respond = <T>(value: T) => Promise.resolve(structuredClone(value));
const ALL = { title: 0, status: 1, assignee: 2, due: 3, estimate: 4 } as const;

describe("mock settings (PJ-14)", () => {
  it("parses quoted CSV", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\r\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
    ]);
  });

  it("workflow draft: preview lists the added status and transitions; publish needs Admin+", async () => {
    const store = createMockProjects({ respond });
    const preview = await store.workflowDrafts.previewPublish("website-redesign");
    expect(preview.version).toBe(4);
    expect(preview.added.map((status) => status.id)).toEqual(["qa"]);
    expect(preview.removed).toEqual([]);
    expect(preview.addedTransitions).toContainEqual(["in-review", "qa"]);
    await expect(store.workflowDrafts.publish("website-redesign", {})).rejects.toMatchObject({ code: "forbidden" });
  });

  it("owner publishes with a required mapping for removed statuses", async () => {
    const store = createMockProjects({ respond });
    const published = await store.workflows.published("mobile-onboarding");
    await store.workflowDrafts.saveDraft("mobile-onboarding", {
      statuses: published.statuses.filter((status) => status.id !== "blocked"),
      transitions: published.transitions,
    });
    const preview = await store.workflowDrafts.previewPublish("mobile-onboarding");
    expect(preview.removed.map((entry) => entry.status.id)).toEqual(["blocked"]);
    const next = await store.workflowDrafts.publish("mobile-onboarding", { blocked: "todo" });
    expect(next.version).toBe(published.version + 1);
    expect((await store.workflows.published("mobile-onboarding")).statuses.some((s) => s.id === "blocked")).toBe(false);
  });

  it("import: dry run changes nothing, commit creates the valid rows, undo removes them", async () => {
    const store = createMockProjects({ respond });
    const csv = "Title,Status,Assignee,Due,Estimate\nA,To do,Kian F.,2026-11-01,3\nB,QA,,31/02,x\n,,,,";
    const before = (await store.projectTasks.list("website-redesign")).tasks.length;
    const inspect = await store.imports.inspect("website-redesign", csv);
    expect(inspect.suggested).toEqual(ALL);
    const dry = await store.imports.dryRun("website-redesign", csv, ALL);
    expect(dry).toMatchObject({ rowsRead: 2, ready: 1 });
    expect(dry.errors.map((error) => error.problem)).toEqual(["status", "date", "number"]);
    expect((await store.projectTasks.list("website-redesign")).tasks.length).toBe(before);
    const result = await store.imports.commit("website-redesign", csv, ALL);
    expect(result.created).toBe(1);
    expect((await store.projectTasks.list("website-redesign")).tasks.length).toBe(before + 1);
    await store.imports.undo("website-redesign", result.batchId);
    expect((await store.projectTasks.list("website-redesign")).tasks.length).toBe(before);
  });

  it("general key rules, transfer (accept + reauth) and delete with name + reauth", async () => {
    const store = createMockProjects({ respond });
    await expect(store.settings.update("website-redesign", { key: "PLA" })).rejects.toMatchObject({ message: "key-taken" });
    expect((await store.settings.update("website-redesign", { name: "Website 2" })).name).toBe("Website 2");
    await expect(store.settings.requestTransfer("website-redesign", "kian")).rejects.toMatchObject({ code: "forbidden" });
    await expect(store.settings.remove("mobile-onboarding", { name: "nope", password: "x" })).rejects.toMatchObject({
      message: "name-mismatch",
    });
    const name = (await store.projects.access("mobile-onboarding")).status === "ok" ? "Mobile Onboarding" : "";
    await expect(store.settings.remove("mobile-onboarding", { name, password: "wrong" })).rejects.toMatchObject({ message: "reauth" });
  });
});
