import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { PillGroup, pillVariants } from "./pills";

const options = [
  { value: "today", label: "Today", count: 9 },
  { value: "overdue", label: "Overdue", count: 1 },
  { value: "week", label: "This week" },
] as const;

describe("PillGroup", () => {
  it("exposes radio semantics, reports changes and keeps a selection", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderWithProviders(<PillGroup label="Due" value="today" onValueChange={onValueChange} options={options} />);
    expect(screen.getByRole("radiogroup", { name: "Due" })).toBeInTheDocument();
    const today = screen.getByRole("radio", { name: "Today 9" });
    expect(today).toHaveAttribute("aria-checked", "true");
    expect(today).toHaveAttribute("data-state", "on");
    expect(screen.getByRole("radio", { name: "This week" })).toHaveAttribute("aria-checked", "false");
    await user.click(today);
    expect(onValueChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("radio", { name: "Overdue 1" }));
    expect(onValueChange).toHaveBeenCalledWith("overdue");
  });

  it("shares the compact pill classes with Tabs, with a 48px hit area", () => {
    renderWithProviders(<PillGroup label="Due" value="today" onValueChange={() => {}} options={options} />);
    const today = screen.getByRole("radio", { name: "Today 9" });
    expect(today.className).toBe(pillVariants({ variant: "outline" }));
    expect(today).toHaveClass("h-8.5", "after:absolute", "after:-inset-y-1.75");
    // Soft tint below lg, ink outline from lg — never colour alone: aria-checked carries the state.
    expect(today.className).toContain("[&:is([data-state=active],[data-state=on])]:text-scope-deep");
    expect(today.className).toContain("lg:[&:is([data-state=active],[data-state=on])]:inset-ring-[1.5px]");
    expect(screen.getByText("9")).toHaveClass("text-fg-muted");
  });

  it("renders the filled family", () => {
    renderWithProviders(
      <PillGroup
        label="Timer mode"
        variant="filled"
        value="focus"
        onValueChange={() => {}}
        options={[
          { value: "focus", label: "Focus" },
          { value: "short", label: "Short break" },
        ]}
      />,
    );
    const focus = screen.getByRole("radio", { name: "Focus" });
    expect(focus).toHaveClass("h-9", "bg-canvas");
    expect(focus.className).toContain("[&:is([data-state=active],[data-state=on])]:bg-primary");
  });

  it("uses Persian digits and mirrors arrow keys in RTL", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PillGroup label="سررسید" value="today" onValueChange={() => {}} options={options} />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa" },
    });
    expect(screen.getByRole("radio", { name: "Today ۹" })).toBeInTheDocument();
    screen.getByRole("radio", { name: "Today ۹" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Overdue ۱" })).toHaveFocus();
  });
});
