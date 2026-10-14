import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UtilityCard, UtilityField } from "./utility-card";

describe("UtilityCard", () => {
  it("is a quiet 20px subtle card with 18px padding: no shadow, no notch", () => {
    render(
      <UtilityCard as="section" aria-label="Filters">
        <UtilityField>Filter · Area</UtilityField>
      </UtilityCard>,
    );
    const card = screen.getByRole("region", { name: "Filters" });
    expect(card.className).toContain("rounded-utility");
    expect(card.className).toContain("bg-subtle");
    expect(card.className).toContain("p-4.5");
    expect(card.className).not.toMatch(/shadow|notch|border/);
    // Fields sit one step off the card: white on the subtle card.
    expect(card.className).toContain("[--utility-field:var(--surface)]");
  });

  it("flips the field colour on a white utility card", () => {
    render(<UtilityCard data-testid="card" tone="surface" />);
    const card = screen.getByTestId("card");
    expect(card.className).toContain("bg-surface");
    expect(card.className).toContain("[--utility-field:var(--surface-subtle)]");
  });

  it("can be a fieldset for a form group", () => {
    render(
      <UtilityCard as="fieldset" aria-label="Group by">
        <UtilityField as="label">Time of day</UtilityField>
      </UtilityCard>,
    );
    expect(screen.getByRole("group", { name: "Group by" }).tagName).toBe("FIELDSET");
  });
});

describe("UtilityField", () => {
  it("is a 48px row with the 16px field radius", () => {
    render(<UtilityField data-testid="field">Filter · Area</UtilityField>);
    const field = screen.getByTestId("field");
    expect(field.className).toContain("min-h-12");
    expect(field.className).toContain("rounded-field");
    expect(field.className).toContain("bg-[color:var(--utility-field,var(--surface))]");
    expect(field.className).toContain("px-3.5");
  });
});
