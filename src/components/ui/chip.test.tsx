import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Chip, RemovableChip, ToggleChip } from "./chip";

describe("Chip", () => {
  it("renders a static scope chip with its dot", () => {
    renderWithProviders(<Chip scope="team">Team</Chip>);
    const chip = screen.getByText("Team").parentElement!;
    expect(chip.className).toContain("bg-team-soft");
    expect(chip.className).toContain("text-team-deep");
    expect(chip.querySelector(".bg-team-dot")).toHaveAttribute("aria-hidden", "true");
  });

  it("defaults to a neutral tint", () => {
    renderWithProviders(<Chip>Copy</Chip>);
    expect(screen.getByText("Copy").parentElement!.className).toContain("bg-raised");
  });
});

describe("ToggleChip", () => {
  it("toggles aria-pressed and shows a check when selected", async () => {
    const user = userEvent.setup();
    const onSelectedChange = vi.fn();
    renderWithProviders(<ToggleChip onSelectedChange={onSelectedChange}>Research</ToggleChip>);
    const chip = screen.getByRole("button", { name: "Research" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip).toHaveAttribute("data-state", "on");
    expect(onSelectedChange).toHaveBeenCalledWith(true);
    chip.focus();
    await user.keyboard("{Enter}");
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("works controlled and disabled", async () => {
    const onSelectedChange = vi.fn();
    const { rerender } = renderWithProviders(
      <ToggleChip selected onSelectedChange={onSelectedChange}>
        1h
      </ToggleChip>,
    );
    expect(screen.getByRole("button", { name: "1h" })).toHaveAttribute("aria-pressed", "true");
    rerender(
      <ToggleChip selected disabled onSelectedChange={onSelectedChange}>
        1h
      </ToggleChip>,
    );
    await userEvent.click(screen.getByRole("button", { name: "1h" }));
    expect(onSelectedChange).not.toHaveBeenCalled();
  });

  it("tints the selected state with a fixed scope", () => {
    renderWithProviders(
      <ToggleChip scope="company" defaultSelected>
        Company
      </ToggleChip>,
    );
    expect(screen.getByRole("button", { name: "Company" }).className).toContain("data-[state=on]:bg-company-soft");
  });
});

describe("RemovableChip", () => {
  it("names its remove button after the label", async () => {
    const onRemove = vi.fn();
    renderWithProviders(<RemovableChip label="Dashboard" onRemove={onRemove} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove Dashboard" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("speaks Persian in fa", () => {
    renderWithProviders(<RemovableChip label="طراحی" onRemove={() => {}} />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa" },
    });
    expect(screen.getByRole("button", { name: "حذف طراحی" })).toBeInTheDocument();
  });

  it("can be disabled", () => {
    renderWithProviders(<RemovableChip label="UI" onRemove={() => {}} disabled />);
    expect(screen.getByRole("button", { name: "Remove UI" })).toBeDisabled();
  });
});
