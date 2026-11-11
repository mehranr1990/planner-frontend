import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { renderWithProviders } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { TeamGate } from "../team-gate";
import { TeamSettingsScreen } from "./team-settings-screen";

function renderSettings(team = "mobile", search = "") {
  setMockPathname(`/teams/${team}/settings`);
  setMockSearch(search);
  return renderWithProviders(
    <TeamGate>
      <TeamSettingsScreen />
    </TeamGate>,
  );
}

afterEach(() => resetToasts());

describe("TM-14 · Team settings", () => {
  it("FolderTabs General · Planning · Access · Lifecycle; Lead sees General read-only", async () => {
    renderSettings();
    const tabs = await screen.findByRole("tablist", { name: "Settings sections" });
    expect(within(tabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["General", "Planning", "Access", "Lifecycle"]);
    expect(screen.getByText("Only Owners and Admins can change this.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeDisabled();
  });

  it("Planning: sprints → weekly asks to complete the running sprint first; schedule shows the default", async () => {
    const user = userEvent.setup();
    renderSettings("mobile", "tab=planning");
    expect(await screen.findByText(/Opens Saturday 09:00 · closes Wednesday 18:00/)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Weekly" }));
    const dialog = await screen.findByRole("dialog", { name: "Complete the sprint first" });
    expect(within(dialog).getByRole("link", { name: "Open sprint" })).toHaveAttribute("href", "/teams/mobile/planning?tab=sprint");
  });

  it("Lifecycle: Join a company disabled; transfer and delete are Owner only", async () => {
    renderSettings("mobile", "tab=lifecycle");
    expect(await screen.findByText("Not available yet")).toBeInTheDocument();
    expect(screen.getByText("Only the Owner can do this.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete…" })).not.toBeInTheDocument();
  });
});
