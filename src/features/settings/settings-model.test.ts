import { describe, expect, it } from "vitest";
import { DEFAULT_PLANNER_SETTINGS } from "@/features/planner-settings/planner-settings";
import { IRAN_WEEK } from "@/lib/dates/week";
import {
  dayKindOf,
  isDeleteConfirmed,
  isValidTimeRange,
  matchesSettingsQuery,
  orderedWeekdays,
  setDayKind,
  undoPatchFor,
} from "./settings-model";

describe("settings model", () => {
  it("orders the week from the configured first day", () => {
    expect(orderedWeekdays(6)).toEqual([6, 0, 1, 2, 3, 4, 5]);
    expect(orderedWeekdays(1)[0]).toBe(1);
  });

  it("reads and moves day kinds, keeping the lists exclusive", () => {
    expect(dayKindOf(IRAN_WEEK, 4)).toBe("half");
    expect(dayKindOf(IRAN_WEEK, 5)).toBe("weekend");
    const next = setDayKind(IRAN_WEEK, 4, "weekend")!;
    expect(next.halfDays).toEqual([]);
    expect(next.weekendDays).toEqual([5, 4]);
    expect(dayKindOf(next, 4)).toBe("weekend");
  });

  it("refuses a week without a working day", () => {
    let week = { weekStartsOn: 6 as const, workDays: [6 as const], halfDays: [], weekendDays: [5 as const] };
    expect(setDayKind(week, 6, "off")).toBeNull();
    week = { ...week, halfDays: [] };
    expect(setDayKind(week, 0, "half")).not.toBeNull();
  });

  it("validates time ranges", () => {
    expect(isValidTimeRange("09:00", "17:00")).toBe(true);
    expect(isValidTimeRange("17:00", "09:00")).toBe(false);
    expect(isValidTimeRange("9:00", "17:00")).toBe(false);
    expect(isValidTimeRange("09:00", "09:00")).toBe(false);
  });

  it("builds an undo patch from the touched groups only", () => {
    const undo = undoPatchFor(DEFAULT_PLANNER_SETTINGS, { focus: { focusMinutes: 50 } });
    expect(undo).toEqual({ focus: DEFAULT_PLANNER_SETTINGS.focus });
  });

  it("confirms deletion only with DELETE", () => {
    expect(isDeleteConfirmed(" DELETE ")).toBe(true);
    expect(isDeleteConfirmed("delete")).toBe(false);
  });

  it("matches search queries case-insensitively", () => {
    expect(matchesSettingsQuery("", ["x"])).toBe(true);
    expect(matchesSettingsQuery("POMO", ["Focus · Pomodoro"])).toBe(true);
    expect(matchesSettingsQuery("zzz", ["Focus"])).toBe(false);
  });
});
