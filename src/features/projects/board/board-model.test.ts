import { describe, expect, it } from "vitest";
import { sampleWorkflow } from "@/fixtures/project-work";
import type { ProjectTask } from "@/data/project-domain";
import { boardStatuses, buildBoard, decideDrop, lanePatch, reorderIds } from "./board-model";

const person = (id: string) => ({ id, name: id.toUpperCase(), initials: id.slice(0, 2).toUpperCase() });

const task = (over: Partial<ProjectTask>): ProjectTask => ({
  id: "t",
  projectId: "p",
  title: "Task",
  statusId: "todo",
  phaseId: "build",
  milestoneId: null,
  assignees: [],
  priority: "medium",
  due: null,
  estimateHours: null,
  blockedBy: [],
  subtasks: { done: 0, total: 0 },
  commentCount: 0,
  revision: 1,
  updatedAt: "2026-10-12T10:00:00+03:30",
  can: { edit: true, status: true, assign: true, delete: false },
  ...over,
});

const caps = { exceedWip: false, reorderTasks: false };
const base = { fromLane: "all", toLane: "all", swimlane: "none" as const, workflow: sampleWorkflow, counts: {} };

describe("PJ-03 board model", () => {
  it("orders columns by the workflow with done last", () => {
    expect(boardStatuses(sampleWorkflow).map((status) => status.id)).toEqual([
      "todo",
      "in-progress",
      "in-review",
      "blocked",
      "done",
    ]);
  });

  it("collapses Done cards completed more than 7 days ago and builds assignee lanes", () => {
    const tasks = [
      task({ id: "old", statusId: "done", completedAt: "2026-09-14T17:00:00+03:30" }),
      task({ id: "new", statusId: "done", completedAt: "2026-10-12T10:00:00+03:30" }),
      task({ id: "a", assignees: [{ person: person("kian"), state: "accepted" }] }),
    ];
    const none = buildBoard(tasks, sampleWorkflow, {
      swimlane: "none",
      phases: [],
      members: [],
      now: "2026-10-13T12:00:00+03:30",
    });
    const done = none.lanes[0]!.columns.find((column) => column.status.id === "done")!;
    expect(done.tasks.map((item) => item.id)).toEqual(["new"]);
    expect(done.collapsed.map((item) => item.id)).toEqual(["old"]);
    expect(none.counts.done).toBe(2);
    const lanes = buildBoard(tasks, sampleWorkflow, {
      swimlane: "assignee",
      phases: [],
      members: [person("kian")],
      now: "2026-10-13T12:00:00+03:30",
    });
    expect(lanes.lanes.map((lane) => lane.id)).toEqual(["person:kian", "nobody"]);
  });

  it("decides drops: transition, role, WIP and reorder", () => {
    expect(decideDrop({ ...base, task: task({}), toStatusId: "done", capabilities: caps })).toEqual({
      kind: "not-allowed",
      reason: "transition",
    });
    expect(
      decideDrop({
        ...base,
        task: task({ can: { edit: false, status: false, assign: false, delete: false } }),
        toStatusId: "in-progress",
        capabilities: caps,
      }),
    ).toEqual({ kind: "not-allowed", reason: "role" });
    const full = { ...base, counts: { "in-progress": 5 } };
    expect(decideDrop({ ...full, task: task({}), toStatusId: "in-progress", capabilities: caps })).toEqual({
      kind: "not-allowed",
      reason: "wip",
    });
    expect(
      decideDrop({ ...full, task: task({}), toStatusId: "in-progress", capabilities: { ...caps, exceedWip: true } }),
    ).toMatchObject({ kind: "move", confirmWip: true });
    expect(decideDrop({ ...base, task: task({}), toStatusId: "todo", capabilities: caps })).toEqual({
      kind: "not-allowed",
      reason: "role",
    });
    expect(
      decideDrop({ ...base, task: task({}), toStatusId: "todo", capabilities: { ...caps, reorderTasks: true } }),
    ).toEqual({ kind: "reorder" });
  });

  it("lane moves need the right per-task flag", () => {
    const lanes = { ...base, swimlane: "assignee" as const, fromLane: "nobody", toLane: "person:kian" };
    expect(
      decideDrop({
        ...lanes,
        task: task({ can: { edit: true, status: true, assign: false, delete: false } }),
        toStatusId: "todo",
        capabilities: caps,
      }),
    ).toEqual({ kind: "not-allowed", reason: "lane" });
    expect(lanePatch("person:kian")).toEqual({ assigneeIds: ["kian"] });
    expect(lanePatch("phase:qa")).toEqual({ phaseId: "qa" });
    expect(reorderIds(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
  });
});
