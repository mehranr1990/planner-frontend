import { describe, expect, it } from "vitest";
import {
  blockDragData,
  blockDragId,
  createDropRegistry,
  dayDropId,
  isBlockDraggable,
  isDragData,
  minutesAtClientY,
  parseDropId,
  PX_PER_MINUTE,
  pxToMinutes,
  taskDragData,
  taskDragId,
  UNSCHEDULED_DROP_ID,
  type DayColumnGeometry,
} from "./drag";

describe("ids", () => {
  it("build draggable ids", () => {
    expect(taskDragId("t-ui-design")).toBe("task:t-ui-design");
    expect(blockDragId("gym")).toBe("block:gym");
  });

  it("build and parse droppable ids", () => {
    expect(dayDropId("2026-10-13")).toBe("day:2026-10-13");
    expect(parseDropId("day:2026-10-13")).toEqual({ type: "day", day: "2026-10-13" });
    expect(parseDropId(UNSCHEDULED_DROP_ID)).toEqual({ type: "unscheduled" });
    for (const bad of ["day:", "task:x", "", "unscheduled:x"]) expect(parseDropId(bad), bad).toBeNull();
    expect(parseDropId(7)).toBeNull();
  });
});

describe("payloads", () => {
  it("carry what the controller needs", () => {
    expect(taskDragData({ id: "t1", title: "Reply", durationMinutes: 20, energy: "medium", scope: "project" } as never)).toEqual({
      type: "task",
      taskId: "t1",
      title: "Reply",
      durationMinutes: 20,
      energy: "medium",
    });
    expect(blockDragData({ id: "b1", taskId: "t1", durationMinutes: 45 })).toEqual({
      type: "block",
      blockId: "b1",
      taskId: "t1",
      durationMinutes: 45,
    });
    expect(blockDragData({ id: "e1", durationMinutes: 30 }).taskId).toBeUndefined();
  });

  it("are recognised by isDragData", () => {
    expect(isDragData(taskDragData({ id: "t", title: "T", durationMinutes: null, energy: null }))).toBe(true);
    expect(isDragData(blockDragData({ id: "b", durationMinutes: 15 }))).toBe(true);
    for (const bad of [null, undefined, "task", {}, { type: "task" }, { type: "block", taskId: "x" }, { type: "other", taskId: "x" }]) {
      expect(isDragData(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("done blocks are not draggable", () => {
    expect(isBlockDraggable({ done: true })).toBe(false);
    expect(isBlockDraggable({ done: false })).toBe(true);
  });
});

describe("pixel mapping", () => {
  it("is 64px per hour", () => {
    expect(PX_PER_MINUTE).toBeCloseTo(1.0667, 4);
    expect(pxToMinutes(64)).toBeCloseTo(60);
    expect(pxToMinutes(32, 2)).toBe(16);
  });
});

function column(day: string, top: number | null, patch: Partial<DayColumnGeometry> = {}): DayColumnGeometry {
  return { day, windowStartMinutes: 480, windowEndMinutes: 1200, pxPerMinute: 2, getTop: () => top, ...patch };
}

describe("drop registry", () => {
  it("maps a viewport y to minutes through the column geometry", () => {
    expect(minutesAtClientY(column("d", 100), 100)).toBe(480);
    expect(minutesAtClientY(column("d", 100), 220)).toBe(540);
    expect(minutesAtClientY(column("d", 100), 40)).toBe(450);
    expect(minutesAtClientY(column("d", null), 40)).toBeNull();
  });

  it("registers columns, lists days in order and answers per day", () => {
    const registry = createDropRegistry();
    registry.register(column("2026-10-14", 0));
    registry.register(column("2026-10-13", 100));
    expect(registry.days()).toEqual(["2026-10-13", "2026-10-14"]);
    expect(registry.minutesAt("2026-10-13", 220)).toBe(540);
    expect(registry.minutesAt("2026-10-14", 0)).toBe(480);
    expect(registry.minutesAt("2026-10-20", 0)).toBeNull();
    expect(registry.get("2026-10-13")?.pxPerMinute).toBe(2);
  });

  it("unregisters, and an old cleanup does not remove a newer registration", () => {
    const registry = createDropRegistry();
    const first = column("2026-10-13", 0);
    const second = column("2026-10-13", 50);
    const removeFirst = registry.register(first);
    const removeSecond = registry.register(second);
    removeFirst();
    expect(registry.get("2026-10-13")).toBe(second);
    removeSecond();
    expect(registry.get("2026-10-13")).toBeUndefined();
    expect(registry.days()).toEqual([]);
  });

  it("reads the column top lazily, so a scroll mid-drag is honoured", () => {
    let top = 100;
    const registry = createDropRegistry();
    registry.register(column("d", 0, { getTop: () => top }));
    expect(registry.minutesAt("d", 220)).toBe(540);
    top = 40;
    expect(registry.minutesAt("d", 220)).toBe(570);
  });
});
