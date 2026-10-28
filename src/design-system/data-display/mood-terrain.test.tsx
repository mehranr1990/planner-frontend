import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fillMoods, MoodTerrain, terrainGeometry, TERRAIN_W, type TerrainDay } from "./mood-terrain";

const DAYS: TerrainDay[] = [
  { day: "2026-10-09", label: "Fri 17", tipLabel: "Fri, 17 Mehr", mood: 3, energy: "low", weekend: true },
  { day: "2026-10-10", label: "Sat 18", tipLabel: "Sat, 18 Mehr", mood: null, energy: null },
  { day: "2026-10-11", label: "Sun 19", tipLabel: "Sun, 19 Mehr", mood: 5, energy: "high" },
];
const MOODS = ["Awful", "Low", "Okay", "Good", "Great"];
const ENERGY = { low: "Low", medium: "Medium", high: "High" } as const;

describe("MoodTerrain", () => {
  it("elevation follows mood, gaps interpolate, and RTL mirrors every x in the geometry (never a CSS flip)", () => {
    expect(fillMoods([null, 2, null, 4, null])).toEqual([2, 2, 3, 4, 4]);
    const ltr = terrainGeometry(DAYS);
    const rtl = terrainGeometry(DAYS, { direction: "rtl" });
    expect(ltr.ys[2]).toBeLessThan(ltr.ys[0]!);
    expect(ltr.horizonY).toBe(ltr.ys[0]);
    for (let i = 0; i < DAYS.length; i += 1) expect(rtl.xs[i]).toBeCloseTo(TERRAIN_W - ltr.xs[i]!);
    expect(rtl.xs[0]).toBeGreaterThan(rtl.xs[2]!);
    expect(ltr.labelAnchor).toBe("start");
    expect(rtl.labelAnchor).toBe("end");
    // Gradient stops stay in ascending offset order in both directions; energy lights 1–3 strata.
    for (const geometry of [ltr, rtl]) {
      for (const stratum of geometry.strata) {
        const offsets = stratum.stops.map((stop) => stop.offset);
        expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
      }
    }
    expect(ltr.strata[2]!.stops.map((stop) => stop.opacity)).toEqual([0.05, 0.05, 0.32]);
    expect(rtl.strata[0]!.stops.map((stop) => stop.opacity)).toEqual([0.55, 0.05, 0.55]);
  });

  it("selects the last check-in; arrows follow the reading direction and the tooltip names mood and energy", () => {
    const { container } = render(
      <MoodTerrain
        days={DAYS}
        label="Mood terrain"
        direction="rtl"
        moodLabel={(mood) => MOODS[mood - 1]!}
        energyLabel={(energy) => ENERGY[energy]}
        moodLine={(word) => `Mood · ${word}`}
      />,
    );
    const chart = screen.getByRole("group", { name: "Mood terrain" });
    const tip = screen.getByRole("status");
    expect(tip).toHaveTextContent("Sun, 19 Mehr");
    expect(tip).toHaveTextContent("Mood · Great");
    expect(tip).toHaveTextContent("High");
    // RTL: time flows right → left, so ArrowRight goes back in time.
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(tip).toHaveTextContent("Sat, 18 Mehr");
    fireEvent.keyDown(chart, { key: "Home" });
    expect(tip).toHaveTextContent("Low");
    expect(container.querySelectorAll("[data-terrain-day] circle").length).toBe(2 + 9);
    expect(container.querySelector("svg")?.getAttribute("style") ?? "").not.toContain("scaleX(-1)");
  });
});
