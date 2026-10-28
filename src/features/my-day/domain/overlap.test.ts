import { describe, expect, it } from "vitest";
import { findOverlaps, overlapMinutesByBlock, overlapsWith } from "./overlap";
import { dayBlock, sampleDayBlocks } from "./test-utils";

describe("findOverlaps", () => {
  it("finds none on the sample day (blocks may touch)", () => {
    expect(findOverlaps(sampleDayBlocks())).toEqual([]);
    expect(findOverlaps([dayBlock("a", "09:00", "10:00"), dayBlock("b", "10:00", "11:00")])).toEqual([]);
  });

  it("reports each overlapping pair with its span and minutes", () => {
    const blocks = [
      dayBlock("b", "11:30", "13:30"),
      dayBlock("a", "09:00", "12:00"),
      dayBlock("c", "13:00", "14:00"),
      dayBlock("far", "18:00", "19:00"),
    ];
    expect(findOverlaps(blocks)).toEqual([
      { aId: "a", bId: "b", startMinutes: 690, endMinutes: 720, minutes: 30 },
      { aId: "b", bId: "c", startMinutes: 780, endMinutes: 810, minutes: 30 },
    ]);
  });

  it("counts a block that covers several others once per pair", () => {
    const blocks = [dayBlock("long", "09:00", "17:00"), dayBlock("s1", "10:00", "11:00"), dayBlock("s2", "12:00", "13:00")];
    expect(findOverlaps(blocks).map((overlap) => overlap.minutes)).toEqual([60, 60]);
  });
});

describe("overlapsWith", () => {
  const blocks = sampleDayBlocks();

  it("lists the blocks a candidate would overlap, with the minutes shared", () => {
    // 15:30–16:45 hits the end of UI design (30m) and the start of the client call (15m).
    expect(overlapsWith(blocks, { startMinutes: 930, endMinutes: 1005 })).toEqual([
      { id: "ui-design", title: "UI design · My Day screen", minutes: 30 },
      { id: "client-call", title: "Client call", minutes: 15 },
    ]);
  });

  it("ignores the block being moved, and free slots overlap nothing", () => {
    expect(overlapsWith(blocks, { startMinutes: 840, endMinutes: 960 }, "ui-design")).toEqual([]);
    expect(overlapsWith(blocks, { startMinutes: 960, endMinutes: 990 })).toEqual([]);
  });
});

describe("overlapMinutesByBlock", () => {
  it("maps each overlapping block to its largest overlap", () => {
    const blocks = [dayBlock("a", "09:00", "12:00"), dayBlock("b", "11:30", "13:30"), dayBlock("c", "13:00", "14:00"), dayBlock("d", "15:00", "16:00")];
    const map = overlapMinutesByBlock(blocks);
    expect(Object.fromEntries(map)).toEqual({ a: 30, b: 30, c: 30 });
    expect(map.has("d")).toBe(false);
  });
});
