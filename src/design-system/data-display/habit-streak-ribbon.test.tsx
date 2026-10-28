import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HabitStreakRibbon, ribbonConnectors, type StreakRibbonNode, type StreakRibbonState } from "./habit-streak-ribbon";

const STATES: StreakRibbonState[] = ["done", "missed", "done", "today-open", "upcoming", "upcoming", "rest"];
const NODES: StreakRibbonNode[] = STATES.map((state, index) => ({
  key: `d${index}`,
  state,
  weekday: ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"][index]!,
  date: String(18 + index),
  weekend: index === 6,
  ariaLabel: `Day ${18 + index}: ${state}`,
}));

describe("HabitStreakRibbon", () => {
  it("keeps a run strong, breaks it at a miss and mirrors x for RTL (never a CSS flip)", () => {
    const ltr = ribbonConnectors(STATES, "ltr");
    expect(ltr.map((connector) => connector.strong)).toEqual([false, false, true, false, false, false]);
    expect(ltr[0]!.d.startsWith("M50.0 26")).toBe(true);
    const rtl = ribbonConnectors(STATES, "rtl");
    expect(rtl[0]!.d.startsWith("M650.0 26")).toBe(true);
    // A rest carries a run only when the run reached it.
    expect(ribbonConnectors(["done", "rest", "today-done"]).map((connector) => connector.strong)).toEqual([true, true]);
    expect(ribbonConnectors(["missed", "rest", "today-done"]).map((connector) => connector.strong)).toEqual([false, false]);
  });

  it("is a labelled group with one labelled node per day, in its own direction, with an optional CTA", () => {
    const { container, rerender } = render(
      <HabitStreakRibbon nodes={NODES} streak={1} streakText="1" streakLabel="day streak" label="Read: 1-day streak" cta={{ label: "Keep going", href: "/personal/habits/h-read" }} />,
    );
    const group = screen.getByRole("group", { name: "Read: 1-day streak" });
    expect(group).toHaveAttribute("dir", "ltr");
    expect(screen.getAllByRole("img")).toHaveLength(7);
    expect(screen.getByRole("img", { name: "Day 21: today-open" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Keep going" })).toHaveAttribute("href", "/personal/habits/h-read");
    expect(container.querySelector("svg")?.getAttribute("style") ?? "").not.toMatch(/scale/);
    rerender(<HabitStreakRibbon nodes={NODES} streak={1} streakText="۱" streakLabel="روز پیاپی" label="ribbon" direction="rtl" compact cta={{ label: "x", href: "/" }} />);
    expect(screen.getByRole("group", { name: "ribbon" })).toHaveAttribute("dir", "rtl");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
