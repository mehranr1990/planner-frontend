import type { CalendarSystem } from "@/lib/dates/format";
import { addDaysToDay, dayToLocalDate, localDateToDay, weekdayOfDay } from "@/lib/dates/clock-time";
import { addCalendarMonths, getMonthGrid, type MonthGrid } from "@/lib/dates/month-grid";
import { getWeekDates, IRAN_WEEK, type WeekConfig } from "@/lib/dates/week";
import type { CalendarView } from "./calendar-params";

/*
 * Which days a view shows around its anchor day, and how prev / next move
 * the anchor: a day, a week, a calendar month (Jalali or Gregorian, the day
 * clamped) or the agenda's 14 days.
 */

export const AGENDA_DAYS = 14;

/** A week column narrower than this switches the week view to 3 days (P04 rules). */
export const MIN_WEEK_COLUMN_PX = 96;

export function weekDays(anchor: string, week: WeekConfig = IRAN_WEEK): string[] {
  return getWeekDates(dayToLocalDate(anchor), week).map(localDateToDay);
}

export function monthGridOf(anchor: string, calendar: CalendarSystem, week: WeekConfig = IRAN_WEEK): MonthGrid {
  return getMonthGrid(dayToLocalDate(anchor), calendar, { week });
}

const nextDays = (from: string, count: number) => Array.from({ length: count }, (_, index) => addDaysToDay(from, index));

/** Every day the view loads, in order. */
export function rangeDays(
  view: CalendarView,
  anchor: string,
  calendar: CalendarSystem,
  week: WeekConfig = IRAN_WEEK,
): string[] {
  switch (view) {
    case "day":
      return [anchor];
    case "week":
      return weekDays(anchor, week);
    case "month":
      return monthGridOf(anchor, calendar, week)
        .flat()
        .map((cell) => localDateToDay(cell.date));
    case "agenda":
      return nextDays(anchor, AGENDA_DAYS);
  }
}

/** The anchor one step (`delta` = ±1) away in the view's unit. */
export function shiftAnchor(view: CalendarView, anchor: string, delta: number, calendar: CalendarSystem): string {
  switch (view) {
    case "day":
      return addDaysToDay(anchor, delta);
    case "week":
      return addDaysToDay(anchor, delta * 7);
    case "agenda":
      return addDaysToDay(anchor, delta * AGENDA_DAYS);
    case "month":
      return localDateToDay(addCalendarMonths(dayToLocalDate(anchor), delta, calendar));
  }
}

/**
 * The days the week grid draws: all seven when they fit, else three from the
 * anchor (kept inside its week), else the anchor alone.
 */
export function visibleWeekDays(days: readonly string[], anchor: string, columns: 1 | 3 | 7): string[] {
  if (columns === 7 || days.length <= columns) return [...days];
  const index = Math.max(0, days.indexOf(anchor));
  const start = Math.min(index, days.length - columns);
  return days.slice(start, start + columns);
}

/** How many columns fit in `widthPx` of grid (labels excluded). */
export function weekColumnsFor(widthPx: number | null, desktop: boolean): 1 | 3 | 7 {
  if (!desktop) return 1;
  if (widthPx === null) return 7;
  return widthPx / 7 >= MIN_WEEK_COLUMN_PX ? 7 : 3;
}

/** Working minutes of the full work days among `days` ("Free week · 40h free": 5 × 8h; Thursday's half day is not counted). */
export function weekWorkMinutes(days: readonly string[], dayMinutes: number, week: WeekConfig = IRAN_WEEK): number {
  return days.filter((day) => week.workDays.includes(weekdayOfDay(day))).length * dayMinutes;
}
