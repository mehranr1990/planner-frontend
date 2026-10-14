import { describe, expect, it } from "vitest";
import {
  addCalendarMonths,
  clampToRange,
  createCalendarDate,
  dayKey,
  getCalendarParts,
  getDaysInCalendarMonth,
  getMonthGrid,
  isJalaliLeapYear,
  isMonthInRange,
  isOutsideRange,
  isSameCalendarMonth,
  startOfCalendarMonth,
  weekColumn,
} from "./month-grid";

const jalali = (y: number, m: number, d: number) => createCalendarDate("jalali", y, m, d);

describe("Jalali month lengths", () => {
  it("has 31 days in the first six months and 30 in months 7–11", () => {
    for (let month = 1; month <= 6; month++) {
      expect(getDaysInCalendarMonth(jalali(1405, month, 1), "jalali"), `month ${month}`).toBe(31);
    }
    for (let month = 7; month <= 11; month++) {
      expect(getDaysInCalendarMonth(jalali(1405, month, 1), "jalali"), `month ${month}`).toBe(30);
    }
  });

  it("gives Esfand 30 days in leap years and 29 otherwise", () => {
    expect(isJalaliLeapYear(1399)).toBe(true);
    expect(isJalaliLeapYear(1403)).toBe(true);
    expect(isJalaliLeapYear(1404)).toBe(false);
    expect(isJalaliLeapYear(1405)).toBe(false);
    expect(getDaysInCalendarMonth(jalali(1403, 12, 1), "jalali")).toBe(30);
    expect(getDaysInCalendarMonth(jalali(1404, 12, 1), "jalali")).toBe(29);
  });

  it("maps Jalali dates to the right Gregorian day", () => {
    expect(jalali(1405, 7, 1)).toEqual(new Date(2026, 8, 23));
    expect(jalali(1405, 1, 1)).toEqual(new Date(2026, 2, 21));
    expect(getCalendarParts(new Date(2026, 9, 13), "jalali")).toEqual({ year: 1405, month: 7, day: 21 });
  });
});

describe("Gregorian month lengths", () => {
  it("handles February in leap and common years", () => {
    expect(getDaysInCalendarMonth(new Date(2028, 1, 10), "gregorian")).toBe(29);
    expect(getDaysInCalendarMonth(new Date(2026, 1, 10), "gregorian")).toBe(28);
    expect(getDaysInCalendarMonth(new Date(2026, 9, 1), "gregorian")).toBe(31);
  });
});

describe("getMonthGrid", () => {
  it("aligns Mehr 1405 to a Saturday-first week (1 Mehr is a Wednesday)", () => {
    const grid = getMonthGrid(new Date(2026, 9, 13), "jalali");
    expect(grid).toHaveLength(5);
    const first = grid[0]!;
    expect(first.slice(0, 4).every((day) => !day.inMonth)).toBe(true);
    expect(first[4]).toMatchObject({ dayOfMonth: 1, inMonth: true, weekday: 3 });
    expect(first[0]!.weekday).toBe(6); // Saturday column
    expect(first[6]!.isWeekend).toBe(true); // Friday column
    const inMonth = grid.flat().filter((day) => day.inMonth);
    expect(inMonth).toHaveLength(30);
    expect(inMonth.at(-1)!.dayOfMonth).toBe(30);
  });

  it("aligns October 2026 (1 Oct is a Thursday, five leading days)", () => {
    const grid = getMonthGrid(new Date(2026, 9, 13), "gregorian");
    expect(grid[0]!.findIndex((day) => day.inMonth)).toBe(5);
    expect(grid.flat().filter((day) => day.inMonth)).toHaveLength(31);
    expect(grid).toHaveLength(6);
  });

  it("returns whole consecutive weeks", () => {
    const days = getMonthGrid(jalali(1403, 12, 5), "jalali").flat();
    expect(days.length % 7).toBe(0);
    for (let index = 1; index < days.length; index++) {
      const gap = (days[index]!.date.getTime() - days[index - 1]!.date.getTime()) / 86_400_000;
      expect(Math.round(gap)).toBe(1);
    }
    expect(days.filter((day) => day.inMonth)).toHaveLength(30);
  });

  it("pads to six weeks when fixedWeeks is set", () => {
    expect(getMonthGrid(jalali(1405, 7, 1), "jalali", { fixedWeeks: true })).toHaveLength(6);
  });

  it("starts with a full in-month first row when day 1 is a Saturday", () => {
    // 1 Aug 2026 is a Saturday.
    const grid = getMonthGrid(new Date(2026, 7, 15), "gregorian");
    expect(grid[0]![0]).toMatchObject({ dayOfMonth: 1, inMonth: true });
  });
});

describe("month arithmetic", () => {
  it("adds Jalali months and clamps the day", () => {
    const end = jalali(1405, 6, 31);
    expect(getCalendarParts(addCalendarMonths(end, 1, "jalali"), "jalali")).toEqual({
      year: 1405,
      month: 7,
      day: 30,
    });
    expect(getCalendarParts(addCalendarMonths(jalali(1405, 1, 10), -1, "jalali"), "jalali")).toEqual({
      year: 1404,
      month: 12,
      day: 10,
    });
  });

  it("finds month starts and compares months per calendar", () => {
    expect(startOfCalendarMonth(new Date(2026, 9, 13), "jalali")).toEqual(new Date(2026, 8, 23));
    expect(startOfCalendarMonth(new Date(2026, 9, 13), "gregorian")).toEqual(new Date(2026, 9, 1));
    const a = new Date(2026, 8, 30);
    const b = new Date(2026, 9, 2);
    expect(isSameCalendarMonth(a, b, "jalali")).toBe(true);
    expect(isSameCalendarMonth(a, b, "gregorian")).toBe(false);
  });

  it("knows the Saturday-first column", () => {
    expect(weekColumn(new Date(2026, 9, 10))).toBe(0); // Saturday
    expect(weekColumn(new Date(2026, 9, 16))).toBe(6); // Friday
  });
});

describe("ranges", () => {
  const min = new Date(2026, 9, 10);
  const max = new Date(2026, 9, 20, 18, 0);

  it("compares by day, ignoring time", () => {
    expect(isOutsideRange(new Date(2026, 9, 10, 23, 0), min, max)).toBe(false);
    expect(isOutsideRange(new Date(2026, 9, 20, 0, 0), min, max)).toBe(false);
    expect(isOutsideRange(new Date(2026, 9, 9), min, max)).toBe(true);
    expect(isOutsideRange(new Date(2026, 9, 21), min, max)).toBe(true);
    expect(isOutsideRange(new Date(2020, 0, 1))).toBe(false);
  });

  it("clamps into range", () => {
    expect(clampToRange(new Date(2026, 0, 1), min, max)).toEqual(min);
    expect(clampToRange(new Date(2027, 0, 1), min, max)).toEqual(new Date(2026, 9, 20));
    const inside = new Date(2026, 9, 15);
    expect(clampToRange(inside, min, max)).toBe(inside);
  });

  it("checks whether a month has any day in range", () => {
    expect(isMonthInRange(new Date(2026, 9, 1), "gregorian", min, max)).toBe(true);
    expect(isMonthInRange(new Date(2026, 10, 1), "gregorian", min, max)).toBe(false);
    // Shahrivar 1405 ends 22 Sep, before min.
    expect(isMonthInRange(jalali(1405, 6, 1), "jalali", min, max)).toBe(false);
    expect(isMonthInRange(jalali(1405, 7, 1), "jalali", min, max)).toBe(true);
  });

  it("builds stable day keys", () => {
    expect(dayKey(new Date(2026, 9, 3, 15))).toBe("2026-10-03");
  });
});
