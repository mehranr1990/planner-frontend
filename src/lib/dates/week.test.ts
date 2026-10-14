import { describe, expect, it } from "vitest";
import {
  IRAN_WEEK,
  WEEKEND_DAYS,
  WEEK_STARTS_ON,
  WORK_DAYS,
  getDayKind,
  getWeekDates,
  isHalfDay,
  isWeekend,
  isWorkday,
  isWorkingDay,
  nextWorkingDay,
  type WeekConfig,
} from "./week";

// Saturday 10 Oct 2026 (18 Mehr 1405) … Friday 16 Oct 2026.
const SAT = new Date(2026, 9, 10);
const SUN = new Date(2026, 9, 11);
const WED = new Date(2026, 9, 14);
const THU = new Date(2026, 9, 15);
const FRI = new Date(2026, 9, 16);
const NEXT_SAT = new Date(2026, 9, 17);

/** A European week: Monday first, Saturday and Sunday off, no half days. */
const EUROPE: WeekConfig = { weekStartsOn: 1, workDays: [1, 2, 3, 4, 5], halfDays: [], weekendDays: [6, 0] };

describe("IRAN_WEEK", () => {
  it("is Saturday-first with Sat–Wed work, Thursday half and Friday off", () => {
    expect(IRAN_WEEK).toEqual({ weekStartsOn: 6, workDays: [6, 0, 1, 2, 3], halfDays: [4], weekendDays: [5] });
  });

  it("keeps the legacy constants in sync", () => {
    expect(WEEK_STARTS_ON).toBe(IRAN_WEEK.weekStartsOn);
    expect(WORK_DAYS).toEqual(IRAN_WEEK.workDays);
    expect(WEEKEND_DAYS).toEqual(IRAN_WEEK.weekendDays);
  });
});

describe("day kinds (Iranian week)", () => {
  it("classifies every day of the week", () => {
    expect(getWeekDates(SAT).map((day) => getDayKind(day))).toEqual([
      "work",
      "work",
      "work",
      "work",
      "work",
      "half",
      "weekend",
    ]);
  });

  it("keeps isWorkday for full work days only", () => {
    expect(isWorkday(SAT)).toBe(true);
    expect(isWorkday(WED)).toBe(true);
    expect(isWorkday(THU)).toBe(false);
    expect(isWorkday(FRI)).toBe(false);
  });

  it("marks Thursday as a half day and Friday as the weekend", () => {
    expect(isHalfDay(THU)).toBe(true);
    expect(isHalfDay(WED)).toBe(false);
    expect(isWeekend(FRI)).toBe(true);
    expect(isWeekend(THU)).toBe(false);
  });

  it("counts half days as working days unless excluded", () => {
    expect(isWorkingDay(THU)).toBe(true);
    expect(isWorkingDay(THU, { includeHalfDays: false })).toBe(false);
    expect(isWorkingDay(SUN, { includeHalfDays: false })).toBe(true);
    expect(isWorkingDay(FRI)).toBe(false);
  });
});

describe("nextWorkingDay", () => {
  it("follows the Iranian week", () => {
    expect(nextWorkingDay(WED)).toEqual(THU);
    expect(nextWorkingDay(THU)).toEqual(NEXT_SAT);
    expect(nextWorkingDay(FRI)).toEqual(NEXT_SAT);
    expect(nextWorkingDay(SAT)).toEqual(SUN);
  });

  it("skips half days when asked", () => {
    expect(nextWorkingDay(WED, { includeHalfDays: false })).toEqual(NEXT_SAT);
  });

  it("is strictly after `from` and returns local midnight", () => {
    const result = nextWorkingDay(new Date(2026, 9, 15, 23, 59, 30));
    expect(result).toEqual(NEXT_SAT);
    expect(result!.getHours()).toBe(0);
    expect(result!.getMinutes()).toBe(0);
  });

  it("returns null when the config has no working days", () => {
    const allOff: WeekConfig = { weekStartsOn: 6, workDays: [], halfDays: [], weekendDays: [5] };
    expect(nextWorkingDay(WED, { config: allOff })).toBeNull();
    expect(nextWorkingDay(THU, { config: IRAN_WEEK, includeHalfDays: false })).toEqual(NEXT_SAT);
  });
});

describe("getWeekDates", () => {
  it("returns the Saturday-first week by default", () => {
    const week = getWeekDates(new Date(2026, 9, 13));
    expect(week).toHaveLength(7);
    expect(week[0]).toEqual(SAT);
    expect(week[6]).toEqual(FRI);
  });

  it("starts on the config's first day", () => {
    const week = getWeekDates(new Date(2026, 9, 13), EUROPE);
    expect(week[0]).toEqual(new Date(2026, 9, 12));
    expect(week[0]!.getDay()).toBe(1);
    expect(week[6]!.getDay()).toBe(0);
  });
});

describe("custom week config", () => {
  it("classifies days by the given config", () => {
    expect(getDayKind(SAT, EUROPE)).toBe("weekend");
    expect(getDayKind(SUN, EUROPE)).toBe("weekend");
    expect(getDayKind(THU, EUROPE)).toBe("work");
    expect(getDayKind(FRI, EUROPE)).toBe("work");
    expect(isWorkday(FRI, EUROPE)).toBe(true);
    expect(isWeekend(SUN, EUROPE)).toBe(true);
    expect(isHalfDay(THU, EUROPE)).toBe(false);
  });

  it("finds the next working day across a two-day weekend", () => {
    expect(nextWorkingDay(FRI, { config: EUROPE })).toEqual(new Date(2026, 9, 19));
    expect(nextWorkingDay(NEXT_SAT, { config: EUROPE })).toEqual(new Date(2026, 9, 19));
  });

  it("reports days a config leaves out as off", () => {
    const short: WeekConfig = { weekStartsOn: 6, workDays: [6, 0, 1], halfDays: [], weekendDays: [5] };
    expect(getDayKind(WED, short)).toBe("off");
    expect(isWorkingDay(WED, { config: short })).toBe(false);
    expect(isWeekend(WED, short)).toBe(false);
  });

  it("lets the weekend win when a day is listed twice", () => {
    const clash: WeekConfig = { ...IRAN_WEEK, workDays: [...IRAN_WEEK.workDays, 5] };
    expect(getDayKind(FRI, clash)).toBe("weekend");
  });
});
