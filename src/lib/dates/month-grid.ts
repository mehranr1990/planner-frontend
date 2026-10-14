import {
  addDays,
  addMonths as addGregorianMonths,
  getDaysInMonth as getGregorianDaysInMonth,
  isSameDay,
  isSameMonth as isSameGregorianMonth,
  startOfDay,
  startOfMonth as startOfGregorianMonth,
} from "date-fns";
import {
  addMonths as addJalaliMonths,
  getDaysInMonth as getJalaliDaysInMonth,
  isLeapYear as isJalaliLeapYearDate,
  isSameMonth as isSameJalaliMonth,
  newDate as newJalaliDate,
  startOfMonth as startOfJalaliMonth,
} from "date-fns-jalali";
import type { CalendarSystem } from "./format";
import { getGregorianParts } from "./gregorian";
import { getJalaliParts, type CalendarParts } from "./jalali";
import { WEEK_STARTS_ON, isWeekend, type Weekday } from "./week";

/*
 * Pure month-grid math for the date picker, on either calendar. Dates are
 * plain local-midnight JS Dates; only the month boundaries differ between
 * Jalali and Gregorian. Weeks are Saturday-first (see week.ts).
 */

export interface MonthGridDay {
  date: Date;
  /** Day of the month in the grid's calendar (1–31). */
  dayOfMonth: number;
  /** False for leading/trailing days that belong to the neighbouring months. */
  inMonth: boolean;
  weekday: Weekday;
  isWeekend: boolean;
}

export type MonthGrid = MonthGridDay[][];

export function getCalendarParts(date: Date, calendar: CalendarSystem): CalendarParts {
  return calendar === "jalali" ? getJalaliParts(date) : getGregorianParts(date);
}

/** Local midnight of `year/month/day` (month 1–12) in the given calendar. */
export function createCalendarDate(
  calendar: CalendarSystem,
  year: number,
  month: number,
  day: number,
): Date {
  return calendar === "jalali" ? newJalaliDate(year, month - 1, day) : new Date(year, month - 1, day);
}

export function startOfCalendarMonth(date: Date, calendar: CalendarSystem): Date {
  return calendar === "jalali" ? startOfJalaliMonth(date) : startOfGregorianMonth(date);
}

export function getDaysInCalendarMonth(date: Date, calendar: CalendarSystem): number {
  return calendar === "jalali" ? getJalaliDaysInMonth(date) : getGregorianDaysInMonth(date);
}

/** Adds whole months, clamping the day (31 Shahrivar + 1 month → 30 Mehr). */
export function addCalendarMonths(date: Date, amount: number, calendar: CalendarSystem): Date {
  return calendar === "jalali" ? addJalaliMonths(date, amount) : addGregorianMonths(date, amount);
}

export function isSameCalendarMonth(a: Date, b: Date, calendar: CalendarSystem): boolean {
  return calendar === "jalali" ? isSameJalaliMonth(a, b) : isSameGregorianMonth(a, b);
}

/** Solar Hijri leap year (Esfand has 30 days), e.g. 1399, 1403, 1408. */
export function isJalaliLeapYear(year: number): boolean {
  return isJalaliLeapYearDate(newJalaliDate(year, 0, 1));
}

/** Columns before day 1 in a Saturday-first week (Saturday = 0 … Friday = 6). */
export function weekColumn(date: Date): number {
  return (date.getDay() - WEEK_STARTS_ON + 7) % 7;
}

export interface MonthGridOptions {
  /** Always return 6 weeks so the picker height never jumps. Default false. */
  fixedWeeks?: boolean;
}

/** The month containing `date`, as Saturday-first weeks of seven days. */
export function getMonthGrid(
  date: Date,
  calendar: CalendarSystem,
  { fixedWeeks = false }: MonthGridOptions = {},
): MonthGrid {
  const first = startOfCalendarMonth(date, calendar);
  const length = getDaysInCalendarMonth(first, calendar);
  const leading = weekColumn(first);
  const weekCount = fixedWeeks ? 6 : Math.ceil((leading + length) / 7);
  const gridStart = addDays(first, -leading);

  return Array.from({ length: weekCount }, (_, week) =>
    Array.from({ length: 7 }, (_, column) => {
      const day = addDays(gridStart, week * 7 + column);
      return {
        date: day,
        dayOfMonth: getCalendarParts(day, calendar).day,
        inMonth: isSameCalendarMonth(day, first, calendar),
        weekday: day.getDay() as Weekday,
        isWeekend: isWeekend(day),
      };
    }),
  );
}

/** True when `date` falls outside [min, max], compared by calendar day. */
export function isOutsideRange(date: Date, min?: Date | null, max?: Date | null): boolean {
  const day = startOfDay(date).getTime();
  if (min && day < startOfDay(min).getTime()) return true;
  if (max && day > startOfDay(max).getTime()) return true;
  return false;
}

/** Pulls `date` back inside [min, max] (by day). */
export function clampToRange(date: Date, min?: Date | null, max?: Date | null): Date {
  if (min && startOfDay(date) < startOfDay(min)) return startOfDay(min);
  if (max && startOfDay(date) > startOfDay(max)) return startOfDay(max);
  return date;
}

/** Can the picker show the month containing `month` given [min, max]? */
export function isMonthInRange(
  month: Date,
  calendar: CalendarSystem,
  min?: Date | null,
  max?: Date | null,
): boolean {
  const first = startOfCalendarMonth(month, calendar);
  const last = addDays(first, getDaysInCalendarMonth(first, calendar) - 1);
  return !isOutsideRange(last, min, null) && !isOutsideRange(first, null, max);
}

/** Stable per-day key, independent of calendar ("2026-10-13"). */
export function dayKey(date: Date): string {
  const { year, month, day } = getGregorianParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export { isSameDay };
