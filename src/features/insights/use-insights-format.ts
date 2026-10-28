"use client";

import { useMemo } from "react";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useMyDayFormat, type MyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { addDaysToDay, dayToLocalDate, weekdayOfDay } from "@/lib/dates/clock-time";
import { formatDate } from "@/lib/dates/format";
import { convertDigits, formatNumber } from "@/lib/locale/digits";

/*
 * What Insights prints: My Day's formatter plus decimals ("7.4" / "۷٫۴"),
 * whole-hour labels ("09") and short weekday names for chart columns.
 * Clock values render inside a dir="ltr" island with tabular numerals.
 */

export interface InsightsFormat extends MyDayFormat {
  /** 7.43 → "7.4" (fraction digits fixed). */
  decimal(value: number, fractionDigits?: number): string;
  /** 9 → "09". */
  hour(hour: number): string;
  /** Short weekday name for a JS weekday (0 = Sunday), for chart columns. */
  weekdayShort(weekday: number, today: string): string;
}

export function useInsightsFormat(): InsightsFormat {
  const base = useMyDayFormat();
  const { locale, digits, calendar } = usePreferences();
  return useMemo(
    () => ({
      ...base,
      decimal: (value, fractionDigits = 1) =>
        formatNumber(value, digits, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }),
      hour: (hour) => convertDigits(String(hour % 24).padStart(2, "0"), digits),
      weekdayShort(weekday, today) {
        const day = addDaysToDay(today, (weekday - weekdayOfDay(today) + 7) % 7);
        return formatDate(dayToLocalDate(day), locale === "fa" ? "weekdayNarrow" : "weekdayShort", { calendar, locale, digits });
      },
    }),
    [base, locale, digits, calendar],
  );
}
