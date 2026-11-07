import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { routerPush, setMockPathname, setMockSearch } from "@/test/setup";
import { AllProjectsScreen } from "./all-projects-screen";

function renderScreen(search = "", options?: Parameters<typeof renderWithProviders>[1]) {
  setMockPathname("/projects");
  setMockSearch(search);
  return renderWithProviders(<AllProjectsScreen />, options);
}

describe("PJ-00 · All projects", () => {
  it("lists project cards with server counts on the pills", async () => {
    renderScreen();
    const card = (await screen.findByRole("link", { name: "Website Redesign" })).closest("article")!;
    expect(card).toHaveTextContent("You · Manager");
    expect(card).toHaveTextContent("At risk");
    expect(card).toHaveTextContent("24 of 41 tasks");
    expect(card).toHaveTextContent("3 for you");
    expect(card).toHaveTextContent("Updated 2h ago");
    expect(within(card).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "58");
    const pills = screen.getByRole("radiogroup", { name: "Filter projects" });
    expect(
      within(pills)
        .getAllByRole("radio")
        .map((pill) => pill.textContent),
    ).toEqual(["All 4", "Owned by me 2", "Member 2", "Invitations 1", "Archived 1"]);
    // Overdue milestone in red text, paused line from the lifecycle.
    expect(screen.getByText("Prototype · overdue 3d")).toBeInTheDocument();
    expect(screen.getByText("Paused by you")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New projects*Blank or from a template/ })).toBeInTheDocument();
  });

  it("filters locally and shows the filtered empty state with Clear filters", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("link", { name: "Website Redesign" });
    await user.click(screen.getByRole("radio", { name: "Owned by me 2" }));
    expect(screen.queryByRole("link", { name: "Website Redesign" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mobile Onboarding" })).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search projects" }), "zzz");
    expect(screen.getByText("Nothing matches")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("link", { name: "Website Redesign" })).toBeInTheDocument();
  });

  it("archived tab: read-only rows with Restore for Owner/Admin", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("radio", { name: "Archived 1" }));
    expect(screen.getByText("Spring Campaign")).toBeInTheDocument();
    expect(screen.getByText(/Archived .* · read-only/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  it("switches to the List view (segmented)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("link", { name: "Website Redesign" });
    await user.click(screen.getByRole("radio", { name: "List" }));
    const table = screen.getByRole("table", { name: "Projects" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Project", "Status", "Progress", "Next milestone", "My role", "For you"]);
    expect(within(table).getAllByRole("row")).toHaveLength(5);
  });

  it("invitation strip: public-safe preview, Accept opens the project", async () => {
    const user = userEvent.setup();
    renderScreen();
    const strip = await screen.findByRole("region", { name: "Invitation · Data Migration" });
    expect(strip).toHaveTextContent("Sara P. invited you as Member");
    await user.click(within(strip).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/projects/data-migration"));
  });

  it("Decline confirms with an optional note", async () => {
    const user = userEvent.setup();
    renderScreen();
    const strip = await screen.findByRole("region", { name: "Invitation · Data Migration" });
    await user.click(within(strip).getByRole("button", { name: "Decline" }));
    const dialog = await screen.findByRole("dialog", { name: "Decline the invitation to “Data Migration”?" });
    await user.type(within(dialog).getByRole("textbox", { name: "Note (optional)" }), "Busy this quarter");
    await user.click(within(dialog).getByRole("button", { name: "Decline invitation" }));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Invitation · Data Migration" })).not.toBeInTheDocument(),
    );
  });

  it.each([
    ["empty", "No projects yet"],
    ["filtered", "Nothing matches"],
    ["error", "Couldn’t load your projects"],
  ])("demo state %s", async (state, text) => {
    renderScreen(`state=${state}`);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it("demo state loading shows the skeleton", () => {
    renderScreen("state=loading");
    expect(screen.getByRole("status", { name: "Loading" })).toHaveAttribute("aria-busy", "true");
  });

  it("renders Persian copy with Persian digits", async () => {
    renderScreen("", { preferences: { locale: "fa", direction: "rtl", digits: "fa", calendar: "jalali" } });
    const card = (await screen.findByRole("link", { name: "Website Redesign" })).closest("article")!;
    expect(card).toHaveTextContent("۲۴ از ۴۱ کار");
    expect(card).toHaveTextContent("در خطر");
    expect(card).toHaveTextContent("Beta · ۲۰ آبان");
    expect(screen.getByRole("radio", { name: "متعلق به من ۲" })).toBeInTheDocument();
  });
});
