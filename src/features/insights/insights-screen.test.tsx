import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createMockRepositories } from "@/data/mock";
import { DataProvider } from "@/data/provider";
import { DEFAULT_PLANNER_SETTINGS } from "@/features/planner-settings/planner-settings";
import { renderWithProviders } from "@/test/render";
import { routerReplace, setMockSearch } from "@/test/setup";
import { contextShares, inWeekOrder, insightsHref, parseInsightsPeriod, parseInsightsTab, sharePointsChange } from "./domain/insights";
import { InsightsScreen } from "./insights-screen";

type Options = Parameters<typeof renderWithProviders>[1] & { fixtures?: NonNullable<Parameters<typeof createMockRepositories>[0]>["fixtures"] };

function renderInsights(search = "", { fixtures, ...rest }: Options = {}) {
  setMockSearch(search);
  const repositories = createMockRepositories({ fixtures });
  return renderWithProviders(
    <DataProvider repositories={repositories}>
      <InsightsScreen />
    </DataProvider>,
    rest,
  );
}

describe("Insights rules (P15)", () => {
  it("parses params, builds pattern links and computes shares", () => {
    expect(parseInsightsTab("nope")).toBe("focus");
    expect(parseInsightsPeriod("3m")).toBe("3m");
    expect(insightsHref("focus")).toBe("/personal/insights?tab=focus");
    expect(insightsHref("time", "year")).toBe("/personal/insights?tab=time&period=year");
    const zero = { personal: 0, projects: 0, teams: 0, companies: 0, other: 0 };
    const shares = contextShares({ days: [{ weekday: 6, minutes: { ...zero, personal: 30, projects: 10 } }] });
    expect(shares.personal).toBe(0.75);
    expect(sharePointsChange(0.374, 0.34)).toBe(3);
    expect(inWeekOrder([{ weekday: 0 }, { weekday: 6 }], 6).map((day) => day.weekday)).toEqual([6, 0]);
  });
});

describe("InsightsScreen (P15)", () => {
  it("headline (one signature card, notch = Why this?) → three observations → Focus tab with the clock and an opt-in action", async () => {
    const user = userEvent.setup();
    const { container } = renderInsights();
    const headline = await screen.findByRole("region", { name: /best work at/ });
    expect(within(headline).getByRole("link", { name: "Plan around it" })).toHaveAttribute("href", "/personal/my-day");
    expect(container.querySelectorAll('[data-slot="signature-surface"]')).toHaveLength(1);
    await waitFor(() => expect(container.querySelector('[data-observation="time"]')).toHaveTextContent(/Personal took \d+% of your tracked time/));
    expect(container.querySelector('[data-observation="estimates"]')).toHaveTextContent("Design work takes 1.6× your estimates.");
    expect(await screen.findByRole("figure", { name: "Typical focus minutes by hour of the day" })).toBeInTheDocument();
    expect(screen.getByText(/is your strongest window/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Protect 09–12 in My Day" }));
    expect(await screen.findByRole("button", { name: "Turn off" })).toBeInTheDocument();
    expect(container.querySelector("[data-action=protected]")).toHaveTextContent("Protected · 09–12 stays free for focus in My Day");
    expect(screen.getByRole("link", { name: "Open My Day" })).toHaveAttribute("href", "/personal/my-day");
  });

  it("observation cards open their tab and sync the URL; the period switch keeps the tab", async () => {
    const user = userEvent.setup();
    renderInsights();
    await user.click(await screen.findByRole("button", { name: "Estimates tab" }));
    expect(routerReplace).toHaveBeenLastCalledWith("/personal/insights?tab=estimates", { scroll: false });
    expect(await screen.findByText("Do I underestimate some work?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Suggest +50% for new Design tasks" }));
    expect(await screen.findByText("Applied · new Design tasks plan with +50% duration.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage in Settings" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "3 months" }));
    expect(routerReplace).toHaveBeenLastCalledWith("/personal/insights?tab=estimates&period=3m", { scroll: false });
  });

  it("Time: the Context Ribbon with an emphasis legend", async () => {
    renderInsights("tab=time");
    expect(await screen.findByRole("figure", { name: /share of tracked time per day/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Projects/, pressed: false })).toBeInTheDocument();
  });

  it("Signals: layered chart and the focus ↔ mood observation", async () => {
    renderInsights("tab=signals");
    expect(await screen.findByRole("img", { name: /Mood, energy and focus/ })).toBeInTheDocument();
    expect(screen.getByText(/On days with 2h or more of focus, mood averages/)).toBeInTheDocument();
  });

  it("no data: explains what we look at; partial: progress and per-tab thresholds", async () => {
    const user = userEvent.setup();
    const empty = renderInsights("", { fixtures: { insights: { historyDays: 0 } } });
    expect(await screen.findByText("Not enough data yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "What do we look at?" }));
    expect(screen.getByText(/Focus sessions/)).toBeVisible();
    empty.unmount();

    const { container } = renderInsights("", { fixtures: { insights: { historyDays: 6 } } });
    expect(await screen.findByText("Collecting · 6 of 14 days")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="signature-surface"]')).toBeNull();
    expect(await screen.findByText("Focus patterns need 10 sessions.")).toBeInTheDocument();
  });

  it("an error stays in its tab and retries; hiding Habits removes its tab and card", async () => {
    const user = userEvent.setup();
    renderInsights("tab=signals", {
      fixtures: { insights: { failing: ["signals"] } },
      plannerSettings: { ...DEFAULT_PLANNER_SETTINGS, modules: { ...DEFAULT_PLANNER_SETTINGS.modules, habits: false } },
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn’t calculate");
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(screen.queryByRole("tab", { name: /Habits/ })).toBeNull();
    expect(screen.getByRole("tab", { name: /Time/ })).toBeInTheDocument();
  });
});
