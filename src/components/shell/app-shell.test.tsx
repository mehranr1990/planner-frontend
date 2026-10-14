import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { AppShell } from "./app-shell";
import { AssistantFab } from "./assistant-fab";
import { PageHeader } from "./page-header";
import { ShellIsland } from "./shell-island";
import { TopBar } from "./top-bar";

function Shell() {
  return (
    <AppShell
      topBar={
        <TopBar
          contextSwitcher={<ShellIsland>Switcher</ShellIsland>}
          schedule={<ShellIsland>Schedule</ShellIsland>}
          actions={
            <ShellIsland>
              <button type="button">Search</button>
            </ShellIsland>
          }
        />
      }
      rail={<nav aria-label="Personal navigation">Rail</nav>}
      mobileHeader={<p>Mobile header</p>}
      mobileNav={<nav aria-label="Mobile navigation">Bottom nav</nav>}
      floating={<AssistantFab />}
    >
      <PageHeader title="My Day" subtitle="Tuesday, 13 October" actions={<button type="button">Plan day</button>} />
    </AppShell>
  );
}

describe("AppShell", () => {
  it("renders landmarks and every slot", () => {
    const { container } = renderWithProviders(<Shell />);
    expect(screen.getAllByRole("banner")).toHaveLength(2);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(main).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("navigation", { name: "Personal navigation" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeInTheDocument();
    expect(screen.getByText("Mobile header")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "My Day" })).toBeInTheDocument();
    // Responsive split: desktop chrome from lg, mobile chrome below it.
    expect(container.querySelector('[data-slot="top-bar"]')!.className).toContain("lg:block");
    expect(container.querySelector('[data-slot="mobile-header"]')!.className).toContain("lg:hidden");
    const mobileNav = container.querySelector('[data-slot="mobile-nav"]')!;
    expect(mobileNav.className).toContain("lg:hidden");
    expect(mobileNav.className).toContain("pb-[max(var(--safe-bottom),1rem)]");
    // Rail lives in its own sticky grid column, never over the content.
    const rail = container.querySelector('[data-slot="rail"]')!;
    expect(rail.parentElement!.className).toContain("lg:grid-cols-[auto_minmax(0,1fr)]");
    expect(rail.firstElementChild!.className).toContain("sticky");
    expect(main.className).toContain("pb-[calc(7rem+var(--safe-bottom))]");
  });

  it("puts the skip link first and targets main", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Shell />);
    await user.tab();
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute("href", "#main-content");
    expect(document.getElementById("main-content")).toBe(screen.getByRole("main"));
  });

  it("works without optional slots", () => {
    const { container } = renderWithProviders(<AppShell>Content</AppShell>);
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Content");
    expect(container.querySelector('[data-slot="rail"]')).toBeNull();
    expect(screen.getByRole("main").className).toContain("pb-[calc(2rem+var(--safe-bottom))]");
  });

  it("translates the shell in Persian and keeps logical layout", () => {
    const { container } = renderWithProviders(<Shell />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa" },
    });
    expect(screen.getByRole("link", { name: "رفتن به محتوا" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "صفحه‌ی اصلی برنامه‌ریز" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "دستیار" }).className).toContain("end-6");
    // No physical left/right utilities anywhere in the frame.
    expect(container.innerHTML).not.toMatch(/\b(?:ml|mr|pl|pr|left|right)-\d/);
  });
});

describe("TopBar", () => {
  it("renders the home link and the island slots in order", () => {
    renderWithProviders(
      <TopBar
        homeHref="/today"
        contextSwitcher={<ShellIsland data-testid="switcher" />}
        schedule={<ShellIsland data-testid="schedule" />}
        actions={<ShellIsland data-testid="actions" />}
      />,
    );
    const home = screen.getByRole("link", { name: "Planner home" });
    expect(home).toHaveAttribute("href", "/today");
    expect(home.className).toContain("size-14");
    const [switcher, schedule, actions] = ["switcher", "schedule", "actions"].map((id) => screen.getByTestId(id));
    expect(switcher!.compareDocumentPosition(schedule!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(schedule!.compareDocumentPosition(actions!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(schedule!.parentElement!.className).toContain("flex-1");
    expect(actions!.className).toContain("h-14");
    expect(actions!.className).toContain("shadow-island");
  });
});

describe("PageHeader", () => {
  it("renders breadcrumb, title, subtitle and actions", () => {
    renderWithProviders(
      <PageHeader
        breadcrumb={<nav aria-label="Breadcrumb">Personal › Mehran</nav>}
        title="Good morning, Mehran"
        subtitle="Tuesday, 13 October 2026"
        actions={<button type="button">Plan my day</button>}
      />,
    );
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    const heading = screen.getByRole("heading", { level: 1, name: "Good morning, Mehran" });
    expect(heading.className).toContain("type-h1");
    expect(screen.getByText("Tuesday, 13 October 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan my day" })).toBeInTheDocument();
  });

  it("supports the display size and a subtitle above the title", () => {
    renderWithProviders(<PageHeader title="My Day" subtitle="Tuesday" size="display" subtitlePlacement="above" />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.className).toContain("type-display");
    expect(screen.getByText("Tuesday").compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("AssistantFab", () => {
  it("is a labelled button fixed at bottom inline-end, desktop only", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithProviders(<AssistantFab onClick={onClick} />);
    const fab = screen.getByRole("button", { name: "Assistant" });
    expect(fab).toHaveAttribute("type", "button");
    expect(fab.className).toContain("fixed");
    expect(fab.className).toContain("end-6");
    expect(fab.className).toContain("bottom-[calc(1.5rem+var(--safe-bottom))]");
    expect(fab.className).toContain("z-(--z-shell)");
    expect(fab.className).toContain("hidden lg:inline-flex");
    await user.click(fab);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders a link child with asChild and supports disabled", () => {
    const { rerender } = renderWithProviders(
      <AssistantFab asChild>
        <a href="/assistant">Ask the assistant</a>
      </AssistantFab>,
    );
    const link = screen.getByRole("link", { name: "Ask the assistant" });
    expect(link).toHaveAttribute("href", "/assistant");
    expect(link.querySelector("svg")).not.toBeNull();
    expect(link).not.toHaveAttribute("type");
    rerender(<AssistantFab disabled />);
    expect(screen.getByRole("button", { name: "Assistant" })).toBeDisabled();
  });
});
