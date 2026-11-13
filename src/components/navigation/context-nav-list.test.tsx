import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { setMockPathname } from "@/test/setup";
import { ContextNavList } from "./context-nav-list";
import { preventDocumentNavigation } from "./test-utils";

describe("ContextNavList", () => {
  preventDocumentNavigation();

  it("lists every page of the context the role can open (inside a company)", async () => {
    setMockPathname("/companies/euroly/reports");
    renderWithProviders(<ContextNavList />);
    const list = screen.getByRole("list", { name: "All Companies pages" });
    // Org Admin in Euroly: every module, all routed.
    expect(await within(list).findByRole("link", { name: "Settings" })).toHaveAttribute("href", "/companies/euroly/settings");
    // + Channels (MS-01, company group 4).
    expect(within(list).getAllByRole("listitem")).toHaveLength(13);
    expect(within(list).queryByText("Coming soon")).toBeNull();
    expect(within(list).getByRole("link", { name: "Reports" })).toHaveAttribute("aria-current", "page");
  });

  it("calls onNavigate when an available item is chosen", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithProviders(<ContextNavList context="company" onNavigate={onNavigate} />);
    await user.click(screen.getByRole("link", { name: "Overview" }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("accepts a custom accessible name and translates", () => {
    renderWithProviders(<ContextNavList context="company" aria-label="Jump to" />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa" },
    });
    const list = screen.getByRole("list", { name: "Jump to" });
    expect(within(list).getAllByRole("link")[0]).toHaveAccessibleName("نمای کلی");
  });
});
