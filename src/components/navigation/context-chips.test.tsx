import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { setMockPathname } from "@/test/setup";
import { ContextChips } from "./context-chips";

describe("ContextChips", () => {
  it("links every context to its overview", () => {
    renderWithProviders(<ContextChips />);
    const nav = screen.getByRole("navigation", { name: "Contexts" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/personal", "/projects", "/teams", "/companies"]);
    expect(links.map((link) => link.getAttribute("data-scope"))).toEqual(["personal", "project", "team", "company"]);
    expect(links.every((link) => !link.hasAttribute("aria-current"))).toBe(true);
    expect(nav.querySelector("[data-slot=active-check]")).toBeNull();
  });

  it("marks the active chip with a decorative check, not colour alone", () => {
    setMockPathname("/projects");
    renderWithProviders(<ContextChips />);
    const active = screen.getByRole("link", { name: "Projects" });
    expect(active).toHaveAttribute("aria-current", "page");
    const check = active.querySelector("[data-slot=active-check] svg");
    expect(check).not.toBeNull();
    expect(check).toHaveAttribute("aria-hidden", "true");
    // The check never changes the accessible name.
    expect(active).toHaveAccessibleName("Projects");
    for (const name of ["Personal", "Teams", "Companies"]) {
      expect(screen.getByRole("link", { name }).querySelector("[data-slot=active-check]")).toBeNull();
    }
  });

  it("marks the active context page or section", () => {
    setMockPathname("/teams/");
    const { unmount } = renderWithProviders(<ContextChips />);
    expect(screen.getByRole("link", { name: "Teams" })).toHaveAttribute("aria-current", "page");
    unmount();

    setMockPathname("/teams/people");
    renderWithProviders(<ContextChips />);
    expect(screen.getByRole("link", { name: "Teams" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Personal" })).not.toHaveAttribute("aria-current");
  });

  it("scrolls the active chip into view inside the row", () => {
    setMockPathname("/companies");
    const scrollBy = vi.fn();
    const rect = (left: number, right: number) => ({ left, right, top: 0, bottom: 48, width: right - left, height: 48, x: left, y: 0, toJSON: () => ({}) });
    const original = HTMLElement.prototype.getBoundingClientRect;
    const originalScrollBy = HTMLElement.prototype.scrollBy;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.tagName === "UL") return rect(0, 358);
      if (this.getAttribute("href") === "/companies") return rect(380, 500);
      return rect(0, 0);
    };
    HTMLElement.prototype.scrollBy = scrollBy as typeof HTMLElement.prototype.scrollBy;
    try {
      renderWithProviders(<ContextChips />);
      expect(scrollBy).toHaveBeenCalledWith({ left: 142 });
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
      HTMLElement.prototype.scrollBy = originalScrollBy;
    }
  });

  it("keeps semantic order in RTL", () => {
    setMockPathname("/personal");
    renderWithProviders(
      <div dir="rtl">
        <ContextChips />
      </div>,
      { preferences: { locale: "fa", direction: "rtl", digits: "fa" } },
    );
    const nav = screen.getByRole("navigation", { name: "حوزه‌ها" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "شخصی",
      "پروژه‌ها",
      "تیم‌ها",
      "شرکت‌ها",
    ]);
    expect(screen.getByRole("link", { name: "شخصی" })).toHaveAttribute("aria-current", "page");
  });
});
