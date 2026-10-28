import type { CalendarSystem } from "@/lib/dates/format";
import { dayToLocalDate, localDateToDay } from "@/lib/dates/clock-time";
import { formatDateParam, parseDateParam } from "@/lib/dates/date-param";

/*
 * The Calendar's URL (PERSONAL.md routes): ?view=day/week/month/agenda,
 * ?cal=shamsi/gregorian and ?date= (Jalali, Latin digits, like My Day).
 * Defaults (week, the person's calendar preference, today) leave no param.
 */

export const CALENDAR_VIEWS = ["day", "week", "month", "agenda"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];
export const DEFAULT_VIEW: CalendarView = "week";

export type CalendarParam = "shamsi" | "gregorian";

export const VIEW_PARAM = "view";
export const CAL_PARAM = "cal";
export const DATE_PARAM = "date";

export function viewFromParam(value: string | null): CalendarView {
  return (CALENDAR_VIEWS as readonly string[]).includes(value ?? "") ? (value as CalendarView) : DEFAULT_VIEW;
}

export function calendarFromParam(value: string | null, fallback: CalendarSystem): CalendarSystem {
  if (value === "shamsi") return "jalali";
  if (value === "gregorian") return "gregorian";
  return fallback;
}

export const calendarParam = (calendar: CalendarSystem): CalendarParam => (calendar === "jalali" ? "shamsi" : "gregorian");

export function dayFromParam(value: string | null, fallback: string): string {
  const date = parseDateParam(value);
  return date ? localDateToDay(date) : fallback;
}

export interface CalendarUrlState {
  day: string;
  view: CalendarView;
  calendar: CalendarSystem;
}

/** `search` with the calendar state applied; other params (?sheet=…) are kept. */
export function searchWithCalendarState(
  search: string,
  { day, view, calendar }: CalendarUrlState,
  defaults: { today: string; calendar: CalendarSystem },
): string {
  const params = new URLSearchParams(search);
  if (day === defaults.today) params.delete(DATE_PARAM);
  else params.set(DATE_PARAM, formatDateParam(dayToLocalDate(day)));
  if (view === DEFAULT_VIEW) params.delete(VIEW_PARAM);
  else params.set(VIEW_PARAM, view);
  if (calendar === defaults.calendar) params.delete(CAL_PARAM);
  else params.set(CAL_PARAM, calendarParam(calendar));
  return params.toString();
}
