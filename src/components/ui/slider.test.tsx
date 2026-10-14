import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Slider } from "./slider";

describe("Slider", () => {
  it("shows and announces the value text", () => {
    renderWithProviders(
      <Slider label="Daily capacity" min={2} max={12} defaultValue={8} formatValue={(value) => `${value} h`} />,
    );
    const thumb = screen.getByRole("slider", { name: "Daily capacity" });
    expect(thumb).toHaveAttribute("aria-valuenow", "8");
    expect(thumb).toHaveAttribute("aria-valuetext", "8 h");
    expect(screen.getByText("8 h")).toBeInTheDocument();
  });

  it("steps with the keyboard (uncontrolled) and reports changes", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderWithProviders(<Slider label="Capacity" min={2} max={12} defaultValue={8} onValueChange={onValueChange} />);
    const thumb = screen.getByRole("slider");
    thumb.focus();
    await user.keyboard("{ArrowRight}");
    expect(onValueChange).toHaveBeenLastCalledWith(9);
    expect(thumb).toHaveAttribute("aria-valuenow", "9");
    await user.keyboard("{End}");
    expect(thumb).toHaveAttribute("aria-valuenow", "12");
  });

  it("follows the RTL direction: ArrowLeft increases", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Slider label="ظرفیت روزانه" min={2} max={12} defaultValue={8} />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa" },
    });
    const thumb = screen.getByRole("slider", { name: "ظرفیت روزانه" });
    expect(thumb).toHaveAttribute("aria-valuetext", "۸");
    thumb.focus();
    await user.keyboard("{ArrowLeft}");
    expect(thumb).toHaveAttribute("aria-valuenow", "9");
    expect(thumb).toHaveAttribute("aria-valuetext", "۹");
  });

  it("is controlled and can be disabled", () => {
    const { rerender } = renderWithProviders(<Slider aria-label="Volume" value={30} onValueChange={() => {}} />);
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveAttribute("aria-valuenow", "30");
    rerender(<Slider aria-label="Volume" value={30} disabled />);
    expect(screen.getByRole("slider")).toHaveAttribute("data-disabled");
  });
});
