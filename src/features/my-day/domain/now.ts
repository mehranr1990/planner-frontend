import type { Task } from "@/data/domain";
import type { DayBlock } from "./day-blocks";

/*
 * The Now card: which block is live, what comes next, and how far along it is.
 * `nowMinutes` is the minute of the day (see minutesOfInstant); callers only
 * ask on the planner's today.
 */

/** The open block containing `nowMinutes`; a task block wins an overlap, then the earlier start. */
export function currentBlock(blocks: readonly DayBlock[], nowMinutes: number): DayBlock | null {
  const live = blocks.filter((block) => !block.done && block.startMinutes <= nowMinutes && nowMinutes < block.endMinutes);
  live.sort((a, b) => Number(b.kind === "task") - Number(a.kind === "task") || a.startMinutes - b.startMinutes);
  return live[0] ?? null;
}

/** The next `count` open blocks starting after now, in time order. */
export function nextBlocks(blocks: readonly DayBlock[], nowMinutes: number, count: number): DayBlock[] {
  return blocks
    .filter((block) => !block.done && block.startMinutes > nowMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes)
    .slice(0, count);
}

export interface NowSummary {
  /** Minutes remaining: effort left (kind "effort") or time to the block's end (kind "time"). */
  leftMinutes: number;
  /** 0..100, rounded. */
  progressPercent: number;
  kind: "effort" | "time";
}

/**
 * A task with logged effort reports effort (duration − spent, spent / duration);
 * anything else reports time to the block's end and the share elapsed.
 */
export function nowSummary(
  block: DayBlock,
  task: Pick<Task, "durationMinutes" | "spentMinutes"> | null,
  nowMinutes: number,
): NowSummary {
  const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));
  if (task && task.spentMinutes !== undefined) {
    const total = task.durationMinutes ?? block.durationMinutes;
    return {
      kind: "effort",
      leftMinutes: Math.max(0, total - task.spentMinutes),
      progressPercent: total > 0 ? clamp((task.spentMinutes / total) * 100) : 0,
    };
  }
  return {
    kind: "time",
    leftMinutes: Math.max(0, block.endMinutes - nowMinutes),
    progressPercent: clamp(((nowMinutes - block.startMinutes) / block.durationMinutes) * 100),
  };
}
