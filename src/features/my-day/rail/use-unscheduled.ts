"use client";

import { useMemo } from "react";
import type { Task } from "@/data/domain";
import { useUnscheduledTasks } from "@/data/queries";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { orderByEnergy } from "../domain/energy";
import { summarize, type UnscheduledSummary } from "../domain/unscheduled";
import { useMyDay } from "../my-day-context";

/*
 * Everything the Unscheduled card and the mobile tray read: the three
 * ranges (the pill counts need all of them), the list of the active pill in
 * energy order, and its summary. Filtering and ordering rules live in the
 * adapter and domain/; this only wires them to the screen's state.
 */

export type UnscheduledModel =
  | { status: "pending"; overdueCount: number | null; todayCount: number | null }
  | { status: "error"; retry: () => void; overdueCount: number | null; todayCount: number | null }
  | {
      status: "ready";
      tasks: Task[];
      summary: UnscheduledSummary;
      overdueCount: number | null;
      todayCount: number | null;
    };

export function useUnscheduledModel(): UnscheduledModel {
  const { day, filter, energy } = useMyDay();
  const { week } = usePlannerSettings();
  const today = useUnscheduledTasks(day, "today", week);
  const overdue = useUnscheduledTasks(day, "overdue", week);
  const thisWeek = useUnscheduledTasks(day, "week", week);
  const active = { today, overdue, week: thisWeek }[filter];
  const data = active.data;

  // Energy only reorders (nothing is hidden); `data` is stable between renders.
  const tasks = useMemo(() => (data ? orderByEnergy(data, energy) : null), [data, energy]);

  const counts = { overdueCount: overdue.data?.length ?? null, todayCount: today.data?.length ?? null };
  if (active.isError) return { status: "error", retry: () => void active.refetch(), ...counts };
  if (!tasks) return { status: "pending", ...counts };
  return { status: "ready", tasks, summary: summarize(tasks), ...counts };
}
