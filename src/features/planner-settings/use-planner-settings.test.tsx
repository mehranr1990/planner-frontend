import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { routerRefresh } from "@/test/setup";
import { DEFAULT_PLANNER_SETTINGS, type PlannerSettings } from "./planner-settings";
import { parsePlannerSettingsCookie, PLANNER_SETTINGS_COOKIE } from "./planner-settings-cookie";
import { PlannerSettingsProvider, usePlannerSettings, usePlannerSettingsActions } from "./use-planner-settings";

function readCookie(): PlannerSettings | null {
  const entry = document.cookie.split("; ").find((part) => part.startsWith(`${PLANNER_SETTINGS_COOKIE}=`));
  return entry ? parsePlannerSettingsCookie(entry.slice(PLANNER_SETTINGS_COOKIE.length + 1)) : null;
}

function setup(initial: PlannerSettings = DEFAULT_PLANNER_SETTINGS) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <PlannerSettingsProvider initial={initial}>{children}</PlannerSettingsProvider>
  );
  return renderHook(() => ({ settings: usePlannerSettings(), actions: usePlannerSettingsActions() }), { wrapper });
}

describe("PlannerSettingsProvider", () => {
  it("serves the server-resolved value without writing anything", () => {
    const initial: PlannerSettings = { ...DEFAULT_PLANNER_SETTINGS, workHours: { start: "08:00", end: "16:00" } };
    const { result } = setup(initial);
    expect(result.current.settings).toBe(initial);
    expect(readCookie()).toBeNull();
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("merges an update, writes the cookie and refreshes the server render", () => {
    const { result } = setup();
    act(() => result.current.actions.update({ weeklyReview: { time: "19:30" } }));
    expect(result.current.settings.weeklyReview).toEqual({ weekday: 4, time: "19:30" });
    expect(readCookie()).toEqual(result.current.settings);
    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });

  it("hides and shows optional modules", () => {
    const { result } = setup();
    act(() => result.current.actions.setModuleVisible("finance", false));
    expect(result.current.settings.modules.finance).toBe(false);
    expect(readCookie()?.modules.finance).toBe(false);
    act(() => result.current.actions.setModuleVisible("finance", true));
    expect(result.current.settings.modules.finance).toBe(true);
    expect(routerRefresh).toHaveBeenCalledTimes(2);
  });

  it("ignores core modules, which cannot be hidden", () => {
    const { result } = setup();
    const before = result.current.settings;
    act(() => result.current.actions.setModuleVisible("inbox" as never, false));
    expect(result.current.settings).toBe(before);
    expect(readCookie()).toBeNull();
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("throws outside the provider", () => {
    expect(() => renderHook(() => usePlannerSettings())).toThrow(/PlannerSettingsProvider/);
  });
});
