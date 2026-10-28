import type { ClockTime, PlannerSettings, PlannerSettingsPatch } from "@/features/planner-settings/planner-settings";
import type { WeekConfig, Weekday } from "@/lib/dates/week";

/*
 * P17 Settings: pure rules behind the editable rows, so the screen stays a
 * thin view over the planner-settings and preferences stores.
 */

export const settingsGroupIds = [
  "appearance",
  "language",
  "calendar",
  "planning",
  "focus",
  "modules",
  "finance",
  "notifications",
  "privacy",
  "data",
] as const;
export type SettingsGroupId = (typeof settingsGroupIds)[number];

export type DayKind = "work" | "half" | "weekend" | "off";
export const dayKinds: readonly DayKind[] = ["work", "half", "weekend", "off"];

/** The seven weekdays, starting from the configured first day. */
export function orderedWeekdays(weekStartsOn: Weekday): Weekday[] {
  return Array.from({ length: 7 }, (_, i) => ((weekStartsOn + i) % 7) as Weekday);
}

export function dayKindOf(week: WeekConfig, day: Weekday): DayKind {
  if (week.workDays.includes(day)) return "work";
  if (week.halfDays.includes(day)) return "half";
  if (week.weekendDays.includes(day)) return "weekend";
  return "off";
}

/**
 * Moves one day to a kind; the lists stay mutually exclusive. Returns null
 * when the week would have no working day (full or half) left.
 */
export function setDayKind(week: WeekConfig, day: Weekday, kind: DayKind): WeekConfig | null {
  const without = (days: readonly Weekday[]) => days.filter((d) => d !== day);
  const add = (days: Weekday[], target: DayKind) => (kind === target ? [...days, day] : days);
  const next: WeekConfig = {
    weekStartsOn: week.weekStartsOn,
    workDays: add(without(week.workDays), "work"),
    halfDays: add(without(week.halfDays), "half"),
    weekendDays: add(without(week.weekendDays), "weekend"),
  };
  return next.workDays.length + next.halfDays.length === 0 ? null : next;
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isClockTime(value: string): value is ClockTime {
  return CLOCK.test(value);
}

/** A time range is valid when both ends are clock times and it ends after it starts. */
export function isValidTimeRange(start: string, end: string): boolean {
  return isClockTime(start) && isClockTime(end) && start < end;
}

/** Default task duration choices, within the store's 5–480 bounds. */
export const durationOptions = [15, 30, 45, 60, 90, 120] as const;

/** Daily focus goal slider, within the store's 15–960 bounds. */
export const DAILY_GOAL = { min: 30, max: 720, step: 30 } as const;

/** The patch that restores every group a patch touches (Saved · Undo). */
export function undoPatchFor(previous: PlannerSettings, patch: PlannerSettingsPatch): PlannerSettingsPatch {
  const undo: Record<string, unknown> = {};
  for (const group of Object.keys(patch)) {
    if (group in previous && group !== "version") undo[group] = previous[group as keyof PlannerSettingsPatch];
  }
  return undo as PlannerSettingsPatch;
}

/** Typed confirmation for Delete account: "DELETE", case-sensitive, surrounding spaces ignored. */
export const DELETE_CONFIRMATION = "DELETE";
export function isDeleteConfirmed(input: string): boolean {
  return input.trim() === DELETE_CONFIRMATION;
}

/** Case- and digit-insensitive search over a group's labels. */
export function matchesSettingsQuery(query: string, haystack: readonly string[]): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  return haystack.some((text) => text.toLocaleLowerCase().includes(q));
}
