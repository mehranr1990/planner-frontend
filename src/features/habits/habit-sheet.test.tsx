import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { HabitSheet } from "./habit-sheet";

describe("HabitSheet in live API mode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("hides the fields the habit API cannot keep", () => {
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "live");
    renderWithProviders(<HabitSheet onClose={() => {}} />);
    expect(screen.getByRole("textbox", { name: "Unit" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Icon" })).not.toBeInTheDocument();
    expect(screen.queryByText("Area")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Reminder" })).not.toBeInTheDocument();
  });

  it("asks for a Latin unit instead of failing the save", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "live");
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<HabitSheet initialTitle="Read" onClose={onClose} />);
    await user.type(screen.getByRole("spinbutton", { name: "Target amount" }), "20");
    await user.type(screen.getByRole("textbox", { name: "Unit" }), "صفحه");
    await user.click(screen.getByRole("button", { name: "Create habit" }));
    expect(screen.getByText("Use Latin letters for the unit (e.g. PAGES, KM or GLASS).")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Unit" })).toHaveAttribute("aria-invalid", "true");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps every field in mock mode", () => {
    renderWithProviders(<HabitSheet onClose={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Icon" })).toBeInTheDocument();
    expect(screen.getByText("Area")).toBeInTheDocument();
  });
});
