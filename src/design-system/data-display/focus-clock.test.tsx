import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FocusClock, focusTier, wedgePath } from "./focus-clock";

const HOURS = [0, 0, 0, 0, 0, 0, 2, 8, 22, 48, 54, 46, 14, 6, 26, 34, 30, 18, 10, 6, 8, 4, 0, 0];

describe("FocusClock", () => {
  it("tiers focus minutes like the board", () => {
    expect([0, 8, 26, 48].map(focusTier)).toEqual([0, 1, 2, 3]);
  });

  it("draws hours clockwise from midnight at the top, longer for more focus", () => {
    // Midnight wedge starts just right of 12 o'clock; 6 o'clock sits on the right.
    expect(wedgePath(0, 0)).toMatch(/^M212\S* 152/);
    expect(wedgePath(6, 0)).toMatch(/^M268 21\d/);
    const radius = (d: string) => Number(/A(\S+) /.exec(d)?.[1]);
    expect(radius(wedgePath(10, 54))).toBeGreaterThan(radius(wedgePath(8, 22)));
  });

  it("renders 24 wedges, the best window, an LTR dial and a text alternative", () => {
    const { container } = render(
      <FocusClock minutesByHour={HOURS} best={[9, 12]} label="Typical focus by hour" />,
    );
    expect(screen.getByRole("figure", { name: "Typical focus by hour" })).toBeInTheDocument();
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveClass("[direction:ltr]");
    expect(svg.querySelectorAll("path[data-tier]")).toHaveLength(24);
    expect(svg.querySelectorAll('path[data-tier="3"]')).toHaveLength(3);
    expect(svg.querySelector('[data-slot="best"]')).not.toBeNull();
    expect(screen.getByText("10:00 · 54m")).toBeInTheDocument();
    expect(screen.queryByText("02:00 · 0m")).toBeNull();
  });
});
