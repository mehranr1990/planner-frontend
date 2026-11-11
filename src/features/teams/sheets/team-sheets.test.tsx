import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { renderWithProviders } from "@/test/render";
import { routerPush, setMockPathname, setMockSearch } from "@/test/setup";
import { TeamSheetHost } from "./team-sheet-host";
import { teamSheetHref } from "./team-sheet-params";

function renderHost(pathname: string, search: string) {
  setMockPathname(pathname);
  setMockSearch(search);
  return renderWithProviders(<TeamSheetHost />);
}

afterEach(() => resetToasts());

describe("TM-90 · team sheets", () => {
  it("builds sheet URLs that keep other params", () => {
    expect(teamSheetHref("/teams/design/work", "view=board", "team-invite")).toBe("/teams/design/work?view=board&sheet=team-invite");
    expect(teamSheetHref("/teams/design/work", "view=board&sheet=team-invite", null)).toBe("/teams/design/work?view=board");
  });

  it("team-new: name required, weekly plan by default, company row disabled; creates and opens the team as Owner", async () => {
    const user = userEvent.setup();
    renderHost("/teams", "sheet=team-new");
    const sheet = await screen.findByRole("dialog", { name: "New team" });
    expect(within(sheet).getByRole("radio", { name: "Weekly plan" })).toBeChecked();
    const company = within(sheet).getByRole("group", { name: "Belongs to a company" });
    expect(company).toHaveAttribute("aria-disabled", "true");
    expect(company).toHaveAccessibleDescription("available in a later phase");
    await user.click(within(sheet).getByRole("button", { name: "Create team" }));
    expect(within(sheet).getByText("Give the team a name")).toBeInTheDocument();
    await user.type(within(sheet).getByRole("textbox", { name: "Name" }), "Help Desk");
    await user.click(within(sheet).getByRole("radio", { name: "Sprints + backlog" }));
    await user.click(within(sheet).getByRole("button", { name: "Create team" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/teams/help-desk"));
    expect(await screen.findByText("Help Desk created")).toBeInTheDocument();
  });

  it("team-invite: note that project access is separate; never reveals accounts; Admin only for Owners", async () => {
    const user = userEvent.setup();
    renderHost("/teams/mobile", "sheet=team-invite");
    const sheet = await screen.findByRole("dialog", { name: "Invite to Mobile Squad" });
    // Lead in Mobile Squad: no Admin role on offer.
    expect(within(sheet).getAllByRole("radio").map((radio) => radio.textContent)).toEqual([
      "Leadplans the week, assigns, check-ins",
      "Memberworks on team tasks",
      "Viewerread only",
    ]);
    expect(within(sheet).getByRole("note")).toHaveTextContent("Joining the team does not give access to the team’s projects.");
    expect(within(sheet).getByText(/we never say whether an account exists/)).toBeInTheDocument();
    await user.type(within(sheet).getByRole("textbox", { name: "Email addresses" }), "lina@example.com{Enter}");
    await user.click(within(sheet).getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText("Invitation sent")).toBeInTheDocument();
  });

  it("team-invite: a Member has no invite right", async () => {
    renderHost("/teams/design", "sheet=team-invite");
    expect(await screen.findByText("Your role can’t invite people to this team.")).toBeInTheDocument();
  });
});
