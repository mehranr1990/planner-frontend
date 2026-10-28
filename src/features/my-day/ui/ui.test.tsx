import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { EnergyBars } from "./energy-bars";
import { blockStyle, blockTone, DRAG_GHOST_STYLE, SLOT_PLACEHOLDER_STYLE } from "./scope-style";
import { createMyDayFormat } from "./use-my-day-format";

describe("EnergyBars", () => {
  it("names the level for assistive tech and lights 1 / 2 / 3 bars", () => {
    const lit = (level: "low" | "medium" | "high") => {
      const { container, unmount } = renderWithProviders(<EnergyBars level={level} />);
      const glyph = screen.getByRole("img", { name: `Energy ${level}` });
      expect(glyph).toHaveAttribute("data-level", level);
      const count = [...container.querySelectorAll("span > span")].filter((bar) => bar.className.includes("bg-fg-secondary")).length;
      unmount();
      return count;
    };
    expect([lit("low"), lit("medium"), lit("high")]).toEqual([1, 2, 3]);
  });

  it("draws 6 / 9 / 12px bars, 3px wide", () => {
    const { container } = renderWithProviders(<EnergyBars level="high" />);
    const bars = [...container.querySelectorAll("span > span")];
    expect(bars.map((bar) => ["h-1.5", "h-[9px]", "h-3"].find((height) => bar.classList.contains(height)))).toEqual([
      "h-1.5",
      "h-[9px]",
      "h-3",
    ]);
    expect(bars.every((bar) => bar.className.includes("w-[3px]"))).toBe(true);
  });

  it("can be decorative, and renders nothing without a level", () => {
    const { container, rerender } = renderWithProviders(<EnergyBars level="medium" decorative />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("[data-slot=energy-bars]")).toHaveAttribute("aria-hidden", "true");
    rerender(<EnergyBars level={null} />);
    expect(container.querySelector("[data-slot=energy-bars]")).toBeNull();
  });

  it("speaks Persian", () => {
    renderWithProviders(<EnergyBars level="high" />, { preferences: { locale: "fa", direction: "rtl" } });
    expect(screen.getByRole("img", { name: "انرژی زیاد" })).toBeInTheDocument();
  });
});

describe("scope styles", () => {
  it("tint each scope with its soft / deep tokens", () => {
    for (const scope of ["personal", "project", "team", "company"] as const) {
      const style = blockStyle({ scope, kind: "event" });
      expect(style.root).toContain(`bg-${scope}-soft`);
      expect(style.root).toContain(`text-${scope}-deep`);
      expect(style.dot).toBe(`bg-${scope}-dot`);
      expect(style.nowChip).toContain(`bg-${scope}-deep`);
    }
  });

  it("breaks are neutral whatever their scope", () => {
    expect(blockTone("team", "break")).toBe("break");
    expect(blockTone("team", "event")).toBe("team");
    const style = blockStyle({ scope: "team", kind: "break" });
    expect(style.root).toContain("bg-subtle");
    expect(style.root).not.toContain("team");
  });

  it("done blocks hatch at 135°, mute and strike the title", () => {
    const style = blockStyle({ scope: "personal", kind: "task", done: true });
    expect(style.root).toContain("repeating-linear-gradient(135deg");
    expect(style.root).toContain("text-fg-muted");
    expect(style.root).not.toContain("bg-personal-soft");
    expect(style.title).toContain("line-through");
    expect(blockStyle({ scope: "personal", kind: "task" }).title).not.toContain("line-through");
  });

  it("the current block is white with a 2px inset deep outline", () => {
    const style = blockStyle({ scope: "project", kind: "task", current: true });
    expect(style.root).toContain("bg-surface");
    expect(style.root).toContain("ring-2");
    expect(style.root).toContain("ring-project-deep");
    expect(style.root).not.toContain("bg-project-soft");
  });

  it("overlap is a rose surface with a 1.5px rose outline, and wins over current", () => {
    const style = blockStyle({ scope: "personal", kind: "event", overlap: true, current: true });
    expect(style.root).toContain("bg-danger-soft");
    expect(style.root).toContain("ring-danger");
    expect(style.root).not.toContain("ring-personal-deep");
    expect(style.meta).toContain("text-danger-text");
    // Done blocks that overlap keep the hatch and still show the outline.
    const done = blockStyle({ scope: "personal", kind: "event", overlap: true, done: true });
    expect(done.root).toContain("repeating-linear-gradient");
    expect(done.root).toContain("ring-danger");
  });

  it("uses tokens only: no raw colours, no black, no volt", () => {
    const all = [
      ...(["personal", "project", "team", "company"] as const).flatMap((scope) =>
        [{}, { done: true }, { current: true }, { overlap: true }].map((variant) => Object.values(blockStyle({ scope, kind: "task", ...variant })).join(" ")),
      ),
      blockStyle({ scope: "personal", kind: "break", current: true }).root,
      SLOT_PLACEHOLDER_STYLE,
      DRAG_GHOST_STYLE,
    ].join(" ");
    expect(all).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(all).not.toMatch(/\b(?:bg|text|ring|border)-(?:black|white|volt)\b/);
  });
});

describe("createMyDayFormat", () => {
  const en = createMyDayFormat({ locale: "en", digits: "latn", calendar: "jalali" });
  const fa = createMyDayFormat({ locale: "fa", digits: "fa", calendar: "jalali" });

  it("formats clock values and ranges in 24-hour time", () => {
    expect(en.clock(14 * 60 + 35)).toBe("14:35");
    expect(en.clock("09:05")).toBe("09:05");
    expect(en.clockRange(840, 960)).toBe("14:00 – 16:00");
    expect(en.clock(1440)).toBe("24:00");
    expect(fa.clock(14 * 60 + 35)).toBe("۱۴:۳۵");
    expect(fa.clockRange(840, 960)).toBe("۱۴:۰۰ – ۱۶:۰۰");
  });

  it("formats durations as the boards do", () => {
    expect([375, 105, 125, 65, 35, 120, 580, 0].map((minutes) => en.duration(minutes))).toEqual([
      "6h 15m",
      "1h 45m",
      "2h 05m",
      "1h 05m",
      "35m",
      "2h",
      "9h 40m",
      "0m",
    ]);
    expect(fa.duration(125)).toBe("۲ ساعت و ۵ دقیقه");
    expect(fa.duration(35)).toBe("۳۵ دقیقه");
  });

  it("digits are independent of the language", () => {
    const faLatin = createMyDayFormat({ locale: "fa", digits: "latn", calendar: "jalali" });
    const enPersian = createMyDayFormat({ locale: "en", digits: "fa", calendar: "gregorian" });
    expect(faLatin.clock(840)).toBe("14:00");
    expect(faLatin.duration(35)).toBe("35 دقیقه");
    expect(enPersian.clock(840)).toBe("۱۴:۰۰");
    expect(enPersian.duration(35)).toBe("۳۵m");
    expect(en.number(3)).toBe("3");
    expect(fa.number(3)).toBe("۳");
    expect(en.percent(0.71)).toBe("71%");
    expect(fa.percent(0.71)).toBe("۷۱٪");
    expect(fa.digits("12:30")).toBe("۱۲:۳۰");
  });

  it("the page kicker names the weekday and both calendars", () => {
    expect(en.kicker("2026-10-13")).toBe("Tuesday, 21 Mehr · 13 Oct");
    expect(fa.kicker("2026-10-13")).toBe("سه‌شنبه ۲۱ مهر · ۱۳ اکتبر");
    const gregorian = createMyDayFormat({ locale: "en", digits: "latn", calendar: "gregorian" });
    expect(gregorian.kicker("2026-10-13")).toBe("Tuesday, 13 Oct · 21 Mehr");
    expect(en.weekday("2026-10-16")).toBe("Friday");
  });
});
