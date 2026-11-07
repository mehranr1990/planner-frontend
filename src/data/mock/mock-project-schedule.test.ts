import { describe, expect, it } from "vitest";
import type { ScheduleGraph } from "../project-domain";
import { computePreview } from "./mock-project-schedule";
import { createMockProjects } from "./mock-projects";

const respond = <T>(value: T) => Promise.resolve(structuredClone(value));

const graph: ScheduleGraph = {
  items: [
    { id: "a", kind: "task", title: "A", start: "2026-10-01", end: "2026-10-05", revision: 1 },
    { id: "b", kind: "task", title: "B", start: "2026-10-07", end: "2026-10-10", revision: 1 },
    { id: "m", kind: "milestone", title: "M", start: "2026-10-12", end: "2026-10-12", revision: 1 },
  ],
  links: [
    { id: "ab", predecessorId: "a", successorId: "b", type: "FS", lagDays: 0 },
    { id: "bm", predecessorId: "b", successorId: "m", type: "FS", lagDays: 0 },
  ],
};

describe("mock schedule (PJ-08 / PJ-05)", () => {
  it("cascades only past the existing slack", () => {
    const preview = computePreview(graph, { itemId: "a", start: "2026-10-04", end: "2026-10-08" }, "cascade");
    expect(preview.deltaDays).toBe(3);
    // a ends 8 Oct → b (slack 2) must start ≥ 8 Oct: +1 day; m (slack 2) does not move.
    expect(preview.moves.map((move) => [move.id, move.to.start, move.to.end])).toEqual([
      ["a", "2026-10-04", "2026-10-08"],
      ["b", "2026-10-08", "2026-10-11"],
    ]);
    expect(preview.hasDependents).toBe(true);
    expect(preview.conflicts).toEqual([]);
  });

  it("“only this task” moves nothing else and reports the violated links", () => {
    const preview = computePreview(graph, { itemId: "a", start: "2026-10-06", end: "2026-10-09" }, "only");
    expect(preview.moves).toHaveLength(1);
    expect(preview.conflicts).toEqual(["ab"]);
  });

  it("previews a milestone date change with dependents and applies it with revisions", async () => {
    const { schedule, milestones } = createMockProjects({ respond });
    const change = { itemId: "beta", start: "2026-11-30", end: "2026-11-30" };
    const preview = await schedule.preview("website-redesign", change, "cascade");
    expect(preview.hasDependents).toBe(true);
    expect(preview.moves.map((move) => move.id)).toContain("regression-plan");
    await schedule.apply("website-redesign", preview.moves);
    const rows = await milestones.milestoneRows("website-redesign");
    expect(rows.find((row) => row.milestone.id === "beta")!.milestone.due).toBe("2026-11-30");
    // Same moves again: stale revisions → conflict, nothing applied.
    await expect(schedule.apply("website-redesign", preview.moves)).rejects.toMatchObject({ code: "conflict" });
  });

  it("computes milestone status and phase counts like the server", async () => {
    const { milestones } = createMockProjects({ respond });
    const rows = await milestones.milestoneRows("website-redesign");
    expect(Object.fromEntries(rows.map((row) => [row.milestone.id, row.status]))).toEqual({
      kickoff: "reached",
      scope: "reached",
      "design-signoff": "reached",
      beta: "next",
      "payment-go-live": "risk",
      launch: "planned",
    });
    const phases = await milestones.phaseRows("website-redesign");
    expect(phases.find((row) => row.phase.id === "planning")).toMatchObject({ tasksDone: 9, tasksTotal: 9 });
    const reordered = await milestones.reorderPhases("website-redesign", ["design", "planning", "build", "qa", "launch"]);
    expect(reordered[0]!.id).toBe("design");
  });
});
