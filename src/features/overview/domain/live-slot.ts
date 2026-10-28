import type { Task } from "@/data/domain";
import type { DayBlock } from "@/features/my-day/domain/day-blocks";
import { currentBlock, nextBlocks } from "@/features/my-day/domain/now";

/*
 * Which of the five P01 live-slot states the Now area shows:
 * A morning (nothing planned yet), B live block (default; the volt card),
 * C free gap before the next block, D evening → Shutdown suggestion,
 * E first run (no data at all). Pure: the card reads this, never the clock.
 */

/** After this the slot suggests Daily shutdown while tasks are open (P01 D: "After 18:00"). */
export const EVENING_FROM_MINUTES = 18 * 60;

/** A gap shorter than this is not worth suggesting a task for. */
export const MIN_GAP_MINUTES = 10;

export type LiveSlot =
  | { kind: "first-run" }
  | { kind: "evening"; openCount: number }
  | { kind: "morning"; openCount: number; freeMinutes: number }
  | { kind: "gap"; gapMinutes: number; next: DayBlock; fit: Task | null }
  /** B, and the quiet "Up next" / idle frame the Now card falls back to. */
  | { kind: "live" };

export interface LiveSlotInput {
  nowMinutes: number;
  blocks: readonly DayBlock[];
  /** Every task the user has (any day, any status): none at all means first run. */
  taskCount: number;
  /** Open tasks in the Today view. */
  openToday: number;
  /** Open tasks without a time for today, best first: candidates for a gap. */
  unscheduled: readonly Task[];
  /** Free minutes in the work window (capacity). */
  freeMinutes: number;
  /** Slots the user dismissed or postponed this session. */
  dismissed?: ReadonlySet<LiveSlot["kind"]>;
}

export function liveSlot(input: LiveSlotInput): LiveSlot {
  const { nowMinutes, blocks, dismissed = new Set() } = input;
  const allowed = (kind: LiveSlot["kind"]) => !dismissed.has(kind);

  if (input.taskCount === 0 && blocks.length === 0 && allowed("first-run")) return { kind: "first-run" };
  if (currentBlock(blocks, nowMinutes)) return { kind: "live" };
  if (nowMinutes >= EVENING_FROM_MINUTES && input.openToday > 0 && allowed("evening")) {
    return { kind: "evening", openCount: input.openToday };
  }
  const planned = blocks.some((block) => block.kind === "task");
  if (!planned && input.openToday > 0 && allowed("morning")) {
    return { kind: "morning", openCount: input.openToday, freeMinutes: input.freeMinutes };
  }
  const next = nextBlocks(blocks, nowMinutes, 1)[0];
  if (next && allowed("gap")) {
    const gapMinutes = next.startMinutes - nowMinutes;
    if (gapMinutes >= MIN_GAP_MINUTES) {
      const fit = input.unscheduled.find((task) => task.durationMinutes !== null && task.durationMinutes <= gapMinutes) ?? null;
      return { kind: "gap", gapMinutes, next, fit };
    }
  }
  return { kind: "live" };
}

/** Today progress (the ring): tasks and habits done over tasks and habits due, 0–1. */
export function todayRatio(tasks: { done: number; total: number }, habits: { done: number; total: number }): number {
  const total = tasks.total + habits.total;
  return total === 0 ? 0 : (tasks.done + habits.done) / total;
}
