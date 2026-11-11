import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { TeamGate } from "../team-gate";
import { TeamAnalyticsScreen } from "./team-analytics-screen";

function renderAnalytics(team = "design", search = "") {
  setMockPathname(`/teams/${team}/analytics`);
  setMockSearch(search);
  return renderWithProviders(
    <TeamGate>
      <TeamAnalyticsScreen />
    </TeamGate>,
  );
}

describe("TM-12 · Team analytics", () => {
  it("KPI tiles with source captions; planned vs done SVG with View as table; team-level only", async () => {
    const user = userEvent.setup();
    renderAnalytics();
    expect(await screen.findByText("Plan completion")).toBeInTheDocument();
    expect(screen.getByText("157 of 199 planned tasks done in 12 weeks")).toBeInTheDocument();
    expect(screen.getByText("avg booked ÷ capacity, all members")).toBeInTheDocument();
    const chart = screen.getByRole("region", { name: "Planned vs done per week" });
    expect(within(chart).getByRole("img")).toBeInTheDocument();
    await user.click(within(chart).getByRole("button", { name: "View as table" }));
    expect(within(chart).getByRole("rowheader", { name: /W42/ })).toBeInTheDocument();
    expect(screen.getByText("Team-level numbers only. No per-person performance.")).toBeInTheDocument();
    // Members: no export, no Other projects aggregate.
    expect(screen.queryByRole("button", { name: "Export snapshot" })).not.toBeInTheDocument();
    expect(screen.queryByText("Other projects")).not.toBeInTheDocument();
  });

  it("Lead: Other projects aggregate and Export snapshot", async () => {
    const user = userEvent.setup();
    renderAnalytics("mobile");
    expect(await screen.findByText("Other projects")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Export snapshot" }));
    expect(await screen.findByRole("dialog", { name: "Export snapshot" })).toBeInTheDocument();
    expect(screen.getByText("team metrics + weekly plan")).toBeInTheDocument();
  });
});
