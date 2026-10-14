import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Popover } from "radix-ui";
import { describe, expect, it, vi } from "vitest";
import type { ContextId, Workspace } from "@/features/navigation/types";
import { renderWithProviders } from "@/test/render";
import { ContextSwitcherPanel } from "./context-switcher-panel";
import { ContextSwitcherTrigger } from "./context-switcher-trigger";

const workspaces: Record<ContextId, Workspace[]> = {
  personal: [{ id: "me", name: "Mehran" }],
  project: [
    { id: "web", name: "Website Redesign" },
    { id: "app", name: "Planner App" },
    { id: "mobile", name: "Mobile Launch" },
  ],
  team: [
    { id: "design", name: "Design Team" },
    { id: "eng", name: "Engineering" },
  ],
  company: [{ id: "euroly", name: "Euroly" }],
};

function renderPanel(onSelect = vi.fn(), options?: Parameters<typeof renderWithProviders>[1]) {
  renderWithProviders(
    <ContextSwitcherPanel activeContext="project" activeWorkspaceId="web" workspaces={workspaces} onSelect={onSelect} />,
    options,
  );
  return onSelect;
}

describe("ContextSwitcherTrigger", () => {
  it("shows the context and workspace and forwards button props", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithProviders(<ContextSwitcherTrigger context="project" workspaceName="Website Redesign" onClick={onClick} />);
    const trigger = screen.getByRole("button", { name: /Projects\s*Website Redesign/ });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("data-scope", "project");
    await user.click(trigger);
    expect(onClick).toHaveBeenCalled();
  });

  it("works as a Radix Popover trigger (asChild + aria-expanded)", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Popover.Root>
        <Popover.Trigger asChild>
          <ContextSwitcherTrigger context="personal" workspaceName="Mehran" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content asChild>
            <ContextSwitcherPanel activeContext="personal" activeWorkspaceId="me" workspaces={workspaces} onSelect={vi.fn()} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>,
    );
    const trigger = screen.getByRole("button", { name: /Personal\s*Mehran/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("is disabled when asked", () => {
    renderWithProviders(<ContextSwitcherTrigger context="team" workspaceName="Design Team" disabled />);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});

describe("ContextSwitcherPanel", () => {
  it("expands the active context by default and marks the active workspace", () => {
    renderPanel();
    const projects = screen.getByRole("button", { name: /^Projects/ });
    expect(projects).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /^Personal/ })).toHaveAttribute("aria-expanded", "false");
    const group = screen.getByRole("group", { name: "Projects workspaces" });
    expect(within(group).getByRole("button", { name: "Website Redesign" })).toHaveAttribute("aria-current", "true");
    expect(within(group).getByRole("button", { name: "Planner App" })).not.toHaveAttribute("aria-current");
    expect(projects).toHaveTextContent("Website Redesign · active");
    expect(screen.getByRole("button", { name: /^Teams/ })).toHaveTextContent("2 workspaces");
  });

  it("keeps a single context expanded at a time", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: /^Teams/ }));
    expect(screen.getByRole("button", { name: /^Teams/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /^Projects/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "Projects workspaces" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Teams/ }));
    expect(screen.getByRole("button", { name: /^Teams/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("selects a workspace with the keyboard (arrows + Enter/Space)", async () => {
    const user = userEvent.setup();
    const onSelect = renderPanel();
    screen.getByRole("button", { name: /^Personal/ }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: /^Projects/ })).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("button", { name: "Planner App" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenLastCalledWith("project", "app");

    // Expand Teams by keyboard, then pick with Space.
    await user.keyboard("{End}");
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("button", { name: /^Teams/ })).toHaveFocus();
    await user.keyboard(" ");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "Design Team" })).toHaveFocus();
    await user.keyboard(" ");
    expect(onSelect).toHaveBeenLastCalledWith("team", "design");

    await user.keyboard("{Home}");
    expect(screen.getByRole("button", { name: /^Personal/ })).toHaveFocus();
  });

  it("shows a disabled Coming soon add row, and a note for Personal", async () => {
    const user = userEvent.setup();
    const onSelect = renderPanel();
    const add = screen.getByRole("button", { name: "New project" });
    expect(add).toHaveAttribute("aria-disabled", "true");
    expect(add).toHaveAccessibleDescription("Coming soon");
    await user.click(add);
    expect(onSelect).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^Personal/ }));
    expect(screen.getByText("Personal space only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Personal space only" })).not.toBeInTheDocument();
  });

  it("renders Persian with localized digits", () => {
    renderPanel(vi.fn(), { preferences: { locale: "fa", direction: "rtl", digits: "fa" } });
    expect(screen.getByRole("group", { name: "تغییر حوزه" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^تیم‌ها/ })).toHaveTextContent("۲ فضای کاری");
    expect(screen.getByRole("button", { name: "پروژه‌ی جدید" })).toHaveAttribute("aria-disabled", "true");
  });
});
