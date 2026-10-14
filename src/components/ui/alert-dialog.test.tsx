import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { useState } from "react";
import { Button } from "./button";
import { ConfirmDialog } from "./alert-dialog";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const trigger = <Button>Delete board</Button>;

describe("ConfirmDialog", () => {
  it("renders an alertdialog with title, description and default destructive labels", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ConfirmDialog
        trigger={trigger}
        tone="destructive"
        title="Delete “Checkout flow”?"
        description="6 subtasks and 7 comments go with it."
        onConfirm={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Delete board" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete “Checkout flow”?" });
    expect(dialog).toHaveAccessibleDescription("6 subtasks and 7 comments go with it.");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    // Radix AlertDialog focuses Cancel first: the safe choice.
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
  });

  it("does not dismiss on an outside click, but Escape closes and restores focus", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfirmDialog trigger={trigger} title="Discard draft?" onConfirm={vi.fn()} />);
    const opener = screen.getByRole("button", { name: "Delete board" });
    await user.click(opener);
    await userEvent.setup({ pointerEventsCheck: 0 }).click(document.body);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it("traps focus between Cancel and Confirm", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfirmDialog trigger={trigger} title="Archive?" onConfirm={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Delete board" }));
    const cancel = screen.getByRole("button", { name: "Cancel" });
    await waitFor(() => expect(cancel).toHaveFocus());
    await user.tab();
    expect(screen.getByRole("button", { name: "Confirm" })).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
  });

  it("closes immediately after a synchronous confirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    renderWithProviders(
      <ConfirmDialog trigger={trigger} title="Archive?" confirmLabel="Archive" onConfirm={onConfirm} onOpenChange={onOpenChange} />,
    );
    await user.click(screen.getByRole("button", { name: "Delete board" }));
    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("stays open and busy while an async confirm runs, then closes", async () => {
    const user = userEvent.setup();
    const work = deferred();
    const onConfirm = vi.fn(() => work.promise);
    renderWithProviders(<ConfirmDialog trigger={trigger} tone="destructive" title="Delete?" onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Delete board" }));
    const confirm = screen.getByRole("button", { name: "Delete" });
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalled();
    expect(confirm).toHaveAttribute("aria-busy", "true");
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute("aria-disabled", "true");

    // Escape is ignored while the work is pending.
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await act(async () => {
      work.resolve();
      await work.promise;
    });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("stays open and re-enables when the async confirm rejects", async () => {
    const user = userEvent.setup();
    const work = deferred();
    renderWithProviders(<ConfirmDialog trigger={trigger} title="Delete?" onConfirm={() => work.promise} />);
    await user.click(screen.getByRole("button", { name: "Delete board" }));
    const confirm = screen.getByRole("button", { name: "Confirm" });
    await user.click(confirm);
    await act(async () => {
      work.reject(new Error("offline"));
      await work.promise.catch(() => undefined);
    });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(confirm).not.toHaveAttribute("aria-busy");
  });

  it("shows a rejection inside the dialog through the error prop, above the buttons", async () => {
    const user = userEvent.setup();
    function Example() {
      const [error, setError] = useState<string | null>(null);
      return (
        <ConfirmDialog
          trigger={trigger}
          title="Delete?"
          error={error}
          onConfirm={async () => {
            setError(null);
            try {
              await Promise.reject(new Error("offline"));
            } catch (cause) {
              setError("Couldn’t delete. Check your connection.");
              throw cause;
            }
          }}
        />
      );
    }
    renderWithProviders(<Example />);
    await user.click(screen.getByRole("button", { name: "Delete board" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Couldn’t delete. Check your connection.");
    // Rendered before the footer buttons, so it is read before them.
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    expect(alert.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("works controlled and renders Persian defaults in RTL", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ConfirmDialog open onOpenChange={onOpenChange} title="حذف شود؟" onConfirm={vi.fn()} />,
      { preferences: { locale: "fa", direction: "rtl", digits: "fa" } },
    );
    const dialog = screen.getByRole("alertdialog", { name: "حذف شود؟" });
    expect(dialog).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("button", { name: "تأیید" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "انصراف" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
