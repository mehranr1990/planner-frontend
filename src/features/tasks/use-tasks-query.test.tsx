import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/app/providers";
import { DEFAULT_PLANNER_SETTINGS } from "@/features/planner-settings/planner-settings";
import { testPreferences } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { COMPLETION_HOLD_MS } from "./domain/completion";
import { TasksProvider, useTasksState, type TasksProviderProps } from "./tasks-context";
import { useCompletionLifecycle } from "./use-completion";
import { useTasksQuery } from "./use-tasks-query";
import { useTodayProgress } from "./use-today-progress";

function setup(props: Partial<TasksProviderProps> = {}, search = "") {
  setMockPathname("/personal/tasks");
  setMockSearch(search);
  return renderHook(() => ({ state: useTasksState(), query: useTasksQuery(), progress: useTodayProgress() }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <Providers preferences={testPreferences} plannerSettings={DEFAULT_PLANNER_SETTINGS}>
        <TasksProvider {...({ syncUrl: false, ...props, children } as TasksProviderProps)} />
      </Providers>
    ),
  });
}

const ready = (result: { current: { query: { isPending: boolean } } }) => waitFor(() => expect(result.current.query.isPending).toBe(false));

describe("useTasksQuery", () => {
  it("serves the Today list grouped by time of day, with the badges", async () => {
    const { result } = setup();
    expect(result.current.query.isPending).toBe(true);
    await ready(result);
    const { groups, counts, totalCounts, orderedIds, isFiltered } = result.current.query;
    expect(groups.map((group) => group.id)).toEqual(["overdue", "morning", "afternoon", "evening", "unscheduled"]);
    expect(orderedIds).toHaveLength(9);
    expect(counts).toEqual({ today: 9, upcoming: 7, all: 28, completed: 9 });
    expect(totalCounts).toEqual(counts);
    expect(isFiltered).toBe(false);
    expect(result.current.query.query).toEqual({ view: "today", day: "2026-10-13", sort: "smart" });
  });

  it("Upcoming groups by date with the weekend marker; Completed by completion day; All by area", async () => {
    const upcoming = setup({ initial: { tab: "upcoming" } });
    await ready(upcoming.result);
    expect(upcoming.result.current.query.groups.map((group) => group.id)).toEqual([
      "date:2026-10-14",
      "date:2026-10-15",
      "date:2026-10-16",
      "date:2026-10-17",
    ]);
    const completed = setup({ initial: { tab: "completed" } });
    await ready(completed.result);
    expect(completed.result.current.query.groups.map((group) => [group.day, group.count])).toEqual([
      ["2026-10-13", 2],
      ["2026-10-12", 4],
      ["2026-10-11", 2],
      ["2026-10-10", 1],
    ]);
    const all = setup({ initial: { tab: "all" } });
    await ready(all.result);
    expect(all.result.current.query.groups[0]!.id).toBe("area:finance");
  });

  it("a chosen grouping overrides the default; board-only groupings give no list groups", async () => {
    const byPriority = setup({ initial: { group: "priority" } });
    await ready(byPriority.result);
    expect(byPriority.result.current.query.groups[0]!.id).toBe("priority:high");
    const board = setup({ initial: { layout: "board" } });
    await ready(board.result);
    expect(board.result.current.query.groups).toEqual([]);
    // The board spans every horizon: it reads the "all" view.
    expect(board.result.current.query.query.view).toBe("all");
    expect(board.result.current.query.tasks).toHaveLength(28);
  });

  it("filters and search narrow the list and the badges, and mark the list filtered", async () => {
    const { result } = setup({ initial: { filters: { areaIds: ["personal"], energies: ["low", "medium"] } } });
    await ready(result);
    expect(result.current.query.tasks.map((task) => task.id)).toEqual(["t-check-in-notes", "t-plan-weekend-trip"]);
    expect(result.current.query.counts).toMatchObject({ today: 2 });
    expect(result.current.query.totalCounts).toMatchObject({ today: 9 });
    expect(result.current.query.isFiltered).toBe(true);

    act(() => {
      result.current.state.clearFilters();
      result.current.state.setQ("katy");
    });
    await waitFor(() => expect(result.current.query.tasks.map((task) => task.id)).toEqual(["t-reply-katy-brief"]));
  });

  it("keeps the previous rows while a changed query loads", async () => {
    const { result } = setup();
    await ready(result);
    act(() => result.current.state.setSort("priority"));
    expect(result.current.query.isPending).toBe(false);
    expect(result.current.query.tasks.length).toBeGreaterThan(0);
  });

  it("prunes selected ids that are not in the list", async () => {
    const { result } = setup({ initialSelection: ["t-ui-design", "t-sort-photo-backups"] });
    await waitFor(() => expect(result.current.state.selectedIds).toEqual(["t-ui-design"]));
  });

  it("reads the board's progress: Today view, unaffected by filters", async () => {
    const { result } = setup({ initial: { filters: { areaIds: ["health"] } } });
    await waitFor(() => expect(result.current.progress).toBeDefined());
    expect(result.current.progress).toMatchObject({ total: 9, done: 2, open: 7 });
  });
});

describe("useCompletionLifecycle", () => {
  afterEach(() => vi.useRealTimers());

  it("holds a completed row for 1.2s then collapses it; reopen cancels", () => {
    vi.useFakeTimers();
    let clock = 0;
    const { result } = renderHook(() => useCompletionLifecycle(() => clock));
    act(() => result.current.complete("a"));
    expect(result.current.phase("a")).toBe("holding");
    clock = COMPLETION_HOLD_MS - 1;
    act(() => vi.advanceTimersByTime(COMPLETION_HOLD_MS - 1));
    expect(result.current.phase("a")).toBe("holding");
    clock = COMPLETION_HOLD_MS;
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.phase("a")).toBe("collapsed");

    act(() => result.current.reopen("a"));
    expect(result.current.phase("a")).toBe("none");

    clock = 5000;
    act(() => result.current.complete("b"));
    act(() => result.current.reopen("b"));
    clock = 9000;
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.phase("b")).toBe("none");
  });
});
