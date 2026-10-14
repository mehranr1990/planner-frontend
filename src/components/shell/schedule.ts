import type { Scope } from "@/design-system/tokens/colors";

/*
 * Pure schedule helpers for the top-bar schedule island. Status comes from
 * `now` alone: ended → done, running → current, not started → upcoming.
 */

export interface ScheduleBlock {
  id: string;
  title: string;
  start: Date;
  end: Date;
  scope: Scope;
  /** People's names; avatars show their initials. */
  people?: readonly string[];
}

export type ScheduleStatus = "done" | "current" | "upcoming";

export interface DerivedScheduleBlock extends ScheduleBlock {
  status: ScheduleStatus;
  /** Elapsed share of the block, 0–100 (0 for upcoming, 100 for done). */
  elapsed: number;
}

export function scheduleStatus(block: Pick<ScheduleBlock, "start" | "end">, now: Date): ScheduleStatus {
  const time = now.getTime();
  if (block.end.getTime() <= time) return "done";
  if (block.start.getTime() <= time) return "current";
  return "upcoming";
}

export function elapsedPercent(block: Pick<ScheduleBlock, "start" | "end">, now: Date): number {
  const total = block.end.getTime() - block.start.getTime();
  if (total <= 0) return now.getTime() >= block.end.getTime() ? 100 : 0;
  const ratio = (now.getTime() - block.start.getTime()) / total;
  return Math.round(Math.min(1, Math.max(0, ratio)) * 1000) / 10;
}

/** Blocks sorted by start time, each with its status and elapsed share. */
export function deriveScheduleBlocks(blocks: readonly ScheduleBlock[], now: Date): DerivedScheduleBlock[] {
  return [...blocks]
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((block) => ({ ...block, status: scheduleStatus(block, now), elapsed: elapsedPercent(block, now) }));
}

/**
 * What the island has room for: the most recent finished block, the current
 * one, and the next few upcoming ones (one more when nothing is running).
 */
export function visibleScheduleBlocks(blocks: readonly DerivedScheduleBlock[]): DerivedScheduleBlock[] {
  const done = blocks.filter((block) => block.status === "done").at(-1);
  const current = blocks.find((block) => block.status === "current");
  const upcoming = blocks.filter((block) => block.status === "upcoming").slice(0, current ? 2 : 3);
  return [done, current, ...upcoming].filter((block): block is DerivedScheduleBlock => Boolean(block));
}
