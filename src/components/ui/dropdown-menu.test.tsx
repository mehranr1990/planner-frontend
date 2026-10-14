import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";

function Example({ onRename = vi.fn(), onDelete = vi.fn() }: { onRename?: () => void; onDelete?: () => void }) {
  const [weekends, setWeekends] = useState(true);
  const [theme, setTheme] = useState("light");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>Actions</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Board</DropdownMenuLabel>
        <DropdownMenuItem icon={Pencil} shortcut="⌘R" onSelect={onRename}>
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem comingSoon>Export</DropdownMenuItem>
        <DropdownMenuCheckboxItem checked={weekends} onCheckedChange={setWeekends}>
          Show weekends
        </DropdownMenuCheckboxItem>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Personal</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={Trash2} tone="destructive" onSelect={onDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("DropdownMenu", () => {
  it("opens from the keyboard and moves with ArrowDown, reaching 'coming soon' items", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    renderWithProviders(<Example onRename={onRename} />);
    screen.getByRole("button", { name: "Actions" }).focus();
    await user.keyboard("{Enter}");

    const menu = await screen.findByRole("menu");
    expect(menu).toHaveClass("rounded-tile", "bg-elevated");
    const rename = screen.getByRole("menuitem", { name: /Rename/ });
    await waitFor(() => expect(rename).toHaveFocus());

    await user.keyboard("{ArrowDown}");
    // "Export" is coming soon: still reachable, announced as unavailable.
    expect(screen.getByRole("menuitem", { name: /Export/ })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemcheckbox", { name: "Show weekends" })).toHaveFocus();

    await user.keyboard("{ArrowUp}{ArrowUp}{Enter}");
    expect(onRename).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("keeps a menu of only 'coming soon' items explorable; selecting one does nothing", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithProviders(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>Create</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem comingSoon onSelect={onSelect}>
            Task
          </DropdownMenuItem>
          <DropdownMenuItem comingSoon onSelect={onSelect}>
            Note
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    screen.getByRole("button", { name: "Create" }).focus();
    await user.keyboard("{Enter}");
    const task = await screen.findByRole("menuitem", { name: /Task/ });
    await waitFor(() => expect(task).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    const note = screen.getByRole("menuitem", { name: /Note/ });
    expect(note).toHaveFocus();
    expect(note).toHaveAttribute("aria-disabled", "true");

    await user.keyboard("{Enter}");
    await user.click(task);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />);
    const trigger = screen.getByRole("button", { name: "Actions" });
    await user.click(trigger);
    await screen.findByRole("menu");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("marks disabled 'coming soon' items and keeps shortcuts LTR", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    const exportItem = await screen.findByRole("menuitem", { name: /Export/ });
    expect(exportItem).toHaveAttribute("aria-disabled", "true");
    expect(exportItem).toHaveTextContent("Coming soon");
    expect(screen.getByText("⌘R")).toHaveAttribute("dir", "ltr");
    expect(screen.getByRole("menuitem", { name: /Delete/ })).toHaveAttribute("data-tone", "destructive");
  });

  it("exposes aria-checked on checkbox and radio items and toggles them", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(await screen.findByRole("menuitemcheckbox", { name: "Show weekends" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute("aria-checked", "false");

    await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));
    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(await screen.findByRole("menuitemradio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("menuitemcheckbox", { name: "Show weekends" }));
    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(await screen.findByRole("menuitemcheckbox", { name: "Show weekends" })).toHaveAttribute("aria-checked", "false");
  });

  it("opens a sub menu with ArrowRight in LTR", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />);
    screen.getByRole("button", { name: "Actions" }).focus();
    await user.keyboard("{Enter}");
    const sub = await screen.findByRole("menuitem", { name: "Move to" });
    sub.focus();
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByRole("menuitem", { name: "Personal" })).toBeInTheDocument();
  });

  it("renders dir=rtl content and opens sub menus with ArrowLeft in RTL", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />, { preferences: { locale: "fa", direction: "rtl", digits: "fa" } });
    screen.getByRole("button", { name: "Actions" }).focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    expect(menu).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("menuitem", { name: /Export/ })).toHaveTextContent("به‌زودی");

    const sub = screen.getByRole("menuitem", { name: "Move to" });
    sub.focus();
    await user.keyboard("{ArrowLeft}");
    expect(await screen.findByRole("menuitem", { name: "Personal" })).toBeInTheDocument();
    // The sub-menu chevron is mirrored for RTL.
    expect(sub.querySelector("svg")).toHaveClass("rtl:-scale-x-100");
  });
});
