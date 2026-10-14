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
// Planned items now live outside Personal (every Personal route exists since Step 3).
const board = getAppContext("project").nav.find((item) => item.id === "board")!;

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
    renderWithProviders(<NavLink item={board} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    const entry = screen.getByRole("button", { name: "Board" });
    expect(entry).toHaveAttribute("aria-disabled", "true");
    expect(entry).toHaveAccessibleDescription("Coming soon");
    expect(screen.getByText("Coming soon")).toBeVisible();
    await user.click(entry);
    expect(entry).not.toHaveAttribute("aria-current");
  });

  it("never marks a planned item current, even on its reserved route", () => {
    setMockPathname("/projects/board");
    renderWithProviders(<NavLink item={board} />);
    expect(screen.getByRole("button", { name: "Board" })).not.toHaveAttribute("aria-current");
  });

  it("hides the label visually when icon-only but keeps the accessible name", () => {
    renderWithProviders(<NavLink item={board} iconOnly />);
    const entry = screen.getByRole("button", { name: "Board" });
    expect(entry).toHaveAccessibleDescription("Coming soon");
    expect(screen.getByText("Board")).toHaveClass("sr-only");
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

  it("shows a count badge on the icon and reads it after the name", () => {
    const inbox = personal.nav.find((item) => item.id === "inbox")!;
    renderWithProviders(<NavLink item={inbox} iconOnly badge={{ count: "6", label: "6 to triage" }} />);
    const link = screen.getByRole("link", { name: "Inbox, 6 to triage" });
    expect(link.querySelector('[data-slot="nav-badge"]')).toHaveTextContent("6");
    expect(link.querySelector('[data-slot="nav-badge"]')).toHaveAttribute("aria-hidden", "true");
  });

  it("translates labels in Persian", () => {
    renderWithProviders(<NavLink item={board} layout="tab" />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa" },
    });
    const entry = screen.getByRole("button", { name: "بورد" });
    expect(entry).toHaveAccessibleDescription("به‌زودی");
  });
});
