import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { Providers } from "@/app/providers";
import { DEFAULT_PLANNER_SETTINGS } from "@/features/planner-settings/planner-settings";
import { testPreferences } from "@/test/render";
import { routerReplace, setMockPathname, setMockSearch } from "@/test/setup";
import {
  dayFromParam,
  MyDayProvider,
  searchWithDayView,
  useMyDay,
  usePlannerNow,
  viewFromParam,
  type MyDayProviderProps,
} from "./my-day-context";

const TODAY = "2026-10-13";

describe("URL helpers", () => {
  it("reads ?date= in Jalali (Latin or Persian digits) or Gregorian, falling back to the default", () => {
    expect(dayFromParam("1405-07-22", TODAY)).toBe("2026-10-14");
    expect(dayFromParam("۱۴۰۵-۰۷-۲۲", TODAY)).toBe("2026-10-14");
    expect(dayFromParam("2026-10-20", TODAY)).toBe("2026-10-20");
    for (const bad of [null, "", "nope", "1405-13-01", "1405-07-32"]) expect(dayFromParam(bad, TODAY), String(bad)).toBe(TODAY);
  });

  it("reads ?view=", () => {
    expect(viewFromParam("3days")).toBe("3days");
    expect(viewFromParam("day")).toBe("day");
    expect(viewFromParam(null)).toBe("day");
    expect(viewFromParam("week")).toBe("day");
  });

  it("writes Jalali dates, drops defaults and keeps other params", () => {
    expect(searchWithDayView("", "2026-10-14", "day", TODAY)).toBe("date=1405-07-22");
    expect(searchWithDayView("", "2026-10-14", "3days", TODAY)).toBe("date=1405-07-22&view=3days");
    expect(searchWithDayView("date=1405-07-22&view=3days", TODAY, "day", TODAY)).toBe("");
    expect(searchWithDayView("sheet=quick-add", "2026-10-14", "day", TODAY)).toBe("sheet=quick-add&date=1405-07-22");
    expect(searchWithDayView("sheet=quick-add&date=1405-07-22", TODAY, "day", TODAY)).toBe("sheet=quick-add");
  });
});

function setup(props: Partial<MyDayProviderProps> = {}, search = "") {
  setMockPathname("/personal/my-day");
  setMockSearch(search);
  return renderHook(() => useMyDay(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <Providers preferences={testPreferences} plannerSettings={DEFAULT_PLANNER_SETTINGS}>
        <MyDayProvider {...({ ...props, children } as MyDayProviderProps)} />
      </Providers>
    ),
  });
}

describe("MyDayProvider (URL synced)", () => {
  it("starts on the planner's today with the defaults", () => {
    const { result } = setup();
    expect(result.current).toMatchObject({
      day: TODAY,
      today: TODAY,
      isToday: true,
      view: "day",
      energy: "medium",
      filter: "today",
      selectedBlockId: null,
      reschedule: null,
    });
  });

  it("takes the day and view from the URL", () => {
    const { result } = setup({}, "date=1405-07-22&view=3days");
    expect(result.current).toMatchObject({ day: "2026-10-14", isToday: false, view: "3days" });
  });

  it("follows the URL when it changes under it (a link, back / forward)", () => {
    const { result, rerender } = setup();
    expect(result.current.day).toBe(TODAY);
    setMockSearch("date=1405-07-22&view=3days");
    rerender();
    expect(result.current).toMatchObject({ day: "2026-10-14", view: "3days" });
    setMockSearch("");
    rerender();
    expect(result.current).toMatchObject({ day: TODAY, view: "day" });
  });

  it("an unreadable ?date= falls back to today", () => {
    expect(setup({}, "date=garbage").result.current.day).toBe(TODAY);
  });

  it("setDay updates at once and replaces the URL without a scroll jump, keeping other params", () => {
    const { result } = setup({}, "sheet=quick-add");
    act(() => result.current.setDay("2026-10-14"));
    expect(result.current.day).toBe("2026-10-14");
    expect(routerReplace).toHaveBeenCalledWith("/personal/my-day?sheet=quick-add&date=1405-07-22", { scroll: false });
  });

  it("shiftDay and goToToday move by days; today leaves no ?date=", () => {
    const { result } = setup();
    act(() => result.current.shiftDay(1));
    expect(result.current.day).toBe("2026-10-14");
    act(() => result.current.shiftDay(-2));
    expect(result.current.day).toBe("2026-10-12");
    act(() => result.current.goToToday());
    expect(result.current.day).toBe(TODAY);
    expect(routerReplace).toHaveBeenLastCalledWith("/personal/my-day", { scroll: false });
  });

  it("setView writes ?view= and keeps the day", () => {
    const { result } = setup({}, "date=1405-07-22");
    act(() => result.current.setView("3days"));
    expect(result.current.view).toBe("3days");
    expect(routerReplace).toHaveBeenCalledWith("/personal/my-day?date=1405-07-22&view=3days", { scroll: false });
    act(() => result.current.setView("day"));
    expect(routerReplace).toHaveBeenLastCalledWith("/personal/my-day?date=1405-07-22", { scroll: false });
  });

  it("changing day clears the selection and the Reschedule popover", () => {
    const { result } = setup();
    act(() => {
      result.current.selectBlock("ui-design");
      result.current.openReschedule({ kind: "block", id: "ui-design" });
    });
    expect(result.current.selectedBlockId).toBe("ui-design");
    expect(result.current.reschedule).toEqual({ target: { kind: "block", id: "ui-design" }, anchor: null });
    act(() => result.current.setDay("2026-10-14"));
    expect(result.current.selectedBlockId).toBeNull();
    expect(result.current.reschedule).toBeNull();
  });

  it("setting the same day again is a no-op (no URL write, selection kept)", () => {
    const { result } = setup();
    act(() => result.current.selectBlock("gym"));
    act(() => result.current.setDay(TODAY));
    expect(routerReplace).not.toHaveBeenCalled();
    expect(result.current.selectedBlockId).toBe("gym");
  });
});

describe("MyDayProvider (local)", () => {
  it("holds day and view in memory and never touches the URL", () => {
    const { result } = setup({ syncUrl: false, initialDay: "2026-10-16", initialView: "3days", initialEnergy: "high", initialFilter: "week" });
    expect(result.current).toMatchObject({ day: "2026-10-16", view: "3days", energy: "high", filter: "week", isToday: false });
    act(() => result.current.setDay("2026-10-17"));
    act(() => result.current.setView("day"));
    expect(result.current).toMatchObject({ day: "2026-10-17", view: "day" });
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("holds the UI state: energy, filter, selection and the Reschedule request with its anchor", () => {
    const { result } = setup({ syncUrl: false });
    const anchor = document.createElement("button");
    act(() => {
      result.current.setEnergy("low");
      result.current.setFilter("overdue");
      result.current.selectBlock("gym");
      result.current.openReschedule({ kind: "task", id: "t-1" }, anchor);
    });
    expect(result.current).toMatchObject({ energy: "low", filter: "overdue", selectedBlockId: "gym" });
    expect(result.current.reschedule?.anchor).toBe(anchor);
    act(() => result.current.closeReschedule());
    expect(result.current.reschedule).toBeNull();
  });
});

describe("MyDayProvider (demo harness options)", () => {
  it("a demo clock replaces the planner clock for the whole screen, and decides today", () => {
    const now = "2026-10-13T19:30:00+03:30";
    const { result } = renderHook(() => ({ day: useMyDay(), now: usePlannerNow() }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <Providers preferences={testPreferences} plannerSettings={DEFAULT_PLANNER_SETTINGS}>
          <MyDayProvider syncUrl={false} now={now}>
            {children}
          </MyDayProvider>
        </Providers>
      ),
    });
    expect(result.current.now).toEqual({ instant: now, day: TODAY, minutes: 1170 });
    expect(result.current.day).toMatchObject({ day: TODAY, today: TODAY, isToday: true });
  });

  it("can open Reschedule on mount, without an anchor", () => {
    const { result } = setup({ syncUrl: false, initialReschedule: { target: { kind: "block", id: "gym" }, preselect: "tomorrow" } });
    expect(result.current.reschedule).toEqual({ target: { kind: "block", id: "gym" }, preselect: "tomorrow", anchor: null });
    act(() => result.current.closeReschedule());
    expect(result.current.reschedule).toBeNull();
  });
});

describe("usePlannerNow", () => {
  it("reads the planner clock: 14:35 on the sample day", () => {
    const { result } = renderHook(() => usePlannerNow());
    expect(result.current).toEqual({ instant: "2026-10-13T14:35:00+03:30", day: TODAY, minutes: 875 });
  });
});
