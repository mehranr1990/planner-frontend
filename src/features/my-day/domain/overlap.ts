import { overlapMinutes, type DayBlock, type MinuteSpan } from "./day-blocks";

/*
 * Overlaps are ALLOWED on My Day (the "Overloaded day" state shows them) but
 * never silent: they are flagged ("overlaps 30m", rose outline) and announced.
 */

export interface Overlap {
  /** The two blocks, earlier start first. */
  aId: string;
  bId: string;
  startMinutes: number;
  endMinutes: number;
  minutes: number;
}

/** Every pair of blocks that share time, in start order. */
export function findOverlaps(blocks: readonly DayBlock[]): Overlap[] {
  const sorted = [...blocks].sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
  const overlaps: Overlap[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      // Sorted by start: once b starts at or after a ends, no later block can overlap a.
      if (b.startMinutes >= a.endMinutes) break;
      const minutes = overlapMinutes(a, b);
      if (minutes > 0) {
        overlaps.push({
          aId: a.id,
          bId: b.id,
          startMinutes: Math.max(a.startMinutes, b.startMinutes),
          endMinutes: Math.min(a.endMinutes, b.endMinutes),
          minutes,
        });
      }
    }
  }
  return overlaps;
}

/** Blocks a candidate span would overlap, with the minutes shared. `ignoreId` skips the block being moved. */
export function overlapsWith(
  blocks: readonly DayBlock[],
  candidate: MinuteSpan,
  ignoreId?: string,
): { id: string; title: string; minutes: number }[] {
  return blocks
    .filter((block) => block.id !== ignoreId)
    .map((block) => ({ id: block.id, title: block.title, minutes: overlapMinutes(block, candidate) }))
    .filter((hit) => hit.minutes > 0);
}

/** For each block that overlaps another: the most minutes it shares with any one other block ("overlaps 30m"). */
export function overlapMinutesByBlock(blocks: readonly DayBlock[]): Map<string, number> {
  const byBlock = new Map<string, number>();
  for (const overlap of findOverlaps(blocks)) {
    for (const id of [overlap.aId, overlap.bId]) {
      byBlock.set(id, Math.max(byBlock.get(id) ?? 0, overlap.minutes));
    }
  }
  return byBlock;
}
