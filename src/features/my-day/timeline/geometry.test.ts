import { describe, expect, it } from "vitest";
import { dayBlock } from "../domain/test-utils";
import { buildDayModel, laneOf } from "./timeline-model";
import {
  assignLanes,
  blockHeight,
  blockTop,
  gridHeight,
  hourMarks,
  isRoomyBlock,
  isShortBlock,
  MIN_BLOCK_PX,
  pxPerMinuteFor,
} from "./geometry";

describe("timeline geometry", () => {
  it("draws 64px per hour on desktop and 56px below lg", () => {
    expect(pxPerMinuteFor(true)).toBeCloseTo(64 / 60, 6);
    expect(pxPerMinuteFor(false)).toBeCloseTo(56 / 60, 6);
  });

  it("places a block from its start and leaves a 4px gap under it", () => {
    const ppm = pxPerMinuteFor(true);
    // 11:00 in an 08:00 window = 3h = 192px; 45m = 48px - 4px.
    expect(blockTop(11 * 60, 8 * 60, ppm)).toBeCloseTo(192, 6);
    expect(blockHeight(45, ppm)).toBeCloseTo(44, 6);
    expect(blockHeight(120, ppm)).toBeCloseTo(124, 6);
  });

  it("keeps a 15-minute block tappable and uses the single row under 40px", () => {
    const ppm = pxPerMinuteFor(true);
    expect(blockHeight(15, ppm)).toBe(MIN_BLOCK_PX);
    expect(isShortBlock(blockHeight(30, ppm))).toBe(true);
    expect(isShortBlock(blockHeight(45, ppm))).toBe(false);
  });

  it("lets a block from 64px up wrap its title and meta instead of truncating", () => {
    const phone = pxPerMinuteFor(false);
    // The 2h current block of the board (108px) wraps; the 1h Gym (52px) and a 45m block do not.
    expect(isRoomyBlock(blockHeight(120, phone))).toBe(true);
    expect(isRoomyBlock(blockHeight(60, phone))).toBe(false);
    expect(isRoomyBlock(blockHeight(45, phone))).toBe(false);
    expect(isRoomyBlock(blockHeight(90, phone))).toBe(true);
  });

  it("draws an hour line per whole hour of the window, end included", () => {
    expect(hourMarks({ startMinutes: 480, endMinutes: 1200 })).toHaveLength(13);
    expect(hourMarks({ startMinutes: 480, endMinutes: 1200 })[0]).toBe(480);
    expect(hourMarks({ startMinutes: 495, endMinutes: 600 })).toEqual([540, 600]);
  });

  it("sizes the grid to the window plus label room", () => {
    const height = gridHeight({ startMinutes: 480, endMinutes: 1200 }, pxPerMinuteFor(true));
    expect(height).toBeCloseTo(12 * 64 + 10, 6);
  });
});

describe("assignLanes", () => {
  it("gives a block that overlaps nothing the whole width", () => {
    const lanes = assignLanes([dayBlock("a", "09:00", "10:00"), dayBlock("b", "10:00", "11:00")]);
    expect(lanes.get("a")).toEqual({ index: 0, count: 1 });
    expect(lanes.get("b")).toEqual({ index: 0, count: 1 });
  });

  it("splits overlapping blocks into lanes and reuses a lane once it is free", () => {
    const lanes = assignLanes([
      dayBlock("a", "09:00", "11:00"),
      dayBlock("b", "10:30", "11:30"),
      dayBlock("c", "11:00", "12:00"),
      dayBlock("far", "15:00", "16:00"),
    ]);
    expect(lanes.get("a")).toEqual({ index: 0, count: 2 });
    expect(lanes.get("b")).toEqual({ index: 1, count: 2 });
    expect(lanes.get("c")).toEqual({ index: 0, count: 2 });
    expect(lanes.get("far")).toEqual({ index: 0, count: 1 });
  });
});

describe("buildDayModel", () => {
  const blocks = [
    dayBlock("deep", "09:00", "11:00", { kind: "task", taskId: "t1" }),
    dayBlock("review", "10:30", "11:30"),
    dayBlock("done", "11:15", "12:00", { done: true }),
  ];

  it("flags open overlapping blocks with the minutes shared, never done ones", () => {
    const model = buildDayModel(blocks, { totalMinutes: 480, nowMinutes: null });
    expect(model.overlapById.get("deep")).toBe(30);
    expect(model.overlapById.get("review")).toBe(30);
    expect(model.overlapById.has("done")).toBe(false);
    expect(model.capacity.overlapCount).toBeGreaterThan(0);
  });

  it("knows the live block only when it is given a now", () => {
    expect(buildDayModel(blocks, { totalMinutes: 480, nowMinutes: null }).currentId).toBeNull();
    expect(buildDayModel(blocks, { totalMinutes: 480, nowMinutes: 9 * 60 + 30 }).currentId).not.toBeNull();
  });

  it("falls back to a single lane for an unknown id", () => {
    const model = buildDayModel(blocks, { totalMinutes: 480, nowMinutes: null });
    expect(laneOf(model, "missing")).toEqual({ index: 0, count: 1 });
  });
});
