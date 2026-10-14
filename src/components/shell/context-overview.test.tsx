import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { ContextOverview } from "./context-overview";
import { ContextPlaceholder } from "./context-placeholder";

const fa = { locale: "fa", direction: "rtl", digits: "fa", calendar: "jalali" } as const;

describe("ContextPlaceholder", () => {
  it.each([
    ["personal", "Today progress", ["Timeline", "Goals", "Habits & mood"], /Compact task list/],
    ["project", "Project health", ["Journey", "Milestones", "Current tasks"], /Risks list/],
    ["team", "People & workload", ["Active work", "Team calendar", "Check-ins"], /activity feed/],
    ["company", "Executive hero", ["Departments", "Portfolio", "Company goals"], /Approvals queue/],
  ] as const)("renders the %s zones, each marked as a Step 3 placeholder", (context, hero, products, utility) => {
    const { container } = renderWithProviders(<ContextPlaceholder context={context} />);
    const region = screen.getByRole("region", { name: "Overview layout placeholder" });
    expect(within(region).getByRole("heading", { level: 2, name: hero })).toBeInTheDocument();
    expect(within(region).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(products);
    expect(region).toHaveTextContent(utility);
    // Hero + three products + utility: every zone carries the placeholder label.
    expect(within(region).getAllByText("Placeholder · Step 3")).toHaveLength(5);
    expect(within(region).getByText("Signature")).toBeInTheDocument();
    expect(within(region).getAllByText("Product")).toHaveLength(3);
    // The notch action is visibly disabled, never a dead link.
    expect(within(region).getByRole("button", { name: "Open, coming soon" })).toBeDisabled();
    expect(within(region).queryByRole("link")).not.toBeInTheDocument();
    // No figures: the placeholder never shows numbers as if they were data.
    expect(region.textContent!.replaceAll("Step 3", "")).not.toMatch(/\d/);
    expect(container.querySelector('[data-placeholder="step-3"]')).toBe(region);
  });

  it.each([
    ["personal", "پیشرفت امروز", "خط زمانی"],
    ["project", "سلامت پروژه", "نقاط عطف"],
    ["team", "افراد و حجم کار", "تقویم تیم"],
    ["company", "نمای مدیریتی", "سبد پروژه‌ها"],
  ] as const)("translates the %s zones in Persian", (context, hero, product) => {
    renderWithProviders(<ContextPlaceholder context={context} />, { preferences: fa });
    const region = screen.getByRole("region", { name: "جای‌نگه‌دار چیدمان نمای کلی" });
    expect(within(region).getByRole("heading", { level: 2, name: hero })).toBeInTheDocument();
    expect(within(region).getByRole("heading", { level: 3, name: product })).toBeInTheDocument();
    expect(within(region).getAllByText("جای‌نگه‌دار · مرحله‌ی ۳")).toHaveLength(5);
  });
});

describe("ContextOverview", () => {
  it("renders the breadcrumb, title, description and a disabled coming-soon action", () => {
    const { container } = renderWithProviders(<ContextOverview context="project" />);
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(breadcrumb).toHaveTextContent("Projects");
    expect(within(breadcrumb).getByText("Overview").closest("[aria-current]")).toHaveAttribute("aria-current", "page");
    expect(breadcrumb.querySelector(".bg-project-dot")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Projects overview" })).toBeInTheDocument();
    expect(screen.getByText("Boards, milestones, flows and deliverables")).toBeInTheDocument();
    const cta = screen.getByRole("button", { name: "New task" });
    expect(cta).toHaveAttribute("aria-disabled", "true");
    expect(cta).toHaveAccessibleDescription("Coming soon");
    expect(container.innerHTML).not.toMatch(/\b(?:ml|mr|pl|pr|left|right)-\d/);
  });

  it("renders in Persian", () => {
    renderWithProviders(<ContextOverview context="company" />, { preferences: fa });
    expect(screen.getByRole("heading", { level: 1, name: "نمای کلی شرکت‌ها" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "بررسی تأییدها" })).toHaveAccessibleDescription("به‌زودی");
  });
});
