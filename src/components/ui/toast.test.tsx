import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { MAX_VISIBLE_TOASTS, dismiss, resetToasts, toast } from "./toast";

// renderWithProviders mounts the app-wide <Toaster /> from Providers.

afterEach(() => {
  act(() => resetToasts());
  vi.useRealTimers();
});

describe("toast()", () => {
  it("renders a toast with title, description and a localised close button", async () => {
    renderWithProviders(<></>);
    act(() => {
      toast({ title: "Task completed", description: "Moved to Done", tone: "success" });
    });
    const region = screen.getByRole("region", { name: /Notifications \(F8\)/ });
    const item = await within(region).findByText("Task completed");
    expect(item).toBeInTheDocument();
    expect(within(region).getByText("Moved to Done")).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(item.closest("[data-tone]")).toHaveAttribute("data-tone", "success");
  });

  it("announces the toast through a live region", async () => {
    renderWithProviders(<></>);
    act(() => {
      toast({ title: "Synced with Google Calendar", tone: "info" });
    });
    await waitFor(() => {
      const announcers = screen
        .getAllByRole("status")
        .filter((node) => node.getAttribute("aria-live") === "polite" && node.textContent?.includes("Synced"));
      expect(announcers.length).toBeGreaterThan(0);
    });
  });

  it("announces danger toasts assertively and names the tone for screen readers", async () => {
    renderWithProviders(<></>);
    act(() => {
      toast({ title: "Couldn’t save expense", tone: "danger" });
    });
    await waitFor(() => {
      const assertive = screen
        .getAllByRole("status")
        .filter((node) => node.getAttribute("aria-live") === "assertive");
      expect(assertive.some((node) => node.textContent?.includes("Couldn’t save expense"))).toBe(true);
    });
    expect(screen.getAllByText("Error:", { exact: false })[0]).toHaveClass("sr-only");
  });

  it("runs the action and closes the toast", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    renderWithProviders(<></>);
    act(() => {
      toast({ title: "Task completed", action: { label: "Undo", altText: "Undo from the task menu", onClick: onUndo } });
    });
    const region = screen.getByRole("region");
    await user.click(await within(region).findByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledOnce();
    await waitFor(() => expect(within(region).queryByText("Task completed")).not.toBeInTheDocument());
  });

  it("dismisses by id and from the close button", async () => {
    const user = userEvent.setup();
    renderWithProviders(<></>);
    let id = "";
    act(() => {
      id = toast({ title: "First" });
      toast({ title: "Second" });
    });
    const region = screen.getByRole("region");
    expect(await within(region).findByText("First")).toBeInTheDocument();
    act(() => dismiss(id));
    await waitFor(() => expect(within(region).queryByText("First")).not.toBeInTheDocument());

    await user.click(within(region).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(within(region).queryByText("Second")).not.toBeInTheDocument());
  });

  it("auto-dismisses after the duration", async () => {
    vi.useFakeTimers();
    renderWithProviders(<></>);
    act(() => {
      toast({ title: "Saved", duration: 2000 });
    });
    const region = screen.getByRole("region");
    expect(within(region).getByText("Saved")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(within(region).getByText("Saved")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(within(region).queryByText("Saved")).not.toBeInTheDocument();
  });

  it("shows at most three at once and queues the rest", async () => {
    renderWithProviders(<></>);
    let first = "";
    act(() => {
      first = toast({ title: "One" });
      ["Two", "Three", "Four"].forEach((title) => toast({ title }));
    });
    const region = screen.getByRole("region");
    await within(region).findByText("Three");
    expect(within(region).getAllByRole("listitem")).toHaveLength(MAX_VISIBLE_TOASTS);
    expect(within(region).queryByText("Four")).not.toBeInTheDocument();

    act(() => dismiss(first));
    expect(await within(region).findByText("Four")).toBeInTheDocument();
    expect(within(region).queryByText("One")).not.toBeInTheDocument();
  });

  it("replaces a toast that reuses an id", async () => {
    renderWithProviders(<></>);
    act(() => {
      toast({ id: "sync", title: "Syncing…" });
      toast({ id: "sync", title: "Synced", tone: "success" });
    });
    const region = screen.getByRole("region");
    expect(await within(region).findByText("Synced")).toBeInTheDocument();
    expect(within(region).queryByText("Syncing…")).not.toBeInTheDocument();
  });

  it("localises the region and close label in Persian", async () => {
    renderWithProviders(<></>, { preferences: { locale: "fa", direction: "rtl", digits: "fa" } });
    act(() => {
      toast({ title: "ذخیره شد" });
    });
    const region = screen.getByRole("region", { name: /اعلان‌ها/ });
    expect(await within(region).findByRole("button", { name: "بستن" })).toBeInTheDocument();
  });
});
