import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Button } from "./button";
import { FloatingPanel, FloatingPanelClose, FloatingPanelContent, FloatingPanelTrigger } from "./floating-panel";

const originalMatchMedia = window.matchMedia;

/** The jsdom stub never matches; flip it to emulate a desktop (lg+) viewport. */
function emulateViewport(desktop: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: desktop && query.includes("min-width: 64rem"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function Example({ closeOnInteractOutside, onPageAction }: { closeOnInteractOutside?: boolean; onPageAction?: () => void }) {
  return (
    <>
      <main>
        <button type="button" onClick={onPageAction}>
          Page action
        </button>
      </main>
      <FloatingPanel>
        <FloatingPanelTrigger asChild>
          <Button>Quick note</Button>
        </FloatingPanelTrigger>
        <FloatingPanelContent
          title="Quick note"
          closeOnInteractOutside={closeOnInteractOutside}
          footer={
            <FloatingPanelClose asChild>
              <Button>Save</Button>
            </FloatingPanelClose>
          }
        >
          <textarea aria-label="Note" />
        </FloatingPanelContent>
      </FloatingPanel>
    </>
  );
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("FloatingPanel · desktop (non-modal)", () => {
  beforeEach(() => emulateViewport(true));

  it("is a non-modal dialog: no aria-modal, no scrim, page stays exposed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />);
    await user.click(screen.getByRole("button", { name: "Quick note" }));

    const panel = screen.getByRole("dialog", { name: "Quick note" });
    expect(panel).not.toHaveAttribute("aria-modal", "true");
    expect(document.querySelector(".bg-scrim")).toBeNull();
    expect(document.querySelector("main")).not.toHaveAttribute("aria-hidden");
    expect(screen.getByRole("button", { name: "Page action" })).toBeInTheDocument();
    expect(document.body).not.toHaveAttribute("data-scroll-locked");
  });

  it("moves focus in, closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />);
    const trigger = screen.getByRole("button", { name: "Quick note" });
    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Note" })).toHaveFocus());

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("stays open, keeping the draft, while the page is used", async () => {
    const user = userEvent.setup();
    const onPageAction = vi.fn();
    renderWithProviders(<Example onPageAction={onPageAction} />);
    await user.click(screen.getByRole("button", { name: "Quick note" }));
    const note = screen.getByRole("textbox", { name: "Note" });
    await user.type(note, "Call the bank");

    await user.click(screen.getByRole("button", { name: "Page action" }));
    expect(onPageAction).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog", { name: "Quick note" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Call the bank");
  });

  it("can opt in to closing on an outside click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example closeOnInteractOutside />);
    await user.click(screen.getByRole("button", { name: "Quick note" }));
    await user.click(screen.getByRole("button", { name: "Page action" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("sits at the bottom inline-end corner as a 380px product surface", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />);
    await user.click(screen.getByRole("button", { name: "Quick note" }));
    const panel = screen.getByRole("dialog");
    expect(panel).toHaveClass("bg-elevated", "shadow-elevated", "lg:rounded-card", "lg:end-6", "lg:w-[380px]");
    expect(panel.className).toContain("lg:bottom-[calc(1.5rem+var(--safe-bottom))]");
    expect(panel).toHaveClass("lg:data-[state=open]:animate-pop-in");
    // Below lg the same element is the bottom sheet.
    expect(panel).toHaveClass("rounded-t-card", "data-[state=open]:animate-sheet-up");
  });

  it("carries dir=rtl in Persian", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />, { preferences: { locale: "fa", direction: "rtl", digits: "fa" } });
    await user.click(screen.getByRole("button", { name: "Quick note" }));
    expect(screen.getByRole("dialog")).toHaveAttribute("dir", "rtl");
  });
});

describe("FloatingPanel · below lg (modal bottom sheet)", () => {
  beforeEach(() => emulateViewport(false));

  it("adds the scrim, hides the page from assistive tech and closes from the scrim", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />);
    await user.click(screen.getByRole("button", { name: "Quick note" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(document.querySelector(".bg-scrim")).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector("main")?.closest("[aria-hidden=true]")).not.toBeNull());

    await userEvent.setup({ pointerEventsCheck: 0 }).click(document.body);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
