"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { CURRENCY_DECIMALS, type SocialCurrency } from "@/data/social-domain";
import { useProjectFormat } from "@/features/projects/format";
import { formatNumber, toLatinDigits, type DigitSystem } from "@/lib/locale/digits";

/*
 * Social number formats (README rule 3, SO-17, SOM02/SOM03): amounts are
 * integers in the scope currency's minor unit and are shown exactly (Toman
 * without decimals, lira/euro with cents), never converted or summed across
 * currencies. In Persian the balance sign follows the number
 * ("۹٬۶۱۰٬۰۰۰ +"); lira is «لیر».
 */

const pow10 = (n: number) => 10 ** n;

/** Minor units → display number without unit: 1_200_000 (try) → "12,000.00". */
export function formatMinor(amount: number, currency: SocialCurrency, digits: DigitSystem): string {
  const decimals = CURRENCY_DECIMALS[currency];
  const abs = Math.abs(amount);
  if (decimals === 0) return formatNumber(abs, digits, { maximumFractionDigits: 0 });
  const whole = Math.trunc(abs / pow10(decimals));
  const frac = abs % pow10(decimals);
  const sep = digits === "fa" ? "٫" : ".";
  const fracText = String(frac).padStart(decimals, "0");
  return `${formatNumber(whole, digits, { maximumFractionDigits: 0 })}${sep}${digits === "fa" ? formatNumber(Number(fracText), digits, { minimumIntegerDigits: decimals, useGrouping: false }) : fracText}`;
}

/**
 * Parses a typed amount into exact minor units, or null: Persian or Latin
 * digits, thousands separators ignored, at most the currency's decimals.
 */
export function parseMinor(input: string, currency: SocialCurrency): number | null {
  const decimals = CURRENCY_DECIMALS[currency];
  const text = toLatinDigits(input).replace(/[\s,٬']/g, "").replace("٫", ".");
  const pattern = decimals === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{0,${decimals}})?$`);
  if (!pattern.test(text)) return null;
  const [whole = "0", frac = ""] = text.split(".");
  const value = Number(whole) * pow10(decimals) + Number(frac.padEnd(decimals, "0") || "0");
  return Number.isSafeInteger(value) ? value : null;
}

/** Minor units → the text an input shows for editing ("12000.50"). */
export function minorToInput(amount: number, currency: SocialCurrency): string {
  const decimals = CURRENCY_DECIMALS[currency];
  if (decimals === 0) return String(amount);
  return `${Math.trunc(amount / pow10(decimals))}.${String(amount % pow10(decimals)).padStart(decimals, "0")}`;
}

export function useSocialFormat() {
  const base = useProjectFormat();
  const t = useTranslations("Social.currency");
  const { digits, locale } = base;
  const unit = useCallback((currency: SocialCurrency) => t(currency), [t]);
  /** Exact amount with unit: "12,000,000 T" / "۱۲٬۰۰۰٬۰۰۰ تومان". */
  const money = useCallback((amount: number, currency: SocialCurrency) => `${formatMinor(amount, currency, digits)} ${t(currency)}`, [digits, t]);
  /** Signed balance: "+9,610,000 T"; in Persian the sign follows the number. */
  const signed = useCallback(
    (amount: number, currency: SocialCurrency) => {
      const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
      const number = formatMinor(amount, currency, digits);
      if (!sign) return `${number} ${t(currency)}`;
      return locale === "fa" ? `${number} ${sign} ${t(currency)}` : `${sign}${number} ${t(currency)}`;
    },
    [digits, locale, t],
  );
  const plain = useCallback((amount: number, currency: SocialCurrency) => formatMinor(amount, currency, digits), [digits]);
  return { ...base, money, signed, plain, unit };
}
