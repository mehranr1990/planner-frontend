"use client";

import { useMemo } from "react";
import { usePreferences } from "@/features/preferences/use-preferences";
import { dayToLocalDate, formatClockTime } from "@/lib/dates/clock-time";
import { formatDate, formatDuration, type CalendarSystem, type DateFormatOptions } from "@/lib/dates/format";
import type { Preferences } from "@/features/preferences/preferences-store";
import { convertDigits, formatNumber, formatPercent } from "@/lib/locale/digits";

/*
 * Everything My Day prints that is a number, time or date, in the person's
 * language, calendar and digit setting (the digits are independent of the
 * language). Clock values are 24-hour in both languages, as on the boards;
 * render them inside a `dir="ltr"` island with tabular numerals.
 */

export interface MyDayFormat {
  /** 840 → "14:00" ("۱۴:۰۰" with Persian digits). Minutes may be a "HH:mm" string already. */
  clock(minutesOrTime: number | string): string;
  /** (840, 960) → "14:00 – 16:00". */
  clockRange(startMinutes: number, endMinutes: number): string;
  /** 125 → "2h 05m" · 35 → "35m" · 120 → "2h"; Persian: "۲ ساعت و ۵ دقیقه". */
  duration(minutes: number): string;
  /** Digit-converted integer: 3 → "۳" or "3". */
  number(value: number): string;
  /** 0.71 → "71%" / "۷۱٪". */
  percent(ratio: number): string;
  /** Any text with its digits converted to the setting (for already-formatted strings). */
  digits(text: string | number): string;
  /** "Tuesday" / "سه‌شنبه". */
  weekday(day: string): string;
  /** "21 Mehr" in the primary calendar. */
  dayMonth(day: string): string;
  /** The same day in the other calendar: "13 Oct" when the primary is Jalali. */
  altDayMonth(day: string): string;
  /** "Tuesday, 21 Mehr · 13 Oct" — the page kicker. */
  kicker(day: string): string;
}

const OTHER_CALENDAR: Record<CalendarSystem, CalendarSystem> = { jalali: "gregorian", gregorian: "jalali" };

/** Pure so it is testable without React; the hook memoises it per preferences. */
export function createMyDayFormat(preferences: Pick<Preferences, "locale" | "digits" | "calendar">): MyDayFormat {
  const { locale, digits, calendar } = preferences;
  const options: DateFormatOptions = { calendar, locale, digits };
  const altOptions: DateFormatOptions = { calendar: OTHER_CALENDAR[calendar], locale, digits };

  const clock = (minutesOrTime: number | string) =>
    convertDigits(typeof minutesOrTime === "number" ? formatClockTime(minutesOrTime) : minutesOrTime, digits);

  const weekday = (day: string) => formatDate(dayToLocalDate(day), "weekday", options);
  const dayMonth = (day: string) => formatDate(dayToLocalDate(day), "dayMonth", options);
  const altDayMonth = (day: string) => formatDate(dayToLocalDate(day), "dayMonth", altOptions);

  return {
    clock,
    clockRange: (start, end) => `${clock(start)} – ${clock(end)}`,
    duration(minutes) {
      // The boards pad minutes beside hours ("2h 05m"); Persian reads whole words and is not padded.
      if (locale === "fa") return formatDuration(minutes, { locale, digits });
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      const text = hours === 0 ? `${rest}m` : rest === 0 ? `${hours}h` : `${hours}h ${String(rest).padStart(2, "0")}m`;
      return convertDigits(text, digits);
    },
    number: (value) => formatNumber(value, digits),
    percent: (ratio) => formatPercent(ratio, digits),
    digits: (text) => convertDigits(text, digits),
    weekday,
    dayMonth,
    altDayMonth,
    kicker: (day) =>
      locale === "fa"
        ? `${weekday(day)} ${dayMonth(day)} · ${altDayMonth(day)}`
        : `${weekday(day)}, ${dayMonth(day)} · ${altDayMonth(day)}`,
  };
}

export function useMyDayFormat(): MyDayFormat {
  const { locale, digits, calendar } = usePreferences();
  return useMemo(() => createMyDayFormat({ locale, digits, calendar }), [locale, digits, calendar]);
}
