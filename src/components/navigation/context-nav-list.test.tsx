import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { setMockPathname } from "@/test/setup";
import { ContextNavList } from "./context-nav-list";
import { preventDocumentNavigation } from "./test-utils";

describe("ContextNavList", () => {
  preventDocumentNavigation();

  it("lists every item of the context with Coming soon badges for planned ones", () => {
    setMockPathname("/companies/reports");
    renderWithProviders(<ContextNavList />);
    const list = screen.getByRole("list", { name: "All Companies pages" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(9);
    expect(within(list).getAllByRole("link")).toHaveLength(1);
    expect(within(list).getAllByText("Coming soon")).toHaveLength(8);
    expect(within(list).getByRole("button", { name: "Reports" })).toHaveAttribute("aria-disabled", "true");
  });

  it("calls onNavigate when an available item is chosen", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithProviders(<ContextNavList context="team" onNavigate={onNavigate} />);
    await user.click(screen.getByRole("button", { name: "People" }));
    expect(onNavigate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("link", { name: "Overview" }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("accepts a custom accessible name and translates", () => {
    renderWithProviders(<ContextNavList context="project" aria-label="Jump to" />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa" },
    });
    const list = screen.getByRole("list", { name: "Jump to" });
    expect(within(list).getByRole("button", { name: "بورد" })).toHaveAccessibleDescription("به‌زودی");
  });
});
