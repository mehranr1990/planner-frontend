import { describe, expect, it } from "vitest";
import { taskDragData } from "../drag";
import { dayBlock } from "../domain/test-utils";
import {
  initialKeyboardTarget,
  planDrop,
  planPlacement,
  planResize,
  readDragItem,
  timelineBlockDragData,
  type DragItem,
} from "./drop-plan";

const DAY = "2026-10-13";
const TOMORROW = "2026-10-14";

const existing = [
  dayBlock("deep", "09:00", "11:00", { title: "Deep work", kind: "task", taskId: "t-deep" }),
  dayBlock("review", "11:00", "11:45", { title: "Design review" }),
];
const blocksForDay = (day: string) => (day === DAY ? existing : []);

const task: DragItem = taskDragData({ id: "t-1", title: "Review expenses", durationMinutes: 30, energy: "low" });
const taskBlock: DragItem = timelineBlockDragData(existing[0]!, DAY);
const eventBlock: DragItem = timelineBlockDragData(existing[1]!, DAY);

const plan = (item: DragItem, over: Parameters<typeof planDrop>[0]["over"], rawStartMinutes: number | null) =>
  planDrop({ item, over, rawStartMinutes, blocksForDay, defaultDurationMinutes: 30 });

describe("planDrop", () => {
  it("schedules an Unscheduled task on the 15-minute grid", () => {
    const result = plan(task, { type: "day", day: DAY }, 14 * 60 + 8);
    expect(result).toMatchObject({ kind: "schedule", taskId: "t-1" });
    expect(planPlacement(result)).toMatchObject({ day: DAY, startMinutes: 14 * 60 + 15, durationMinutes: 30, start: "14:15" });
  });

  it("gives a task without a duration the planner default", () => {
    const item = taskDragData({ id: "t-2", title: "Think", durationMinutes: null, energy: null });
    expect(planPlacement(plan(item, { type: "day", day: DAY }, 15 * 60))?.durationMinutes).toBe(30);
  });

  it("allows an overlap but flags it with the minutes shared", () => {
    const result = plan(task, { type: "day", day: DAY }, 10 * 60 + 30);
    expect(result.kind).toBe("schedule");
    if (result.kind !== "schedule") return;
    expect(result.overlaps).toEqual([{ id: "deep", title: "Deep work", minutes: 30 }]);
  });

  it("moves a block to another day and remembers where it was for Undo", () => {
    const result = plan(eventBlock, { type: "day", day: TOMORROW }, 9 * 60);
    expect(result).toMatchObject({
      kind: "move",
      blockId: "review",
      resized: false,
      previous: { day: DAY, start: "11:00", durationMinutes: 45 },
    });
    expect(planPlacement(result)).toMatchObject({ day: TOMORROW, startMinutes: 540, durationMinutes: 45 });
  });

  it("ignores the block itself when looking for overlaps", () => {
    const result = plan(taskBlock, { type: "day", day: DAY }, 8 * 60 + 50);
    expect(result.kind).toBe("move");
    if (result.kind !== "move") return;
    expect(result.overlaps).toEqual([]);
  });

  it("does nothing when a block lands where it already is", () => {
    expect(plan(taskBlock, { type: "day", day: DAY }, 9 * 60 + 4)).toEqual({ kind: "noop" });
  });

  it("rejects a drop that would run past midnight", () => {
    expect(plan(task, { type: "day", day: DAY }, 23 * 60 + 45)).toEqual({
      kind: "reject",
      reason: "out-of-range",
      title: "Review expenses",
    });
    expect(plan(task, { type: "day", day: DAY }, -30)).toMatchObject({ kind: "reject", reason: "out-of-range" });
  });

  it("rejects a drop over nothing of ours or with no pointer position", () => {
    expect(plan(task, null, 600)).toMatchObject({ kind: "reject", reason: "no-target" });
    expect(plan(task, { type: "day", day: DAY }, null)).toMatchObject({ kind: "reject", reason: "no-target" });
  });

  it("unschedules a task block dropped on Unscheduled", () => {
    expect(plan(taskBlock, { type: "unscheduled" }, null)).toMatchObject({
      kind: "unschedule",
      blockId: "deep",
      taskId: "t-deep",
      previous: { day: DAY, start: "09:00", durationMinutes: 120 },
    });
  });

  it("refuses to unschedule events and routines, and ignores a task dropped back on Unscheduled", () => {
    expect(plan(eventBlock, { type: "unscheduled" }, null)).toMatchObject({ kind: "reject", reason: "not-unschedulable" });
    expect(plan(task, { type: "unscheduled" }, null)).toEqual({ kind: "noop" });
  });
});

describe("planResize", () => {
  const block = { id: "review", title: "Design review", taskId: undefined };
  const before = { startMinutes: 660, endMinutes: 705 };

  it("is a move with the new length and the old span as Undo target", () => {
    const result = planResize({ block, day: DAY, before, after: { startMinutes: 660, endMinutes: 750 }, blocksForDay });
    expect(result).toMatchObject({
      kind: "move",
      resized: true,
      previous: { day: DAY, start: "11:00", durationMinutes: 45 },
    });
    expect(planPlacement(result)).toMatchObject({ startMinutes: 660, durationMinutes: 90 });
  });

  it("flags an overlap the resize creates", () => {
    const result = planResize({ block, day: DAY, before, after: { startMinutes: 540, endMinutes: 705 }, blocksForDay });
    expect(result.kind).toBe("move");
    if (result.kind !== "move") return;
    expect(result.overlaps.map((hit) => hit.id)).toEqual(["deep"]);
  });

  it("is nothing when the span did not change", () => {
    expect(planResize({ block, day: DAY, before, after: before, blocksForDay })).toEqual({ kind: "noop" });
  });
});

describe("initialKeyboardTarget", () => {
  const base = { day: DAY, nowMinutes: 14 * 60 + 35, workStartMinutes: 9 * 60, blocks: existing, defaultDurationMinutes: 30 };

  it("leaves a lifted block where it is", () => {
    expect(initialKeyboardTarget({ ...base, item: taskBlock, isToday: true })).toEqual({ day: DAY, startMinutes: 540 });
  });

  it("puts a task in the next free half hour after now today", () => {
    expect(initialKeyboardTarget({ ...base, item: task, isToday: true })).toEqual({ day: DAY, startMinutes: 15 * 60 });
  });

  it("starts at the first free half hour of work on another day", () => {
    // 09:00 and 11:00 are taken in the sample blocks; 11:45 rounds to 12:00.
    expect(initialKeyboardTarget({ ...base, item: task, isToday: false })).toEqual({ day: DAY, startMinutes: 12 * 60 });
  });
});

describe("readDragItem", () => {
  it("accepts rail tasks and timeline blocks", () => {
    expect(readDragItem(task)?.type).toBe("task");
    expect(readDragItem(taskBlock)?.type).toBe("block");
  });

  it("rejects anything it cannot place", () => {
    expect(readDragItem(null)).toBeNull();
    expect(readDragItem({ type: "block", blockId: "x" })).toBeNull();
    expect(readDragItem({ type: "other" })).toBeNull();
  });
});
