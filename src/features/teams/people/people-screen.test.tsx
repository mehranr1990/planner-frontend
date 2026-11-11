import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { renderWithProviders } from "@/test/render";
import { routerPush, setMockPathname, setMockSearch } from "@/test/setup";
import { TeamGate } from "../team-gate";
import { PeopleScreen } from "./people-screen";

function renderPeople(team = "design") {
  setMockPathname(`/teams/${team}/people`);
  setMockSearch("");
  return renderWithProviders(
    <TeamGate>
      <PeopleScreen />
    </TeamGate>,
  );
}

afterEach(() => resetToasts());

describe("TM-08 · People & capacity", () => {
  it("the strip, the highlighted row and the Person card follow one selection (A–Z, no ranking)", async () => {
    const user = userEvent.setup();
    renderPeople();
    const card = (await screen.findByRole("heading", { level: 2, name: "Amélie L." })).closest("section")!;
    expect(within(card).getByText("UX Designer · Member")).toBeInTheDocument();
    expect(await screen.findByRole("radiogroup")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show Katy F." }));
    const katy = (await screen.findByRole("heading", { level: 2, name: "Katy F." })).closest("section")!;
    expect(within(katy).getByRole("link", { name: "Checkout flow hand-off" })).toBeInTheDocument();
    expect(within(katy).getByText("1 other project task · 2h")).toBeInTheDocument();
    expect(within(katy).getByText("This week · 33 / 32h")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show Katy F." }).closest("li")).toHaveAttribute("aria-current", "true");
    // The strip follows the row selection.
    expect(screen.getByRole("radio", { name: /^Katy F\./ })).toHaveAttribute("aria-checked", "true");
  });

  it("Members: status and roles read-only, no row actions, notch Copy profile link, no Invitations tab", async () => {
    renderPeople();
    await screen.findByRole("heading", { level: 2, name: "Amélie L." });
    expect(screen.getByRole("button", { name: "Over capacity 1" })).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Change role of/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Actions for/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy profile link" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /^Invitations/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/rank #|most productive/i)).not.toBeInTheDocument();
  });

  it("Lead: Assign a task opens Work quick add for that person; Edit capacity; Invitations tab", async () => {
    const user = userEvent.setup();
    renderPeople("mobile");
    await screen.findByRole("heading", { level: 2, name: "Jonathan K." });
    await user.click(screen.getByRole("button", { name: "Assign a task" }));
    expect(routerPush).toHaveBeenLastCalledWith("/teams/mobile/work?add=task&assignee=jonathan");

    await user.click(screen.getByRole("button", { name: "Actions for Kian F." }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit capacity" }));
    const dialog = await screen.findByRole("dialog", { name: "Capacity · Kian F." });
    expect(within(dialog).getByRole("button", { name: "Thu" })).toHaveAttribute("aria-pressed", "false");
    const hours = await within(dialog).findByRole("spinbutton", { name: "Hours for this team per week" });
    await user.clear(hours);
    await user.type(hours, "28");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Capacity saved")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Show Kian F." }).closest("li")).toHaveTextContent("28h"),
    );

    await user.click(screen.getByRole("radio", { name: "Invitations 0" }));
    expect(await screen.findByText("No pending invitations.")).toBeInTheDocument();
  });
});
