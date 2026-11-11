import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { routerPush, setMockPathname, setMockSearch } from "@/test/setup";
import { TeamGate } from "../team-gate";
import { TeamOverviewScreen } from "./overview-screen";

function renderOverview(search = "") {
  setMockPathname("/teams/design");
  setMockSearch(search);
  return renderWithProviders(
    <TeamGate>
      <TeamOverviewScreen />
    </TeamGate>,
  );
}

describe("TM-01 · Team overview", () => {
  it("header: people and lead chips; Invite hidden for a Member, New task shown", async () => {
    renderOverview();
    expect(await screen.findByRole("heading", { level: 1, name: "Design Team" })).toBeInTheDocument();
    expect(screen.getByText("8 people")).toBeInTheDocument();
    expect(screen.getByText("Lead · Harry B.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New task" })).toBeInTheDocument();
  });

  it("People & workload: A–Z radiogroup picker, strip, now working on only when shared, Message coming soon", async () => {
    const user = userEvent.setup();
    renderOverview();
    const card = await screen.findByRole("region", { name: "People & workload" });
    const picker = await within(card).findByRole("radiogroup", { name: "People & workload" });
    const radios = within(picker).getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("aria-label"))).toEqual([
      "Amélie L., Available",
      "Ava R., No status",
      "Harry B., Busy",
      "Jonathan K., Available",
      "Katy F., Busy",
      "Mehran R., Available",
      "Nina T., Off today",
      "Sarah P., Available",
    ]);
    await user.click(within(picker).getByRole("radio", { name: "Sarah P., Available" }));
    const strip = card.querySelector<HTMLElement>("[data-slot=selected-person]")!;
    expect(strip).toHaveTextContent("Icon set v2 · review");
    expect(strip).toHaveTextContent("This week · 88% booked");
    expect(within(strip).getByRole("button", { name: "Message" })).toHaveAttribute("aria-disabled", "true");
    await user.click(within(picker).getByRole("radio", { name: "Harry B., Busy" }));
    expect(strip).toHaveTextContent("Not shared");
    await user.click(within(picker).getByRole("radio", { name: "Mehran R., Available" }));
    await user.click(within(strip).getByRole("button", { name: "Set status" }));
    expect(routerPush).toHaveBeenLastCalledWith("/teams/design?sheet=team-status", { scroll: false });
    // Over 100% shows the red overflow segment.
    expect(within(card).getByRole("meter", { name: "Katy F., booked this week" })).toHaveAttribute("aria-valuenow", "103");
  });

  it("This week: the signature card with Open week plan; volt only on today", async () => {
    const user = userEvent.setup();
    renderOverview();
    const week = await screen.findByRole("region", { name: "This week · W42" });
    expect(week).toHaveTextContent("11/18");
    expect(week).toHaveTextContent("3 blocked");
    expect(week).toHaveTextContent("2 carried over from W41");
    expect(week.querySelectorAll(".bg-volt")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Open week plan" }));
    expect(routerPush).toHaveBeenLastCalledWith("/teams/design/planning");
  });

  it("Work tabs show sources; project tasks open in their project", async () => {
    const user = userEvent.setup();
    renderOverview();
    const tabs = await screen.findByRole("tablist", { name: "Team work" });
    expect(await within(tabs).findByRole("tab", { name: /In progress\s*2/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "API integration" })).toHaveAttribute(
      "href",
      "/projects/website-redesign/tasks/api-integration",
    );
    expect(screen.getByRole("link", { name: "Usability round 2" })).toHaveAttribute("href", "/teams/design/work/t-usability");
    await user.click(within(tabs).getByRole("tab", { name: /Blocked\s*3/ }));
    expect(screen.getByRole("link", { name: "Checkout flow hand-off" })).toBeInTheDocument();
  });

  it("Projects: only linked projects the viewer can open, no hidden count", async () => {
    renderOverview();
    const card = await screen.findByRole("region", { name: "Projects" });
    expect(await within(card).findByText("3 you can open")).toBeInTheDocument();
    expect(within(card).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Website Redesign",
      "Planner App",
      "Brand Refresh",
    ]);
  });

  it("Activity / Check-ins / Recognition: replies count only, team thanks only", async () => {
    const user = userEvent.setup();
    renderOverview();
    expect(await screen.findByText(/moved Icon set v2 to Review/)).toBeInTheDocument();
    const tabs = screen.getByRole("tablist", { name: "Team updates" });
    await user.click(await within(tabs).findByRole("tab", { name: /Check-ins/ }));
    expect(screen.getByText(/5 of 8 replied/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reply" })).toHaveAttribute("href", "/teams/design/check-ins");
    await user.click(within(tabs).getByRole("tab", { name: "Recognition" }));
    expect(screen.getByText("For the icon audit — 40 inconsistencies caught.")).toBeInTheDocument();
    expect(screen.queryByText("Clear acceptance criteria on quick add.")).not.toBeInTheDocument();
  });

  it("Viewer: status-only rows (no booking), no New task, viewer banner", async () => {
    renderOverview("state=read-only");
    const card = await screen.findByRole("region", { name: "People & workload" });
    await within(card).findByRole("radiogroup");
    expect(within(card).queryAllByRole("meter")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "New task" })).not.toBeInTheDocument();
    expect(screen.getByText("You’re a Viewer in this team · read only")).toBeInTheDocument();
  });
});
