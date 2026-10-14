import { intlLocale, type Locale } from "./config";

/** `latn` = 0–9, `fa` = Extended Arabic-Indic ۰–۹ (Persian). */
export type DigitSystem = "latn" | "fa";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]!);
}

/** Converts Persian and Arabic-Indic digits to 0–9; other characters untouched. */
export function toLatinDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (digit) => {
    const persian = PERSIAN_DIGITS.indexOf(digit);
    return String(persian >= 0 ? persian : ARABIC_DIGITS.indexOf(digit));
  });
}

export function convertDigits(input: string | number, system: DigitSystem): string {
  return system === "fa" ? toPersianDigits(input) : toLatinDigits(String(input));
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function numberFormatter(system: DigitSystem, options: Intl.NumberFormatOptions = {}) {
  const locale = system === "fa" ? "fa-IR" : "en-US";
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/**
 * Locale-aware number. Persian uses `fa-IR` (٬ thousands, ٫ decimal); its
 * output keeps Intl's bidi marks so signs stay put inside RTL text.
 */
export function formatNumber(
  value: number,
  system: DigitSystem,
  options?: Intl.NumberFormatOptions,
): string {
  return numberFormatter(system, options).format(value);
}

export interface CompactNumberOptions {
  /** Picks the magnitude word: "B" / "میلیارد". */
  locale: Locale;
  /** Picks the digits, independently of the language. */
  digits: DigitSystem;
  maximumFractionDigits?: number;
}

const compactCache = new Map<string, Intl.NumberFormat>();

/**
 * Short form for charts and tight tiles: 1_864_000_000 → "1.86B",
 * "۱٫۸۶ میلیارد", "1.86 میلیارد" or "۱٫۸۶B". The word follows the UI language,
 * the digits follow the digit setting.
 */
export function formatCompactNumber(
  value: number,
  { locale, digits, maximumFractionDigits = 2 }: CompactNumberOptions,
): string {
  const numberingSystem = digits === "fa" ? "arabext" : "latn";
  const key = `${locale}|${numberingSystem}|${maximumFractionDigits}`;
  let formatter = compactCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(intlLocale[locale], {
      notation: "compact",
      maximumFractionDigits,
      numberingSystem,
    });
    compactCache.set(key, formatter);
  }
  return formatter.format(value);
}

/** `ratio` is 0–1: 0.45 → "45%" / "۴۵٪". */
export function formatPercent(
  ratio: number,
  system: DigitSystem,
  maximumFractionDigits = 0,
): string {
  return numberFormatter(system, { style: "percent", maximumFractionDigits }).format(ratio);
}

/**
 * Parses user input typed in either digit system, with either separator set:
 * "۱۲٬۵۰۰٫۵", "12,500.5" → 12500.5. Returns null when it isn't a number.
 */
export function parseLocalizedNumber(input: string): number | null {
  const normalized = toLatinDigits(input)
    .replace(/[‎‏؜\s]/g, "")
    .replace(/[٬,]/g, "")
    .replace(/٫/g, ".")
    .replace(/[−–]/g, "-");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}
