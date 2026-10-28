import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/app/providers";
import { DEFAULT_PLANNER_SETTINGS } from "@/features/planner-settings/planner-settings";
import { testPreferences } from "@/test/render";
import { routerReplace, setMockPathname, setMockSearch } from "@/test/setup";
import { SEARCH_URL_DEBOUNCE_MS, TasksProvider, useTasksState, type TasksProviderProps } from "./tasks-context";

const TODAY = "2026-10-13";

function setup(props: Partial<TasksProviderProps> = {}, search = "") {
  setMockPathname("/personal/tasks");
  setMockSearch(search);
  return renderHook(() => useTasksState(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <Providers preferences={testPreferences} plannerSettings={DEFAULT_PLANNER_SETTINGS}>
        <TasksProvider {...({ ...props, children } as TasksProviderProps)} />
      </Providers>
    ),
  });
}

describe("TasksProvider (URL synced)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts on the defaults: list, Today, grouped by time of day, smart sort", () => {
    const { result } = setup();
    expect(result.current).toMatchObject({
      today: TODAY,
      layout: "list",
      tab: "today",
      group: null,
      effectiveGroup: "time",
      sort: "smart",
      q: "",
      filters: {},
      selectedIds: [],
      expandedId: null,
      focusedId: null,
    });
  });

  it("reads every documented param", () => {
    const { result } = setup({}, "view=board&tab=all&group=status&sort=manual&q=rent&area=home&energy=low&energy=medium");
    expect(result.current).toMatchObject({
      layout: "board",
      tab: "all",
      group: "status",
      effectiveGroup: "status",
      sort: "manual",
      q: "rent",
      filters: { areaIds: ["home"], energies: ["low", "medium"] },
    });
  });

  it("loads the older board link ?view=board&group=horizon", () => {
    const { result } = setup({}, "view=board&group=horizon");
    expect(result.current).toMatchObject({ layout: "board", group: "horizon", effectiveGroup: "horizon" });
  });

  it("Upcoming groups by date, All by area, Completed by day, unless a group was chosen", () => {
    expect(setup({}, "tab=upcoming").result.current.effectiveGroup).toBe("date");
    expect(setup({}, "tab=all").result.current.effectiveGroup).toBe("area");
    expect(setup({}, "tab=completed").result.current.effectiveGroup).toBe("date");
    expect(setup({}, "tab=upcoming&group=priority").result.current.effectiveGroup).toBe("priority");
  });

  it("follows the URL when it changes under it", () => {
    const { result, rerender } = setup();
    setMockSearch("tab=completed&q=bill");
    rerender();
    expect(result.current).toMatchObject({ tab: "completed", q: "bill" });
    setMockSearch("");
    rerender();
    expect(result.current).toMatchObject({ tab: "today", q: "" });
  });

  it("changes update at once and write only non-defaults with router.replace, keeping other params", () => {
    const { result } = setup({}, "sheet=quick-add");
    act(() => result.current.setTab("upcoming"));
    expect(result.current.tab).toBe("upcoming");
    expect(routerReplace).toHaveBeenLastCalledWith("/personal/tasks?sheet=quick-add&tab=upcoming", { scroll: false });
    act(() => result.current.setSort("priority"));
    expect(routerReplace).toHaveBeenLastCalledWith("/personal/tasks?sheet=quick-add&tab=upcoming&sort=priority", { scroll: false });
    act(() => result.current.setGroup("area"));
    expect(routerReplace).toHaveBeenLastCalledWith(expect.stringContaining("group=area"), { scroll: false });
    act(() => {
      result.current.setTab("today");
      result.current.setSort("smart");
      result.current.setGroup(null);
    });
    expect(routerReplace).toHaveBeenLastCalledWith("/personal/tasks?sheet=quick-add", { scroll: false });
  });

  it("filters write as readable params, and clear removes them", () => {
    const { result } = setup();
    act(() => result.current.setFilters((current) => ({ ...current, areaIds: ["personal", "health"] })));
    act(() => result.current.setFilters((current) => ({ ...current, energies: ["low", "medium"] })));
    expect(result.current.filters).toEqual({ areaIds: ["personal", "health"], energies: ["low", "medium"] });
    expect(routerReplace).toHaveBeenLastCalledWith(
      "/personal/tasks?area=health&area=personal&energy=low&energy=medium",
      { scroll: false },
    );
    act(() => result.current.clearFilters());
    expect(result.current.filters).toEqual({});
    expect(routerReplace).toHaveBeenLastCalledWith("/personal/tasks", { scroll: false });
  });

  it("typing updates search at once and writes the URL after a pause", () => {
    const { result } = setup();
    act(() => result.current.setQ("r"));
    act(() => result.current.setQ("re"));
    act(() => result.current.setQ("rent"));
    expect(result.current.q).toBe("rent");
    expect(routerReplace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(SEARCH_URL_DEBOUNCE_MS));
    expect(routerReplace).toHaveBeenCalledTimes(1);
    expect(routerReplace).toHaveBeenCalledWith("/personal/tasks?q=rent", { scroll: false });
  });

  it("the URL echoing an older search does not undo newer typing", () => {
    const { result, rerender } = setup();
    act(() => result.current.setQ("re"));
    act(() => vi.advanceTimersByTime(SEARCH_URL_DEBOUNCE_MS));
    act(() => result.current.setQ("rent"));
    // The echo of the first write arrives while the person has typed on.
    setMockSearch("q=re");
    rerender();
    expect(result.current.q).toBe("rent");
    // An outside navigation to another search is adopted.
    setMockSearch("q=gym");
    rerender();
    expect(result.current.q).toBe("gym");
  });

  it("changing tab or layout clears the selection and the inline editor; same value is a no-op", () => {
    const { result } = setup();
    act(() => {
      result.current.toggleSelected("a");
      result.current.setExpandedId("b");
    });
    act(() => result.current.setTab("today"));
    expect(result.current.selectedIds).toEqual(["a"]);
    expect(routerReplace).not.toHaveBeenCalled();
    act(() => result.current.setTab("all"));
    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.expandedId).toBeNull();
    act(() => result.current.toggleSelected("a"));
    act(() => result.current.setLayout("board"));
    expect(result.current.selectedIds).toEqual([]);
    expect(routerReplace).toHaveBeenLastCalledWith("/personal/tasks?view=board&tab=all", { scroll: false });
  });
});

describe("TasksProvider (local)", () => {
  it("does not touch the URL and takes its initial state", () => {
    const { result } = setup({ syncUrl: false, initial: { tab: "upcoming", filters: { recurring: true } }, today: "2026-01-01" });
    expect(result.current).toMatchObject({ today: "2026-01-01", tab: "upcoming", effectiveGroup: "date", filters: { recurring: true } });
    act(() => {
      result.current.setTab("all");
      result.current.setQ("x");
    });
    expect(result.current).toMatchObject({ tab: "all", q: "x" });
    expect(routerReplace).not.toHaveBeenCalled();
  });
});

describe("TasksProvider · selection, rows and groups", () => {
  const visible = ["a", "b", "c", "d"];

  it("selects with the pointer rule: ⇧ ranges, others toggle; ⌘A adds a group; Esc-style clear", () => {
    const { result } = setup({ syncUrl: false });
    act(() => result.current.select("a", visible));
    act(() => result.current.select("c", visible, { shiftKey: true }));
    expect(result.current.selectedIds).toEqual(["a", "b", "c"]);
    expect(result.current.isSelected("b")).toBe(true);
    act(() => result.current.select("b", visible, { metaKey: true }));
    expect(result.current.selectedIds).toEqual(["a", "c"]);
    act(() => result.current.selectAll(["c", "d"]));
    expect(result.current.selectedIds).toEqual(["a", "c", "d"]);
    act(() => result.current.clearSelection());
    expect(result.current.selectedIds).toEqual([]);
  });

  it("prunes ids that left the data", () => {
    const { result } = setup({ syncUrl: false, initialSelection: ["a", "b", "z"] });
    act(() => result.current.pruneSelection(new Set(["a", "b"])));
    expect(result.current.selectedIds).toEqual(["a", "b"]);
  });

  it("tracks the expanded and focused rows", () => {
    const { result } = setup({ syncUrl: false });
    act(() => {
      result.current.setExpandedId("t1");
      result.current.setFocusedId("t2");
    });
    expect(result.current).toMatchObject({ expandedId: "t1", focusedId: "t2" });
  });

  it("collapses groups, honouring a group's default", () => {
    const { result } = setup({ syncUrl: false });
    expect(result.current.isGroupCollapsed("morning")).toBe(false);
    expect(result.current.isGroupCollapsed("date:2026-09-01", true)).toBe(true);
    act(() => result.current.toggleGroup("morning"));
    expect(result.current.isGroupCollapsed("morning")).toBe(true);
    act(() => result.current.toggleGroup("date:2026-09-01", true));
    expect(result.current.isGroupCollapsed("date:2026-09-01", true)).toBe(false);
    act(() => result.current.toggleGroup("morning"));
    expect(result.current.isGroupCollapsed("morning")).toBe(false);
  });
});
