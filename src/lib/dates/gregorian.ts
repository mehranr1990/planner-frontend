import { format } from "date-fns";
import { enUS, faIR } from "date-fns/locale";
import type { Locale } from "@/lib/locale/config";
import type { CalendarParts } from "./jalali";

const GREGORIAN_LOCALE = { en: enUS, fa: faIR } as const;

/** date-fns pattern formatting on the Gregorian calendar. */
export function formatGregorian(date: Date, pattern: string, locale: Locale): string {
  return format(date, pattern, { locale: GREGORIAN_LOCALE[locale] });
}

export function getGregorianParts(date: Date): CalendarParts {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}
