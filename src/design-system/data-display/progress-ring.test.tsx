import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressRing } from "./progress-ring";

describe("ProgressRing", () => {
  it("exposes progressbar semantics", () => {
    render(<ProgressRing value={160} max={200} label="Monthly focus" tone="scope" shade="base" valueText="160 of 200 hours" />);
    const bar = screen.getByRole("progressbar", { name: "Monthly focus" });
    expect(bar).toHaveAttribute("aria-valuenow", "160");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "200");
    expect(bar).toHaveAttribute("aria-valuetext", "160 of 200 hours");
  });

  it("clamps the value and draws the matching arc", () => {
    const { container } = render(<ProgressRing value={150} label="Ring" tone="scope" shade="base" size={100} strokeWidth={10} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    const fill = container.querySelector('[data-slot="ring-fill"]')!;
    expect(Number(fill.getAttribute("stroke-dashoffset"))).toBe(0);

    const half = render(<ProgressRing value={50} label="Half" tone="scope" shade="base" size={100} strokeWidth={10} />);
    const halfFill = half.container.querySelector('[data-slot="ring-fill"]')!;
    const circumference = 2 * Math.PI * 45;
    expect(Number(halfFill.getAttribute("stroke-dashoffset"))).toBeCloseTo(circumference / 2);
    expect(halfFill.getAttribute("r")).toBe("45");
  });

  it("uses scope tokens for the fill and the raised token for the track", () => {
    const { container, rerender } = render(<ProgressRing value={20} label="Ring" tone="scope" shade="base" />);
    expect(container.querySelector('[data-slot="ring-fill"]')!.getAttribute("class")).toContain("stroke-scope-dot");
    expect(container.querySelector("circle")!.getAttribute("class")).toContain("stroke-raised");
    rerender(<ProgressRing value={20} label="Ring" tone="personal" shade="deep" />);
    expect(container.querySelector('[data-slot="ring-fill"]')!.getAttribute("class")).toContain("stroke-personal-deep");
  });

  it("mirrors only the ring under RTL, never the centre content", () => {
    const { container } = render(
      <div dir="rtl">
        <ProgressRing value={80} label="Ring" tone="scope" shade="base">
          <span>۱۶۰</span>
        </ProgressRing>
      </div>,
    );
    const ring = container.querySelector('[data-slot="ring"]')!;
    expect(ring.getAttribute("class")).toContain("rtl:-scale-x-100");
    expect(ring.getAttribute("aria-hidden")).toBe("true");
    const centre = screen.getByText("۱۶۰").parentElement!;
    expect(ring.contains(centre)).toBe(false);
    expect(centre.className).not.toContain("scale-x");
  });

  it("sizes from the size prop through a CSS variable that classes can override", () => {
    render(<ProgressRing value={20} label="Ring" tone="scope" shade="base" size={120} className="max-sm:size-24" />);
    const ring = screen.getByRole("progressbar");
    expect(ring.style.getPropertyValue("--ring-size")).toBe("120px");
    expect(ring).toHaveClass("size-(--ring-size)", "max-sm:size-24");
    // The SVG scales with the box.
    expect(ring.querySelector("svg")).toHaveAttribute("viewBox", "0 0 120 120");
  });
});
