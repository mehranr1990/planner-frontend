import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { renderWithProviders } from "@/test/render";
import { routerPush, setMockPathname, setMockSearch } from "@/test/setup";
import { AllTeamsScreen } from "./all-teams-screen";

function renderScreen(search = "") {
  setMockPathname("/teams");
  setMockSearch(search);
  return renderWithProviders(<AllTeamsScreen />);
}

afterEach(() => resetToasts());

describe("TM-00 · All teams", () => {
  it("lists my teams as product cards with role, counts and only openable projects", async () => {
    renderScreen();
    expect(await screen.findByRole("heading", { name: "All teams", level: 1 })).toBeInTheDocument();
    const design = (await screen.findByRole("link", { name: "Design Team" })).closest("article")!;
    expect(design).toHaveTextContent("Member · 8 people");
    expect(design).toHaveTextContent("12 open tasks");
    expect(design).toHaveTextContent("3 for you");
    // partner-portal is linked but not openable: never counted.
    expect(design).toHaveTextContent("3 projects");
    const growth = screen.getByRole("link", { name: "Growth" }).closest("article")!;
    expect(growth).not.toHaveTextContent("for you");
    expect(screen.queryByRole("link", { name: "Launch Crew" })).not.toBeInTheDocument();
  });

  it("filters with pills and counts; invitations say joining gives no project access", async () => {
    const user = userEvent.setup();
    renderScreen();
    const filters = await screen.findByRole("radiogroup", { name: "Filter teams" });
    expect(within(filters).getByRole("radio", { name: "All 3" })).toBeChecked();
    expect(within(filters).getByRole("radio", { name: "Lead / Admin 1" })).toBeInTheDocument();
    const strip = screen.getByRole("region", { name: "Research Guild invited you as Member" });
    expect(strip).toHaveTextContent("Joining does not give project access by itself");
    await user.click(within(filters).getByRole("radio", { name: "Viewer 1" }));
    expect(screen.getByRole("link", { name: "Growth" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Design Team" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /invited you/ })).not.toBeInTheDocument();
  });

  it("archived: read-only row with Restore for Owner/Admin", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("radio", { name: "Archived" }));
    expect(screen.getByText("Launch Crew")).toBeInTheDocument();
    expect(screen.getByText("Read-only")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(await screen.findByText("Launch Crew restored")).toBeInTheDocument();
  });

  it("accepting an invitation opens the team", async () => {
    const user = userEvent.setup();
    renderScreen();
    const strip = await screen.findByRole("region", { name: "Research Guild invited you as Member" });
    await user.click(within(strip).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/teams/research"));
  });

  it("switches to the List view", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("radio", { name: "List" }));
    const table = screen.getByRole("table", { name: "Your teams" });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
  });

  it("empty first use and loading demo states", async () => {
    const { unmount } = renderScreen("state=empty");
    expect(await screen.findByRole("heading", { name: "No teams yet" })).toBeInTheDocument();
    expect(screen.getByText("Teams plan the week together. Create one or accept an invitation.")).toBeInTheDocument();
    unmount();
    renderScreen("state=loading");
    expect(screen.getByRole("status", { busy: true })).toBeInTheDocument();
  });
});
