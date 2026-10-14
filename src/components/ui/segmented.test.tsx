import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Segmented } from "./segmented";

const options = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
] as const;

describe("Segmented", () => {
  it("exposes radio semantics and keeps a selection", async () => {
    const onValueChange = vi.fn();
    renderWithProviders(<Segmented label="View" value="week" onValueChange={onValueChange} options={options} />);
    const week = screen.getByRole("radio", { name: "Week" });
    expect(week).toHaveAttribute("aria-checked", "true");
    await userEvent.click(week);
    expect(onValueChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("radio", { name: "Month" }));
    expect(onValueChange).toHaveBeenCalledWith("month");
  });

  it("has a compact size and a 48px default", () => {
    const { rerender } = renderWithProviders(
      <Segmented label="Calendar" value="day" onValueChange={() => {}} options={options} size="sm" />,
    );
    expect(screen.getByRole("radio", { name: "Day" }).className).toContain("min-h-9");
    rerender(<Segmented label="Calendar" value="day" onValueChange={() => {}} options={options} />);
    expect(screen.getByRole("radio", { name: "Day" }).className).toContain("min-h-touch");
  });
});
