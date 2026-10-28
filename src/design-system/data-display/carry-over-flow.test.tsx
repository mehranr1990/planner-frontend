import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CarryOverFlow, carryOverGeometry, FLOW_W } from "./carry-over-flow";

const startX = (d: string) => Number(/^M([\d.]+)/.exec(d)![1]);

describe("CarryOverFlow", () => {
  it("draws one closed stream per item, in reading order, mirrored by coordinates for RTL", () => {
    const ltr = carryOverGeometry([31, 6, 3, 2]);
    expect(ltr.streams).toHaveLength(4);
    expect(ltr.streams.every((d) => d.startsWith("M") && d.endsWith("Z"))).toBe(true);
    expect(startX(ltr.streams[0]!)).toBeLessThan(startX(ltr.streams[1]!));
    const rtl = carryOverGeometry([31, 6, 3, 2], { direction: "rtl" });
    expect(startX(rtl.streams[0]!)).toBeGreaterThan(startX(rtl.streams[1]!));
    expect(startX(rtl.streams[0]!)).toBeLessThan(FLOW_W);
    expect(carryOverGeometry([]).streams).toEqual([]);
  });

  it("shows the total, each count with its share and marks the emphasised card", () => {
    render(
      <CarryOverFlow
        label="What happened to this week's plan"
        totalLabel="planned this week"
        emphasis="done"
        items={[
          { id: "done", count: 3, label: "Completed", color: "green", icon: null, cta: <button type="button">Great week</button> },
          { id: "inbox", count: 1, label: "Back to inbox", color: "grey", icon: null },
        ]}
      />,
    );
    expect(screen.getByText("planned this week").previousSibling).toHaveTextContent("4");
    const cards = within(screen.getByRole("list", { name: "What happened to this week's plan" })).getAllByRole("listitem");
    expect(cards[0]).toHaveAttribute("data-emphasis", "true");
    expect(cards[0]).toHaveTextContent("75%");
    expect(cards[1]).toHaveTextContent("25%");
    expect(screen.getByRole("button", { name: "Great week" })).toBeInTheDocument();
  });
});
