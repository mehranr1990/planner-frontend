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

const panelOf = () => screen.getByRole("tabpanel").parentElement!;
const fillets = (tab: HTMLElement) =>
  Array.from(tab.querySelectorAll<HTMLElement>("[data-fillet]")).map((el) => el.dataset.fillet);

describe("FolderTabsCard", () => {
  it("merges the active tab into the panel and outlines the others (P00 D)", () => {
    renderWithProviders(<FolderTabsCard label="Project" tabs={tabs} />);
    expect(screen.getAllByRole("tablist")).toHaveLength(1);
    expect(screen.getByRole("tablist", { name: "Project" })).toHaveClass("lg:gap-2.5", "lg:items-end", "lg:-mb-px");
    const overview = screen.getByRole("tab", { name: /Overview/ });
    const tasks = screen.getByRole("tab", { name: /Tasks/ });
    expect(overview).toHaveAttribute("aria-selected", "true");
    // Active: 56px, 24px top radius, panel background, no outline.
    expect(overview).toHaveClass("lg:h-14", "lg:rounded-t-folder-tab", "lg:rounded-b-none", "lg:bg-(--folder-bg)", "lg:px-6.5", "inset-ring-0");
    // Inactive: 44px capsule, 1.5px outline, 14px/600 secondary text, 8px off the panel.
    expect(tasks).toHaveClass("lg:h-11", "lg:px-4.5", "lg:mb-2", "lg:inset-ring-[1.5px]", "inset-ring-outline", "lg:font-semibold", "text-fg-secondary");
    expect(tasks).not.toHaveClass("lg:bg-(--folder-bg)");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Overview panel");
  });

  it("drops the start fillet on the first tab and squares the panel's top-start corner", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FolderTabsCard label="Project" tabs={tabs} />);
    const overview = screen.getByRole("tab", { name: /Overview/ });
    expect(fillets(overview)).toEqual(["end"]);
    expect(panelOf()).toHaveClass("rounded-card", "py-card", "px-card", "lg:rounded-ss-none");

    await user.click(screen.getByRole("tab", { name: /Tasks/ }));
    const tasks = screen.getByRole("tab", { name: /Tasks/ });
    expect(fillets(tasks)).toEqual(["start", "end"]);
    expect(fillets(overview)).toEqual([]);
    expect(tasks.querySelector('[data-fillet="start"]')).toHaveClass("end-full", "bottom-0", "size-(--folder-fillet)", "hidden", "lg:block");
    expect(tasks.querySelector('[data-fillet="end"]')).toHaveClass("start-full");
    expect(tasks.querySelector("[data-fillet]")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Tasks panel");
    expect(panelOf()).not.toHaveClass("lg:rounded-ss-none");
  });

  it("collapses to compact pills below lg in the same tablist", () => {
    renderWithProviders(<FolderTabsCard label="Project" tabs={tabs} />);
    const list = screen.getByRole("tablist");
    expect(list).toHaveClass("flex-wrap", "gap-1.5", "mb-3");
    const overview = screen.getByRole("tab", { name: /Overview/ });
    const tasks = screen.getByRole("tab", { name: /Tasks/ });
    // Mobile-first pill classes, overridden from lg up.
    expect(overview).toHaveClass("h-8.5", "rounded-pill", "text-xs", "bg-scope-soft", "text-scope-deep");
    expect(tasks).toHaveClass("h-8.5", "rounded-pill", "inset-ring", "inset-ring-outline");
    // Hit area ≥ 48px: 34 + 2 × 7 below lg, 44 + 2 × 2 from lg.
    expect(tasks).toHaveClass("after:-inset-y-1.75", "lg:after:-inset-y-0.5");
    // Fully rounded panel below lg: the square corner is lg-only.
    expect(panelOf()).toHaveClass("rounded-card");
    expect(panelOf().className).not.toMatch(/(^|\s)rounded-ss-none/);
  });

  it("shows muted counts in the preferred digits, never coloured badges", () => {
    renderWithProviders(<FolderTabsCard label="پروژه" tabs={tabs} />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa" },
    });
    expect(screen.getByRole("tab", { name: /Tasks/ })).toHaveTextContent("۱۸");
    expect(screen.getByRole("tab", { name: /Overview/ })).toHaveTextContent("۷۲%");
    expect(screen.getByRole("tab", { name: /Activity/ })).toHaveTextContent("۱٬۲۵۰");
    expect(screen.getByText("۱۸")).toHaveClass("text-fg-muted", "font-bold", "lg:text-xs");
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
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: /Overview/ })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: /Activity/ })).toHaveFocus();
  });

  it("mirrors fillets and arrow keys in RTL", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FolderTabsCard label="پروژه" tabs={tabs} defaultValue="tasks" />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa" },
    });
    const tasks = screen.getByRole("tab", { name: /Tasks/ });
    // Logical placement plus mirrored gradients.
    expect(tasks.querySelector('[data-fillet="start"]')!.className).toContain("rtl:bg-[radial-gradient(circle_at_100%_0");
    expect(tasks.querySelector('[data-fillet="end"]')!.className).toContain("rtl:bg-[radial-gradient(circle_at_0_0");
    await user.click(screen.getByRole("tab", { name: /Overview/ }));
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: /Tasks/ })).toHaveFocus();
  });

  it("uses the subtle surface and keeps the deprecated tone alias", () => {
    const { container, rerender } = renderWithProviders(<FolderTabsCard label="P" tabs={tabs} surface="subtle" />);
    const root = () => container.querySelector('[data-variant="top"]')!;
    expect(root()).toHaveClass("[--folder-bg:var(--surface-subtle)]");
    rerender(<FolderTabsCard label="P" tabs={tabs} tone="raised" />);
    expect(root()).toHaveClass("[--folder-bg:var(--surface-raised)]");
    rerender(<FolderTabsCard label="P" tabs={tabs} />);
    expect(root()).toHaveClass("[--folder-bg:var(--surface)]");
  });

  describe("bottom-even", () => {
    const two: FolderTab[] = [
      { value: "history", label: "History", content: <p>History panel</p> },
      { value: "details", label: "Details", content: <p>Details panel</p> },
    ];

    it("hangs equal-width uppercase tabs below the panel, fillets on top", async () => {
      const user = userEvent.setup();
      renderWithProviders(<FolderTabsCard variant="bottom-even" label="View" tabs={two} header={<h2>Read 30 pages</h2>} />);
      const list = screen.getByRole("tablist", { name: "View" });
      expect(list).toHaveClass("order-last", "grid", "grid-flow-col", "auto-cols-fr");
      const history = screen.getByRole("tab", { name: "History" });
      expect(history).toHaveClass("h-14", "text-xs", "font-bold", "uppercase", "tracking-[0.12em]", "rounded-b-folder-tab", "bg-(--folder-bg)");
      expect(screen.getByRole("tab", { name: "Details" })).toHaveClass("text-fg-secondary");
      // First tab: only the inner (end) fillet; the panel's bottom-start corner is square.
      expect(fillets(history)).toEqual(["end"]);
      expect(history.querySelector("[data-fillet]")).toHaveClass("top-0", "start-full");
      expect(history.querySelector("[data-fillet]")!.className).toContain("circle_at_100%_100%");
      // Only the rounded bottom corner is emitted: no rounded-b-* shorthand can override the square one.
      expect(panelOf()).toHaveClass("rounded-ee-card");
      expect(panelOf().className).not.toMatch(/rounded-b-card|rounded-es-card/);

      await user.click(screen.getByRole("tab", { name: "Details" }));
      const details = screen.getByRole("tab", { name: "Details" });
      // Last tab: only the inner (start) fillet; the bottom-end corner is square.
      expect(fillets(details)).toEqual(["start"]);
      expect(panelOf()).toHaveClass("rounded-es-card");
      expect(panelOf().className).not.toMatch(/rounded-b-card|rounded-ee-card/);
      expect(screen.getByRole("tabpanel")).toHaveTextContent("Details panel");
    });

    it("keeps the header before the tab row and the panel after it in DOM order", () => {
      renderWithProviders(<FolderTabsCard variant="bottom-even" label="View" tabs={two} header={<h2>Read 30 pages</h2>} />);
      const heading = screen.getByRole("heading", { name: "Read 30 pages" });
      const tablist = screen.getByRole("tablist");
      expect(heading.closest('[data-slot="folder-tabs-header"]')).toHaveClass("rounded-t-card", "bg-(--folder-bg)");
      expect(heading.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(tablist.compareDocumentPosition(screen.getByRole("tabpanel")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("keeps both fillets on a middle tab and no pill collapse", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <FolderTabsCard
          variant="bottom-even"
          label="View"
          tabs={[...two, { value: "notes", label: "Notes", content: <p>Notes panel</p> }]}
        />,
      );
      await user.click(screen.getByRole("tab", { name: "Details" }));
      const details = screen.getByRole("tab", { name: "Details" });
      expect(fillets(details)).toEqual(["start", "end"]);
      expect(details).not.toHaveClass("h-8.5");
      expect(panelOf()).toHaveClass("rounded-card");
      expect(panelOf()).not.toHaveClass("rounded-es-none");
      expect(panelOf()).not.toHaveClass("rounded-ee-none");
    });
  });
});
