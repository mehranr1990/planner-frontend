"use client";

import { useMemo } from "react";
import type { Transaction } from "@/data/domain";
import { usePreferences } from "@/features/preferences/use-preferences";
import { dayToLocalDate } from "@/lib/dates/clock-time";
import { formatDate } from "@/lib/dates/format";
import { convertDigits, formatNumber, formatPercent } from "@/lib/locale/digits";
import { currencyLabel, formatCompactMoney, tomanToRial, type Currency } from "@/lib/locale/money";

/*
 * Finance's numbers: amounts are held in Toman and shown in the chosen
 * currency (Rial = ×10, display only); digits follow the digit setting, not
 * the language. Months are Jalali budget months, named in the UI language.
 */

export interface FinanceFormat {
  currency: Currency;
  /** "تومان" / "Toman". */
  unit: string;
  /** 1_240_000 → "1,240,000" in the display currency, no unit. */
  amount(toman: number): string;
  /** Signed: −1,240,000 / +48,000,000 (sign outside the bidi run). */
  signed(toman: number): string;
  /** 31_200_000 → "31.2M" / "۳۱٫۲ میلیون" in the display currency. */
  compact(toman: number): string;
  /** The amount in the other currency with its unit: "12,400,000 Rial". */
  other(toman: number): string;
  percent(ratio: number): string;
  number(value: number): string;
  digits(text: string | number): string;
  /** "Mehr 1405". */
  monthYear(start: string): string;
  /** "Mehr". */
  monthName(start: string): string;
  /** "21 Mehr". */
  dayMonth(day: string): string;
  /** "Tue". */
  weekdayShort(day: string): string;
}

export function useFinanceFormat(): FinanceFormat {
  const { locale, digits, currency } = usePreferences();
  return useMemo(() => {
    const display = (toman: number, as: Currency = currency) => (as === "rial" ? tomanToRial(toman) : toman);
    const amount = (toman: number) => formatNumber(display(toman), digits, { maximumFractionDigits: 0 });
    const dateOptions = { calendar: "jalali" as const, locale, digits };
    const otherCurrency: Currency = currency === "rial" ? "toman" : "rial";
    return {
      currency,
      unit: currencyLabel(currency, locale),
      amount,
      signed: (toman) => `${toman < 0 ? "−" : "+"}${amount(Math.abs(toman))}`,
      compact: (toman) => formatCompactMoney(toman, { currency, digits, locale }),
      other: (toman) =>
        `${formatNumber(display(toman, otherCurrency), digits, { maximumFractionDigits: 0 })} ${currencyLabel(otherCurrency, locale)}`,
      percent: (ratio) => formatPercent(ratio, digits),
      number: (value) => formatNumber(value, digits),
      digits: (text) => convertDigits(text, digits),
      monthYear: (start) => formatDate(dayToLocalDate(start), "monthYear", dateOptions),
      monthName: (start) => formatDate(dayToLocalDate(start), "monthYear", dateOptions).split(" ")[0]!,
      dayMonth: (day) => formatDate(dayToLocalDate(day), "dayMonth", dateOptions),
      weekdayShort: (day) => formatDate(dayToLocalDate(day), "weekdayShort", dateOptions),
    } satisfies FinanceFormat;
  }, [locale, digits, currency]);
}

/** Category label key ("income" for income). */
export const categoryKey = (tx: Pick<Transaction, "category">) => tx.category ?? "income";

/** CSS colour of a category ("income" = the scope colour). */
export const categoryColor = (key: string) => (key === "income" ? "var(--color-scope-deep)" : `var(--viz-${key})`);
