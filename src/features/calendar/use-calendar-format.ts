"use client";

import { useMemo } from "react";
import { useMyDayFormat, type MyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { usePreferences } from "@/features/preferences/use-preferences";
import { dayToLocalDate } from "@/lib/dates/clock-time";
import { formatDate, formatDateRange, type CalendarSystem, type DateFormatOptions, type DateStyle } from "@/lib/dates/format";

/*
 * My Day's formatter plus what the Calendar adds: ranges, month titles and
 * day numbers in the primary calendar and the other one. Inside the
 * Calendar's PreferencesOverride, "primary" follows the Shamsi / Gregorian
 * switch.
 */

export interface CalendarFormat extends MyDayFormat {
  date(day: string, style: DateStyle): string;
  altDate(day: string, style: DateStyle): string;
  range(from: string, to: string): string;
  altRange(from: string, to: string): string;
}

const OTHER: Record<CalendarSystem, CalendarSystem> = { jalali: "gregorian", gregorian: "jalali" };

export function useCalendarFormat(): CalendarFormat {
  const base = useMyDayFormat();
  const { locale, digits, calendar } = usePreferences();
  return useMemo(() => {
    const options: DateFormatOptions = { locale, digits, calendar };
    const alt: DateFormatOptions = { ...options, calendar: OTHER[calendar] };
    return {
      ...base,
      date: (day, style) => formatDate(dayToLocalDate(day), style, options),
      altDate: (day, style) => formatDate(dayToLocalDate(day), style, alt),
      range: (from, to) => formatDateRange(dayToLocalDate(from), dayToLocalDate(to), options),
      altRange: (from, to) => formatDateRange(dayToLocalDate(from), dayToLocalDate(to), alt),
    };
  }, [base, locale, digits, calendar]);
}
