import type { EnergyLevel, Scope, Task, TaskPriority, TimeBlock, TimeBlockKind } from "@/data/domain";
import { MINUTES_PER_DAY, minutesFromDayStart } from "@/lib/dates/clock-time";

/*
 * Every domain module below works on blocks projected onto ONE day in
 * minutes-of-day, never on ISO instants: that is what the timeline draws and
 * what drag math moves. A block that spans midnight is clamped to the day.
 */

export interface DayBlock {
  id: string;
  title: string;
  scope: Scope;
  kind: TimeBlockKind;
  taskId?: string;
  done: boolean;
  /** Own energy (events, routines) or the task's; null when unknown. */
  energy: EnergyLevel | null;
  /** The task's priority for task blocks; null otherwise. */
  priority: TaskPriority | null;
  /** Minutes after the day's midnight, 0..1440. */
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
}

/** A span of minutes within a day (a window, a gap, a candidate placement). */
export interface MinuteSpan {
  startMinutes: number;
  endMinutes: number;
}

/** The whole day as a window. */
export const FULL_DAY: MinuteSpan = { startMinutes: 0, endMinutes: MINUTES_PER_DAY };

/**
 * Blocks overlapping `day`, clamped to it, in start order (ties: shorter
 * first). Task blocks take energy and priority from `tasks` when given.
 */
export function toDayBlocks(blocks: readonly TimeBlock[], day: string, tasks: readonly Task[] = []): DayBlock[] {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const result: DayBlock[] = [];
  for (const block of blocks) {
    const startMinutes = Math.max(0, minutesFromDayStart(block.start, day));
    const endMinutes = Math.min(MINUTES_PER_DAY, minutesFromDayStart(block.end, day));
    if (endMinutes <= startMinutes) continue;
    const task = block.taskId ? tasksById.get(block.taskId) : undefined;
    result.push({
      id: block.id,
      title: block.title,
      scope: block.scope,
      kind: block.kind,
      taskId: block.taskId,
      done: block.done === true,
      energy: block.energy ?? task?.energy ?? null,
      priority: task?.priority ?? null,
      startMinutes,
      endMinutes,
      durationMinutes: endMinutes - startMinutes,
    });
  }
  return result.sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
}

/** Whether two spans share any minute (touching edges do not overlap). */
export function spansOverlap(a: MinuteSpan, b: MinuteSpan): boolean {
  return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

/** Minutes two spans share (0 when they only touch or are apart). */
export function overlapMinutes(a: MinuteSpan, b: MinuteSpan): number {
  return Math.max(0, Math.min(a.endMinutes, b.endMinutes) - Math.max(a.startMinutes, b.startMinutes));
}
