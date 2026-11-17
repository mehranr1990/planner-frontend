"use client";

import { useMemo } from "react";
import { useScheduleCapacity } from "@/data/personal-services-queries";
import { useBlocks, useTasks } from "@/data/queries";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { computeCapacity, serverCapacity, workWindow, type Capacity } from "../domain/capacity";
import { toDayBlocks, type DayBlock } from "../domain/day-blocks";

/*
 * The day's blocks and capacity for the header, the overload bar and the empty
 * state: one place that joins repository data with the domain maths, so every
 * piece of the screen reads the same numbers. Tasks give task blocks their
 * priority (the order "Move N to tomorrow" picks by); a task list that fails
 * to load only costs that ordering, not the day. Live mode takes totals from
 * the server's schedule capacity for the day (null = mock: the local
 * work-hours model); a failed capacity read reads as unknown, not as hours.
 */

export type DayPlan =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      blocks: DayBlock[];
      capacity: Capacity;
      work: ReturnType<typeof workWindow>;
    };

const LOADING: DayPlan = { status: "loading" };
const FAILED: DayPlan = { status: "error" };

export function useDayPlan(day: string): DayPlan {
  const { workHours } = usePlannerSettings();
  const blocks = useBlocks(day);
  const tasks = useTasks({ view: "all" });
  const server = useScheduleCapacity({ date: day });
  const serverDay = server.data?.days.find((item) => item.date === day) ?? null;
  const serverSettled = !server.isPending;
  const serverServed = server.isError || server.data !== null;

  const blockData = blocks.data;
  const taskData = tasks.data;
  const tasksSettled = !tasks.isPending;
  const start = workHours.start;
  const end = workHours.end;

  return useMemo<DayPlan>(() => {
    if (blocks.isError) return FAILED;
    if (!blockData || !tasksSettled || !serverSettled) return LOADING;
    const work = workWindow({ start, end });
    const dayBlocks = toDayBlocks(blockData, day, taskData ?? []);
    const capacity = !serverServed
      ? computeCapacity(dayBlocks, work.totalMinutes)
      : serverCapacity(dayBlocks, serverDay ?? { state: "UNKNOWN", availableMinutes: null, reservedMinutes: null, remainingMinutes: null, overbookedMinutes: null });
    return { status: "ready", blocks: dayBlocks, capacity, work };
  }, [blocks.isError, blockData, taskData, tasksSettled, serverSettled, serverServed, serverDay, day, start, end]);
}
