"use client";

import { useMemo } from "react";
import { useMyDayFormat, type MyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { usePreferences } from "@/features/preferences/use-preferences";
import { dayToLocalDate } from "@/lib/dates/clock-time";
import { formatDate, type DateFormatOptions } from "@/lib/dates/format";
import { formatGregorian } from "@/lib/dates/gregorian";
import { formatJalali } from "@/lib/dates/jalali";
import { convertDigits } from "@/lib/locale/digits";

/** Dates on the Habits screen: the board's "Sa 11", "ش ۱۸" and month names, in the calendar and digit settings. */
export interface HabitFormat extends MyDayFormat {
  /** "Sa" · "ش" (Habit Field columns, ribbon in Persian). */
  weekdayNarrow(day: string): string;
  /** "Sat" · "ش" (ribbon). */
  weekdayRibbon(day: string): string;
  /** "21" · "۲۱". */
  date(day: string): string;
  /** "Mehr" · "مهر". */
  monthName(day: string): string;
}

export function useHabitFormat(): HabitFormat {
  const base = useMyDayFormat();
  const { locale, digits, calendar } = usePreferences();
  return useMemo(() => {
    const options: DateFormatOptions = { locale, digits, calendar };
    const narrow = (day: string) => formatDate(dayToLocalDate(day), "weekdayNarrow", options);
    return {
      ...base,
      weekdayNarrow: narrow,
      weekdayRibbon: (day) => (locale === "fa" ? narrow(day) : convertDigits(formatGregorian(dayToLocalDate(day), "EEE", "en"), digits)),
      date: (day) => formatDate(dayToLocalDate(day), "day", options),
      monthName: (day) =>
        convertDigits(calendar === "jalali" ? formatJalali(dayToLocalDate(day), "MMMM", locale) : formatGregorian(dayToLocalDate(day), "MMMM", locale), digits),
    };
  }, [base, locale, digits, calendar]);
}
