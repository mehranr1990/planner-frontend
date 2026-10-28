import { describe, expect, it } from "vitest";
import { blocksToMoveToTomorrow, computeCapacity, movableBlocks, plannedMinutes, workWindow } from "./capacity";
import { dayBlock, sampleDayBlocks } from "./test-utils";

describe("workWindow", () => {
  it("reads the work hours (09:00–17:00 → 8h)", () => {
    expect(workWindow({ start: "09:00", end: "17:00" })).toEqual({ startMinutes: 540, endMinutes: 1020, totalMinutes: 480 });
    expect(workWindow({ start: "08:30", end: "12:30" }).totalMinutes).toBe(240);
  });

  it("falls back to 09:00–17:00 for invalid or inverted hours", () => {
    expect(workWindow({ start: "nope", end: "17:00" }).totalMinutes).toBe(480);
    expect(workWindow({ start: "18:00", end: "09:00" }).totalMinutes).toBe(480);
  });
});

describe("computeCapacity", () => {
  it("the board's default day: 6h 15m of 8h planned, 1h 45m free, breaks not counted", () => {
    const blocks = sampleDayBlocks();
    // Morning routine and lunch are breaks: 120 + 45 + 120 + 30 + 60.
    expect(plannedMinutes(blocks)).toBe(375);
    expect(computeCapacity(blocks, 480)).toEqual({
      plannedMinutes: 375,
      totalMinutes: 480,
      freeMinutes: 105,
      ratio: 375 / 480,
      state: "normal",
      overlapCount: 0,
      overlapMinutes: 0,
    });
  });

  it("is empty with no blocks, partial under half the day, normal from half", () => {
    expect(computeCapacity([], 480)).toMatchObject({ state: "empty", plannedMinutes: 0, freeMinutes: 480 });
    expect(computeCapacity([dayBlock("a", "09:00", "11:00")], 480).state).toBe("partial");
    expect(computeCapacity([dayBlock("a", "09:00", "13:00")], 480).state).toBe("normal");
    // Only breaks: blocks exist but nothing is planned.
    expect(computeCapacity([dayBlock("l", "13:00", "14:00", { kind: "break" })], 480)).toMatchObject({ state: "partial", plannedMinutes: 0 });
  });

  it("counts done blocks as planned", () => {
    expect(computeCapacity([dayBlock("a", "09:00", "17:00", { done: true })], 480)).toMatchObject({ plannedMinutes: 480, state: "normal" });
  });

  it("is over above 100%, with free time clamped at zero", () => {
    const blocks = [dayBlock("a", "08:00", "12:00"), dayBlock("b", "12:00", "17:00")];
    expect(computeCapacity(blocks, 480)).toMatchObject({ plannedMinutes: 540, freeMinutes: 0, state: "over", overlapCount: 0 });
  });

  it("is over when blocks overlap even under 100%, and reports the overlaps", () => {
    const blocks = [dayBlock("a", "09:00", "11:00"), dayBlock("b", "10:30", "11:30")];
    expect(computeCapacity(blocks, 480)).toMatchObject({ state: "over", overlapCount: 1, overlapMinutes: 30, plannedMinutes: 180 });
  });

  it("survives a zero workday", () => {
    expect(computeCapacity([dayBlock("a", "09:00", "10:00")], 0)).toMatchObject({ ratio: 0, freeMinutes: 0 });
  });
});

/** Overloaded 9h 40m (580m) with one 30m overlap: the board's "Move 2 to tomorrow". */
function overloadedDay() {
  return [
    dayBlock("a", "09:00", "13:00", { kind: "task", taskId: "a", priority: "high" }),
    dayBlock("b", "12:30", "15:30", { kind: "task", taskId: "b", priority: "medium" }),
    dayBlock("c", "15:30", "17:00", { kind: "task", taskId: "c", priority: "low" }),
    dayBlock("d", "17:00", "18:10", { kind: "task", taskId: "d", priority: "low" }),
  ];
}

describe("overloaded day", () => {
  it("reads 9h 40m of 8h with one overlap", () => {
    expect(computeCapacity(overloadedDay(), 480)).toMatchObject({
      plannedMinutes: 580,
      state: "over",
      overlapCount: 1,
      overlapMinutes: 30,
    });
  });

  it("moves the lowest-priority task blocks first, latest first on ties, until the plan fits", () => {
    expect(blocksToMoveToTomorrow(overloadedDay(), 480).map((block) => block.id)).toEqual(["d", "c"]);
  });

  it("moves at least one block when only an overlap makes the day over", () => {
    const blocks = [
      dayBlock("a", "09:00", "11:00", { kind: "task", taskId: "a", priority: "high" }),
      dayBlock("b", "10:30", "11:30", { kind: "task", taskId: "b", priority: "low" }),
    ];
    expect(blocksToMoveToTomorrow(blocks, 480).map((block) => block.id)).toEqual(["b"]);
  });

  it("never moves done blocks, events or routines; may move fewer than needed", () => {
    const blocks = [
      dayBlock("event", "08:00", "12:00"),
      dayBlock("done", "12:00", "15:00", { kind: "task", taskId: "x", done: true }),
      dayBlock("open", "15:00", "17:00", { kind: "task", taskId: "y" }),
    ];
    expect(movableBlocks(blocks).map((block) => block.id)).toEqual(["open"]);
    expect(blocksToMoveToTomorrow(blocks, 120).map((block) => block.id)).toEqual(["open"]);
    expect(blocksToMoveToTomorrow([dayBlock("event", "08:00", "20:00")], 480)).toEqual([]);
  });

  it("treats a task without priority as lowest", () => {
    const blocks = [
      dayBlock("p", "09:00", "14:00", { kind: "task", taskId: "p", priority: "low" }),
      dayBlock("n", "14:00", "18:00", { kind: "task", taskId: "n", priority: null }),
    ];
    expect(movableBlocks(blocks).map((block) => block.id)).toEqual(["n", "p"]);
  });
});
