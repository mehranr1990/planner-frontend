import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { setMockPathname } from "@/test/setup";
import { MobileBottomNav } from "./mobile-bottom-nav";

/** Asserts the nav's interactive elements appear in this DOM (reading/tab) order. */
function expectOrder(nav: HTMLElement, expected: ["link" | "button", string][]) {
  const elements = expected.map(([role, name]) => within(nav).getByRole(role, { name }));
  expect(Array.from(nav.querySelectorAll("a, button"))).toEqual(elements);
}

describe("MobileBottomNav", () => {
  it("Personal (PM01): Today · Tasks · (+) · Calendar · More, all real links", () => {
    setMockPathname("/personal");
    renderWithProviders(<MobileBottomNav fabLabel="Quick add" />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expectOrder(nav, [
      ["link", "Today"],
      ["link", "Tasks"],
      ["button", "Quick add"],
      ["link", "Calendar"],
      ["button", "More"],
    ]);
    expect(within(nav).getByRole("link", { name: "Today" })).toHaveAttribute("href", "/personal");
  });

  it.each(["/personal", "/personal/my-day"])("keeps Today current on %s (Overview ⇄ Plan)", (path) => {
    setMockPathname(path);
    renderWithProviders(<MobileBottomNav fabLabel="Quick add" />);
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Tasks" })).not.toHaveAttribute("aria-current");
  });

  it("marks the active item and disables planned ones (Projects)", () => {
    setMockPathname("/projects");
    renderWithProviders(<MobileBottomNav fabLabel="Quick add" />);
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    const tasks = screen.getByRole("button", { name: "Tasks" });
    expect(tasks).toHaveAttribute("aria-disabled", "true");
    expect(tasks).toHaveAccessibleDescription("Coming soon");
  });

  it("follows the context in the URL", () => {
    setMockPathname("/projects/board");
    renderWithProviders(<MobileBottomNav fabLabel="New task" />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toHaveAttribute("data-scope", "project");
    expect(within(nav).getByRole("button", { name: "Case flow" })).toBeInTheDocument();
  });

  it("calls the FAB and More callbacks", async () => {
    const user = userEvent.setup();
    const onFabClick = vi.fn();
    const onMoreClick = vi.fn();
    renderWithProviders(
      <MobileBottomNav fabLabel="Quick add" onFabClick={onFabClick} onMoreClick={onMoreClick} moreExpanded={false} />,
    );
    await user.click(screen.getByRole("button", { name: "Quick add" }));
    expect(onFabClick).toHaveBeenCalledTimes(1);
    const more = screen.getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-haspopup", "dialog");
    expect(more).toHaveAttribute("aria-expanded", "false");
    await user.click(more);
    expect(onMoreClick).toHaveBeenCalledTimes(1);
  });

  it("renders a custom FAB element with the label", () => {
    renderWithProviders(<MobileBottomNav fabLabel="Quick add" fab={<Link href="/personal" />} />);
    const fab = screen.getByRole("link", { name: "Quick add" });
    expect(fab).toHaveAttribute("href", "/personal");
    expect(fab.querySelector("svg")).toBeInTheDocument();
  });

  it("keeps semantic order in RTL with Persian labels", () => {
    setMockPathname("/personal");
    renderWithProviders(
      <div dir="rtl">
        <MobileBottomNav fabLabel="افزودن سریع" />
      </div>,
      { preferences: { locale: "fa", direction: "rtl", digits: "fa" } },
    );
    const nav = screen.getByRole("navigation", { name: "اصلی" });
    expectOrder(nav, [
      ["link", "امروز"],
      ["link", "کارها"],
      ["button", "افزودن سریع"],
      ["link", "تقویم"],
      ["button", "بیشتر"],
    ]);
  });
});
