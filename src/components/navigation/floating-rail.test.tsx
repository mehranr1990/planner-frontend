import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_PLANNER_SETTINGS } from "@/features/planner-settings/planner-settings";
import { renderWithProviders } from "@/test/render";
import { setMockPathname } from "@/test/setup";
import { FloatingRail } from "./floating-rail";

describe("FloatingRail", () => {
  it("is a navigation landmark named after the URL's context", () => {
    setMockPathname("/companies");
    renderWithProviders(<FloatingRail />);
    const nav = screen.getByRole("navigation", { name: "Companies navigation" });
    expect(nav).toHaveAttribute("data-scope", "company");
  });

  describe("Companies (CS-01)", () => {
    it("collection: All companies, my companies as tiles, New company", async () => {
      setMockPathname("/companies");
      renderWithProviders(<FloatingRail />);
      const nav = screen.getByRole("navigation", { name: "Companies navigation" });
      expect(nav).toHaveAttribute("data-rail", "collection");
      expect(within(nav).getByRole("link", { name: "All companies" })).toHaveAttribute("aria-current", "page");
      const yours = await within(nav).findByRole("list", { name: "Your companies" });
      expect(within(yours).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
        "/companies/euroly",
        "/companies/araxitis",
      ]);
      expect(within(nav).getByRole("button", { name: "New company" })).toHaveAttribute("aria-haspopup", "dialog");
    });

    it("inside a company: four groups + Settings, approvals badge, role-filtered", async () => {
      setMockPathname("/companies/euroly/approvals");
      renderWithProviders(<FloatingRail />);
      const nav = screen.getByRole("navigation", { name: "Companies navigation" });
      expect(nav).toHaveAttribute("data-rail", "grouped");
      expect(await within(nav).findByRole("link", { name: /^Approvals/ })).toHaveAttribute("aria-current", "page");
      expect(within(nav).getByRole("link", { name: "Projects & teams" })).toHaveAttribute("href", "/companies/euroly/work");
      expect(within(nav).getAllByRole("link")).toHaveLength(13);
      expect(nav.querySelectorAll("[data-slot='rail-separator']")).toHaveLength(3);
    });
  });

  describe("Teams (TS-01)", () => {
    it("collection: All teams, my active teams as tiles, New team", async () => {
      setMockPathname("/teams");
      renderWithProviders(<FloatingRail />);
      const nav = screen.getByRole("navigation", { name: "Teams navigation" });
      expect(nav).toHaveAttribute("data-rail", "collection");
      expect(within(nav).getByRole("link", { name: "All teams" })).toHaveAttribute("aria-current", "page");
      const yours = await within(nav).findByRole("list", { name: "Your teams" });
      expect(within(yours).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
        "/teams/design",
        "/teams/mobile",
        "/teams/growth",
      ]);
      expect(within(nav).getByRole("button", { name: "New team" })).toHaveAttribute("aria-haspopup", "dialog");
    });

    it("inside a team: 3 groups + Settings, hidden by role, Check-ins badge", async () => {
      setMockPathname("/teams/design/work");
      renderWithProviders(<FloatingRail />);
      const nav = screen.getByRole("navigation", { name: "Teams navigation" });
      expect(nav).toHaveAttribute("data-rail", "grouped");
      expect(within(nav).getByRole("link", { name: "Work" })).toHaveAttribute("aria-current", "page");
      await within(nav).findByRole("link", { name: "Planning" });
      expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
        "/teams/design",
        "/teams/design/work",
        "/teams/design/calendar",
        "/teams/design/planning",
        "/teams/design/projects",
        "/teams/design/goals",
        "/teams/design/people",
        "/teams/design/analytics",
        "/teams/design/channels",
        "/teams/design/check-ins",
        "/teams/design/recognition",
        "/teams/design/files",
      ]);
      expect(within(nav).queryByRole("link", { name: /Activity/ })).not.toBeInTheDocument();
      expect(within(nav).getByRole("link", { name: /^Check-ins, / })).toBeInTheDocument();
    });
  });

  describe("Projects (SH01)", () => {
    it("collection: All projects, four recent projects and New project (D7)", async () => {
      setMockPathname("/projects");
      renderWithProviders(<FloatingRail />);
      const nav = screen.getByRole("navigation", {
        name: "Projects navigation",
      });
      expect(nav).toHaveAttribute("data-rail", "collection");
      expect(within(nav).getByRole("link", { name: "All projects" })).toHaveAttribute("aria-current", "page");
      const recent = await within(nav).findByRole("list", {
        name: "Recent projects",
      });
      expect(
        within(recent)
          .getAllByRole("link")
          .map((link) => link.getAttribute("href")),
      ).toEqual([
        "/projects/website-redesign",
        "/projects/planner-app",
        "/projects/mobile-onboarding",
        "/projects/brand-refresh",
      ]);
      expect(within(nav).getByRole("button", { name: "New project" })).toHaveAttribute("aria-haspopup", "dialog");
    });

    it("inside a project: three groups + Settings, capability-aware, Risks badge", async () => {
      setMockPathname("/projects/website-redesign/milestones");
      renderWithProviders(<FloatingRail />);
      const nav = screen.getByRole("navigation", {
        name: "Projects navigation",
      });
      expect(nav).toHaveAttribute("data-rail", "grouped");
      await within(nav).findByRole("link", { name: "Milestones" });
      const hrefs = within(nav)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"));
      // Manager: everything in D2 order + Settings (PJ-14: Manager+ open Settings).
      expect(hrefs).toEqual([
        "/projects/website-redesign",
        "/projects/website-redesign/tasks",
        "/projects/website-redesign/timeline",
        "/projects/website-redesign/gantt",
        "/projects/website-redesign/calendar",
        "/projects/website-redesign/milestones",
        "/projects/website-redesign/risks",
        "/projects/website-redesign/workload",
        "/projects/website-redesign/channels",
        "/projects/website-redesign/members",
        "/projects/website-redesign/files",
        "/projects/website-redesign/analytics",
        "/projects/website-redesign/settings",
      ]);
      expect(within(nav).getByRole("link", { name: "Milestones" })).toHaveAttribute("aria-current", "page");
      expect(within(nav).getByRole("link", { name: "Risks, open high risks: 1" })).toBeInTheDocument();
    });

    it("an owner sees Settings; Tasks stays current on the Board view route", async () => {
      setMockPathname("/projects/mobile-onboarding/board");
      renderWithProviders(<FloatingRail />);
      const nav = screen.getByRole("navigation", {
        name: "Projects navigation",
      });
      expect(await within(nav).findByRole("link", { name: "Settings" })).toHaveAttribute(
        "href",
        "/projects/mobile-onboarding/settings",
      );
      expect(within(nav).getByRole("link", { name: "Tasks" })).toHaveAttribute("aria-current", "page");
    });
  });

  describe("Personal (P00PersonalIA)", () => {
    const groupsOf = (nav: HTMLElement) =>
      within(nav)
        .getAllByRole("list")
        .map((list) => within(list).getAllByRole("link").map((link) => link.getAttribute("href")));

    it("is icon-only with three groups and Settings at the bottom, every item a real link", () => {
      setMockPathname("/personal/my-day");
      renderWithProviders(<FloatingRail />);
      const nav = screen.getByRole("navigation", {
        name: "Personal navigation",
      });
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
      const inbox = await screen.findByRole("link", {
        name: "Inbox, 6 to triage",
      });
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
      const nav = screen.getByRole("navigation", {
        name: "Personal navigation",
      });
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

  it("falls back to Personal outside any context", () => {
    setMockPathname("/");
    renderWithProviders(<FloatingRail />);
    expect(screen.getByRole("navigation", { name: "Personal navigation" })).toBeInTheDocument();
  });
});
