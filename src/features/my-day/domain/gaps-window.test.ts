import { describe, expect, it } from "vitest";
import { freeGaps, fitHints, gapHints, HINT_GAP_MINUTES } from "./gaps";
import { dayBlock, sampleDayBlocks } from "./test-utils";
import { visibleWindow } from "./window";

const WORK = { startMinutes: 540, endMinutes: 1020 };

describe("visibleWindow", () => {
  it("the default day is 08:00–20:00", () => {
    expect(visibleWindow(sampleDayBlocks(), WORK)).toEqual({ startMinutes: 480, endMinutes: 1200 });
  });

  it("an empty day shows an hour before work to three hours after", () => {
    expect(visibleWindow([], WORK)).toEqual({ startMinutes: 480, endMinutes: 1200 });
  });

  it("grows to the earliest and latest block, in whole hours", () => {
    const early = dayBlock("early", "06:20", "07:00");
    const late = dayBlock("late", "21:10", "22:15");
    // Floor 06:20 → 06:00; ceil(22:15 + 30m = 22:45) → 23:00.
    expect(visibleWindow([early, late], WORK)).toEqual({ startMinutes: 360, endMinutes: 1380 });
  });

  it("is not pulled in by blocks inside the default window", () => {
    expect(visibleWindow([dayBlock("noon", "12:00", "13:00")], WORK)).toEqual({ startMinutes: 480, endMinutes: 1200 });
  });

  it("clamps to the day", () => {
    expect(visibleWindow([dayBlock("night", "00:10", "23:50")], WORK)).toEqual({ startMinutes: 0, endMinutes: 1440 });
    expect(visibleWindow([], { startMinutes: 30, endMinutes: 1400 })).toEqual({ startMinutes: 0, endMinutes: 1440 });
  });
});

describe("freeGaps", () => {
  const window = { startMinutes: 480, endMinutes: 1200 };

  it("lists the gaps of the sample day inside the window", () => {
    expect(freeGaps(sampleDayBlocks(), window).map((gap) => [gap.startMinutes, gap.endMinutes, gap.minutes])).toEqual([
      [525, 540, 15],
      [705, 780, 75],
      [825, 840, 15],
      [960, 990, 30],
      [1020, 1035, 15],
      [1095, 1200, 105],
    ]);
  });

  it("filters by minimum length", () => {
    expect(freeGaps(sampleDayBlocks(), window, HINT_GAP_MINUTES).map((gap) => gap.minutes)).toEqual([75, 105]);
  });

  it("returns the whole window for an empty day, nothing for a full one", () => {
    expect(freeGaps([], window)).toEqual([{ startMinutes: 480, endMinutes: 1200, minutes: 720 }]);
    expect(freeGaps([dayBlock("all", "07:00", "21:00")], window)).toEqual([]);
  });

  it("handles overlapping blocks and blocks outside the window", () => {
    const blocks = [dayBlock("a", "09:00", "11:00"), dayBlock("b", "10:00", "10:30"), dayBlock("x", "05:00", "06:00"), dayBlock("y", "22:00", "23:00")];
    expect(freeGaps(blocks, window).map((gap) => [gap.startMinutes, gap.endMinutes])).toEqual([
      [480, 540],
      [660, 1200],
    ]);
  });
});

describe("fitHints", () => {
  const tasks = [
    { durationMinutes: 10, energy: "low" as const },
    { durationMinutes: 20, energy: "medium" as const },
    { durationMinutes: 90, energy: "medium" as const },
    { durationMinutes: 60, energy: "high" as const },
    { durationMinutes: null, energy: null },
  ];
  const gap = (start: number, minutes: number) => ({ startMinutes: start, endMinutes: start + minutes, minutes });

  it("counts tasks whose duration fits the gap (a missing duration is the default 30m)", () => {
    // Afternoon gap, medium energy: high-energy work is held back.
    expect(fitHints(gap(15 * 60, 30), tasks, "medium")).toBe(3);
    expect(fitHints(gap(15 * 60, 15), tasks, "medium")).toBe(1);
    expect(fitHints(gap(15 * 60, 120), tasks, "medium")).toBe(4);
  });

  it("counts high-energy tasks in a 09:00–12:00 gap or when the selected energy is high", () => {
    expect(fitHints(gap(10 * 60, 120), tasks, "low")).toBe(5);
    expect(fitHints(gap(12 * 60, 120), tasks, "low")).toBe(4);
    expect(fitHints(gap(15 * 60, 120), tasks, "high")).toBe(5);
    expect(fitHints(gap(9 * 60 - 15, 120), tasks, "low")).toBe(4);
  });

  it("honours another default duration", () => {
    expect(fitHints(gap(15 * 60, 45), [{ durationMinutes: null, energy: null }], "medium", 60)).toBe(0);
  });
});

describe("gapHints", () => {
  it("returns only gaps of an hour or more, with how many tasks fit", () => {
    const tasks = [
      { durationMinutes: 30, energy: "low" as const },
      { durationMinutes: 90, energy: "medium" as const },
    ];
    const blocks = [dayBlock("a", "08:00", "10:00"), dayBlock("b", "12:00", "17:00")];
    const hints = gapHints(blocks, { startMinutes: 480, endMinutes: 1200 }, tasks, "medium");
    expect(hints).toEqual([
      { gap: { startMinutes: 600, endMinutes: 720, minutes: 120 }, fit: 2 },
      { gap: { startMinutes: 1020, endMinutes: 1200, minutes: 180 }, fit: 2 },
    ]);
  });
});
