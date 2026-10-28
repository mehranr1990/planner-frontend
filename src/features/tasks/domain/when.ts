import type { Task } from "@/data/domain";
import { isOverdue } from "@/data/task-query";
import { dayOfInstant, diffDays, instantToClockTime } from "@/lib/dates/clock-time";
import { relativeDay, type RelativeDay } from "./group";

/*
 * What the "When" column says for a row, as data: the time when it has one,
 * otherwise a relative word (Today, Yesterday), a weekday inside the coming
 * week, or a day-month. `tone: "overdue"` paints it rose (with the words, never
 * colour alone).
 */

export type WhenDescriptor =
  | { kind: "time"; time: string; tone?: "overdue" }
  | { kind: "relative"; relative: RelativeDay; tone?: "overdue" }
  | { kind: "weekday"; day: string; tone?: "overdue" }
  | { kind: "date"; day: string; tone?: "overdue" }
  | { kind: "none" };

export interface WhenContext {
  /** The planner's today. */
  day: string;
  /** "completed": rows of the Completed view read their completion day. */
  basis?: "planned" | "completed";
}

/** Whole days an open task is past its day; 0 when it is not overdue. */
export function overdueDays(task: Pick<Task, "status" | "date">, day: string): number {
  return isOverdue(task, day) ? diffDays(task.date!, day) : 0;
}

function describeDay(taskDay: string, today: string, tone?: "overdue"): WhenDescriptor {
  const relative = relativeDay(taskDay, today);
  if (relative) return tone ? { kind: "relative", relative, tone } : { kind: "relative", relative };
  const away = Math.abs(diffDays(today, taskDay));
  const kind = away <= 6 ? "weekday" : "date";
  return tone ? { kind, day: taskDay, tone } : { kind, day: taskDay };
}

export function taskWhen(task: Task, { day, basis = "planned" }: WhenContext): WhenDescriptor {
  if (basis === "completed" && task.completedAt) {
    const doneDay = dayOfInstant(task.completedAt);
    if (doneDay === day) {
      return task.time ? { kind: "time", time: task.time } : { kind: "relative", relative: "today" };
    }
    return describeDay(doneDay, day);
  }
  if (task.date === null) return { kind: "none" };
  const overdue = isOverdue(task, day);
  if (overdue) return describeDay(task.date, day, "overdue");
  if (task.date === day) return task.time ? { kind: "time", time: task.time } : { kind: "relative", relative: "today" };
  // Another day: the time when there is one (the group header names the day), else the day itself.
  return task.time ? { kind: "time", time: task.time } : describeDay(task.date, day);
}

/** The clock time an instant reads in the planner zone, for completed rows. */
export function completedClock(task: Pick<Task, "completedAt">): string | null {
  return task.completedAt ? instantToClockTime(task.completedAt) : null;
}
