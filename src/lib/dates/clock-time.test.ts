import { describe, expect, it } from "vitest";
import {
  addDaysToDay,
  addMinutesToInstant,
  dayOfInstant,
  dayToLocalDate,
  diffDays,
  durationBetween,
  formatClockTime,
  instantAt,
  instantAtTime,
  instantToClockTime,
  localDateToDay,
  minutesFromDayStart,
  minutesOfInstant,
  parseClockTime,
  parseDay,
  snap15,
  snapTo,
  weekdayOfDay,
} from "./clock-time";

describe("clock times", () => {
  it("parses HH:mm to minutes and rejects anything else", () => {
    expect(parseClockTime("00:00")).toBe(0);
    expect(parseClockTime("09:30")).toBe(570);
    expect(parseClockTime("9:05")).toBe(545);
    expect(parseClockTime("23:59")).toBe(1439);
    expect(parseClockTime("24:00")).toBe(1440);
    for (const bad of ["", "24:01", "12:60", "12", "ab:cd", "12:5", "-1:00"]) expect(parseClockTime(bad), bad).toBeNull();
  });

  it("formats minutes as HH:mm, 1440 as 24:00, and wraps other values", () => {
    expect(formatClockTime(0)).toBe("00:00");
    expect(formatClockTime(570)).toBe("09:30");
    expect(formatClockTime(1439)).toBe("23:59");
    expect(formatClockTime(1440)).toBe("24:00");
    expect(formatClockTime(1500)).toBe("01:00");
    expect(formatClockTime(-30)).toBe("23:30");
    expect(parseClockTime(formatClockTime(845))).toBe(845);
  });
});

describe("snapping", () => {
  it("snaps to the 15-minute grid", () => {
    expect(snap15(0)).toBe(0);
    expect(snap15(7)).toBe(0);
    expect(snap15(8)).toBe(15);
    expect(snap15(22)).toBe(15);
    expect(snap15(23)).toBe(30);
    expect(snap15(-5)).toBe(0);
    expect(snap15(61, "floor")).toBe(60);
    expect(snap15(61, "ceil")).toBe(75);
    expect(snap15(75, "ceil")).toBe(75);
  });

  it("snaps to other steps", () => {
    expect(snapTo(1095, 30, "ceil")).toBe(1110);
    expect(snapTo(1110, 30, "ceil")).toBe(1110);
    expect(snapTo(890, 30, "ceil")).toBe(900);
  });
});

describe("calendar days", () => {
  it("validates days", () => {
    expect(parseDay("2026-10-13")).toEqual({ year: 2026, month: 10, date: 13 });
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("2026-13-01")).toBeNull();
    expect(parseDay("26-10-13")).toBeNull();
  });

  it("adds days across month and year ends", () => {
    expect(addDaysToDay("2026-10-13", 1)).toBe("2026-10-14");
    expect(addDaysToDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDays("2026-10-13", "2026-10-17")).toBe(4);
    expect(diffDays("2026-10-17", "2026-10-13")).toBe(-4);
  });

  it("names the weekday: 13 Oct 2026 is a Tuesday, 16 Oct a Friday", () => {
    expect(weekdayOfDay("2026-10-13")).toBe(2);
    expect(weekdayOfDay("2026-10-15")).toBe(4);
    expect(weekdayOfDay("2026-10-16")).toBe(5);
    expect(weekdayOfDay("2026-10-17")).toBe(6);
  });

  it("round-trips through a local Date", () => {
    expect(localDateToDay(dayToLocalDate("2026-10-13"))).toBe("2026-10-13");
    expect(dayToLocalDate("2026-10-13").getHours()).toBe(0);
    expect(() => dayToLocalDate("nope")).toThrow(RangeError);
  });
});

describe("instants in the planner zone", () => {
  it("builds Tehran instants from a day and minutes", () => {
    expect(instantAt("2026-10-13", 14 * 60)).toBe("2026-10-13T14:00:00+03:30");
    expect(instantAt("2026-10-13", 8 * 60 + 45)).toBe("2026-10-13T08:45:00+03:30");
    expect(instantAt("2026-10-13", 0)).toBe("2026-10-13T00:00:00+03:30");
    expect(instantAtTime("2026-10-13", "09:30")).toBe("2026-10-13T09:30:00+03:30");
    expect(() => instantAtTime("2026-10-13", "25:00")).toThrow(RangeError);
  });

  it("treats 1440 as the next midnight", () => {
    expect(instantAt("2026-10-13", 1440)).toBe("2026-10-14T00:00:00+03:30");
    expect(instantAt("2026-10-13", -30)).toBe("2026-10-12T23:30:00+03:30");
  });

  it("reads the Tehran day and wall time of an instant, whatever offset it is written in", () => {
    expect(dayOfInstant("2026-10-13T14:35:00+03:30")).toBe("2026-10-13");
    expect(minutesOfInstant("2026-10-13T14:35:00+03:30")).toBe(14 * 60 + 35);
    // 20:30Z = 00:00 Tehran the next day.
    expect(dayOfInstant("2026-10-13T20:30:00Z")).toBe("2026-10-14");
    expect(minutesOfInstant("2026-10-13T20:30:00Z")).toBe(0);
    expect(dayOfInstant("2026-10-13T19:29:00Z")).toBe("2026-10-13");
    expect(instantToClockTime("2026-10-13T11:00:00+03:30")).toBe("11:00");
  });

  it("measures minutes from a day's start, including blocks that cross midnight", () => {
    const day = "2026-10-13";
    expect(minutesFromDayStart("2026-10-13T09:00:00+03:30", day)).toBe(540);
    expect(minutesFromDayStart("2026-10-14T00:30:00+03:30", day)).toBe(1470);
    expect(minutesFromDayStart("2026-10-12T23:00:00+03:30", day)).toBe(-60);
  });

  it("computes durations and shifts", () => {
    expect(durationBetween("2026-10-13T14:00:00+03:30", "2026-10-13T16:00:00+03:30")).toBe(120);
    expect(addMinutesToInstant("2026-10-13T23:30:00+03:30", 60)).toBe("2026-10-14T00:30:00+03:30");
    expect(addMinutesToInstant("2026-10-13T14:35:00+03:30", -35)).toBe("2026-10-13T14:00:00+03:30");
  });

  it("is consistent with the fixtures' sampleInstant format", () => {
    expect(instantAt("2026-10-13", 9 * 60 + 5)).toBe("2026-10-13T09:05:00+03:30");
  });
});
