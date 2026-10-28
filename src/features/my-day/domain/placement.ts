import { formatClockTime, MINUTES_PER_DAY, snap15, snapTo } from "@/lib/dates/clock-time";
import { FULL_DAY, type DayBlock, type MinuteSpan } from "./day-blocks";

export { snap15 } from "@/lib/dates/clock-time";

/*
 * Placement math for drop, drag, resize and the S shortcut. Starts snap to
 * the 15-minute grid; durations stay as given (a 10m task keeps its 10m).
 */

/** Smallest block a drop may create. */
export const MIN_BLOCK_MINUTES = 5;

/** Smallest a resize may shrink a block to (15m grid). */
export const MIN_RESIZE_MINUTES = 15;

/** Suggested slots (placeholder, Later today, auto-fit) land on :00 and :30. */
export const SLOT_STEP_MINUTES = 30;

export interface PlacementInput {
  day: string;
  startMinutes: number;
  durationMinutes: number;
}

export interface Placement extends PlacementInput {
  endMinutes: number;
  /** "HH:mm" of the snapped start, ready for the repository. */
  start: string;
}

export type PlacementResult =
  | { ok: true; placement: Placement }
  | { ok: false; reason: "out-of-range" | "too-short" };

/**
 * Snaps the start to the grid and checks the block stays inside `window`
 * (default the whole day, 00:00–24:00). Too short: under MIN_BLOCK_MINUTES.
 */
export function resolvePlacement(input: PlacementInput, window: MinuteSpan = FULL_DAY): PlacementResult {
  const durationMinutes = Math.round(input.durationMinutes);
  if (!(durationMinutes >= MIN_BLOCK_MINUTES)) return { ok: false, reason: "too-short" };
  const startMinutes = snap15(input.startMinutes);
  const endMinutes = startMinutes + durationMinutes;
  if (startMinutes < window.startMinutes || endMinutes > window.endMinutes) return { ok: false, reason: "out-of-range" };
  return {
    ok: true,
    placement: { day: input.day, startMinutes, durationMinutes, endMinutes, start: formatClockTime(startMinutes) },
  };
}

/**
 * Drags one edge by `deltaMinutes`, snapped to the grid. The span never
 * shrinks below MIN_RESIZE_MINUTES (or its current length when already
 * shorter) and stays inside `window`.
 */
export function resizeFromEdge(
  span: MinuteSpan,
  edge: "start" | "end",
  deltaMinutes: number,
  window: MinuteSpan = FULL_DAY,
): MinuteSpan {
  const minimum = Math.min(MIN_RESIZE_MINUTES, span.endMinutes - span.startMinutes);
  if (edge === "end") {
    const end = snap15(span.endMinutes + deltaMinutes);
    return {
      startMinutes: span.startMinutes,
      endMinutes: Math.min(window.endMinutes, Math.max(span.startMinutes + minimum, end)),
    };
  }
  const start = snap15(span.startMinutes + deltaMinutes);
  return {
    startMinutes: Math.max(window.startMinutes, Math.min(span.endMinutes - minimum, start)),
    endMinutes: span.endMinutes,
  };
}

/**
 * The first start at or after `afterMinutes` (rounded up to `step`) where
 * `durationMinutes` fits between blocks — breaks count as busy — inside
 * `window`. Null when nothing fits. After the last block it is simply the
 * next step past its end.
 */
export function nextFreeSlot(
  blocks: readonly Pick<DayBlock, "startMinutes" | "endMinutes">[],
  afterMinutes: number,
  durationMinutes: number,
  window: MinuteSpan = FULL_DAY,
  step: number = SLOT_STEP_MINUTES,
): number | null {
  const sorted = [...blocks].sort((a, b) => a.startMinutes - b.startMinutes);
  let candidate = snapTo(Math.max(afterMinutes, window.startMinutes), step, "ceil");
  for (const block of sorted) {
    if (block.endMinutes <= candidate) continue;
    if (candidate + durationMinutes <= block.startMinutes) break;
    candidate = snapTo(block.endMinutes, step, "ceil");
  }
  return candidate + durationMinutes <= Math.min(window.endMinutes, MINUTES_PER_DAY) ? candidate : null;
}

/**
 * The S shortcut: the start of the next free gap that holds the task, after
 * now, else after the last block. Null when the day has no room left.
 */
export function autoFit(
  blocks: readonly DayBlock[],
  task: { durationMinutes: number | null },
  nowMinutes: number,
  window: MinuteSpan = FULL_DAY,
  defaultDurationMinutes = 30,
): number | null {
  return nextFreeSlot(blocks, nowMinutes, task.durationMinutes ?? defaultDurationMinutes, window);
}
