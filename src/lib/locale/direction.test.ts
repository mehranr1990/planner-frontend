import { describe, expect, it } from "vitest";
import { getDirection, inlineSign, isRtl, mirrorX } from "./direction";

describe("getDirection", () => {
  it.each([
    ["fa", "rtl"],
    ["fa-IR", "rtl"],
    ["ar_EG", "rtl"],
    ["he", "rtl"],
    ["en", "ltr"],
    ["en-US", "ltr"],
    ["de", "ltr"],
    ["", "ltr"],
  ] as const)("%s → %s", (locale, expected) => {
    expect(getDirection(locale)).toBe(expected);
  });

  it("matches on the base language, case-insensitively", () => {
    expect(isRtl("FA-ir")).toBe(true);
    expect(isRtl("fake")).toBe(false);
  });
});

describe("geometry helpers", () => {
  it("returns the inline sign for physical transforms", () => {
    expect(inlineSign("ltr")).toBe(1);
    expect(inlineSign("rtl")).toBe(-1);
  });

  it("mirrors x coordinates only in RTL", () => {
    expect(mirrorX(20, 300, "ltr")).toBe(20);
    expect(mirrorX(20, 300, "rtl")).toBe(280);
  });
});
