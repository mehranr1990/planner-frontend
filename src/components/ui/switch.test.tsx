import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Switch } from "./switch";

describe("Switch", () => {
  it("is a labelled role=switch that toggles by click and keyboard", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    renderWithProviders(<Switch label="Reminders" onCheckedChange={onCheckedChange} />);
    const toggle = screen.getByRole("switch", { name: "Reminders" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByText("Reminders"));
    expect(toggle).toHaveAttribute("aria-checked", "true");
    toggle.focus();
    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(onCheckedChange).toHaveBeenCalledTimes(2);
  });

  it("works controlled", async () => {
    function Controlled() {
      const [on, setOn] = useState(true);
      return <Switch aria-label="Weekly review email" checked={on} onCheckedChange={setOn} />;
    }
    renderWithProviders(<Controlled />);
    const toggle = screen.getByRole("switch", { name: "Weekly review email" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("is inert when disabled and links its description", async () => {
    renderWithProviders(<Switch label="Sync contacts" description="Admins only" disabled />);
    const toggle = screen.getByRole("switch", { name: "Sync contacts" });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAccessibleDescription("Admins only");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("moves the thumb toward the inline end in RTL", () => {
    renderWithProviders(<Switch label="یادآوری" defaultChecked />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa" },
    });
    const thumb = screen.getByRole("switch", { name: "یادآوری" }).firstElementChild!;
    expect(thumb.className).toContain("rtl:data-[state=checked]:-translate-x-6");
  });
});
