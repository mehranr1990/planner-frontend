import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BudgetRiver, riverGeometry, RIVER_W, smoothSeries, type RiverSeries } from "./budget-river";

const SERIES: RiverSeries[] = [
  { id: "food", label: "Food", color: "var(--viz-food)", values: [100, 200, 300, 400, 200, 0] },
  { id: "work", label: "Work", color: "var(--viz-work)", values: [50, 50, 50, 900, 50, 0] },
];
const POINTS = ["d1", "d2", "d3", "d4", "d5", "d6"];
const fmt = (value: number) => String(Math.round(value));

describe("BudgetRiver", () => {
  it("stacks streams in time order and mirrors x for RTL (never a CSS flip)", () => {
    expect(smoothSeries([0, 3, 0], 1)).toEqual([1.5, 1, 1.5]);
    const ltr = riverGeometry(SERIES, { smoothing: 0 });
    const rtl = riverGeometry(SERIES, { direction: "rtl", smoothing: 0 });
    expect(ltr.streams.map((stream) => stream.id)).toEqual(["food", "work"]);
    expect(ltr.xs[0]).toBe(18);
    expect(rtl.xs[0]).toBe(RIVER_W - 18);
    expect(rtl.xs.at(-1)).toBe(RIVER_W - ltr.xs.at(-1)!);
    expect(ltr.labelAnchor).toBe("start");
    expect(rtl.labelAnchor).toBe("end");
    expect(riverGeometry([{ id: "x", values: [0, 0] }]).streams).toEqual([]);
  });

  it("shows the selected day's total and top category; arrows follow the reading direction; a chip isolates a stream", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <BudgetRiver series={SERIES} points={POINTS} todayIndex={3} label="River summary" legendLabel="Categories" formatValue={fmt} topText={(label, value) => `Top: ${label} · ${value}`} direction="rtl" />,
    );
    const chart = screen.getByRole("group", { name: "River summary" });
    const tip = screen.getByRole("status");
    expect(tip).toHaveTextContent("d4");
    expect(tip).toHaveTextContent("1300");
    expect(tip).toHaveTextContent("Top: Work · 900");
    chart.focus();
    // RTL: time flows right → left, so ArrowRight goes back in time.
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(tip).toHaveTextContent("d3");
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(tip).toHaveTextContent("d4"); // never past today
    await user.click(screen.getByRole("button", { name: "Food" }));
    expect(screen.getByRole("button", { name: "Food" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector("svg")?.getAttribute("style") ?? "").not.toMatch(/scale/);
    expect(container.querySelectorAll("[data-stream]")).toHaveLength(2);
  });
});
