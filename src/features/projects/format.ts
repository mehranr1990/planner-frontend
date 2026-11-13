"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { parseDay } from "@/lib/dates/clock-time";
import { formatDate, formatDateRange, type DateStyle } from "@/lib/dates/format";
import { getPlannerNow } from "@/data/clock";
import { convertDigits, formatNumber, formatPercent } from "@/lib/locale/digits";
import { usePreferences } from "@/features/preferences/use-preferences";

/*
 * Display helpers for Project screens: Gregorian transport days ("2026-11-11")
 * and instants shown in the user's calendar (Jalali default) and digits.
 */

/** A transport day as a local calendar date (no time-zone drift). */
export function dayToDate(day: string): Date {
  const parts = parseDay(day.slice(0, 10));
  if (!parts) return new Date(Number.NaN);
  return new Date(parts.year, parts.month - 1, parts.date);
}

export function useProjectFormat() {
  const { calendar, locale, digits } = usePreferences();
  const t = useTranslations("ContextShell");
  const options = useMemo(() => ({ calendar, locale, digits }), [calendar, locale, digits]);
  const day = useCallback(
    (value: string, style: DateStyle = "dayMonth") => formatDate(dayToDate(value), style, options),
    [options],
  );
  /** A missing (undeclared) end shows "Unknown", never a guessed date. */
  const range = useCallback(
    (start: string | null, end: string | null) => (start && end ? formatDateRange(dayToDate(start), dayToDate(end), options) : t("unknown")),
    [options, t],
  );
  const number = useCallback((value: number) => formatNumber(value, digits), [digits]);
  /** 0–100 → "58%" / "۵۸٪". */
  const percent = useCallback((value: number | null) => (value === null ? t("unknown") : formatPercent(value / 100, digits)), [digits, t]);
  /** Project completion: done / eligible tasks; "No tasks yet" when nothing is eligible. */
  const progress = useCallback(
    (value: { total: number; percent: number }) => (value.total === 0 ? t("noTasks") : formatPercent(value.percent / 100, digits)),
    [digits, t],
  );
  /** "2h ago" / "yesterday" / "۲ هفته پیش" from the planner clock. */
  const relative = useCallback(
    (instant: string) => convertDigits(formatRelative(instant, getPlannerNow(), locale), digits),
    [locale, digits],
  );
  /** Whole days from the planner day to `day` (negative = past). */
  const daysFromToday = useCallback((value: string) => daysBetween(getPlannerNow().slice(0, 10), value), []);
  return { day, range, number, percent, progress, relative, daysFromToday, locale, digits, calendar };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Coarse relative time (minutes → weeks), as cards show it. */
export function formatRelative(instant: string, now: string, locale: string): string {
  const diff = Date.parse(instant) - Date.parse(now);
  const format = new Intl.RelativeTimeFormat(locale === "fa" ? "fa-IR" : "en", { numeric: "auto", style: "narrow" });
  const abs = Math.abs(diff);
  if (abs < HOUR) return format.format(Math.round(diff / MINUTE), "minute");
  if (abs < DAY) return format.format(Math.round(diff / HOUR), "hour");
  if (abs < 7 * DAY) return format.format(Math.round(diff / DAY), "day");
  return format.format(Math.round(diff / (7 * DAY)), "week");
}

/** Whole calendar days from `from` to `to` (both "YYYY-MM-DD"). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dayToDate(to).getTime() - dayToDate(from).getTime()) / DAY);
}
