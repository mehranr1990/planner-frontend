"use client";

import { useMemo } from "react";
import { usePreferences } from "@/features/preferences/use-preferences";
import { dayOfInstant, dayToLocalDate, instantToClockTime } from "@/lib/dates/clock-time";
import { formatDate } from "@/lib/dates/format";
import { formatDecimal, shiftDecimal } from "@/lib/locale/decimal";
import { convertDigits, formatNumber } from "@/lib/locale/digits";
import { currencyLabel } from "@/lib/locale/money";

/*
 * Formatting for the Personal services UI: days in the chosen calendar,
 * instants in the account zone (day + 24h clock digits), money from exact
 * decimal strings (IRR shown as Toman ÷10 or Rial, other currencies with
 * their ISO code), digits from the digit setting.
 */

export function useServiceFormat() {
  const { locale, digits, calendar, currency } = usePreferences();
  return useMemo(() => {
    const options = { calendar, locale, digits };
    const day = (value: string) => formatDate(dayToLocalDate(value), "dayMonth", options);
    const clock = (value: string) => convertDigits(value, digits);
    return {
      day,
      dayFull: (value: string) => formatDate(dayToLocalDate(value), "short", options),
      clock,
      instant: (iso: string) => `${day(dayOfInstant(iso))} · ${clock(instantToClockTime(iso))}`,
      number: (value: number) => formatNumber(value, digits),
      digits: (value: string | number) => convertDigits(value, digits),
      /** Display unit of IRR amounts. */
      unit: currencyLabel(currency, locale),
      currency,
      /** An exact amount with its unit; IRR follows the Toman / Rial setting. */
      money(amount: string, code: string): string {
        if (code !== "IRR") return `${formatDecimal(amount, digits)} ${code}`;
        const value = currency === "toman" ? shiftDecimal(amount, -1) : amount;
        return `${formatDecimal(value, digits)} ${currencyLabel(currency, locale)}`;
      },
      /** An IRR amount in the display unit, for a form field (Latin digits). */
      editable(amountRial: string): string {
        return currency === "toman" ? shiftDecimal(amountRial, -1) : amountRial;
      },
    };
  }, [calendar, locale, digits, currency]);
}

export type ServiceFormat = ReturnType<typeof useServiceFormat>;
