import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Checkbox, type CheckedState } from "./checkbox";

describe("Checkbox", () => {
  it("toggles uncontrolled from a click on its label and from Space", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    renderWithProviders(<Checkbox label="Show weekends" onCheckedChange={onCheckedChange} />);
    const box = screen.getByRole("checkbox", { name: "Show weekends" });
    expect(box).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByText("Show weekends"));
    expect(box).toHaveAttribute("aria-checked", "true");
    box.focus();
    await user.keyboard(" ");
    expect(box).toHaveAttribute("aria-checked", "false");
    expect(onCheckedChange).toHaveBeenNthCalledWith(1, true);
  });

  it("supports controlled indeterminate", async () => {
    function Controlled() {
      const [checked, setChecked] = useState<CheckedState>("indeterminate");
      return <Checkbox aria-label="All tasks" checked={checked} onCheckedChange={setChecked} />;
    }
    renderWithProviders(<Controlled />);
    const box = screen.getByRole("checkbox", { name: "All tasks" });
    expect(box).toHaveAttribute("aria-checked", "mixed");
    await userEvent.click(box);
    expect(box).toHaveAttribute("aria-checked", "true");
  });

  it("is inert when disabled", async () => {
    renderWithProviders(<Checkbox label="Hide completed" disabled />);
    const box = screen.getByRole("checkbox", { name: "Hide completed" });
    expect(box).toBeDisabled();
    await userEvent.click(box);
    expect(box).toHaveAttribute("aria-checked", "false");
  });

  it("shows a lock glyph when locked by policy, not colour alone", () => {
    renderWithProviders(<Checkbox label="Locked by workspace policy" locked defaultChecked />);
    const box = screen.getByRole("checkbox", { name: "Locked by workspace policy" });
    expect(box).toBeDisabled();
    expect(box).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Locked by workspace policy").querySelector("svg")).toBeInTheDocument();
  });

  it("links a description and posts with forms", () => {
    renderWithProviders(
      <form aria-label="settings">
        <Checkbox label="Digest" description="Every Saturday" name="digest" defaultChecked />
      </form>,
    );
    expect(screen.getByRole("checkbox", { name: "Digest" })).toHaveAccessibleDescription("Every Saturday");
    const form = screen.getByRole("form", { name: "settings" }) as HTMLFormElement;
    expect(new FormData(form).get("digest")).toBe("on");
  });

  it("supports invalid and RTL layout", () => {
    renderWithProviders(<Checkbox label="تأیید" invalid />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa" },
    });
    expect(screen.getByRole("checkbox", { name: "تأیید" })).toHaveAttribute("aria-invalid", "true");
  });
});
