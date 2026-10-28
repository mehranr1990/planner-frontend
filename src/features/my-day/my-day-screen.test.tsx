import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { createMockRepositories } from "@/data/mock";
import { DataProvider } from "@/data/provider";
import type { Preferences } from "@/features/preferences/preferences-store";
import { myDayStateFixtures, myDayStateNow, type MyDayState } from "@/fixtures/personal/my-day-states";
import { renderWithProviders } from "@/test/render";
import { routerPush } from "@/test/setup";
import { MyDayScreen, type MyDayDemoOptions } from "./my-day-screen";
import { mockViewport, persian } from "./states/test-utils";

/*
 * The assembled screen on the demo states: composition per breakpoint, the
 * three Signature cards, the clock override and Reschedule on mount. The
 * pieces have their own tests; this checks they are put together right.
 */

afterEach(() => resetToasts());

function renderScreen(state: MyDayState = "normal", demo: MyDayDemoOptions = {}, preferences: Partial<Preferences> = {}) {
  const repositories = createMockRepositories({ fixtures: myDayStateFixtures(state) });
  return renderWithProviders(
    <DataProvider repositories={repositories}>
      <MyDayScreen demo={{ now: myDayStateNow(state), ...demo }} />
    </DataProvider>,
    { preferences },
  );
}

const signatureCards = (root: ParentNode = document) => root.querySelectorAll("[data-slot=signature-surface]");
const rail = () => document.querySelector<HTMLElement>('[data-slot="my-day-rail"]')!;
const timelineBlocks = () => document.querySelectorAll('[data-slot="time-block"]');

describe("MyDayScreen · desktop", () => {
  beforeEach(() => mockViewport("desktop"));

  it("is the board: header, timeline | right rail (Now · Focus · Priorities · Unscheduled)", async () => {
    renderScreen();
    expect(screen.getByRole("heading", { level: 1, name: "My Day" })).toBeInTheDocument();
    await waitFor(() => expect(timelineBlocks()).toHaveLength(7));

    // Now · Focus · Priorities · Unscheduled, in this order.
    await within(rail()).findByRole("heading", { level: 2, name: "UI design · My Day screen" });
    const headings = within(rail())
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(["UI design · My Day screen", "Focus · Pomodoro", "Priorities", "Unscheduled"]);
    expect(screen.getByRole("heading", { level: 2, name: "Timeline" })).toBeInTheDocument();
    // Header controls of the board.
    expect(screen.getByRole("radiogroup", { name: "Energy today" })).toBeInTheDocument();
    expect(await screen.findByText("6h 15m of 8h planned")).toBeInTheDocument();
  });

  it("has exactly three Signature cards: Timeline, Now and Focus", async () => {
    renderScreen();
    await waitFor(() => expect(timelineBlocks()).toHaveLength(7));
    expect(signatureCards()).toHaveLength(3);
    expect(signatureCards(rail())).toHaveLength(2);
    // Each notch holds its one primary action.
    expect(screen.getByRole("button", { name: "Add block" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Mark done" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Start focus" })).toBeInTheDocument();
  });

  it("Start focus on the Now card links to the running task", async () => {
    renderScreen();
    const link = await screen.findByRole("link", { name: "Start focus · 25m" });
    expect(link).toHaveAttribute("href", "/personal/focus?task=t-ui-design");
  });

  it("Add block opens the quick-add sheet route", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(timelineBlocks()).toHaveLength(7));
    await user.click(screen.getByRole("button", { name: "Add block" }));
    expect(routerPush).toHaveBeenCalledWith(expect.stringContaining("sheet=quick-add"), expect.anything());
  });

  it("an overloaded day shows the overload bar and Move 2 opens Reschedule on Tomorrow", async () => {
    const user = userEvent.setup();
    renderScreen("overloaded");
    await waitFor(() => expect(timelineBlocks().length).toBeGreaterThan(0));
    // The desktop bar sits in the timeline card; the phone row is the same component, hidden by CSS from lg.
    const buttons = await screen.findAllByRole("button", { name: "Move 2 to tomorrow" });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Move 2 blocks" });
    expect(within(dialog).getByRole("menuitem", { name: /Tomorrow/ })).toBeInTheDocument();
  });

  it("an empty day shows the empty state instead of the grid, with the day's own numbers", async () => {
    renderScreen("empty");
    expect(await screen.findByRole("heading", { name: "Nothing planned yet" })).toBeInTheDocument();
    expect(timelineBlocks()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Pick top 3" })).toBeInTheDocument();
  });

  it("after hours: the injected clock leaves nothing running (no volt Now card, no Now chip)", async () => {
    renderScreen("after-hours");
    await waitFor(() => expect(timelineBlocks()).toHaveLength(7));
    expect(screen.queryByRole("button", { name: "Mark done" })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Now · /)).not.toBeInTheDocument();
    const card = within(rail()).getByRole("region", { name: "Now" });
    expect(card.querySelector("[data-slot=signature-surface]")?.className).not.toContain("bg-volt");
  });

  it("opens Reschedule on mount for a block (the demo's ?reschedule=)", async () => {
    renderScreen("normal", { initialReschedule: { target: { kind: "block", id: "client-call" } } });
    const dialog = await screen.findByRole("dialog", { name: "Reschedule “Client call”" });
    // An event has no task to send back to Unscheduled.
    expect(within(dialog).getByRole("menuitem", { name: /Tomorrow/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole("menuitem", { name: /Back to Unscheduled/ })).not.toBeInTheDocument();
  });
});

describe("MyDayScreen · below lg (PM01 Today · Plan)", () => {
  beforeEach(() => mockViewport("mobile"));

  it("is the phone screen: title, Overview ⇄ Plan switch, plain timeline card, collapsed tray", async () => {
    renderScreen();
    expect(screen.getByRole("heading", { level: 1, name: "My Day" })).toBeInTheDocument();
    await waitFor(() => expect(timelineBlocks()).toHaveLength(7));

    const today = screen.getByRole("navigation", { name: "Today" });
    expect(within(today).getByRole("link", { name: "Plan" })).toHaveAttribute("aria-current", "page");
    expect(within(today).getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/personal");

    // The timeline is a plain card here (no notch, no Add block): the Signature cards left in the
    // DOM are the rail's, which CSS hides below lg.
    expect(rail()).toHaveClass("hidden", "lg:flex");
    expect(signatureCards()).toHaveLength(signatureCards(rail()).length);
    expect(screen.queryByRole("button", { name: "Add block" })).not.toBeInTheDocument();

    const tray = screen.getByRole("button", { name: /Unscheduled · 4/ });
    expect(tray).toHaveAttribute("aria-expanded", "false");
  });

  it("every layout box can shrink (no horizontal scroll source at 390)", async () => {
    renderScreen();
    await waitFor(() => expect(timelineBlocks()).toHaveLength(7));
    expect(document.querySelector('[data-screen="my-day"]')).toHaveClass("min-w-0");
    expect(rail()).toHaveClass("min-w-0");
  });
});

describe("MyDayScreen · Persian", () => {
  beforeEach(() => mockViewport("desktop"));

  it("renders in Persian with the same structure", async () => {
    renderScreen("normal", {}, persian);
    expect(await screen.findByRole("heading", { level: 1, name: "روز من" })).toBeInTheDocument();
    await waitFor(() => expect(timelineBlocks()).toHaveLength(7));
    expect(signatureCards()).toHaveLength(3);
  });
});
