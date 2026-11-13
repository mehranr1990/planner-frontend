"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";
import { getPlannerNow } from "@/data/clock";
import { formatDate, formatTime } from "@/lib/dates/format";
import { convertDigits, formatNumber } from "@/lib/locale/digits";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatRelative } from "@/features/projects/format";

/*
 * Message display formats: 24-hour times (both languages, as the boards),
 * day separators in the user's calendar (Jalali default), sizes and voice
 * durations with the digits preference. Durations/times are LTR islands.
 */

const localDay = (instant: string) => {
  const d = new Date(instant);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export function useMsgFormat() {
  const { calendar, locale, digits } = usePreferences();
  const t = useTranslations("Msg.common");
  const options = useMemo(() => ({ calendar, locale, digits }), [calendar, locale, digits]);
  const time = useCallback((instant: string) => formatTime(new Date(instant), { locale, digits, hourCycle: "h23" }), [locale, digits]);
  const date = useCallback((instant: string, style: "dayMonth" | "full" | "short" = "dayMonth") => formatDate(new Date(instant), style, options), [options]);
  /** "Today" / "Yesterday" / "Sunday 19 Mehr 1405". */
  const dayLabel = useCallback(
    (instant: string) => {
      const now = new Date(getPlannerNow());
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      if (localDay(instant) === localDay(now.toISOString())) return t("today");
      if (localDay(instant) === localDay(yesterday.toISOString())) return t("yesterday");
      return formatDate(new Date(instant), "full", options);
    },
    [options, t],
  );
  /** List rows: time today, "Yesterday", else the day and month. */
  const listTime = useCallback(
    (instant: string) => {
      const label = dayLabel(instant);
      if (label === t("today")) return time(instant);
      if (label === t("yesterday")) return label;
      return date(instant);
    },
    [dayLabel, time, date, t],
  );
  const sameDay = useCallback((a: string, b: string) => localDay(a) === localDay(b), []);
  const relative = useCallback((instant: string) => convertDigits(formatRelative(instant, getPlannerNow(), locale), digits), [locale, digits]);
  /** 1_800_000 → "1.8 MB". */
  const bytes = useCallback(
    (value: number) => {
      const mb = value / (1024 * 1024);
      if (mb >= 1) return `${formatNumber(Math.round(mb * 10) / 10, digits)} MB`;
      return `${formatNumber(Math.max(1, Math.round(value / 1024)), digits)} KB`;
    },
    [digits],
  );
  /** 42 → "0:42". */
  const duration = useCallback(
    (seconds: number) => {
      const s = Math.max(0, Math.floor(seconds));
      return convertDigits(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, digits);
    },
    [digits],
  );
  const number = useCallback((value: number) => formatNumber(value, digits), [digits]);
  return { time, date, dayLabel, listTime, sameDay, relative, bytes, duration, number, locale, digits, calendar };
}
