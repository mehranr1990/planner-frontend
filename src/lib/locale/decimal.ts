import { convertDigits, toLatinDigits, type DigitSystem } from "./digits";

/*
 * Exact decimal strings (API money): no float maths. Used where the server
 * sends minor-unit decimal strings (bills, finance reports) so Toman ⇄ Rial
 * (one decimal place) and grouping never round.
 */

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

/** Moves the decimal point: shiftDecimal("12345", -1) = "1234.5"; ("12.5", 1) = "125". */
export function shiftDecimal(value: string, places: number): string {
  const match = DECIMAL.exec(value.trim());
  if (!match) throw new RangeError(`Not a decimal: "${value}"`);
  const [, sign, int, frac = ""] = match;
  let digits = int! + frac;
  let point = int!.length + places;
  if (point < 1) {
    digits = "0".repeat(1 - point) + digits;
    point = 1;
  }
  if (point > digits.length) digits += "0".repeat(point - digits.length);
  const whole = digits.slice(0, point).replace(/^0+(?=\d)/, "");
  const rest = digits.slice(point).replace(/0+$/, "");
  const text = rest ? `${whole}.${rest}` : whole;
  return sign && /[1-9]/.test(text) ? `-${text}` : text;
}

/** "-1234567.5" → "-1,234,567.5" in the digit system (the sign stays outside the number run). */
export function formatDecimal(value: string, digits: DigitSystem): string {
  const match = DECIMAL.exec(value.trim());
  if (!match) return convertDigits(value, digits);
  const [, sign, int, frac] = match;
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, digits === "fa" ? "٬" : ",");
  const text = frac ? `${grouped}${digits === "fa" ? "٫" : "."}${frac}` : grouped;
  return `${sign ? "−" : ""}${convertDigits(text, digits)}`;
}

/**
 * A typed amount (Persian or Latin digits, grouping allowed) → an exact
 * positive decimal string with at most `maxFraction` places, or null.
 */
export function parseDecimalInput(input: string, maxFraction: number): string | null {
  const latin = toLatinDigits(input).replace(/[,\s٬]/g, "").replace("٫", ".").trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(latin);
  if (!match || (match[2]?.length ?? 0) > maxFraction) return null;
  const text = shiftDecimal(latin, 0);
  return /[1-9]/.test(text) ? text : null;
}
