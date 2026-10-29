import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createMockRepositories } from "@/data/mock";
import { DataProvider } from "@/data/provider";
import { DEFAULT_PLANNER_SETTINGS } from "@/features/planner-settings/planner-settings";
import { renderWithProviders } from "@/test/render";
import { OverviewScreen } from "./overview-screen";

function renderOverview(options: Parameters<typeof renderWithProviders>[1] & { now?: string; empty?: boolean } = {}) {
  const { now, empty, ...rest } = options;
  const repositories = createMockRepositories(
    empty ? { fixtures: { tasks: [], blocks: [], habits: [], goals: [], moods: [], finance: null, insight: null } } : {},
  );
  return renderWithProviders(
    <DataProvider repositories={repositories}>
      <OverviewScreen now={now} />
    </DataProvider>,
    rest,
  );
}

describe("OverviewScreen (P01)", () => {
  it("greets, shows the Today switch and the hero with its one notch action and ring", async () => {
    renderOverview();
    expect(screen.getByRole("heading", { level: 1, name: /Good afternoon/ })).toBeInTheDocument();
    const today = screen.getByRole("navigation", { name: "Today" });
    expect(within(today).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Open My Day" })).toBeInTheDocument();
    // 6/9 tasks + 3/5 habits = 64%.
    expect(await screen.findByRole("heading", { name: "On track for a normal Tuesday" })).toBeInTheDocument();
    expect(screen.getAllByText("64%").length).toBeGreaterThan(0);
  });

  it("puts the live block in the slot (the volt Now card) and lists Up next", async () => {
    renderOverview();
    await waitFor(() => expect(document.querySelector('[data-slot="live-slot"]')).toHaveAttribute("data-state", "live"));
    const upNext = screen.getByRole("region", { name: "Up next" });
    expect(await within(upNext).findByText("Client call")).toBeInTheDocument();
  });

  it("checks a habit in place and moves the count", async () => {
    renderOverview();
    const habits = screen.getByRole("region", { name: "Habits" });
    expect(await within(habits).findByText("3 of 5 today")).toBeInTheDocument();
    await userEvent.click(within(habits).getByRole("button", { name: "Read", pressed: false }));
    expect(await within(habits).findByText("4 of 5 today")).toBeInTheDocument();
    expect(within(habits).getByRole("group", { name: /Read: 12-day streak/ })).toBeInTheDocument();
  });

  it("removes the cards of hidden modules (no placeholder)", async () => {
    renderOverview({
      plannerSettings: {
        ...DEFAULT_PLANNER_SETTINGS,
        modules: { ...DEFAULT_PLANNER_SETTINGS.modules, habits: false, finance: false, goals: false },
      },
    });
    expect(await screen.findByRole("region", { name: "Mood" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Habits" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Finance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Goals" })).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="overview-modules"]')).toHaveClass("lg:grid-cols-2");
  });

  it("shows the evening shutdown suggestion after 18:00 and falls back when dismissed", async () => {
    renderOverview({ now: "2026-10-13T19:30:00+03:30" });
    expect(await screen.findByRole("link", { name: "Start" })).toHaveAttribute("href", "/personal/shutdown");
    const slot = document.querySelector<HTMLElement>("[data-slot=\"live-slot\"]")!;
    await userEvent.click(within(slot).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(document.querySelector('[data-slot="live-slot"]')).toHaveAttribute("data-state", "live"));
  });

  it("keeps a dismissed suggestion dismissed after a reload the same day", async () => {
    const first = renderOverview({ now: "2026-10-13T19:30:00+03:30" });
    await userEvent.click(await screen.findByRole("button", { name: "Later" }));
    first.unmount();
    renderOverview({ now: "2026-10-13T19:45:00+03:30" });
    await waitFor(() => expect(document.querySelector('[data-slot="live-slot"]')).toHaveAttribute("data-state", "live"));
    expect(screen.queryByRole("link", { name: "Start" })).not.toBeInTheDocument();
  });

  it("measures focus against the daily goal from planner settings", async () => {
    renderOverview({ plannerSettings: { ...DEFAULT_PLANNER_SETTINGS, focus: { ...DEFAULT_PLANNER_SETTINGS.focus, dailyGoalMinutes: 180 } } });
    expect(await screen.findByText(/goal 3h/)).toBeInTheDocument();
  });

  it("keeps today's mood out of the hero tile while the Journal is locked", async () => {
    const privacy = { ...DEFAULT_PLANNER_SETTINGS.privacy, journalLock: true };
    renderOverview({ plannerSettings: { ...DEFAULT_PLANNER_SETTINGS, privacy } });
    expect(await screen.findByText(/goal 4h/)).toBeInTheDocument();
    const tile = screen.getByText("Mood · energy").closest("div")!;
    await waitFor(() => expect(tile).toHaveTextContent("Journal is locked"));
    expect(tile).not.toHaveTextContent(/Good|Medium energy/);
  });

  it("offers the first-run card and its 3-step tour with no data", async () => {
    renderOverview({ empty: true });
    expect(await screen.findByRole("heading", { name: "Start with My Day, Tasks and Calendar." })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Take 3-step tour" }));
    expect(screen.getByText("Tour · 1 of 3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Tour · 3 of 3")).toBeInTheDocument();
  });

  it("renders Persian with Persian digits", async () => {
    renderOverview({ preferences: { locale: "fa", direction: "rtl", digits: "fa" } });
    expect(screen.getByRole("heading", { level: 1, name: /عصر بخیر/ })).toBeInTheDocument();
    expect(await screen.findByText("۳ از ۵ امروز")).toBeInTheDocument();
  });
});
