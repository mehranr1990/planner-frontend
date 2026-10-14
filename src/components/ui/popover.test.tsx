import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Button } from "./button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "./popover";

function Example({ arrow }: { arrow?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button>Notifications</Button>
      </PopoverTrigger>
      <PopoverContent aria-label="Notifications panel" arrow={arrow} align="end">
        <p>Two new mentions</p>
        <PopoverClose asChild>
          <Button variant="secondary">Done</Button>
        </PopoverClose>
      </PopoverContent>
    </Popover>
  );
}

describe("Popover", () => {
  it("opens, exposes aria-expanded and focuses inside", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />);
    const trigger = screen.getByRole("button", { name: "Notifications" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);

    const panel = screen.getByRole("dialog", { name: "Notifications panel" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(panel).toHaveClass("bg-elevated", "rounded-tile", "z-(--z-overlay)");
    await waitFor(() => expect(screen.getByRole("button", { name: "Done" })).toHaveFocus());
    // No arrow by default.
    expect(panel.querySelector("svg")).toBeNull();
  });

  it("closes with Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />);
    const trigger = screen.getByRole("button", { name: "Notifications" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("closes from PopoverClose and on an outside click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />);
    const trigger = screen.getByRole("button", { name: "Notifications" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("renders an optional arrow and carries dir in RTL", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example arrow />, { preferences: { locale: "fa", direction: "rtl", digits: "fa" } });
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    const panel = screen.getByRole("dialog");
    expect(panel).toHaveAttribute("dir", "rtl");
    expect(panel.querySelector("svg")).not.toBeNull();
  });

  it("renders an unstyled asChild panel that brings its own surface", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Popover>
        <PopoverTrigger asChild>
          <Button>Switch context</Button>
        </PopoverTrigger>
        <PopoverContent unstyled asChild arrow aria-label="Contexts">
          <section className="own-surface">
            <PopoverClose asChild>
              <Button variant="secondary">Personal</Button>
            </PopoverClose>
          </section>
        </PopoverContent>
      </Popover>,
      { preferences: { locale: "fa", direction: "rtl", digits: "fa" } },
    );
    const trigger = screen.getByRole("button", { name: "Switch context" });
    await user.click(trigger);
    const panel = screen.getByRole("dialog", { name: "Contexts" });
    // The child element itself is the Radix content: same node, own surface.
    expect(panel.tagName).toBe("SECTION");
    expect(panel).toHaveClass("own-surface", "z-(--z-overlay)");
    expect(panel).not.toHaveClass("bg-elevated");
    expect(panel).not.toHaveClass("p-3");
    expect(panel).not.toHaveClass("w-80");
    expect(panel).toHaveAttribute("dir", "rtl");
    await waitFor(() => expect(screen.getByRole("button", { name: "Personal" })).toHaveFocus());

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
