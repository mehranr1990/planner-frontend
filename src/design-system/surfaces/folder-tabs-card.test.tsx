import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { FolderTabsCard, type FolderTab } from "./folder-tabs-card";

const tabs: FolderTab[] = [
  { value: "overview", label: "Overview", count: "72%", content: <p>Overview panel</p> },
  { value: "tasks", label: "Tasks", count: 18, content: <p>Tasks panel</p> },
  { value: "files", label: "Files", count: 2, content: <p>Files panel</p>, disabled: true },
  { value: "activity", label: "Activity", count: 1250, content: <p>Activity panel</p> },
];

describe("FolderTabsCard", () => {
  it("merges the active tab into the card and outlines the others", () => {
    renderWithProviders(<FolderTabsCard label="Project" tabs={tabs} />);
    expect(screen.getByRole("tablist", { name: "Project" })).toBeInTheDocument();
    const overview = screen.getByRole("tab", { name: /Overview/ });
    const tasks = screen.getByRole("tab", { name: /Tasks/ });
    expect(overview).toHaveAttribute("aria-selected", "true");
    expect(overview.className).toContain("bg-(--folder-bg)");
    // First tab: no start fillet, and the panel's top-start corner is square.
    expect(overview.className).toContain("before:hidden");
    expect(screen.getByRole("tabpanel").parentElement!.className).toContain("rounded-ss-none");
    expect(tasks.className).toContain("border-outline");
    expect(tasks.className).toContain("rounded-pill");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Overview panel");
  });

  it("draws both fillets on a later active tab and restores the panel corner", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FolderTabsCard label="Project" tabs={tabs} />);
    await user.click(screen.getByRole("tab", { name: /Tasks/ }));
    const tasks = screen.getByRole("tab", { name: /Tasks/ });
    expect(tasks).toHaveAttribute("aria-selected", "true");
    expect(tasks.className).not.toContain("before:hidden");
    expect(tasks.className).toContain("before:end-full");
    expect(tasks.className).toContain("after:start-full");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Tasks panel");
    expect(screen.getByRole("tabpanel").parentElement!.className).not.toContain("rounded-ss-none");
  });

  it("supports controlled use and keyboard navigation per Radix", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderWithProviders(<FolderTabsCard label="Project" tabs={tabs} value="tasks" onValueChange={onValueChange} />);
    await user.click(screen.getByRole("tab", { name: /Tasks/ }));
    await user.keyboard("{ArrowRight}");
    // Disabled "Files" is skipped.
    expect(screen.getByRole("tab", { name: /Activity/ })).toHaveFocus();
    expect(onValueChange).toHaveBeenCalledWith("activity");
    // Controlled: stays on the value the parent passes.
    expect(screen.getByRole("tab", { name: /Tasks/ })).toHaveAttribute("aria-selected", "true");
  });

  it("formats counts with Persian digits and mirrors keys in RTL", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FolderTabsCard label="پروژه" tabs={tabs} />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa" },
    });
    expect(screen.getByRole("tab", { name: /Tasks/ })).toHaveTextContent("۱۸");
    expect(screen.getByRole("tab", { name: /Overview/ })).toHaveTextContent("۷۲%");
    expect(screen.getByRole("tab", { name: /Activity/ })).toHaveTextContent("۱٬۲۵۰");
    // RTL fillet gradients are swapped through the rtl: variant.
    expect(screen.getByRole("tab", { name: /Overview/ }).className).toContain("rtl:after:bg-");
    await user.click(screen.getByRole("tab", { name: /Overview/ }));
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: /Tasks/ })).toHaveFocus();
  });
});
