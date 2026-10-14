import { toLatinDigits } from "@/lib/locale/digits";
import type { CalendarSystem } from "./format";
import { getJalaliParts } from "./jalali";
import { createCalendarDate, getCalendarParts } from "./month-grid";

/*
 * The `?date=` search param (/personal/my-day?date=1405-07-21). URLs always
 * carry the Jalali date with Latin digits, whatever the display settings, so
 * a link reads the same for every user. Parsing is lenient for shared links:
 * Persian digits and Gregorian ISO dates are accepted too.
 */

const DATE_PARAM = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

/** Years below this are Solar Hijri (1405); from it on, Gregorian (2026). */
const GREGORIAN_YEAR_FLOOR = 1700;

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Jalali "yyyy-MM-dd" from the date's local fields. Pass a wall-clock date
 * (see zone.ts), not a raw server instant.
 */
export function formatDateParam(date: Date): string {
  const { year, month, day } = getJalaliParts(date);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Local midnight of a `?date=` value, or null when it is missing or not a
 * real day (1405-13-01, 1405-07-32, Esfand 30 outside a leap year…).
 * Takes the first value when the param repeats.
 */
export function parseDateParam(value: string | string[] | null | undefined): Date | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const match = DATE_PARAM.exec(toLatinDigits(raw.trim()));
  if (!match) return null;

  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  if (year < 1) return null;
  const calendar: CalendarSystem = year < GREGORIAN_YEAR_FLOOR ? "jalali" : "gregorian";
  const date = createCalendarDate(calendar, year, month, day);
  if (Number.isNaN(date.getTime())) return null;

  // Out-of-range parts roll over into another day; only an exact round trip is valid.
  const parts = getCalendarParts(date, calendar);
  return parts.year === year && parts.month === month && parts.day === day ? date : null;
}
