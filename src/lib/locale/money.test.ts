import { describe, expect, it } from "vitest";
import { currencyLabel, formatCompactMoney, formatMoney, rialToToman, tomanToRial } from "./money";

const NBSP = " ";

describe("currency conversion", () => {
  it("treats one Toman as ten Rial", () => {
    expect(tomanToRial(2_000_000)).toBe(20_000_000);
    expect(rialToToman(20_000_000)).toBe(2_000_000);
  });

  it("returns whole Rial without float noise", () => {
    expect(tomanToRial(1.1)).toBe(11);
    expect(tomanToRial(12_500.5)).toBe(125_005);
  });
});

describe("formatMoney", () => {
  it("formats Toman in Persian (the default case)", () => {
    expect(formatMoney(2_000_000, { currency: "toman", digits: "fa", locale: "fa" })).toBe(
      `۲٬۰۰۰٬۰۰۰${NBSP}تومان`,
    );
  });

  it("converts to Rial when Rial is selected", () => {
    expect(formatMoney(2_000_000, { currency: "rial", digits: "fa", locale: "fa" })).toBe(
      `۲۰٬۰۰۰٬۰۰۰${NBSP}ریال`,
    );
  });

  it("formats English labels to match the boards", () => {
    expect(formatMoney(2_000_000, { currency: "toman", digits: "latn", locale: "en" })).toBe(
      `2,000,000${NBSP}Toman`,
    );
    expect(formatMoney(2_000_000, { currency: "rial", digits: "latn", locale: "en" })).toBe(
      `20,000,000${NBSP}IRR`,
    );
  });

  it("keeps digits independent of language", () => {
    expect(formatMoney(12_500, { currency: "toman", digits: "latn", locale: "fa" })).toBe(
      `12,500${NBSP}تومان`,
    );
  });

  it("keeps one Toman decimal (exactly one Rial) and none for Rial", () => {
    expect(formatMoney(12_500.5, { currency: "toman", digits: "latn", locale: "en" })).toBe(
      `12,500.5${NBSP}Toman`,
    );
    expect(formatMoney(12_500.5, { currency: "rial", digits: "latn", locale: "en" })).toBe(
      `125,005${NBSP}IRR`,
    );
  });

  it("exposes the unit labels", () => {
    expect(currencyLabel("toman", "fa")).toBe("تومان");
    expect(currencyLabel("rial", "en")).toBe("IRR");
  });
});

/** Drops Intl bidi marks and normalises minus signs. */
const plain = (text: string) => text.replace(/[‎‏؜]/g, "").replace(/−/g, "-");

describe("formatCompactMoney", () => {
  const AMOUNT_TOMAN = 186_400_000;

  it("multiplies by ten for Rial (the P13 Rial state: 1.86B / ۱٫۸۶ میلیارد)", () => {
    expect(formatCompactMoney(AMOUNT_TOMAN, { currency: "rial", digits: "latn", locale: "en" })).toBe("1.86B");
    expect(formatCompactMoney(AMOUNT_TOMAN, { currency: "rial", digits: "fa", locale: "fa" })).toBe(
      `۱٫۸۶${NBSP}میلیارد`,
    );
  });

  it("keeps Toman amounts as they are", () => {
    expect(formatCompactMoney(AMOUNT_TOMAN, { currency: "toman", digits: "latn", locale: "en" })).toBe("186.4M");
    expect(formatCompactMoney(48_000_000, { currency: "toman", digits: "fa", locale: "fa" })).toBe(
      `۴۸${NBSP}میلیون`,
    );
  });

  it("covers every language × digits combination", () => {
    const format = (locale: "en" | "fa", digits: "latn" | "fa") =>
      formatCompactMoney(AMOUNT_TOMAN, { currency: "rial", digits, locale });
    expect(format("en", "latn")).toBe("1.86B");
    expect(format("en", "fa")).toBe("۱٫۸۶B");
    expect(format("fa", "latn")).toBe(`1.86${NBSP}میلیارد`);
    expect(format("fa", "fa")).toBe(`۱٫۸۶${NBSP}میلیارد`);
  });

  it("appends the unit with a no-break space when asked", () => {
    expect(formatCompactMoney(AMOUNT_TOMAN, { currency: "rial", digits: "latn", locale: "en", unit: true })).toBe(
      `1.86B${NBSP}IRR`,
    );
    expect(formatCompactMoney(48_000_000, { currency: "toman", digits: "fa", locale: "fa", unit: true })).toBe(
      `۴۸${NBSP}میلیون${NBSP}تومان`,
    );
  });

  it("keeps the sign of a negative balance", () => {
    expect(plain(formatCompactMoney(-AMOUNT_TOMAN, { currency: "rial", digits: "latn", locale: "en" }))).toBe("-1.86B");
    expect(plain(formatCompactMoney(-AMOUNT_TOMAN, { currency: "rial", digits: "fa", locale: "fa" }))).toBe(
      `-۱٫۸۶${NBSP}میلیارد`,
    );
  });
});
