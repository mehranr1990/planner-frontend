import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { renderWithProviders } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { TeamSheetHost } from "./sheets/team-sheet-host";
import { TeamGate, useTeam } from "./team-gate";

function Probe() {
  const { team, capabilities } = useTeam();
  return (
    <p>
      {team.name} · {team.role} · {String(capabilities.setOwnStatus)}
    </p>
  );
}

function renderGate(pathname: string, search = "") {
  setMockPathname(pathname);
  setMockSearch(search);
  return renderWithProviders(
    <TeamGate>
      <Probe />
    </TeamGate>,
  );
}

afterEach(() => resetToasts());

describe("TS-01 · team gate and access states", () => {
  it("provides the team and capabilities to the page", async () => {
    renderGate("/teams/design");
    expect(await screen.findByText("Design Team · member · true")).toBeInTheDocument();
  });

  it("forbidden = not found (no discovery)", async () => {
    renderGate("/teams/secret");
    expect(await screen.findByRole("heading", { name: "This team isn’t available" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to my teams" })).toHaveAttribute("href", "/teams");
  });

  it("invitation: public-safe preview, joining does not give project access", async () => {
    renderGate("/teams/research");
    expect(await screen.findByRole("heading", { name: "You’re invited to “Research Guild”" })).toBeInTheDocument();
    expect(screen.getByText(/Joining the team does not give access to the team’s projects/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });

  it("removed / left", async () => {
    renderGate("/teams/old-studio");
    expect(await screen.findByRole("heading", { name: "Your access to this team was removed" })).toBeInTheDocument();
  });

  it("demo states: Viewer banner input and archived read-only", async () => {
    renderGate("/teams/design", "state=read-only");
    expect(await screen.findByText("Design Team · viewer · false")).toBeInTheDocument();
  });
});

describe("TS-01 · ?sheet=team-status (manual status)", () => {
  it("sets a status with note and clear-after for this team", async () => {
    const user = userEvent.setup();
    setMockPathname("/teams/design");
    setMockSearch("sheet=team-status");
    renderWithProviders(<TeamSheetHost />);
    const sheet = await screen.findByRole("dialog", { name: "Your status in Design Team" });
    const statuses = await within(sheet).findByRole("radiogroup", { name: "Status" });
    expect(within(statuses).getAllByRole("radio").map((radio) => radio.textContent)).toEqual([
      "Available",
      "Busy",
      "Away",
      "Off today",
    ]);
    await user.click(within(statuses).getByRole("radio", { name: "Busy" }));
    await user.type(within(sheet).getByRole("textbox", { name: "Note (optional)" }), "deep work");
    await user.click(within(sheet).getByRole("radio", { name: "Today" }));
    expect(within(sheet).getByRole("switch", { name: "Same status in all my teams" })).not.toBeChecked();
    expect(within(sheet).getByText("Set by you only. Nothing is read from calendars or activity.")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Set" }));
    expect(await screen.findByText("Status set")).toBeInTheDocument();
  });

  it("Viewers cannot set a status", async () => {
    setMockPathname("/teams/growth");
    setMockSearch("sheet=team-status");
    renderWithProviders(<TeamSheetHost />);
    await waitFor(() => expect(screen.getByText("Viewers can’t set a status in this team.")).toBeInTheDocument());
  });
});
