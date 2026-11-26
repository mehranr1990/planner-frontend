import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { HabitSheet } from "./habit-sheet";

describe("HabitSheet in live API mode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("offers every field the habit API keeps: icon ids, category, unit label, time of day, reminder", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "live");
    const user = userEvent.setup();
    renderWithProviders(<HabitSheet onClose={() => {}} />);
    const icons = screen.getByRole("radiogroup", { name: "Icon" });
    expect(icons.querySelectorAll('[role="radio"]')).toHaveLength(10);
    expect(screen.getByRole("radio", { name: "Water" })).toBeInTheDocument();
    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Unit" })).toHaveAttribute("placeholder", "COUNT");
    expect(screen.getByRole("textbox", { name: "Display label" })).toHaveAttribute("maxlength", "100");
    expect(screen.getByText("Describes when you usually do it. It doesn’t turn a reminder on.")).toBeInTheDocument();
    const reminder = screen.getByRole("switch", { name: "Reminder" });
    expect(reminder).not.toBeChecked();
    await user.click(reminder);
    expect(screen.getByLabelText("Reminder time")).toHaveValue("20:00");
  });

  it("asks for a Latin unit code and points to the display label", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "live");
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<HabitSheet initialTitle="Read" onClose={onClose} />);
    await user.type(screen.getByRole("textbox", { name: "Target amount" }), "20");
    await user.type(screen.getByRole("textbox", { name: "Unit" }), "صفحه");
    await user.click(screen.getByRole("button", { name: "Create habit" }));
    expect(screen.getByText(/Put the word you want to see, in any language, in Display label/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Unit" })).toHaveAttribute("aria-invalid", "true");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps every field in mock mode", () => {
    renderWithProviders(<HabitSheet onClose={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Icon" })).toBeInTheDocument();
    expect(screen.getByText("Category")).toBeInTheDocument();
  });
});
