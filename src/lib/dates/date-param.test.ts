import { addDays } from "date-fns";
import { describe, expect, it } from "vitest";
import { formatDateParam, parseDateParam } from "./date-param";
import { isJalaliLeapYear } from "./month-grid";

// The boards' sample day: "Tue 21 Mehr · 13 Oct".
const BOARD_DAY = new Date(2026, 9, 13);

const LEAP_YEAR = [1402, 1403, 1404, 1405, 1406, 1407, 1408].find(isJalaliLeapYear)!;
const COMMON_YEAR = [1402, 1403, 1404, 1405, 1406, 1407, 1408].find((year) => !isJalaliLeapYear(year))!;

describe("formatDateParam", () => {
  it("writes the Jalali date, zero-padded, with Latin digits", () => {
    expect(formatDateParam(BOARD_DAY)).toBe("1405-07-21");
    expect(formatDateParam(new Date(2026, 2, 21))).toBe("1405-01-01");
  });

  it("uses the date's local day, whatever the time", () => {
    expect(formatDateParam(new Date(2026, 9, 13, 23, 59))).toBe("1405-07-21");
  });
});

describe("parseDateParam", () => {
  it("reads a Jalali date as local midnight", () => {
    const date = parseDateParam("1405-07-21");
    expect(date).toEqual(BOARD_DAY);
    expect(date!.getDay()).toBe(2); // Tuesday
  });

  it("accepts Persian and Arabic-Indic digits", () => {
    expect(parseDateParam("۱۴۰۵-۰۷-۲۱")).toEqual(BOARD_DAY);
    expect(parseDateParam("١٤٠٥-٠٧-٢١")).toEqual(BOARD_DAY);
  });

  it("accepts unpadded month and day", () => {
    expect(parseDateParam("1405-7-21")).toEqual(BOARD_DAY);
  });

  it("accepts a Gregorian ISO date from a shared link", () => {
    expect(parseDateParam("2026-10-13")).toEqual(BOARD_DAY);
  });

  it("takes the first value of a repeated param", () => {
    expect(parseDateParam(["1405-07-21", "1405-07-22"])).toEqual(BOARD_DAY);
    expect(parseDateParam([])).toBeNull();
  });

  it("rejects days that do not exist", () => {
    expect(parseDateParam("1405-13-01")).toBeNull();
    expect(parseDateParam("1405-00-10")).toBeNull();
    expect(parseDateParam("1405-07-31")).toBeNull(); // Mehr has 30 days
    expect(parseDateParam("1405-07-32")).toBeNull();
    expect(parseDateParam("1405-07-00")).toBeNull();
    expect(parseDateParam("2026-02-29")).toBeNull();
    expect(parseDateParam("2026-13-01")).toBeNull();
  });

  it("allows Esfand 30 only in a Jalali leap year", () => {
    expect(isJalaliLeapYear(LEAP_YEAR)).toBe(true);
    expect(isJalaliLeapYear(COMMON_YEAR)).toBe(false);
    expect(parseDateParam(`${LEAP_YEAR}-12-30`)).not.toBeNull();
    expect(formatDateParam(parseDateParam(`${LEAP_YEAR}-12-30`)!)).toBe(`${LEAP_YEAR}-12-30`);
    expect(parseDateParam(`${COMMON_YEAR}-12-30`)).toBeNull();
    expect(parseDateParam(`${COMMON_YEAR}-12-29`)).not.toBeNull();
  });

  it.each([undefined, null, "", " ", "today", "1405/07/21", "14050721", "1405-07-21T00:00", "05-07-21", "0000-01-01"])(
    "returns null for %j",
    (value) => {
      expect(parseDateParam(value)).toBeNull();
    },
  );

  it("round-trips every day across several years", () => {
    let day = new Date(2024, 0, 1);
    for (let index = 0; index < 1200; index++) {
      const param = formatDateParam(day);
      expect(param).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(parseDateParam(param), param).toEqual(day);
      day = addDays(day, 1);
    }
  });
});
