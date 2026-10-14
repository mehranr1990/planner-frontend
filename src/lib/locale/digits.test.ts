import { describe, expect, it } from "vitest";
import {
  convertDigits,
  formatCompactNumber,
  formatNumber,
  formatPercent,
  parseLocalizedNumber,
  toLatinDigits,
  toPersianDigits,
} from "./digits";

describe("digit conversion", () => {
  it("converts 0–9 to Persian digits and leaves other characters alone", () => {
    expect(toPersianDigits("1405/07/21 · 14:35")).toBe("۱۴۰۵/۰۷/۲۱ · ۱۴:۳۵");
    expect(toPersianDigits(2026)).toBe("۲۰۲۶");
  });

  it("converts Persian and Arabic-Indic digits back to 0–9", () => {
    expect(toLatinDigits("۱۲۳۴۵۶۷۸۹۰")).toBe("1234567890");
    expect(toLatinDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(toLatinDigits("ساعت ۱۴:۳۰")).toBe("ساعت 14:30");
  });

  it("round-trips through convertDigits", () => {
    const persian = convertDigits("Invoice #214", "fa");
    expect(persian).toBe("Invoice #۲۱۴");
    expect(convertDigits(persian, "latn")).toBe("Invoice #214");
  });
});

describe("formatNumber", () => {
  it("uses Persian digits with ٬ thousands and ٫ decimal separators", () => {
    expect(formatNumber(2_000_000, "fa")).toBe("۲٬۰۰۰٬۰۰۰");
    expect(formatNumber(3.5, "fa")).toBe("۳٫۵");
  });

  it("uses English digits with , and . separators", () => {
    expect(formatNumber(2_000_000, "latn")).toBe("2,000,000");
    expect(formatNumber(1_234_567.89, "latn")).toBe("1,234,567.89");
  });

  it("formats percentages with ٪ in Persian", () => {
    expect(formatPercent(0.45, "fa")).toBe("۴۵٪");
    expect(formatPercent(0.45, "latn")).toBe("45%");
    expect(formatPercent(0.684, "latn", 1)).toBe("68.4%");
  });
});

describe("parseLocalizedNumber", () => {
  it.each([
    ["۱۲٬۵۰۰٫۵", 12500.5],
    ["12,500.5", 12500.5],
    ["١٢٣", 123],
    [" 42 ", 42],
    ["−۳٫۵", -3.5],
  ])("parses %s", (input, expected) => {
    expect(parseLocalizedNumber(input)).toBe(expected);
  });

  it.each(["", "12a", "O", "1.2.3"])("rejects %j", (input) => {
    expect(parseLocalizedNumber(input)).toBeNull();
  });
});

/** Drops Intl bidi marks and normalises minus signs and no-break spaces. */
const plain = (text: string) => text.replace(/[‎‏؜]/g, "").replace(/−/g, "-").replace(/ /g, " ");

describe("formatCompactNumber", () => {
  it("keeps the word with the language and the digits with the digit setting", () => {
    const value = 1_864_000_000;
    expect(plain(formatCompactNumber(value, { locale: "en", digits: "latn" }))).toBe("1.86B");
    expect(plain(formatCompactNumber(value, { locale: "en", digits: "fa" }))).toBe("۱٫۸۶B");
    expect(plain(formatCompactNumber(value, { locale: "fa", digits: "latn" }))).toBe("1.86 میلیارد");
    expect(plain(formatCompactNumber(value, { locale: "fa", digits: "fa" }))).toBe("۱٫۸۶ میلیارد");
  });

  it("matches the DataViz board samples", () => {
    expect(formatCompactNumber(48_000_000, { locale: "en", digits: "latn" })).toBe("48M");
    expect(formatCompactNumber(31_200_000, { locale: "en", digits: "latn" })).toBe("31.2M");
    expect(plain(formatCompactNumber(48_000_000, { locale: "fa", digits: "fa" }))).toBe("۴۸ میلیون");
  });

  it("honours maximumFractionDigits and leaves small numbers whole", () => {
    expect(formatCompactNumber(1_864_000_000, { locale: "en", digits: "latn", maximumFractionDigits: 1 })).toBe("1.9B");
    expect(formatCompactNumber(950, { locale: "en", digits: "latn" })).toBe("950");
    expect(formatCompactNumber(950, { locale: "fa", digits: "fa" })).toBe("۹۵۰");
  });

  it("keeps the sign of negative values", () => {
    expect(plain(formatCompactNumber(-1_864_000_000, { locale: "en", digits: "latn" }))).toBe("-1.86B");
    expect(plain(formatCompactNumber(-1_864_000_000, { locale: "fa", digits: "fa" }))).toBe("-۱٫۸۶ میلیارد");
  });
});
