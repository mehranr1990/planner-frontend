import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Button } from "./button";
import { Sheet, SheetContent, SheetTrigger, type SheetContentProps } from "./sheet";

function Example(props: Partial<Pick<SheetContentProps, "side" | "size" | "mobileSide" | "hideTitle">>) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button>Quick add</Button>
      </SheetTrigger>
      <SheetContent title="Quick add" footer={<Button>Create</Button>} {...props}>
        <button type="button">Task</button>
        <button type="button">Event</button>
      </SheetContent>
    </Sheet>
  );
}

async function open(ui: Parameters<typeof renderWithProviders>[0]) {
  const user = userEvent.setup();
  renderWithProviders(ui);
  await user.click(screen.getByRole("button", { name: "Quick add" }));
  return screen.getByRole("dialog", { name: "Quick add" });
}

describe("Sheet", () => {
  it("opens an end drawer with title, close button and focus inside", async () => {
    const sheet = await open(<Example />);
    expect(sheet).toHaveAttribute("data-side", "end");
    expect(sheet).toHaveAttribute("data-size", "drawer");
    await waitFor(() => expect(screen.getByRole("button", { name: "Task" })).toHaveFocus());
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("is a floating inset drawer from lg (420px, 32px radius) and a bottom sheet below", async () => {
    const sheet = await open(<Example />);
    expect(sheet).toHaveAttribute("data-mobile-side", "bottom");
    // Below lg: the bottom sheet geometry and keyframes.
    expect(sheet).toHaveClass("rounded-t-card", "pb-(--safe-bottom)", "data-[state=open]:animate-sheet-up");
    // From lg: inset 16px at the inline end, product radius, side keyframes.
    expect(sheet).toHaveClass(
      "lg:inset-y-4",
      "lg:end-4",
      "lg:start-auto",
      "lg:max-w-[420px]",
      "lg:rounded-card",
      "lg:data-[state=open]:animate-sheet-in",
      "lg:data-[state=closed]:animate-sheet-out",
    );
    // The handle only shows on the mobile sheet.
    expect(sheet.querySelector("span[aria-hidden]")).toHaveClass("lg:hidden");
  });

  it("widens to 520px for the task detail drawer", async () => {
    const sheet = await open(<Example size="detail" />);
    expect(sheet).toHaveAttribute("data-size", "detail");
    expect(sheet).toHaveClass("lg:max-w-[520px]");
    expect(sheet).not.toHaveClass("lg:max-w-[420px]");
  });

  it("can go full screen below lg (task detail on mobile)", async () => {
    const sheet = await open(<Example size="detail" mobileSide="fullscreen" />);
    expect(sheet).toHaveAttribute("data-mobile-side", "fullscreen");
    expect(sheet).toHaveClass("inset-0", "h-dvh", "pt-(--safe-top)", "data-[state=open]:animate-sheet-in");
    expect(sheet).not.toHaveClass("rounded-t-card");
    expect(sheet).toHaveClass("lg:h-auto", "lg:pt-0", "lg:rounded-card", "lg:max-w-[520px]");
    expect(sheet.querySelector("span[aria-hidden].rounded-pill")).toBeNull();
  });

  it("keeps the drawer geometry at every width with mobileSide='same'", async () => {
    const sheet = await open(<Example mobileSide="same" />);
    expect(sheet).toHaveAttribute("data-mobile-side", "end");
    expect(sheet).toHaveClass("inset-y-4", "end-4", "max-w-[420px]", "rounded-card", "data-[state=open]:animate-sheet-in");
    expect(sheet.className).not.toContain("lg:");
    expect(sheet.className).not.toContain("animate-sheet-up");
  });

  it("renders the centred sheet on desktop and a bottom sheet below lg", async () => {
    const sheet = await open(<Example side="center" />);
    expect(sheet).toHaveAttribute("data-side", "center");
    expect(sheet).not.toHaveAttribute("data-size");
    expect(sheet).toHaveClass("rounded-t-card", "data-[state=open]:animate-sheet-up");
    expect(sheet).toHaveClass(
      "lg:inset-6",
      "lg:m-auto",
      "lg:h-fit",
      "lg:max-w-[760px]",
      "lg:rounded-card",
      "lg:data-[state=open]:animate-pop-in",
      "lg:data-[state=closed]:animate-pop-out",
    );
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

  it("dims the page with the scrim and closes on an outside click", async () => {
    await open(<Example side="bottom" />);
    expect(document.querySelector(".bg-scrim[data-state]")).toBeInTheDocument();
    await userEvent.setup({ pointerEventsCheck: 0 }).click(document.body);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("renders the bottom sheet with grab handle, safe-area padding and a hideable title", async () => {
    const sheet = await open(<Example side="bottom" hideTitle />);
    expect(sheet).toHaveAttribute("data-side", "bottom");
    expect(sheet).toHaveClass("rounded-t-card", "pb-(--safe-bottom)", "data-[state=open]:animate-sheet-up");
    expect(sheet.className).not.toContain("lg:");
    const handle = sheet.querySelector("span[aria-hidden]");
    expect(handle).toHaveClass("rounded-pill");
    expect(handle).not.toHaveClass("lg:hidden");
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
