import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateRange,
  formatDuration,
  formatTime,
  getWeekDays,
  type DateFormatOptions,
} from "./format";
import { getGregorianParts } from "./gregorian";
import { formatJalali, getJalaliParts } from "./jalali";
import { getWeekDates, isWeekend, isWorkday } from "./week";

// Tue 13 Oct 2026, 14:35 = 21 Mehr 1405 (the date used across the boards).
const DATE = new Date(2026, 9, 13, 14, 35);

const faJalali: DateFormatOptions = { calendar: "jalali", locale: "fa", digits: "fa" };
const enGregorian: DateFormatOptions = { calendar: "gregorian", locale: "en", digits: "latn" };

describe("Jalali", () => {
  it("converts to Solar Hijri parts", () => {
    expect(getJalaliParts(DATE)).toEqual({ year: 1405, month: 7, day: 21 });
  });

  it("handles Nowruz (1 Farvardin)", () => {
    expect(getJalaliParts(new Date(2026, 2, 21))).toEqual({ year: 1405, month: 1, day: 1 });
  });

  it("formats with Persian names and digits (FaRules samples)", () => {
    expect(formatDate(DATE, "full", faJalali)).toBe("سه‌شنبه ۲۱ مهر ۱۴۰۵");
    expect(formatDate(DATE, "short", faJalali)).toBe("۱۴۰۵/۰۷/۲۱");
    expect(formatDate(DATE, "monthYear", faJalali)).toBe("مهر ۱۴۰۵");
  });

  it("formats Jalali in English (Utility date picker)", () => {
    expect(formatDate(DATE, "full", { ...faJalali, locale: "en", digits: "latn" })).toBe(
      "Tue, 21 Mehr 1405",
    );
    expect(formatJalali(DATE, "MMMM yyyy", "en")).toBe("Mehr 1405");
  });

  it("uses the standard English spellings for Shahrivar and Dey", () => {
    expect(formatJalali(new Date(2026, 8, 1), "MMMM", "en")).toBe("Shahrivar");
    expect(formatJalali(new Date(2027, 0, 1), "MMMM", "en")).toBe("Dey");
    expect(formatJalali(new Date(2026, 8, 1), "MMMM", "fa")).toBe("شهریور");
  });

  it("formats a same-month range", () => {
    expect(formatDateRange(new Date(2026, 9, 10), new Date(2026, 9, 16), faJalali)).toBe(
      "۱۸ تا ۲۴ مهر",
    );
  });

  it("spells out both months when a range crosses months", () => {
    expect(formatDateRange(new Date(2026, 9, 20), new Date(2026, 9, 25), faJalali)).toBe(
      "۲۸ مهر تا ۳ آبان",
    );
  });

  it("honours English digits in Persian", () => {
    expect(formatDate(DATE, "short", { ...faJalali, digits: "latn" })).toBe("1405/07/21");
  });
});

describe("Gregorian", () => {
  it("formats English samples", () => {
    expect(getGregorianParts(DATE)).toEqual({ year: 2026, month: 10, day: 13 });
    expect(formatDate(DATE, "full", enGregorian)).toBe("Tue, 13 Oct 2026");
    expect(formatDate(DATE, "short", enGregorian)).toBe("13/10/2026");
    expect(formatDateRange(new Date(2026, 9, 10), new Date(2026, 9, 16), enGregorian)).toBe(
      "10 – 16 Oct",
    );
  });

  it("formats Gregorian in Persian when switched", () => {
    expect(formatDate(DATE, "short", { ...enGregorian, locale: "fa", digits: "fa" })).toBe(
      "۲۰۲۶/۱۰/۱۳",
    );
  });
});

describe("time and duration", () => {
  it("uses 24-hour time in Persian and 12-hour in English", () => {
    expect(formatTime(DATE, { locale: "fa", digits: "fa" })).toBe("۱۴:۳۵");
    expect(formatTime(DATE, { locale: "en", digits: "latn" })).toBe("2:35 pm");
    expect(formatTime(DATE, { locale: "en", digits: "latn", hourCycle: "h23" })).toBe("14:35");
  });

  it("formats durations", () => {
    expect(formatDuration(90, { locale: "fa", digits: "fa" })).toBe("۱ ساعت و ۳۰ دقیقه");
    expect(formatDuration(90, { locale: "en", digits: "latn" })).toBe("1h 30m");
    expect(formatDuration(120, { locale: "en", digits: "latn" })).toBe("2h");
    expect(formatDuration(0, { locale: "fa", digits: "latn" })).toBe("0 دقیقه");
  });
});

describe("Iranian week", () => {
  it("starts on Saturday and ends on Friday", () => {
    const week = getWeekDates(DATE);
    expect(week).toHaveLength(7);
    expect(week[0]!.getDay()).toBe(6);
    expect(week[6]!.getDay()).toBe(5);
    expect(week[0]!.getDate()).toBe(10);
  });

  it("treats Saturday–Wednesday as work days and Friday as the weekend", () => {
    const [sat, , , , wed, thu, fri] = getWeekDates(DATE);
    expect(isWorkday(sat!)).toBe(true);
    expect(isWorkday(wed!)).toBe(true);
    expect(isWorkday(thu!)).toBe(false);
    expect(isWeekend(thu!)).toBe(false);
    expect(isWeekend(fri!)).toBe(true);
  });

  it("labels the week for the chosen calendar", () => {
    const days = getWeekDays(DATE, faJalali);
    expect(days.map((day) => day.dayOfMonth)).toEqual(["۱۸", "۱۹", "۲۰", "۲۱", "۲۲", "۲۳", "۲۴"]);
    expect(days[0]!.label).toBe("شنبه");
    expect(days[6]!.isWeekend).toBe(true);
    expect(getWeekDays(DATE, enGregorian)[0]!.narrow).toBe("Sa");
  });
});
