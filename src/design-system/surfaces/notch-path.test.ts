import { describe, expect, it } from "vitest";
import { notchPresets } from "@/design-system/tokens/radii";
import { canNotch, notchPath } from "./notch-path";

/** The reference implementation from design CLAUDE.md §4, whitespace-normalised. */
function designNotchPath(W: number, H: number, C = 32, nw = 64, nh = 64, f = 28) {
  return `M ${C} 0
    L ${W - nw - f} 0
    A ${f} ${f} 0 0 1 ${W - nw} ${f}
    L ${W - nw} ${nh - f}
    A ${f} ${f} 0 0 0 ${W - nw + f} ${nh}
    L ${W - f} ${nh}
    A ${f} ${f} 0 0 1 ${W} ${nh + f}
    L ${W} ${H - C}
    A ${C} ${C} 0 0 1 ${W - C} ${H}
    L ${C} ${H}
    A ${C} ${C} 0 0 1 0 ${H - C}
    L 0 ${C}
    A ${C} ${C} 0 0 1 ${C} 0 Z`
    .replace(/\s+/g, " ")
    .trim();
}

describe("notchPath", () => {
  it("matches the design reference in LTR", () => {
    expect(notchPath({ width: 400, height: 240 })).toBe(designNotchPath(400, 240));
    expect(notchPath({ width: 360, height: 200, notchWidth: 112, notchHeight: 60, fillet: 28 })).toBe(
      designNotchPath(360, 200, 32, 112, 60, 28),
    );
  });

  it("mirrors every x and flips every sweep in RTL", () => {
    const ltr = notchPath({ width: 400, height: 240 }).split(" ");
    const rtl = notchPath({ width: 400, height: 240, direction: "rtl" }).split(" ");
    expect(rtl).toHaveLength(ltr.length);
    expect(rtl.slice(0, 3)).toEqual(["M", "368", "0"]);
    // First arc: sweep flag 1 → 0, end x 336 → 64.
    const arc = rtl.indexOf("A");
    expect(rtl.slice(arc, arc + 8)).toEqual(["A", "28", "28", "0", "0", "0", "64", "28"]);
  });

  it("falls back to a rounded rectangle when the box is too small", () => {
    expect(canNotch({ width: 100, height: 100 })).toBe(false);
    const path = notchPath({ width: 100, height: 100 });
    expect(path.startsWith("M 32 0 L 68 0 A 32 32 0 0 1 100 32")).toBe(true);
  });

  it("rejects fillets too large for the notch", () => {
    expect(canNotch({ width: 400, height: 240, notchWidth: 50, notchHeight: 50, fillet: 30 })).toBe(false);
  });

  it.each(Object.entries(notchPresets))("fits the %s preset on a typical card", (_, preset) => {
    const { notchWidth, notchHeight, fillet } = preset;
    expect(canNotch({ width: 360, height: 220, notchWidth, notchHeight, fillet })).toBe(true);
  });
});
