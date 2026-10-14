import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { getAppContext } from "@/features/navigation/contexts";
import { renderWithProviders } from "@/test/render";
import { setMockPathname } from "@/test/setup";
import { NavLink } from "./nav-link";
import { preventDocumentNavigation } from "./test-utils";

const personal = getAppContext("personal");
const overview = personal.nav.find((item) => item.id === "overview")!;
const goals = personal.nav.find((item) => item.id === "goals")!;

describe("NavLink", () => {
  preventDocumentNavigation();

  it("renders an available item as a link with aria-current on its route", () => {
    setMockPathname("/personal/");
    renderWithProviders(<NavLink item={overview} />);
    const link = screen.getByRole("link", { name: "Overview" });
    expect(link).toHaveAttribute("href", "/personal");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("omits aria-current elsewhere", () => {
    setMockPathname("/projects");
    renderWithProviders(<NavLink item={overview} />);
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("lets the active prop override the URL", () => {
    setMockPathname("/");
    renderWithProviders(<NavLink item={overview} active />);
    expect(screen.getByRole("link")).toHaveAttribute("aria-current", "page");
  });

  it("renders a planned item as a disabled non-link with a Coming soon description", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NavLink item={goals} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    const entry = screen.getByRole("button", { name: "Goals" });
    expect(entry).toHaveAttribute("aria-disabled", "true");
    expect(entry).toHaveAccessibleDescription("Coming soon");
    expect(screen.getByText("Coming soon")).toBeVisible();
    await user.click(entry);
    expect(entry).not.toHaveAttribute("aria-current");
  });

  it("never marks a planned item current, even on its reserved route", () => {
    setMockPathname("/personal/goals");
    renderWithProviders(<NavLink item={goals} />);
    expect(screen.getByRole("button", { name: "Goals" })).not.toHaveAttribute("aria-current");
  });

  it("hides the label visually when icon-only but keeps the accessible name", () => {
    renderWithProviders(<NavLink item={goals} iconOnly />);
    const entry = screen.getByRole("button", { name: "Goals" });
    expect(entry).toHaveAccessibleDescription("Coming soon");
    expect(screen.getByText("Goals")).toHaveClass("sr-only");
  });

  it("calls onNavigate on a plain click only", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithProviders(<NavLink item={overview} onNavigate={onNavigate} />);
    const link = screen.getByRole("link", { name: "Overview" });
    await user.click(link);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    // Ctrl/Cmd-click opens a new tab: a containing sheet should stay open.
    await user.keyboard("{Control>}");
    await user.click(link);
    await user.keyboard("{/Control}");
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("translates labels in Persian", () => {
    renderWithProviders(<NavLink item={goals} layout="tab" />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa" },
    });
    const entry = screen.getByRole("button", { name: "هدف‌ها" });
    expect(entry).toHaveAccessibleDescription("به‌زودی");
  });
});
