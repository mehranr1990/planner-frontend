import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BudgetFlow, FLOW_W, flowGeometry } from "./budget-flow";

const ROWS = [
  { id: "housing", label: "Housing", color: "var(--viz-housing)", value: 12 },
  { id: "food", label: "Food", color: "var(--viz-food)", value: 6 },
];

describe("BudgetFlow", () => {
  it("feeds ribbons from the source, adds a Remaining ribbon, and mirrors x for RTL", () => {
    const ltr = flowGeometry(30, [12, 6], { height: 420 });
    expect(ltr.map((ribbon) => ribbon.rest)).toEqual([false, false, true]);
    // Width at the source = amount.
    expect((ltr[0]!.b - ltr[0]!.a) / (ltr[1]!.b - ltr[1]!.a)).toBeCloseTo(2);
    expect(ltr[0]!.d.startsWith("M0 ")).toBe(true);
    expect(flowGeometry(30, [12, 6], { height: 420, direction: "rtl" })[0]!.d.startsWith(`M${FLOW_W} `)).toBe(true);
    // Overspent: no Remaining, nothing negative.
    expect(flowGeometry(10, [12], { height: 420 }).map((ribbon) => ribbon.rest)).toEqual([false]);
  });

  it("lists categories with share and amount, a neutral Remaining row, and selectable rows", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <BudgetFlow
        income={30}
        rows={ROWS}
        label="Flow summary"
        remainingLabel="Remaining"
        formatValue={(value) => `${value}M`}
        formatShare={(ratio) => `${Math.round(ratio * 100)}%`}
        remainingShare={(ratio) => `${Math.round(ratio * 100)}% of income`}
      />,
    );
    expect(screen.getByRole("group", { name: "Flow summary" })).toBeInTheDocument();
    const housing = screen.getByRole("button", { name: /Housing/ });
    expect(housing).toHaveTextContent("67%");
    expect(housing).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector("[data-flow-rest]")).toHaveTextContent("40% of income");
    await user.click(screen.getByRole("button", { name: /Food/ }));
    expect(screen.getByRole("button", { name: /Food/ })).toHaveAttribute("aria-pressed", "true");
    expect(housing).toHaveAttribute("aria-pressed", "false");
  });
});
