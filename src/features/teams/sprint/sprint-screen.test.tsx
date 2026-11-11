import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { burndownOf, sprintDays } from "@/data/mock/mock-team-sprints";
import { renderWithProviders } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { TeamPlanningRoute } from "../planning/planning-route";
import { TeamGate } from "../team-gate";

function renderRoute(team: string, search = "") {
  setMockPathname(`/teams/${team}/planning`);
  setMockSearch(search);
  return renderWithProviders(
    <TeamGate>
      <TeamPlanningRoute />
    </TeamGate>,
  );
}

afterEach(() => resetToasts());

beforeAll(() => {
  // jsdom lacks the pointer-capture and scrolling APIs Radix Select calls.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

describe("TM-05 model", () => {
  it("counts Sat–Wed working days and burns down by completion day", () => {
    const days = sprintDays("2026-10-06", "2026-10-19");
    expect(days).toHaveLength(10);
    const burn = burndownOf(
      [
        {
          taskId: "a",
          title: "a",
          source: { kind: "team" },
          status: "done",
          estimate: 3,
          assignee: null,
          completedOn: "2026-10-11",
        },
        { taskId: "b", title: "b", source: { kind: "team" }, status: "todo", estimate: 5, assignee: null },
      ],
      days,
      "2026-10-13",
    );
    expect(burn.map((point) => point.remaining)).toEqual([8, 8, 8, 5, 5, 5]);
  });
});

describe("TM-05 · Sprint & backlog", () => {
  it("weekly teams show “This team plans weekly” on sprint tabs", async () => {
    renderRoute("design", "tab=sprint");
    expect(await screen.findByText("This team plans weekly")).toBeInTheDocument();
    // Members have no Settings module: no Open settings.
    expect(screen.queryByRole("button", { name: "Open settings" })).not.toBeInTheDocument();
  });

  it("shows the ranked backlog (openable projects only) and the sprint card with burndown", async () => {
    renderRoute("mobile");
    const sprint = (await screen.findByRole("heading", { name: /Make the PWA feel native/ })).closest("section")!;
    expect(within(sprint).getByText("Sprint 14 · day 6 of 10")).toBeInTheDocument();
    expect(within(sprint).getByRole("img", { name: /^Burndown: 18 pt remaining of 26 pt/ })).toBeInTheDocument();
    expect(within(sprint).getByRole("button", { name: "Complete sprint" })).toBeInTheDocument();
    const backlog = screen.getByRole("region", { name: "Backlog" });
    expect(await within(backlog).findByText("Deep links to tasks")).toBeInTheDocument();
    expect(within(backlog).getByText("Mobile Onboarding")).toBeInTheDocument();
    expect(within(backlog).queryByText("SDK crash reporter")).not.toBeInTheDocument();
    expect(within(backlog).getByRole("button", { name: "Move Offline banner for PWA" })).toBeInTheDocument();
  });

  it("Complete → items to next sprint or backlog → review; then Start the next sprint", async () => {
    const user = userEvent.setup();
    renderRoute("mobile");
    await user.click(await screen.findByRole("button", { name: "Complete sprint" }));
    const dialog = await screen.findByRole("dialog", { name: "Complete sprint 14" });
    expect(within(dialog).getByText("4 unfinished items:")).toBeInTheDocument();
    within(dialog).getByRole("combobox", { name: "Where Pull to refresh goes" }).focus();
    await user.keyboard("{Enter}");
    const option = await screen.findByRole("option", { name: "Backlog" });
    act(() => option.focus());
    await user.keyboard("{Enter}");
    await user.click(within(dialog).getByRole("button", { name: "Complete & open review" }));
    expect(await screen.findByText("Sprint 14 completed")).toBeInTheDocument();
    expect(await screen.findByText("Make the PWA feel native")).toBeInTheDocument();
    expect(screen.getByText("3 to the next sprint · 1 to backlog")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Sprint 15" }));
    await user.click(await screen.findByRole("button", { name: "Start sprint" }));
    const start = await screen.findByRole("dialog", { name: "Start sprint 15" });
    expect(within(start).getByText(/^Committed 16 pt · capacity 30 pt/)).toBeInTheDocument();
    await user.type(within(start).getByRole("textbox", { name: "Goal" }), "Widgets & deep links");
    await user.click(within(start).getByRole("button", { name: "Start sprint" }));
    expect(await screen.findByText("Sprint 15 started")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: /Widgets & deep links/ })).toBeInTheDocument());
  });
});
