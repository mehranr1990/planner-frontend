import type { Task } from "@/data/domain";
import { isOverdue } from "@/data/task-query";
import { formatClockTime, MINUTES_PER_DAY, parseClockTime } from "@/lib/dates/clock-time";

/*
 * The time-of-day windows of the Today list: Morning (before 12:00),
 * Afternoon (12:00 to 17:00 inclusive), Evening (after 17:00), Unscheduled (no
 * time) and Overdue (open and dated before the day).
 */

export type TimeWindow = "overdue" | "morning" | "afternoon" | "evening" | "unscheduled";

/** The windows in list order. */
export const TIME_WINDOWS: readonly TimeWindow[] = ["overdue", "morning", "afternoon", "evening", "unscheduled"];

/** A window a time can fall in. */
export type ClockWindow = "morning" | "afternoon" | "evening";

const NOON = 12 * 60;
const FIVE_PM = 17 * 60;

export function windowOfMinutes(minutes: number): ClockWindow {
  if (minutes < NOON) return "morning";
  return minutes <= FIVE_PM ? "afternoon" : "evening";
}

/** The window of an "HH:mm" time; null for no (or an invalid) time. */
export function windowOfTime(time: string | null): ClockWindow | null {
  if (time === null) return null;
  const minutes = parseClockTime(time);
  return minutes === null || minutes >= MINUTES_PER_DAY ? null : windowOfMinutes(minutes);
}

/** Which window of `day`'s list a task sits in. */
export function timeWindowOf(task: Pick<Task, "status" | "date" | "time">, day: string): TimeWindow {
  if (isOverdue(task, day)) return "overdue";
  return windowOfTime(task.time) ?? "unscheduled";
}

/** Whether a time lies inside a clock window. */
export function timeInWindow(time: string | null, window: ClockWindow): boolean {
  return windowOfTime(time) === window;
}

/**
 * The time a task gets when dropped into a window it has no time in:
 * Morning at the work-day start (09:00 when that is not before noon),
 * Afternoon 14:00, Evening 18:00 (or the work-day end when later).
 */
export function defaultTimeForWindow(window: ClockWindow, workHours: { start: string; end: string }): string {
  const start = parseClockTime(workHours.start);
  const end = parseClockTime(workHours.end);
  switch (window) {
    case "morning":
      return start !== null && start < NOON ? formatClockTime(start) : "09:00";
    case "afternoon":
      return "14:00";
    case "evening":
      return end !== null && end > 18 * 60 && end < MINUTES_PER_DAY ? formatClockTime(end) : "18:00";
  }
}
