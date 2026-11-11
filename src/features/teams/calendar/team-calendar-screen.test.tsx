import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import type { TeamEventDetail } from "@/data/team-domain";
import { renderWithProviders } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { TeamGate } from "../team-gate";
import { hourWindow, itemsByDay, pickEvent, rsvpCounts, TEAM_CAL_LAYERS } from "./calendar-model";
import { TeamCalendarScreen } from "./team-calendar-screen";

function renderCalendar(team = "design", search = "view=week") {
  setMockPathname(`/teams/${team}/calendar`);
  setMockSearch(search);
  return renderWithProviders(
    <TeamGate>
      <TeamCalendarScreen />
    </TeamGate>,
  );
}

afterEach(() => resetToasts());

const meeting = (id: string, extra: Partial<TeamEventDetail> = {}): TeamEventDetail => ({
  id,
  title: id,
  kind: "meeting",
  day: "2026-10-11",
  time: "14:00",
  end: "15:30",
  organiser: null,
  invitees: [],
  agenda: [],
  url: null,
  myRsvp: null,
  can: { edit: false, rsvp: true },
  ...extra,
});

describe("TM-03 model", () => {
  it("filters layers, widens the hour window and counts RSVPs", () => {
    const late = meeting("late", { time: "19:00", end: null });
    const off = meeting("off", { kind: "time-off", time: null, end: null });
    const map = itemsByDay([late, off], [], new Set(TEAM_CAL_LAYERS.filter((layer) => layer !== "timeOff")));
    expect(map.get("2026-10-11")?.map((item) => ("event" in item ? item.event.id : ""))).toEqual(["late"]);
    expect(hourWindow(map.get("2026-10-11")!)).toEqual({ from: 9 * 60, to: 20 * 60 });
    const person = { id: "a", name: "A", initials: "A" };
    expect(
      rsvpCounts(meeting("m", { invitees: [{ person, rsvp: "going" }, { person, rsvp: null }, { person, rsvp: "maybe" }] })),
    ).toEqual({ going: 1, maybe: 1, no: 0, none: 1 });
    expect(pickEvent([late, meeting("agenda", { agenda: [{ id: "x", title: "x", owner: null, minutes: 5 }] })], null)?.id).toBe(
      "agenda",
    );
    expect(pickEvent([late], "late")?.id).toBe("late");
  });
});

describe("TM-03 · Team calendar", () => {
  it("shows the team layers and the event Signature card (notch = Open meeting link, agenda, RSVP)", async () => {
    renderCalendar();
    const card = (await screen.findByRole("heading", { name: "Critique" })).closest("section")!;
    expect(within(card).getByRole("button", { name: "Open meeting link" })).toBeInTheDocument();
    expect(within(card).getByText("Onboarding variants (Amélie L.)")).toBeInTheDocument();
    expect(within(card).getByText("6 going · 1 maybe · 1 no reply")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Team events" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Nina T. · time off" })).toBeInTheDocument();
    // Project events only from projects the viewer can open (partner-portal: no grant).
    expect(screen.getByRole("link", { name: /^Client call, Website Redesign/ })).toBeInTheDocument();
    expect(screen.queryByText("Partner sync")).not.toBeInTheDocument();
  });

  it("RSVP saves my answer", async () => {
    const user = userEvent.setup();
    renderCalendar();
    const group = await screen.findByRole("group", { name: "Your answer" });
    await user.click(within(group).getByRole("button", { name: "Going" }));
    await waitFor(() => expect(within(group).getByRole("button", { name: "Going" })).toHaveAttribute("aria-pressed", "true"));
    expect(await screen.findByText("7 going · 1 maybe · 0 no reply")).toBeInTheDocument();
  });

  it("keeps My personal busy off by default; on overlays untitled slots", async () => {
    const user = userEvent.setup();
    const { container } = renderCalendar();
    const busy = await screen.findByRole("button", { name: "My personal busy · off" });
    expect(container.querySelector("[data-busy]")).toBeNull();
    await user.click(busy);
    await waitFor(() => expect(container.querySelector("[data-busy]")).not.toBeNull());
  });

  it("selecting an event without a link: organiser gets Edit event, others Copy event link", async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(await screen.findByRole("button", { name: /^Workshop/ }));
    expect(await screen.findByRole("button", { name: "Edit event" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Planning/ }));
    expect(await screen.findByRole("button", { name: "Copy event link" })).toBeInTheDocument();
  });

  it("adds a team event; Viewers cannot", async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(await screen.findByRole("button", { name: "Team event" }));
    const dialog = await screen.findByRole("dialog", { name: "New team event" });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByText("Add a title")).toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox", { name: "Title" }), "Design sync");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Event added")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^Design sync/ })).toBeInTheDocument();
  });

  it("Viewers see the calendar without Team event", async () => {
    renderCalendar("growth");
    await screen.findByRole("heading", { name: "Experiment review" });
    expect(screen.queryByRole("button", { name: "Team event" })).not.toBeInTheDocument();
  });
});
