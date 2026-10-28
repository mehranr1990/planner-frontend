import type { Task } from "@/data/domain";

export interface UnscheduledSummary {
  count: number;
  totalMinutes: number;
}

/** "4 tasks · 2h 05m": how many, and their total duration (a task without one adds nothing). */
export function summarize(tasks: readonly Pick<Task, "durationMinutes">[]): UnscheduledSummary {
  return {
    count: tasks.length,
    totalMinutes: tasks.reduce((sum, task) => sum + (task.durationMinutes ?? 0), 0),
  };
}
