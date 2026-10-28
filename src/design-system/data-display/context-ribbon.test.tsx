import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContextRibbon, RIBBON_W, ribbonGeometry } from "./context-ribbon";

const VALUES = [
  [2, 3, 4],
  [1, 1, 2],
];

describe("ContextRibbon", () => {
  it("stacks one closed band per series and mirrors x (not a CSS flip) for RTL", () => {
    const ltr = ribbonGeometry(VALUES, { height: 220 });
    expect(ltr.bands).toHaveLength(2);
    expect(ltr.bands.every((d) => d.startsWith("M") && d.endsWith("Z"))).toBe(true);
    expect(ltr.xs[0]).toBeLessThan(ltr.xs[2]!);
    const rtl = ribbonGeometry(VALUES, { height: 220, direction: "rtl" });
    expect(rtl.xs.map((x) => RIBBON_W - x)).toEqual(ltr.xs);
    expect(ribbonGeometry([], { height: 220 }).bands).toEqual([]);
  });

  it("names the figure, fades non-emphasised bands and lists values for screen readers", () => {
    const { container } = render(
      <ContextRibbon
        label="Share of tracked time per day"
        columns={["Sat", "Sun", "Mon"]}
        emphasis="personal"
        formatValue={(value) => `${value}h`}
        series={[
          { id: "personal", label: "Personal", color: "var(--personal-dot)", values: VALUES[0]! },
          { id: "projects", label: "Projects", color: "var(--project-dot)", values: VALUES[1]! },
        ]}
      />,
    );
    expect(screen.getByRole("figure", { name: "Share of tracked time per day" })).toBeInTheDocument();
    expect(container.querySelector('[data-band="projects"]')).toHaveAttribute("fill-opacity", "0.12");
    expect(container.querySelector('[data-band="personal"]')).toHaveAttribute("fill-opacity", "0.8");
    expect(screen.getByRole("rowheader", { name: "Personal" }).parentElement).toHaveTextContent("Personal2h3h4h");
  });
});
