"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatTime } from "@/lib/dates/format";
import { convertDigits } from "@/lib/locale/digits";

/** "mm:ss", whole seconds rounded up (a phase never shows 00:00 while it runs); minutes may pass 59. */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Focus formatting with the viewer's digit setting (independent of language). */
export function useFocusFormat() {
  const t = useTranslations("Focus");
  const { locale, digits } = usePreferences();
  return useMemo(
    () => ({
      digits: (value: string | number) => convertDigits(value, digits),
      clock: (ms: number) => convertDigits(clockText(ms), digits),
      time: (at: number) => formatTime(new Date(at), { locale, digits, hourCycle: "h23" }),
      duration: (ms: number) => {
        const minutes = Math.round(ms / 60_000);
        const h = Math.floor(minutes / 60);
        const m = convertDigits(minutes % 60, digits);
        return h > 0 ? t("duration.hm", { h: convertDigits(h, digits), m }) : t("duration.m", { m });
      },
    }),
    [t, locale, digits],
  );
}
