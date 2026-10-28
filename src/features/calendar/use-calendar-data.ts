"use client";

import { useMemo } from "react";
import type { Task } from "@/data/domain";
import { useBlocksForDays, useTasks } from "@/data/queries";
import { toDayBlocks, type DayBlock } from "@/features/my-day/domain/day-blocks";
import { useCalendar } from "./calendar-context";
import { layerCounts, visibleBlocks } from "./domain/layers";

/*
 * The blocks of every day a view loads, as My Day's DayBlocks (with each
 * task's energy and priority), filtered by the visible scope layers. Layer
 * counts are taken before filtering so a hidden layer still shows its count.
 */

export type CalendarDataStatus = "pending" | "error" | "ready";

export interface CalendarData {
  status: CalendarDataStatus;
  /** Visible blocks per day. */
  byDay: ReadonlyMap<string, readonly DayBlock[]>;
  tasks: ReadonlyMap<string, Task>;
  counts: ReturnType<typeof layerCounts>;
  refetch(): void;
}

const NO_TASKS: readonly Task[] = [];

export function useCalendarData(days: readonly string[]): CalendarData {
  const { hidden } = useCalendar();
  const blocks = useBlocksForDays(days);
  const tasksQuery = useTasks();
  const tasks = tasksQuery.data ?? NO_TASKS;

  const all = useMemo(
    () => days.map((day, index) => [day, toDayBlocks(blocks.data[index] ?? [], day, tasks)] as const),
    [days, blocks.data, tasks],
  );
  const byDay = useMemo(() => new Map(all.map(([day, items]) => [day, visibleBlocks(items, hidden)])), [all, hidden]);
  const counts = useMemo(() => layerCounts(all.flatMap(([, items]) => items)), [all]);
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  const status: CalendarDataStatus = blocks.isError ? "error" : blocks.isPending ? "pending" : "ready";
  return { status, byDay, tasks: taskMap, counts, refetch: blocks.refetch };
}
