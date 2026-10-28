import type { EnergyLevel, Task } from "@/data/domain";
import type { DayBlock, MinuteSpan } from "./day-blocks";

/*
 * Free gaps between blocks, and "N tasks fit" hints for the partially-planned
 * day. A gap is time no block (breaks included) occupies.
 */

export interface Gap extends MinuteSpan {
  minutes: number;
}

/** Hints render only for gaps at least this long. */
export const HINT_GAP_MINUTES = 60;

/** High-energy work counts as fitting only when the gap starts in these morning hours. */
const MORNING: MinuteSpan = { startMinutes: 9 * 60, endMinutes: 12 * 60 };

/** Free gaps inside `window` of at least `minMinutes`, in time order. */
export function freeGaps(blocks: readonly DayBlock[], window: MinuteSpan, minMinutes = 1): Gap[] {
  const sorted = [...blocks].sort((a, b) => a.startMinutes - b.startMinutes);
  const gaps: Gap[] = [];
  let cursor = window.startMinutes;
  const push = (start: number, end: number) => {
    const minutes = end - start;
    if (minutes > 0 && minutes >= minMinutes) gaps.push({ startMinutes: start, endMinutes: end, minutes });
  };
  for (const block of sorted) {
    if (block.endMinutes <= cursor) continue;
    if (block.startMinutes >= window.endMinutes) break;
    push(cursor, Math.min(block.startMinutes, window.endMinutes));
    cursor = Math.max(cursor, block.endMinutes);
  }
  push(cursor, window.endMinutes);
  return gaps;
}

/**
 * How many tasks fit the gap: duration within the gap, and a high-energy task
 * only when the gap starts between 09:00 and 12:00 or the selected energy is
 * "high". A task without a duration is taken as `defaultDurationMinutes`.
 */
export function fitHints(
  gap: Gap,
  tasks: readonly Pick<Task, "durationMinutes" | "energy">[],
  selectedEnergy: EnergyLevel,
  defaultDurationMinutes = 30,
): number {
  const startsInMorning = gap.startMinutes >= MORNING.startMinutes && gap.startMinutes < MORNING.endMinutes;
  return tasks.filter((task) => {
    if ((task.durationMinutes ?? defaultDurationMinutes) > gap.minutes) return false;
    return task.energy !== "high" || selectedEnergy === "high" || startsInMorning;
  }).length;
}

export interface GapHint {
  gap: Gap;
  /** Tasks that fit it. */
  fit: number;
}

/** The gaps worth a dashed "2h free · 3 tasks fit" placeholder: at least an hour long, in time order. */
export function gapHints(
  blocks: readonly DayBlock[],
  window: MinuteSpan,
  tasks: readonly Pick<Task, "durationMinutes" | "energy">[],
  selectedEnergy: EnergyLevel,
  defaultDurationMinutes = 30,
): GapHint[] {
  return freeGaps(blocks, window, HINT_GAP_MINUTES).map((gap) => ({
    gap,
    fit: fitHints(gap, tasks, selectedEnergy, defaultDurationMinutes),
  }));
}
