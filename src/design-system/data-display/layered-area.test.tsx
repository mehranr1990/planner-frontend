import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LAYERED_W, LayeredArea, layeredPaths, layeredScales } from "./layered-area";

const SERIES = [
  { id: "mood", label: "Mood", color: "var(--viz-mood)", values: [4, 6, 8] },
  { id: "energy", label: "Energy", color: "var(--viz-energy)", values: [5, 5, 3] },
];

describe("LayeredArea", () => {
  it("maps 0–10 onto the shared scale, closes the area at the baseline and mirrors x for RTL", () => {
    const ltr = layeredScales(3, { height: 260 });
    const rtl = layeredScales(3, { height: 260, direction: "rtl" });
    expect(rtl.x(0)).toBeCloseTo(LAYERED_W - ltr.x(0));
    expect(ltr.y(10)).toBeLessThan(ltr.y(0));
    expect(ltr.y(12)).toBe(ltr.y(10));
    const { area, points } = layeredPaths([4, 6, 8], { height: 260 });
    expect(points).toHaveLength(3);
    expect(area.endsWith("Z")).toBe(true);
  });

  it("puts the emphasised layer on top, fades the rest and inspects points with the keyboard", () => {
    const { container } = render(
      <LayeredArea label="Mood, energy and focus" series={SERIES} pointLabels={["1 Mehr", "2 Mehr", "3 Mehr"]} emphasis="mood" />,
    );
    const layers = [...container.querySelectorAll("[data-layer]")];
    expect(layers.map((layer) => layer.getAttribute("data-layer"))).toEqual(["energy", "mood"]);
    expect(layers[0]).toHaveStyle({ opacity: "0.12" });
    const chart = screen.getByRole("img", { name: /3 Mehr: Mood 8\.0, Energy 3\.0/ });
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(chart).toHaveAccessibleName(/2 Mehr: Mood 6\.0, Energy 5\.0/);
    fireEvent.keyDown(chart, { key: "Home" });
    expect(chart).toHaveAccessibleName(/1 Mehr/);
  });
});
