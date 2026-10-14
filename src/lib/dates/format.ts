import { isSameMonth } from "date-fns";
import { isSameMonth as isSameJalaliMonth } from "date-fns-jalali";
import type { Locale } from "@/lib/locale/config";
import { convertDigits, type DigitSystem } from "@/lib/locale/digits";
import { formatGregorian } from "./gregorian";
import { formatJalali } from "./jalali";
import { IRAN_WEEK, getWeekDates, isHalfDay, isWeekend, isWorkday, type WeekConfig } from "./week";

export type CalendarSystem = "jalali" | "gregorian";

export interface DateFormatOptions {
  calendar: CalendarSystem;
  locale: Locale;
  digits: DigitSystem;
}

export type DateStyle = "full" | "short" | "monthYear" | "dayMonth" | "day" | "weekday" | "weekdayNarrow";

/*
 * Patterns per calendar × locale, matching FaRules:
 * fa full "سه‌شنبه ۲۱ مهر ۱۴۰۵", short "۱۴۰۵/۰۷/۲۱"; en full "Tue, 13 Oct 2026".
 * Jalali month names have no standard abbreviation, so English uses them whole.
 */
const PATTERNS: Record<CalendarSystem, Record<Locale, Record<DateStyle, string>>> = {
  jalali: {
    fa: { full: "EEEE d MMMM yyyy", short: "yyyy/MM/dd", monthYear: "MMMM yyyy", dayMonth: "d MMMM", day: "d", weekday: "EEEE", weekdayNarrow: "EEEEE" },
    en: { full: "EEE, d MMMM yyyy", short: "yyyy/MM/dd", monthYear: "MMMM yyyy", dayMonth: "d MMMM", day: "d", weekday: "EEEE", weekdayNarrow: "EEEEEE" },
  },
  gregorian: {
    fa: { full: "EEEE d MMMM yyyy", short: "yyyy/MM/dd", monthYear: "MMMM yyyy", dayMonth: "d MMMM", day: "d", weekday: "EEEE", weekdayNarrow: "EEEEE" },
    en: { full: "EEE, d MMM yyyy", short: "dd/MM/yyyy", monthYear: "MMMM yyyy", dayMonth: "d MMM", day: "d", weekday: "EEEE", weekdayNarrow: "EEEEEE" },
  },
};

function formatPattern(date: Date, pattern: string, options: DateFormatOptions): string {
  const raw =
    options.calendar === "jalali"
      ? formatJalali(date, pattern, options.locale)
      : formatGregorian(date, pattern, options.locale);
  return convertDigits(raw, options.digits);
}

export function formatDate(date: Date, style: DateStyle, options: DateFormatOptions): string {
  return formatPattern(date, PATTERNS[options.calendar][options.locale][style], options);
}

/** "۱۸ تا ۲۴ مهر" · "10 – 16 Oct"; spells out both months when they differ. */
export function formatDateRange(start: Date, end: Date, options: DateFormatOptions): string {
  const sameMonth =
    options.calendar === "jalali" ? isSameJalaliMonth(start, end) : isSameMonth(start, end);
  const separator = options.locale === "fa" ? " تا " : " – ";
  const startText = formatDate(start, sameMonth ? "day" : "dayMonth", options);
  return `${startText}${separator}${formatDate(end, "dayMonth", options)}`;
}

export interface TimeFormatOptions {
  locale: Locale;
  digits: DigitSystem;
  /** Persian UI is 24-hour; English defaults to 12-hour. */
  hourCycle?: "h12" | "h23";
}

export function formatTime(date: Date, options: TimeFormatOptions): string {
  const hourCycle = options.hourCycle ?? (options.locale === "fa" ? "h23" : "h12");
  const pattern = hourCycle === "h23" ? "HH:mm" : "h:mm aaa";
  return convertDigits(formatGregorian(date, pattern, "en"), options.digits);
}

/** 90 → "1h 30m" · "۱ ساعت و ۳۰ دقیقه". */
export function formatDuration(
  totalMinutes: number,
  options: { locale: Locale; digits: DigitSystem },
): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (options.locale === "fa") {
    if (hours) parts.push(`${hours} ساعت`);
    if (minutes || !hours) parts.push(`${minutes} دقیقه`);
    return convertDigits(parts.join(" و "), options.digits);
  }
  if (hours) parts.push(`${hours}h`);
  if (minutes || !hours) parts.push(`${minutes}m`);
  return convertDigits(parts.join(" "), options.digits);
}

export interface WeekDay {
  date: Date;
  label: string;
  narrow: string;
  dayOfMonth: string;
  isWeekend: boolean;
  /** A full work day (Thursday in Iran is a half day, not a workday). */
  isWorkday: boolean;
  isHalfDay: boolean;
}

/** The week around `date` (Saturday-first by default), labelled for the given calendar. */
export function getWeekDays(
  date: Date,
  options: DateFormatOptions,
  week: WeekConfig = IRAN_WEEK,
): WeekDay[] {
  return getWeekDates(date, week).map((day) => ({
    date: day,
    label: formatDate(day, "weekday", options),
    narrow: formatDate(day, "weekdayNarrow", options),
    dayOfMonth: formatDate(day, "day", options),
    isWeekend: isWeekend(day, week),
    isWorkday: isWorkday(day, week),
    isHalfDay: isHalfDay(day, week),
  }));
}
