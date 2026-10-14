import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PLANNER_SETTINGS } from "@/features/planner-settings/planner-settings";
import { renderWithProviders } from "@/test/render";
import { setMockPathname } from "@/test/setup";
import { FloatingRail } from "./floating-rail";

describe("FloatingRail", () => {
  it("is a navigation landmark named after the URL's context", () => {
    setMockPathname("/projects");
    renderWithProviders(<FloatingRail />);
    const nav = screen.getByRole("navigation", { name: "Projects navigation" });
    expect(nav).toHaveAttribute("data-scope", "project");
    const entries = within(nav).getAllByRole("listitem");
    expect(entries).toHaveLength(8);
  });

  it("marks the overview current and renders planned items as disabled non-links (Projects)", () => {
    setMockPathname("/projects");
    renderWithProviders(<FloatingRail />);
    const nav = screen.getByRole("navigation", { name: "Projects navigation" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Overview");
    expect(links[0]).toHaveAttribute("aria-current", "page");
    const tasks = within(nav).getByRole("button", { name: "Tasks" });
    expect(tasks).toHaveAttribute("aria-disabled", "true");
    expect(tasks).toHaveAccessibleDescription("Coming soon");
  });

  describe("Personal (P00PersonalIA)", () => {
    const groupsOf = (nav: HTMLElement) =>
      within(nav)
        .getAllByRole("list")
        .map((list) => within(list).getAllByRole("link").map((link) => link.getAttribute("href")));

    it("is icon-only with three groups and Settings at the bottom, every item a real link", () => {
      setMockPathname("/personal/my-day");
      renderWithProviders(<FloatingRail />);
      const nav = screen.getByRole("navigation", { name: "Personal navigation" });
      expect(nav).toHaveAttribute("data-rail", "grouped");
      expect(within(nav).queryByRole("button", { name: /navigation/ })).not.toBeInTheDocument();
      expect(groupsOf(nav)).toEqual([
        ["/personal", "/personal/my-day", "/personal/tasks", "/personal/calendar", "/personal/goals", "/personal/habits"],
        ["/personal/finance", "/personal/journal", "/personal/insights"],
        ["/personal/inbox", "/personal/brain-dump"],
        ["/personal/settings"],
      ]);
      expect(nav.querySelectorAll('[data-slot="rail-separator"]')).toHaveLength(2);
      expect(within(nav).getByRole("link", { name: "My Day" })).toHaveAttribute("aria-current", "page");
      expect(screen.getByText("My Day")).toHaveClass("sr-only");
    });

    it("badges the Inbox with the untriaged count from the data seam", async () => {
      setMockPathname("/personal");
      renderWithProviders(<FloatingRail />);
      const inbox = await screen.findByRole("link", { name: "Inbox, 6 to triage" });
      expect(inbox.querySelector('[data-slot="nav-badge"]')).toHaveTextContent("6");
    });

    it("drops hidden modules and the separator of a group that empties", () => {
      setMockPathname("/personal");
      renderWithProviders(<FloatingRail />, {
        plannerSettings: {
          ...DEFAULT_PLANNER_SETTINGS,
          modules: { ...DEFAULT_PLANNER_SETTINGS.modules, finance: false, journal: false, insights: false, goals: false },
        },
      });
      const nav = screen.getByRole("navigation", { name: "Personal navigation" });
      expect(groupsOf(nav)).toEqual([
        ["/personal", "/personal/my-day", "/personal/tasks", "/personal/calendar", "/personal/habits"],
        ["/personal/inbox", "/personal/brain-dump"],
        ["/personal/settings"],
      ]);
      expect(nav.querySelectorAll('[data-slot="rail-separator"]')).toHaveLength(1);
    });

    it("renders Persian labels in RTL with the same order", () => {
      setMockPathname("/personal");
      renderWithProviders(
        <div dir="rtl">
          <FloatingRail />
        </div>,
        { preferences: { locale: "fa", direction: "rtl", digits: "fa" } },
      );
      const nav = screen.getByRole("navigation", { name: "ناوبری شخصی" });
      const names = within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent);
      expect(names.slice(0, 2)).toEqual(["نمای کلی", "روز من"]);
      expect(names.at(-1)).toBe("تنظیمات");
    });
  });

  it("toggles expanded state with aria-expanded, aria-controls and visible labels (contexts with a flat rail)", async () => {
    const user = userEvent.setup();
    const onExpandedChange = vi.fn();
    setMockPathname("/projects");
    renderWithProviders(<FloatingRail onExpandedChange={onExpandedChange} />);

    const toggle = screen.getByRole("button", { name: "Expand navigation" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toBeInTheDocument();
    expect(screen.getByText("Overview")).toHaveClass("sr-only");
    expect(screen.getByRole("navigation")).toHaveClass("w-16");

    await user.click(toggle);
    const collapse = screen.getByRole("button", { name: "Collapse navigation" });
    expect(collapse).toBe(toggle);
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    expect(collapse).toHaveFocus();
    expect(screen.getByText("Overview")).not.toHaveClass("sr-only");
    expect(screen.getAllByText("Coming soon").length).toBeGreaterThan(0);
    expect(screen.getByRole("navigation")).toHaveClass("w-58");
    expect(onExpandedChange).toHaveBeenLastCalledWith(true);

    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(onExpandedChange).toHaveBeenLastCalledWith(false);
  });

  it("supports controlled expanded state", async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [expanded, setExpanded] = useState(true);
      return (
        <>
          <FloatingRail context="team" expanded={expanded} onExpandedChange={setExpanded} />
          <output>{String(expanded)}</output>
        </>
      );
    }
    renderWithProviders(<Controlled />);
    expect(screen.getByRole("navigation", { name: "Teams navigation" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collapse navigation" }));
    expect(screen.getByText("false")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand navigation" })).toHaveAttribute("aria-expanded", "false");
  });

  it("honours a fixed expanded prop when no handler updates it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FloatingRail context="company" expanded />);
    await user.click(screen.getByRole("button", { name: "Collapse navigation" }));
    expect(screen.getByRole("button", { name: "Collapse navigation" })).toHaveAttribute("aria-expanded", "true");
  });

  it("falls back to Personal outside any context", () => {
    setMockPathname("/");
    renderWithProviders(<FloatingRail />);
    expect(screen.getByRole("navigation", { name: "Personal navigation" })).toBeInTheDocument();
  });

  it("expands a flat rail in Persian RTL with the same item order (Teams)", async () => {
    const user = userEvent.setup();
    setMockPathname("/teams");
    renderWithProviders(
      <div dir="rtl">
        <FloatingRail />
      </div>,
      { preferences: { locale: "fa", direction: "rtl", digits: "fa" } },
    );
    const nav = screen.getByRole("navigation");
    await user.click(within(nav).getByRole("button", { name: "باز کردن ناوبری" }));
    const names = within(nav)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(names[0]).toBe("نمای کلی");
    expect(within(nav).getByRole("button", { name: "جمع کردن ناوبری" })).toHaveAttribute("aria-expanded", "true");
  });
});
