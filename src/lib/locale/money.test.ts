import { describe, expect, it } from "vitest";
import { currencyLabel, formatMoney, rialToToman, tomanToRial } from "./money";

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
