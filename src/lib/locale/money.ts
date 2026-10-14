import type { Locale } from "./config";
import { formatCompactNumber, formatNumber, type DigitSystem } from "./digits";

export type Currency = "toman" | "rial";

export const RIAL_PER_TOMAN = 10;

export function tomanToRial(toman: number): number {
  return Math.round(toman * RIAL_PER_TOMAN);
}

export function rialToToman(rial: number): number {
  return rial / RIAL_PER_TOMAN;
}

const CURRENCY_LABEL: Record<Locale, Record<Currency, string>> = {
  fa: { toman: "تومان", rial: "ریال" },
  en: { toman: "Toman", rial: "IRR" },
};

export function currencyLabel(currency: Currency, locale: Locale): string {
  return CURRENCY_LABEL[locale][currency];
}

export interface MoneyFormatOptions {
  currency: Currency;
  digits: DigitSystem;
  locale: Locale;
}

/**
 * Formats an amount held in Toman, the app's base unit, in the user's chosen
 * display currency: 2_000_000 → "۲٬۰۰۰٬۰۰۰ تومان" or "20,000,000 IRR".
 * Number and unit are joined by a no-break space so they never wrap apart.
 */
export function formatMoney(amountToman: number, options: MoneyFormatOptions): string {
  const isRial = options.currency === "rial";
  const amount = isRial ? tomanToRial(amountToman) : amountToman;
  // One Toman decimal is exactly one Rial, so Toman may show a single decimal.
  const number = formatNumber(amount, options.digits, {
    maximumFractionDigits: isRial ? 0 : 1,
  });
  return `${number} ${currencyLabel(options.currency, options.locale)}`;
}

export interface CompactMoneyFormatOptions extends MoneyFormatOptions {
  /** Append the currency label. Default false (chart axes and tiles). */
  unit?: boolean;
}

/**
 * Compact money for charts: 186_400_000 Toman in Rial → "1.86B" or
 * "۱٫۸۶ میلیارد ریال" with the unit. Same Rial ×10 rule as formatMoney.
 */
export function formatCompactMoney(
  amountToman: number,
  { unit = false, ...options }: CompactMoneyFormatOptions,
): string {
  const amount = options.currency === "rial" ? tomanToRial(amountToman) : amountToman;
  const number = formatCompactNumber(amount, options);
  return unit ? `${number} ${currencyLabel(options.currency, options.locale)}` : number;
}
