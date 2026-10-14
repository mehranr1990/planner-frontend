import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { SearchField } from "./search-field";

describe("SearchField", () => {
  it("renders a search box with a non-mirrored icon and an LTR shortcut hint", () => {
    renderWithProviders(
      <SearchField aria-label="Filter tasks" shortcut="⌘K" aria-keyshortcuts="Meta+K" />,
      { preferences: { locale: "fa", direction: "rtl", digits: "fa" } },
    );
    const input = screen.getByRole("searchbox", { name: "Filter tasks" });
    expect(input).toHaveAttribute("aria-keyshortcuts", "Meta+K");
    const box = input.parentElement!;
    expect(box.querySelector("svg")).not.toHaveClass("rtl:-scale-x-100");
    const kbd = box.querySelector("kbd")!;
    expect(kbd).toHaveTextContent("⌘K");
    expect(kbd).toHaveAttribute("dir", "ltr");
  });

  it("shows a clear button once there is text and clears uncontrolled input", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderWithProviders(<SearchField aria-label="Search" shortcut="⌘K" onValueChange={onValueChange} />);
    const input = screen.getByRole("searchbox");
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    await user.type(input, "tax");
    expect(document.querySelector("kbd")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(onValueChange).toHaveBeenLastCalledWith("");
  });

  it("clears a controlled value on Escape", async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [query, setQuery] = useState("budget");
      return <SearchField aria-label="Search" value={query} onValueChange={setQuery} />;
    }
    renderWithProviders(<Controlled />);
    const input = screen.getByRole("searchbox");
    expect(input).toHaveValue("budget");
    input.focus();
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");
  });

  it("lets Escape through when already empty", async () => {
    const user = userEvent.setup();
    const onKeyDownParent = vi.fn();
    renderWithProviders(
      <div onKeyDown={(event) => onKeyDownParent(event.key)}>
        <SearchField aria-label="Search" />
      </div>,
    );
    screen.getByRole("searchbox").focus();
    await user.keyboard("{Escape}");
    expect(onKeyDownParent).toHaveBeenCalledWith("Escape");
  });

  it("forwards ref, name and onChange for react-hook-form register()", async () => {
    const ref = createRef<HTMLInputElement>();
    const onChange = vi.fn();
    renderWithProviders(<SearchField aria-label="Search" name="q" ref={ref} onChange={onChange} />);
    expect(ref.current).toBe(screen.getByRole("searchbox"));
    expect(ref.current).toHaveAttribute("name", "q");
    await userEvent.type(ref.current!, "a");
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.lastCall![0].target.value).toBe("");
  });

  it("uses the Persian clear label", async () => {
    renderWithProviders(<SearchField aria-label="جستجو" defaultValue="مالیات" />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa" },
    });
    expect(screen.getByRole("button", { name: "پاک کردن" })).toBeInTheDocument();
  });

  it("gives the 36px clear button a 48px hit area without changing its size", () => {
    renderWithProviders(<SearchField aria-label="Search" defaultValue="x" />);
    const clear = screen.getByRole("button", { name: "Clear" });
    // jsdom has no layout: assert the pseudo-element expansion contract
    // (36px + 2 × 6px = 48px), shared with RemovableChip.
    expect(clear).toHaveClass("size-9", "relative", "before:absolute", "before:-inset-1.5");
  });

  it("hides the clear button when disabled", () => {
    renderWithProviders(<SearchField aria-label="Search" defaultValue="x" disabled />);
    expect(screen.getByRole("searchbox")).toBeDisabled();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
