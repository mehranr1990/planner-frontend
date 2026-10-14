import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SegmentedProgress } from "./segmented-progress";

describe("SegmentedProgress", () => {
  it("renders n-of-m steps as dashes with progressbar semantics", () => {
    render(<SegmentedProgress label="Habits today" valueText="4 of 5" steps={{ done: 4, total: 5 }} />);
    const bar = screen.getByRole("progressbar", { name: "Habits today" });
    expect(bar).toHaveAttribute("aria-valuenow", "4");
    expect(bar).toHaveAttribute("aria-valuemax", "5");
    expect(bar).toHaveAttribute("aria-valuetext", "4 of 5");
    const dashes = Array.from(bar.children);
    expect(dashes).toHaveLength(5);
    expect(dashes.filter((dash) => dash.className.includes("bg-scope-deep"))).toHaveLength(4);
  });

  it("clamps steps to the total", () => {
    render(<SegmentedProgress label="Steps" valueText="all" steps={{ done: 9, total: 3 }} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");
  });

  it("renders proportional parts in their tones", () => {
    render(
      <SegmentedProgress
        label="Today progress"
        valueText="74%"
        value={74}
        parts={[
          { value: 6, tone: "base" },
          { value: 2, tone: "deep" },
          { value: 3, tone: "track" },
        ]}
      />,
    );
    const bar = screen.getByRole("progressbar", { name: "Today progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "74");
    const [base, deep, track] = Array.from(bar.children) as HTMLElement[];
    expect(base!.className).toContain("bg-scope-dot");
    expect(deep!.className).toContain("bg-scope-deep");
    expect(track!.className).toContain("bg-hairline");
    expect(Number(base!.style.flexGrow)).toBeCloseTo(6 / 11);
  });
});
