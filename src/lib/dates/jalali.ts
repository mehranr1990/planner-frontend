import {
  format,
  getDate,
  getMonth,
  getYear,
} from "date-fns-jalali";
import { enUS, faIR } from "date-fns-jalali/locale";
import type { Locale } from "@/lib/locale/config";

/*
 * date-fns-jalali's English locale spells month 6 "Sharivar" and month 10
 * "Day"; use the standard romanisations for the full month names.
 */
const EN_MONTH_FIXES: Record<number, string> = { 5: "Shahrivar", 9: "Dey" };

const enJalali: typeof enUS = {
  ...enUS,
  localize: {
    ...enUS.localize,
    month: (month, options) =>
      options?.width === "wide" || options?.width === undefined
        ? (EN_MONTH_FIXES[month] ?? enUS.localize.month(month, options))
        : enUS.localize.month(month, options),
  },
};

const JALALI_LOCALE = { en: enJalali, fa: faIR } as const;

/** date-fns pattern formatting on the Solar Hijri (Jalali) calendar. */
export function formatJalali(date: Date, pattern: string, locale: Locale): string {
  return format(date, pattern, { locale: JALALI_LOCALE[locale] });
}

export interface CalendarParts {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
}

export function getJalaliParts(date: Date): CalendarParts {
  return { year: getYear(date), month: getMonth(date) + 1, day: getDate(date) };
}
