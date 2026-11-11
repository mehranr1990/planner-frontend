import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { renderWithProviders } from "@/test/render";
import { routerPush, setMockPathname, setMockSearch } from "@/test/setup";
import { TeamSheetHost } from "../sheets/team-sheet-host";
import { TeamGate } from "../team-gate";
import { TeamProjectsScreen } from "./team-projects-screen";

function renderProjects(team = "design") {
  setMockPathname(`/teams/${team}/projects`);
  setMockSearch("");
  return renderWithProviders(
    <TeamGate>
      <TeamProjectsScreen />
    </TeamGate>,
  );
}

afterEach(() => resetToasts());

describe("TM-06 · Team projects", () => {
  it("lists only projects the viewer can open, with relation, role and filters (no hidden count)", async () => {
    const user = userEvent.setup();
    renderProjects();
    const owned = await screen.findByRole("link", { name: "Website Redesign" });
    expect(owned).toHaveAttribute("href", "/projects/website-redesign");
    const row = owned.closest("li")!;
    expect(within(row).getByText("Team-owned")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Planner App" }).closest("li")).toHaveTextContent("Linked");
    expect(screen.queryByText(/Partner Portal/)).not.toBeInTheDocument();
    expect(screen.queryByText(/hidden/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All 3" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Linked 2" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Website Redesign" })).not.toBeInTheDocument());
    // Members neither link nor create team projects.
    expect(screen.queryByRole("button", { name: "Link a project" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New team project" })).not.toBeInTheDocument();
  });

  it("timeline view shows read-only bars with a now line", async () => {
    const user = userEvent.setup();
    renderProjects();
    await screen.findByRole("link", { name: "Website Redesign" });
    await user.click(screen.getByRole("radio", { name: "Timeline" }));
    expect(await screen.findByRole("heading", { name: "Portfolio timeline" })).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /^Website Redesign: / })).toHaveLength(1);
  });

  it("Lead: New team project opens ?sheet=project-new owned by the team", async () => {
    const user = userEvent.setup();
    renderProjects("mobile");
    await user.click(await screen.findByRole("button", { name: "New team project" }));
    expect(routerPush).toHaveBeenLastCalledWith("/teams/mobile/projects?sheet=project-new", { scroll: false });
  });

  it("project-new sheet under a team shows the owning team", async () => {
    setMockPathname("/teams/mobile/projects");
    setMockSearch("sheet=project-new");
    renderWithProviders(<TeamSheetHost />);
    const sheet = await screen.findByRole("dialog", { name: "New team project" });
    expect(within(sheet).getByText("Owned by Mobile Squad")).toBeInTheDocument();
  });
});
