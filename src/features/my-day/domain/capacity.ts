import type { TaskPriority } from "@/data/domain";
import { parseClockTime } from "@/lib/dates/clock-time";
import type { DayBlock } from "./day-blocks";
import { findOverlaps } from "./overlap";

/*
 * Capacity (the header pill): planned work against the workday. Breaks never
 * count; done blocks do (the day's plan includes what is already finished).
 */

export type CapacityState = "empty" | "partial" | "normal" | "over";

export interface Capacity {
  plannedMinutes: number;
  totalMinutes: number;
  /** Never negative. */
  freeMinutes: number;
  /** planned / total; 0 when total is 0. Can exceed 1. */
  ratio: number;
  state: CapacityState;
  overlapCount: number;
  overlapMinutes: number;
}

/** Below this share of the workday the day reads as "partially planned". */
export const PARTIAL_RATIO = 0.5;

/** Work hours as minutes-of-day and their span. Falls back to 09:00–17:00 on bad input. */
export function workWindow(workHours: { start: string; end: string }): {
  startMinutes: number;
  endMinutes: number;
  totalMinutes: number;
} {
  const start = parseClockTime(workHours.start);
  const end = parseClockTime(workHours.end);
  const [startMinutes, endMinutes] = start !== null && end !== null && end > start ? [start, end] : [540, 1020];
  return { startMinutes, endMinutes, totalMinutes: endMinutes - startMinutes };
}

export function plannedMinutes(blocks: readonly DayBlock[]): number {
  return blocks.reduce((sum, block) => (block.kind === "break" ? sum : sum + block.durationMinutes), 0);
}

export function computeCapacity(blocks: readonly DayBlock[], totalMinutes: number): Capacity {
  const planned = plannedMinutes(blocks);
  const overlaps = findOverlaps(blocks);
  const ratio = totalMinutes > 0 ? planned / totalMinutes : 0;
  const overlapCount = overlaps.length;

  let state: CapacityState;
  if (blocks.length === 0) state = "empty";
  else if (ratio > 1 || overlapCount > 0) state = "over";
  else if (ratio < PARTIAL_RATIO) state = "partial";
  else state = "normal";

  return {
    plannedMinutes: planned,
    totalMinutes,
    freeMinutes: Math.max(0, totalMinutes - planned),
    ratio,
    state,
    overlapCount,
    overlapMinutes: overlaps.reduce((sum, overlap) => sum + overlap.minutes, 0),
  };
}

const PRIORITY_WEIGHT: Record<TaskPriority | "none", number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

/** Open task blocks that can move to another day, ordered lowest priority first (later start first on ties). */
export function movableBlocks(blocks: readonly DayBlock[]): DayBlock[] {
  return blocks
    .filter((block) => block.kind === "task" && !block.done)
    .sort(
      (a, b) =>
        PRIORITY_WEIGHT[b.priority ?? "none"] - PRIORITY_WEIGHT[a.priority ?? "none"] ||
        b.startMinutes - a.startMinutes,
    );
}

/**
 * The blocks "Move N to tomorrow" would move: lowest priority first, until the
 * plan fits the workday. At least one when the day is over (an overlap alone
 * is also "over"); fewer than needed when there is nothing movable left.
 */
export function blocksToMoveToTomorrow(blocks: readonly DayBlock[], totalMinutes: number): DayBlock[] {
  const movable = movableBlocks(blocks);
  const chosen: DayBlock[] = [];
  let planned = plannedMinutes(blocks);
  for (const block of movable) {
    if (planned <= totalMinutes && chosen.length > 0) break;
    chosen.push(block);
    planned -= block.durationMinutes;
  }
  return chosen;
}
