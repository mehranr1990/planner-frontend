import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Tooltip } from "./tooltip";

describe("Tooltip", () => {
  it("opens on keyboard focus, describes the trigger and stacks above overlays", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Tooltip content="Energy = how demanding a block is">
        <button type="button" aria-label="Energy">
          ?
        </button>
      </Tooltip>,
    );
    await user.tab();
    const trigger = screen.getByRole("button", { name: "Energy" });
    expect(trigger).toHaveFocus();
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Energy = how demanding a block is");
    expect(trigger).toHaveAccessibleDescription("Energy = how demanding a block is");
    const content = document.querySelector("[data-side]");
    expect(content).toHaveClass("z-(--z-tooltip)");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("is a surface island with a hairline shadow, never an ink fill", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Tooltip content="Mood 4.2">
        <button type="button">Point</button>
      </Tooltip>,
    );
    await user.tab();
    await screen.findByRole("tooltip");
    const content = document.querySelector("[data-side]");
    expect(content).toHaveClass("bg-surface", "text-fg", "shadow-tooltip", "rounded-field");
    expect(content?.className).not.toMatch(/bg-fg|text-surface/);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
