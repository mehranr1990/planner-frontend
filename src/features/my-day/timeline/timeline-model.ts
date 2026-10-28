import { computeCapacity, type Capacity } from "../domain/capacity";
import type { DayBlock } from "../domain/day-blocks";
import { currentBlock } from "../domain/now";
import { overlapMinutesByBlock } from "../domain/overlap";
import { assignLanes, type Lane } from "./geometry";

/*
 * Everything the grid derives from one day's blocks, computed once per data
 * change: which blocks overlap (and by how much), how they share the width,
 * which one is live and the day's capacity state.
 */

export interface DayModel {
  blocks: DayBlock[];
  /** Minutes each overlapping open block shares with another ("overlaps 30m"). Done blocks are never flagged. */
  overlapById: Map<string, number>;
  lanes: Map<string, Lane>;
  /** The live block; null off today. */
  currentId: string | null;
  capacity: Capacity;
}

const SINGLE_LANE: Lane = { index: 0, count: 1 };

export function buildDayModel(
  blocks: readonly DayBlock[],
  options: { totalMinutes: number; /** Minute of the planner's now on today, null on any other day. */ nowMinutes: number | null },
): DayModel {
  const all = overlapMinutesByBlock(blocks);
  const overlapById = new Map<string, number>();
  for (const block of blocks) {
    const minutes = all.get(block.id);
    if (minutes && !block.done) overlapById.set(block.id, minutes);
  }
  return {
    blocks: [...blocks],
    overlapById,
    lanes: assignLanes(blocks),
    currentId: options.nowMinutes === null ? null : (currentBlock(blocks, options.nowMinutes)?.id ?? null),
    capacity: computeCapacity(blocks, options.totalMinutes),
  };
}

export const laneOf = (model: DayModel, id: string): Lane => model.lanes.get(id) ?? SINGLE_LANE;
