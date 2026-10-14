import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
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

  it("marks the overview current and renders planned items as disabled non-links", () => {
    setMockPathname("/personal");
    renderWithProviders(<FloatingRail />);
    const nav = screen.getByRole("navigation", { name: "Personal navigation" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Overview");
    expect(links[0]).toHaveAttribute("aria-current", "page");
    const myDay = within(nav).getByRole("button", { name: "My Day" });
    expect(myDay).toHaveAttribute("aria-disabled", "true");
    expect(myDay).toHaveAccessibleDescription("Coming soon");
  });

  it("toggles expanded state with aria-expanded, aria-controls and visible labels", async () => {
    const user = userEvent.setup();
    const onExpandedChange = vi.fn();
    setMockPathname("/personal");
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

  it("renders Persian labels in RTL with the same item order", async () => {
    const user = userEvent.setup();
    setMockPathname("/personal");
    renderWithProviders(
      <div dir="rtl">
        <FloatingRail />
      </div>,
      { preferences: { locale: "fa", direction: "rtl", digits: "fa" } },
    );
    const nav = screen.getByRole("navigation", { name: "ناوبری شخصی" });
    await user.click(within(nav).getByRole("button", { name: "باز کردن ناوبری" }));
    const names = within(nav)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(names[0]).toBe("نمای کلی");
    expect(names[1]).toContain("روز من");
    expect(within(nav).getByRole("button", { name: "جمع کردن ناوبری" })).toHaveAttribute("aria-expanded", "true");
  });
});
