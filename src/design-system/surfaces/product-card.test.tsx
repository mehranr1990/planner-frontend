import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductCard } from "./product-card";

describe("ProductCard", () => {
  it("is a 28px surface card with 20px padding and never a notch", () => {
    render(<ProductCard data-testid="card">Run 100 km</ProductCard>);
    const card = screen.getByTestId("card");
    expect(card.tagName).toBe("DIV");
    expect(card.className).toContain("rounded-product");
    expect(card.className).toContain("bg-surface");
    expect(card.className).toContain("p-5");
    expect(card.className).not.toMatch(/notch|shadow/);
    expect(card.style.clipPath).toBe("");
  });

  it("renders the requested element with its accessible name", () => {
    render(
      <ul>
        <ProductCard as="li" aria-label="Run 100 km this month" />
      </ul>,
    );
    expect(screen.getByRole("listitem", { name: "Run 100 km this month" })).toBeInTheDocument();
  });

  it("takes an optional scope tint", () => {
    render(
      <ProductCard as="article" aria-label="Goal" tone="scope-soft">
        x
      </ProductCard>,
    );
    const card = screen.getByRole("article", { name: "Goal" });
    expect(card.className).toContain("bg-scope-soft");
    expect(card.className).not.toContain("bg-surface");
  });
});
