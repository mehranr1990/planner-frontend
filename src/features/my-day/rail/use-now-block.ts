"use client";

import { useMemo } from "react";
import type { Task } from "@/data/domain";
import { useBlocks, useTask } from "@/data/queries";
import { toDayBlocks, type DayBlock } from "../domain/day-blocks";
import { currentBlock, nextBlocks, nowSummary, type NowSummary } from "../domain/now";
import { usePlannerNow } from "../my-day-context";

/*
 * What is happening on the planner's today, for the Now and Focus cards: the
 * live block, the task behind it (for effort left and the meta line), what
 * comes next. Always today: "now" has no meaning on another day.
 */

export type NowBlockState =
  | { status: "pending" }
  | { status: "error"; refetch: () => void }
  | {
      status: "ready";
      today: string;
      nowMinutes: number;
      current: DayBlock | null;
      /** The task behind the current block, when it has one and it loaded. */
      task: Task | null;
      summary: NowSummary | null;
      /** Open blocks after now, soonest first (two of them: the card's "Next" line). */
      next: DayBlock[];
    };

export function useNowBlock(): NowBlockState {
  const { day: today, minutes: nowMinutes } = usePlannerNow();
  const blocks = useBlocks(today);
  const dayBlocks = useMemo(() => toDayBlocks(blocks.data ?? [], today), [blocks.data, today]);
  const current = useMemo(() => currentBlock(dayBlocks, nowMinutes), [dayBlocks, nowMinutes]);
  const taskId = current?.taskId ?? null;
  const taskQuery = useTask(taskId);

  const task = taskQuery.data ?? null;
  const next = useMemo(() => nextBlocks(dayBlocks, nowMinutes, 2), [dayBlocks, nowMinutes]);

  if (blocks.isError) return { status: "error", refetch: () => void blocks.refetch() };
  if (blocks.isPending || (taskId !== null && taskQuery.isPending && !taskQuery.isError)) return { status: "pending" };
  return {
    status: "ready",
    today,
    nowMinutes,
    current,
    task,
    summary: current ? nowSummary(current, task, nowMinutes) : null,
    next,
  };
}
