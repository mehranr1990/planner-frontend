import type { Task } from "@/data/domain";
import { matchesView } from "@/data/task-query";

/*
 * "6 of 9 done today · 3h 55m left": the denominator is the Today tab (dated
 * today, any status, plus open overdue), so the pill agrees with the "Today 9"
 * badge. Minutes left are the open tasks' durations; a task with no
 * duration counts nothing.
 */

export interface TodayProgress {
  /** Tasks in the Today view. */
  total: number;
  done: number;
  open: number;
  /** Open durations in minutes. */
  minutesLeft: number;
  /** Durations of the done tasks ("3h 40m focused"). */
  completedMinutes: number;
  /** There is something today and all of it is done. */
  allDone: boolean;
}

/** `tasks` may be any list that includes today's; the Today view is picked out of it. */
export function todayProgress(tasks: readonly Task[], day: string): TodayProgress {
  const today = tasks.filter((task) => matchesView(task, "today", day));
  const done = today.filter((task) => task.status === "done");
  const open = today.filter((task) => task.status === "open");
  const sum = (items: readonly Task[]) => items.reduce((total, task) => total + (task.durationMinutes ?? 0), 0);
  return {
    total: today.length,
    done: done.length,
    open: open.length,
    minutesLeft: sum(open),
    completedMinutes: sum(done),
    allDone: today.length > 0 && open.length === 0,
  };
}
