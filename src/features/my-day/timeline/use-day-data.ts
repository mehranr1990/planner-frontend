"use client";

import { useMemo } from "react";
import type { Task } from "@/data/domain";
import { useBlocks, useTasks } from "@/data/queries";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { workWindow } from "../domain/capacity";
import { toDayBlocks, type DayBlock } from "../domain/day-blocks";
import { usePlannerNow } from "../my-day-context";
import { buildDayModel, type DayModel } from "./timeline-model";

/*
 * One day for the timeline: its blocks (with each task's energy and priority)
 * and everything derived from them. "pending" covers both queries so a block
 * never first shows without its energy bars.
 */

export type DayDataStatus = "pending" | "error" | "ready";

export interface DayData {
  status: DayDataStatus;
  blocks: DayBlock[];
  /** Tasks by id: the current block's effort left comes from them. */
  tasks: ReadonlyMap<string, Task>;
  model: DayModel;
  refetch(): void;
}

const NO_TASKS: readonly Task[] = [];

export function useDayData(day: string): DayData {
  const blocksQuery = useBlocks(day);
  const tasksQuery = useTasks();
  const { workHours } = usePlannerSettings();
  const now = usePlannerNow();

  const tasks = tasksQuery.data ?? NO_TASKS;
  const blocks = useMemo(
    () => (blocksQuery.data ? toDayBlocks(blocksQuery.data, day, tasks) : []),
    [blocksQuery.data, day, tasks],
  );
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const totalMinutes = workWindow(workHours).totalMinutes;
  const nowMinutes = now.day === day ? now.minutes : null;
  const model = useMemo(() => buildDayModel(blocks, { totalMinutes, nowMinutes }), [blocks, totalMinutes, nowMinutes]);

  // A failed task list only costs the energy bars; a failed block list is the screen's error.
  const status: DayDataStatus = blocksQuery.isError ? "error" : blocksQuery.isPending || tasksQuery.isPending ? "pending" : "ready";

  return {
    status,
    blocks,
    tasks: taskMap,
    model,
    refetch: () => void blocksQuery.refetch(),
  };
}
