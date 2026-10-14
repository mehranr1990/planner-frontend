import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Button } from "./button";
import { Sheet, SheetContent, SheetTrigger, type SheetSide } from "./sheet";

function Example({ side, hideTitle }: { side?: SheetSide; hideTitle?: boolean }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button>Quick add</Button>
      </SheetTrigger>
      <SheetContent side={side} title="Quick add" hideTitle={hideTitle} footer={<Button>Create</Button>}>
        <button type="button">Task</button>
        <button type="button">Event</button>
      </SheetContent>
    </Sheet>
  );
}

describe("Sheet", () => {
  it("opens an end sheet with title, close button and focus inside", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />);
    await user.click(screen.getByRole("button", { name: "Quick add" }));
    const sheet = screen.getByRole("dialog", { name: "Quick add" });
    expect(sheet).toHaveAttribute("data-side", "end");
    expect(sheet.className).toContain("data-[state=open]:animate-sheet-in");
    expect(sheet.className).toContain("end-0");
    await waitFor(() => expect(screen.getByRole("button", { name: "Task" })).toHaveFocus());
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("traps focus, closes on Escape and restores focus", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />);
    const trigger = screen.getByRole("button", { name: "Quick add" });
    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole("button", { name: "Task" })).toHaveFocus());
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Create" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Task" })).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("closes on an outside click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example side="bottom" />);
    await user.click(screen.getByRole("button", { name: "Quick add" }));
    await userEvent.setup({ pointerEventsCheck: 0 }).click(document.body);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("renders the bottom sheet with grab handle, safe-area padding and a hideable title", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example side="bottom" hideTitle />);
    await user.click(screen.getByRole("button", { name: "Quick add" }));
    const sheet = screen.getByRole("dialog", { name: "Quick add" });
    expect(sheet).toHaveAttribute("data-side", "bottom");
    expect(sheet.className).toContain("rounded-t-card");
    expect(sheet.className).toContain("pb-(--safe-bottom)");
    expect(sheet.className).toContain("data-[state=open]:animate-sheet-up");
    expect(sheet.querySelector("span[aria-hidden]")).toHaveClass("rounded-pill");
    expect(screen.getByText("Quick add", { selector: "h2" })).toHaveClass("sr-only");
  });

  it("carries dir=rtl so the end sheet slides from the left in Persian", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />, { preferences: { locale: "fa", direction: "rtl", digits: "fa" } });
    await user.click(screen.getByRole("button", { name: "Quick add" }));
    const sheet = screen.getByRole("dialog");
    expect(sheet).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("button", { name: "بستن" })).toBeInTheDocument();
  });

  it("keeps an LTR layout under a Persian language with LTR direction", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />, { preferences: { locale: "fa", direction: "ltr", digits: "fa" } });
    await user.click(screen.getByRole("button", { name: "Quick add" }));
    expect(screen.getByRole("dialog")).toHaveAttribute("dir", "ltr");
  });
});
