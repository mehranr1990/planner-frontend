import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { NavigationView } from "./navigation-view";

const SECTIONS = [
  "Live application shell",
  "Top bar",
  "Context switcher",
  "Floating rail",
  "Mobile navigation",
  "Breadcrumbs & page header",
  "Context page list",
  "Schedule island",
];

// A full page of previews: role queries over it are slow on a loaded machine.
describe("NavigationView", { timeout: 30_000 }, () => {
  it("renders one page title and every navigation section", () => {
    renderWithProviders(<NavigationView />);
    // The PageHeader preview's <h1> is re-levelled, so the page keeps one title.
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Navigation & shell" })).toBeInTheDocument();
    for (const name of SECTIONS) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
  });

  it("marks the current page and links to the live shell", () => {
    renderWithProviders(<NavigationView />);
    const nav = screen.getByRole("navigation", { name: "Styleguide pages" });
    expect(within(nav).getByRole("link", { name: "Navigation" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Components" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Open the live application shell" })).toHaveAttribute("href", "/personal");
  });

  it("previews the real top bar islands", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NavigationView />);
    const topBar = screen.getByRole("region", { name: "Top bar" });
    // Outside a context the shell resolves to Personal, as in the app.
    expect(within(topBar).getByRole("button", { name: /^Personals*Mehrans*Switch context$/ })).toBeInTheDocument();
    const actions = within(topBar).getByRole("group", { name: "Quick actions" });
    expect(within(actions).getByRole("button", { name: "Notifications" })).toBeInTheDocument();

    await user.click(within(actions).getByRole("button", { name: "Quick create" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Task/ })).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{Escape}");

    await user.click(within(actions).getByRole("button", { name: "Search and commands" }));
    expect(await screen.findByRole("dialog", { name: "Search and commands" })).toBeInTheDocument();
  });

  it("registers the command palette shortcut once", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NavigationView />);
    await user.keyboard("{Control>}k{/Control}");
    expect(await screen.findAllByRole("dialog", { name: "Search and commands" })).toHaveLength(1);
  });

  it("previews the rail collapsed and expanded", () => {
    renderWithProviders(<NavigationView />);
    const rails = screen.getAllByRole("navigation", { name: /^Personal navigation · / });
    expect(rails).toHaveLength(2);
    expect(within(rails[0]!).getByRole("button", { name: "Expand navigation" })).toHaveAttribute("aria-expanded", "false");
    expect(within(rails[1]!).getByRole("button", { name: "Collapse navigation" })).toHaveAttribute("aria-expanded", "true");
  });

  it("switches the preview context for every preview", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<NavigationView />);
    await user.click(screen.getByRole("radio", { name: "Projects" }));

    expect(container.querySelector("[data-scope]")).toHaveAttribute("data-scope", "project");
    expect(screen.getAllByRole("navigation", { name: /^Projects navigation · / })).toHaveLength(2);
    expect(screen.queryByRole("navigation", { name: /^Personal navigation · / })).not.toBeInTheDocument();
    const switcher = screen.getByRole("region", { name: "Context switcher" });
    expect(within(switcher).getByRole("button", { name: /^Projects\s*Website Redesign\s*Switch context$/ })).toBeInTheDocument();
  });

  it("selects a workspace from the switcher panel", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NavigationView />);
    const switcher = screen.getByRole("region", { name: "Context switcher" });
    await user.click(within(switcher).getByRole("button", { name: /^Teams/ }));
    await user.click(within(switcher).getByRole("button", { name: "Engineering" }));

    expect(screen.getByRole("radio", { name: "Teams" })).toHaveAttribute("aria-checked", "true");
    expect(within(switcher).getByRole("button", { name: /^Teams\s*Engineering\s*Switch context$/ })).toHaveAttribute("aria-expanded", "true");
    expect(within(switcher).getByRole("button", { name: "Engineering" })).toHaveAttribute("aria-current", "true");
  });

  it("contains the mobile bar in its phone frame and opens More as a sheet", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NavigationView />);
    const mobile = screen.getByRole("region", { name: "Mobile navigation" });
    const bar = within(mobile).getByRole("navigation", { name: "Primary" });
    expect(bar.className).not.toMatch(/\bfixed\b/);

    await user.click(within(bar).getByRole("button", { name: "More" }));
    const sheet = await screen.findByRole("dialog", { name: "All Personal pages" });
    expect(within(sheet).getByRole("list", { name: "All Personal pages" })).toBeInTheDocument();
  });

  it("renders in Persian", () => {
    renderWithProviders(<NavigationView />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa", currency: "toman", calendar: "jalali" },
    });
    expect(screen.getByRole("heading", { level: 1, name: "ناوبری و پوسته" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "باز کردن پوسته‌ی زنده‌ی برنامه" })).toBeInTheDocument();
  });
});
