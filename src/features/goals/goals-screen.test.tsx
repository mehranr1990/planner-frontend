import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createMockRepositories } from "@/data/mock";
import { DataProvider } from "@/data/provider";
import { preferencesForLocale } from "@/features/preferences/preferences-store";
import { renderWithProviders } from "@/test/render";
import { routerPush, setMockSearch } from "@/test/setup";
import { activeList, defaultTab, milestoneState } from "./domain/goals";
import { GoalsScreen } from "./goals-screen";

function renderGoals(goalId: string | null, options: Parameters<typeof renderWithProviders>[1] & { empty?: boolean } = {}) {
  const { empty, ...rest } = options;
  const repositories = createMockRepositories(empty ? { fixtures: { goals: [] } } : {});
  const view = renderWithProviders(
    <DataProvider repositories={repositories}>
      <GoalsScreen goalId={goalId} />
    </DataProvider>,
    rest,
  );
  return { ...view, repositories };
}

describe("goal rules (P11)", () => {
  it("keeps recently completed goals under Active, picks the default tab and flags late milestones", async () => {
    const { goals } = createMockRepositories();
    const fund = (await goals.get("g-emergency-fund"))!;
    expect(milestoneState(fund, fund.milestones![1]!, "2026-10-13")).toBe("late");
    expect(milestoneState(fund, fund.milestones![2]!, "2026-10-13")).toBe("next");
    const done = { ...fund, lifecycle: "completed" as const, completedDay: "2026-10-12" };
    expect(activeList([], [done], "2026-10-13")).toHaveLength(1);
    expect(activeList([], [done], "2026-10-20")).toHaveLength(0);
    expect(defaultTab({ ...fund, milestones: [], keyResults: [{ id: "k", title: "K", current: 1, target: 2 }] })).toBe("results");
  });
});

describe("GoalsScreen (P11)", () => {
  it("lists active goals as cards with number + bar and shows the selected goal's journey", async () => {
    renderGoals("g-launch-planner-v1");
    const list = await screen.findByRole("list", { name: "Goals" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(within(list).getByRole("link", { name: "Launch Planner v1" })).toHaveAttribute("aria-current", "page");
    expect(within(list).getByText("Behind by 3 days")).toBeInTheDocument();
    // One signature card: the selected goal, its notch holding Edit.
    expect(await screen.findByRole("button", { name: "Edit goal" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Journey 5 milestones/, selected: true })).toBeInTheDocument();
    // Phones get the vertical path.
    const path = screen.getByRole("list", { name: "Milestone path of Launch Planner v1" });
    expect(within(path).getByRole("button", { name: /Development/, pressed: true })).toBeInTheDocument();
    expect(screen.getByText(/Next milestone/)).toHaveTextContent("Next milestone · Beta");
  });

  it("Plan next step creates a task linked to the goal", async () => {
    const user = userEvent.setup();
    const { repositories } = renderGoals("g-launch-planner-v1");
    const before = (await repositories.goals.tasks("g-launch-planner-v1")).length;
    await user.click(await screen.findByRole("button", { name: "Plan next step" }));
    await waitFor(async () => expect(await repositories.goals.tasks("g-launch-planner-v1")).toHaveLength(before + 1));
    const tasks = await repositories.goals.tasks("g-launch-planner-v1");
    expect(tasks.some((task) => task.title === "50 beta users" && task.deadline === "2026-11-11")).toBe(true);
  });

  it("shows the delayed state with a suggestion and the simple number + bar goal", async () => {
    const { unmount } = renderGoals("g-emergency-fund");
    expect(await screen.findByText(/Suggested:/)).toHaveTextContent("Suggested: Add 2M transfer on 1 Aban");
    expect(screen.getByRole("button", { name: "Adjust deadline" })).toBeInTheDocument();
    unmount();
    renderGoals("g-run-100km");
    expect(await screen.findByText("of 100 km · 9 days left")).toBeInTheDocument();
  });

  it("opens Key results and Linked from ?tab=", async () => {
    setMockSearch("tab=results");
    const { unmount } = renderGoals("g-launch-planner-v1");
    expect(await screen.findByText("Beta testers signed up")).toBeInTheDocument();
    unmount();
    setMockSearch("tab=linked");
    renderGoals("g-launch-planner-v1");
    expect(await screen.findByText("Budget · launch costs")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Show all in Tasks" })).toBeInTheDocument();
  });

  it("shows the empty state, which opens the Goal sheet", async () => {
    const user = userEvent.setup();
    renderGoals(null, { empty: true });
    expect(await screen.findByRole("heading", { name: "No goals yet" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create a goal" }));
    expect(routerPush).toHaveBeenCalledWith(expect.stringContaining("sheet=goal"), { scroll: false });
  });

  it("speaks Persian with Persian digits in RTL", async () => {
    renderGoals("g-launch-planner-v1", { preferences: preferencesForLocale("fa") });
    expect(await screen.findByRole("heading", { level: 1, name: "هدف‌ها" })).toBeInTheDocument();
    expect((await screen.findAllByText("۶۴٪")).length).toBeGreaterThan(0);
  });
});
