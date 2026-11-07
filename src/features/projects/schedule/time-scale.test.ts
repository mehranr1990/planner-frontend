import { describe, expect, it } from "vitest";
import { draggedSpan } from "./bar-drag";
import { makeScale, packRows } from "./time-scale";

describe("project time scale", () => {
  it("maps days to x and mirrors in RTL (x → width − x)", () => {
    const ltr = makeScale("2026-10-01", "2026-10-31", "weeks", false);
    const rtl = makeScale("2026-10-01", "2026-10-31", "weeks", true);
    expect(ltr.width).toBe(31 * 16);
    expect(ltr.x("2026-10-03")).toBe(32);
    expect(rtl.x("2026-10-03")).toBe(ltr.width - 32);
    const a = ltr.span("2026-10-03", "2026-10-04", 84);
    const b = rtl.span("2026-10-03", "2026-10-04", 84);
    expect(a).toEqual({ left: 32, width: 84 });
    expect(b.left).toBe(ltr.width - 32 - 84);
    expect(ltr.daysFor(33)).toBe(2);
    expect(rtl.daysFor(33)).toBe(-2);
  });

  it("weeks start on Saturday; months follow the calendar", () => {
    const weeks = makeScale("2026-10-01", "2026-10-20", "weeks", false).ticks("gregorian");
    expect(weeks.map((tick) => tick.day)).toEqual(["2026-10-03", "2026-10-10", "2026-10-17"]);
    const months = makeScale("2026-09-01", "2026-11-30", "months", false).ticks("jalali");
    // 1 Mehr = 23 Sep, 1 Aban = 23 Oct, 1 Azar = 22 Nov.
    expect(months.map((tick) => tick.day)).toEqual(["2026-09-23", "2026-10-23", "2026-11-22"]);
  });

  it("packs overlapping bars into rows and drags ends without inverting", () => {
    const rows = packRows([
      { start: "2026-10-01", end: "2026-10-05" },
      { start: "2026-10-03", end: "2026-10-06" },
      { start: "2026-10-07", end: "2026-10-08" },
    ]);
    expect(rows.map((row) => row.length)).toEqual([2, 1]);
    expect(draggedSpan("2026-10-01", "2026-10-05", "end", 3)).toEqual({ start: "2026-10-01", end: "2026-10-08" });
    expect(draggedSpan("2026-10-01", "2026-10-05", "start", 9)).toEqual({ start: "2026-10-05", end: "2026-10-05" });
    expect(draggedSpan("2026-10-01", "2026-10-05", "move", -1)).toEqual({ start: "2026-09-30", end: "2026-10-04" });
  });
});
