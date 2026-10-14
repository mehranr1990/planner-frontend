import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Button } from "./button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "./dialog";

function Example({ description, size }: { description?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open dialog</Button>
      </DialogTrigger>
      <DialogContent title="Rename board" description={description} size={size}>
        <input aria-label="Board name" />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("opens with an accessible name, description and a localised close button", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example description="Pick a short name." />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));

    const dialog = screen.getByRole("dialog", { name: "Rename board" });
    expect(dialog).toHaveAccessibleDescription("Pick a short name.");
    expect(dialog).toHaveClass("max-w-lg");
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("omits aria-describedby when there is no description", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example size="sm" />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toHaveAttribute("aria-describedby");
    expect(dialog).toHaveClass("max-w-sm");
  });

  it("focuses the first control, traps Tab and restores focus on Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });
    await user.click(trigger);

    const input = screen.getByRole("textbox", { name: "Board name" });
    await waitFor(() => expect(input).toHaveFocus());
    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("closes from the close button and on an outside click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Radix listens for pointerdown outside the content.
    await userEvent.setup({ pointerEventsCheck: 0 }).click(document.body);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("dims the page with the themed scrim token, not a tint of the text colour", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    const overlay = document.querySelector(".fixed.inset-0[data-state]");
    expect(overlay).toHaveClass("bg-scrim");
    expect(overlay?.className).not.toContain("bg-fg");
  });

  it("locks page scroll while open", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    await waitFor(() => expect(document.body).toHaveAttribute("data-scroll-locked"));
  });

  it("carries dir and localised close label in Persian RTL", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />, { preferences: { locale: "fa", direction: "rtl", digits: "fa" } });
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    expect(screen.getByRole("dialog")).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("button", { name: "بستن" })).toBeInTheDocument();
  });

  it("can hide the title visually while keeping the name", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent title="Hidden title" hideTitle hideClose>
          <button type="button">Only action</button>
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("dialog", { name: "Hidden title" })).toBeInTheDocument();
    expect(screen.getByText("Hidden title")).toHaveClass("sr-only");
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });
});
