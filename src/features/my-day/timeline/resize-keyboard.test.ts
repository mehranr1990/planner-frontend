import { describe, expect, it } from "vitest";
import { moveKeyboardTarget } from "./keyboard";
import { resizeByKey, resizeByPixels, resizeKey, sameSpan } from "./resize";

const window = { startMinutes: 8 * 60, endMinutes: 20 * 60 };
const span = { startMinutes: 14 * 60, endMinutes: 16 * 60 };
const ppm = 64 / 60;

describe("resizeByPixels", () => {
  it("snaps the dragged end to 15 minutes", () => {
    // 20 minutes of travel snaps to 15.
    expect(resizeByPixels(span, "end", 20 * ppm, ppm, window)).toEqual({ startMinutes: 840, endMinutes: 975 });
    expect(resizeByPixels(span, "end", -40 * ppm, ppm, window)).toEqual({ startMinutes: 840, endMinutes: 915 });
  });

  it("never shrinks below 15 minutes", () => {
    expect(resizeByPixels(span, "end", -500 * ppm, ppm, window)).toEqual({ startMinutes: 840, endMinutes: 855 });
    expect(resizeByPixels(span, "start", 500 * ppm, ppm, window)).toEqual({ startMinutes: 945, endMinutes: 960 });
  });

  it("stays inside the visible window", () => {
    expect(resizeByPixels(span, "end", 900 * ppm, ppm, window).endMinutes).toBe(window.endMinutes);
    expect(resizeByPixels(span, "start", -900 * ppm, ppm, window).startMinutes).toBe(window.startMinutes);
  });
});

describe("resizeKey", () => {
  const key = (init: Partial<KeyboardEventInit> & { key: string }) => resizeKey({ shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...init });

  it("Shift+Up/Down resizes the end, Alt+Shift the start", () => {
    expect(key({ key: "ArrowDown", shiftKey: true })).toEqual({ edge: "end", direction: 1 });
    expect(key({ key: "ArrowUp", shiftKey: true })).toEqual({ edge: "end", direction: -1 });
    expect(key({ key: "ArrowUp", shiftKey: true, altKey: true })).toEqual({ edge: "start", direction: -1 });
  });

  it("ignores plain arrows, other keys and Ctrl/Meta combos", () => {
    expect(key({ key: "ArrowDown" })).toBeNull();
    expect(key({ key: "a", shiftKey: true })).toBeNull();
    expect(key({ key: "ArrowDown", shiftKey: true, ctrlKey: true })).toBeNull();
    expect(key({ key: "ArrowDown", shiftKey: true, metaKey: true })).toBeNull();
  });

  it("steps 15 minutes per press", () => {
    const grown = resizeByKey(span, { edge: "end", direction: 1 }, window);
    expect(grown.endMinutes).toBe(975);
    const earlier = resizeByKey(span, { edge: "start", direction: -1 }, window);
    expect(earlier.startMinutes).toBe(825);
    expect(sameSpan(grown, grown)).toBe(true);
    expect(sameSpan(grown, earlier)).toBe(false);
  });
});

describe("moveKeyboardTarget", () => {
  const days = ["2026-10-13", "2026-10-14", "2026-10-15"];
  const target = { day: "2026-10-14", startMinutes: 14 * 60 };
  const ltr = { days, rtl: false, durationMinutes: 60 };

  it("moves 15 minutes up and down", () => {
    expect(moveKeyboardTarget(target, "ArrowDown", ltr)).toEqual({ ...target, startMinutes: 855 });
    expect(moveKeyboardTarget(target, "ArrowUp", ltr)).toEqual({ ...target, startMinutes: 825 });
  });

  it("stops at midnight, keeping the whole block inside the day", () => {
    expect(moveKeyboardTarget({ ...target, startMinutes: 0 }, "ArrowUp", ltr)).toBeNull();
    expect(moveKeyboardTarget({ ...target, startMinutes: 23 * 60 }, "ArrowDown", ltr)).toBeNull();
  });

  it("switches columns with the arrows, following the visual direction", () => {
    expect(moveKeyboardTarget(target, "ArrowRight", ltr)?.day).toBe("2026-10-15");
    expect(moveKeyboardTarget(target, "ArrowLeft", ltr)?.day).toBe("2026-10-13");
    // In rtl the columns run right to left: the right arrow reaches the earlier day.
    expect(moveKeyboardTarget(target, "ArrowRight", { ...ltr, rtl: true })?.day).toBe("2026-10-13");
    expect(moveKeyboardTarget(target, "ArrowLeft", { ...ltr, rtl: true })?.day).toBe("2026-10-15");
  });

  it("does not leave the first or last column and ignores other keys", () => {
    expect(moveKeyboardTarget({ ...target, day: days[0]! }, "ArrowLeft", ltr)).toBeNull();
    expect(moveKeyboardTarget({ ...target, day: days[2]! }, "ArrowRight", ltr)).toBeNull();
    expect(moveKeyboardTarget(target, "Enter", ltr)).toBeNull();
    expect(moveKeyboardTarget({ ...target, day: "2030-01-01" }, "ArrowRight", ltr)).toBeNull();
  });
});
