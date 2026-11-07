"use client";

import { useCallback, useMemo } from "react";
import { parseDay } from "@/lib/dates/clock-time";
import { formatDate, formatDateRange, type DateStyle } from "@/lib/dates/format";
import { formatNumber, formatPercent } from "@/lib/locale/digits";
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
  const options = useMemo(() => ({ calendar, locale, digits }), [calendar, locale, digits]);
  const day = useCallback(
    (value: string, style: DateStyle = "dayMonth") => formatDate(dayToDate(value), style, options),
    [options],
  );
  const range = useCallback(
    (start: string, end: string) => formatDateRange(dayToDate(start), dayToDate(end), options),
    [options],
  );
  const number = useCallback((value: number) => formatNumber(value, digits), [digits]);
  /** 0–100 → "58%" / "۵۸٪". */
  const percent = useCallback((value: number) => formatPercent(value / 100, digits), [digits]);
  return { day, range, number, percent, locale, digits, calendar };
}
