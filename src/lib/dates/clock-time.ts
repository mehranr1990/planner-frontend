import { APP_TIME_ZONE, toZonedTime } from "./zone";

/*
 * Wall-clock arithmetic in the planner's time zone, without Date objects in
 * the data layer: minutes-of-day <-> "HH:mm" <-> ISO instants with an offset,
 * and the calendar day an instant falls on. Everything here is a pure
 * function of its arguments and APP_TIME_ZONE, so a UTC server and a browser
 * anywhere produce the same strings.
 */

export const MINUTES_PER_DAY = 24 * 60;

/** The drag and resize grid of the day planner. */
export const SNAP_MINUTES = 15;

const pad = (value: number) => String(value).padStart(2, "0");

const CLOCK_TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Minutes after midnight of "HH:mm"; null when it is not a valid 24-hour time. "24:00" is accepted as the day's end. */
export function parseClockTime(value: string): number | null {
  if (value === "24:00") return MINUTES_PER_DAY;
  const match = CLOCK_TIME.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** "HH:mm" of minutes-of-day. 1440 reads "24:00"; other values wrap into 0..1439. */
export function formatClockTime(minutes: number): string {
  if (minutes === MINUTES_PER_DAY) return "24:00";
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

/** Snaps to the 15-minute grid. Default rounds to the nearest line. */
export function snap15(minutes: number, mode: "round" | "floor" | "ceil" = "round"): number {
  const steps = minutes / SNAP_MINUTES;
  // `+ 0` normalises -0 so equality checks stay simple.
  return Math[mode === "round" ? "round" : mode](steps) * SNAP_MINUTES + 0;
}

/** Snaps to any step (e.g. 30 for suggested slots on :00 / :30). */
export function snapTo(minutes: number, step: number, mode: "round" | "floor" | "ceil" = "round"): number {
  return Math[mode === "round" ? "round" : mode](minutes / step) * step + 0;
}

// ── Calendar days ("YYYY-MM-DD") ─────────────────────────────────────────

/** Parts of a calendar day; null when it is not a real day. */
export function parseDay(day: string): { year: number; month: number; date: number } | null {
  const match = CALENDAR_DAY.exec(day);
  if (!match) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  const check = new Date(Date.UTC(year, month - 1, date));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === date
    ? { year, month, date }
    : null;
}

function requireDay(day: string): { year: number; month: number; date: number } {
  const parts = parseDay(day);
  if (!parts) throw new RangeError(`Not a calendar day: "${day}"`);
  return parts;
}

/** "YYYY-MM-DD" from a Date's local fields. */
export function localDateToDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight of a "YYYY-MM-DD" day (for the week and calendar helpers). */
export function dayToLocalDate(day: string): Date {
  const { year, month, date } = requireDay(day);
  return new Date(year, month - 1, date);
}

/** The day `delta` days away. */
export function addDaysToDay(day: string, delta: number): string {
  const { year, month, date } = requireDay(day);
  const shifted = new Date(Date.UTC(year, month - 1, date + delta));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function diffDays(from: string, to: string): number {
  const a = requireDay(from);
  const b = requireDay(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.date) - Date.UTC(a.year, a.month - 1, a.date)) / 86_400_000);
}

/** JS weekday of a day: 0 = Sunday … 6 = Saturday. */
export function weekdayOfDay(day: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const { year, month, date } = requireDay(day);
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

// ── Instants ─────────────────────────────────────────────────────────────

/** Offset of the planner zone at a moment, in minutes east of UTC (Tehran: 210). */
function zoneOffsetMinutes(ms: number): number {
  const zoned = toZonedTime(new Date(ms), APP_TIME_ZONE);
  const asUtc = Date.UTC(
    zoned.getFullYear(),
    zoned.getMonth(),
    zoned.getDate(),
    zoned.getHours(),
    zoned.getMinutes(),
    zoned.getSeconds(),
  );
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

function offsetString(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Epoch milliseconds of planner wall-clock `minutes` after midnight of `day` (minutes may exceed 1439 or be negative). */
export function dayMinutesToMs(day: string, minutes: number): number {
  const { year, month, date } = requireDay(day);
  const wallAsUtc = Date.UTC(year, month - 1, date) + minutes * 60_000;
  // Two passes settle the offset around a zone transition; a fixed-offset zone needs one.
  const first = wallAsUtc - zoneOffsetMinutes(wallAsUtc) * 60_000;
  return wallAsUtc - zoneOffsetMinutes(first) * 60_000;
}

/** ISO 8601 instant with the zone's offset for epoch milliseconds ("2026-10-13T14:00:00+03:30"). */
export function msToInstant(ms: number): string {
  const offset = zoneOffsetMinutes(ms);
  const wall = new Date(ms + offset * 60_000);
  const stamp = `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}`;
  const time = `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:${pad(wall.getUTCSeconds())}`;
  return `${stamp}T${time}${offsetString(offset)}`;
}

/**
 * The instant at `minutes` after midnight of `day` in the planner zone.
 * 1440 is the next midnight (a block that ends at the day's end).
 */
export function instantAt(day: string, minutes: number): string {
  return msToInstant(dayMinutesToMs(day, minutes));
}

/** The instant at an "HH:mm" time on `day`. Throws on an invalid time. */
export function instantAtTime(day: string, time: string): string {
  const minutes = parseClockTime(time);
  if (minutes === null) throw new RangeError(`Not a clock time: "${time}"`);
  return instantAt(day, minutes);
}

/** Calendar day "YYYY-MM-DD" of an instant in the planner zone. */
export function dayOfInstant(instant: string): string {
  return localDateToDay(toZonedTime(new Date(instant), APP_TIME_ZONE));
}

/** Minutes after the planner-zone midnight of the instant's own day (0..1439). */
export function minutesOfInstant(instant: string): number {
  const zoned = toZonedTime(new Date(instant), APP_TIME_ZONE);
  return zoned.getHours() * 60 + zoned.getMinutes();
}

/**
 * Minutes from midnight of `day` to the instant. Negative before the day,
 * above 1440 after it: how a block that spans midnight is clamped to a day.
 */
export function minutesFromDayStart(instant: string, day: string): number {
  return Math.round((Date.parse(instant) - dayMinutesToMs(day, 0)) / 60_000);
}

/** Whole minutes between two instants (`end` − `start`). */
export function durationBetween(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 60_000);
}

/** The instant `delta` minutes after `instant`. */
export function addMinutesToInstant(instant: string, delta: number): string {
  return msToInstant(Date.parse(instant) + delta * 60_000);
}

/** "HH:mm" of an instant's wall-clock time in the planner zone. */
export function instantToClockTime(instant: string): string {
  return formatClockTime(minutesOfInstant(instant));
}
