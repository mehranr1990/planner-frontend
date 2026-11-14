import { describe, expect, it } from "vitest";
import { formatDecimal, parseDecimalInput, shiftDecimal } from "./decimal";

describe("decimal strings", () => {
  it("shifts the point without float maths", () => {
    expect(shiftDecimal("12345", -1)).toBe("1234.5");
    expect(shiftDecimal("250000000.5", -1)).toBe("25000000.05");
    expect(shiftDecimal("5", -2)).toBe("0.05");
    expect(shiftDecimal("1234.567", 1)).toBe("12345.67");
    expect(shiftDecimal("-12.84", 1)).toBe("-128.4");
    expect(shiftDecimal("-0.0", 0)).toBe("0");
    expect(shiftDecimal("9007199254740993", -1)).toBe("900719925474099.3");
  });

  it("groups and converts digits", () => {
    expect(formatDecimal("-1234567.5", "latn")).toBe("−1,234,567.5");
    expect(formatDecimal("1234567", "fa")).toBe("۱٬۲۳۴٬۵۶۷");
  });

  it("parses typed amounts in either digit system", () => {
    expect(parseDecimalInput("۱٬۲۵۰٬۰۰۰", 4)).toBe("1250000");
    expect(parseDecimalInput("1,250.75", 4)).toBe("1250.75");
    expect(parseDecimalInput("1.23456", 4)).toBeNull();
    expect(parseDecimalInput("0", 4)).toBeNull();
    expect(parseDecimalInput("abc", 4)).toBeNull();
  });
});
