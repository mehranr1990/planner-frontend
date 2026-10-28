"use client";

import { useMemo } from "react";
import { useTasks } from "@/data/queries";
import { todayProgress, type TodayProgress } from "./domain/progress";
import { useTasksState } from "./tasks-context";

/**
 * The header's "6 of 9 done today · 3h 55m left" pill. Reads the Today view
 * without the screen's filters or search, so it always agrees with the
 * unfiltered "Today N" badge. Undefined while loading.
 */
export function useTodayProgress(): TodayProgress | undefined {
  const { today } = useTasksState();
  const { data } = useTasks({ view: "today", day: today }, { keepPrevious: true });
  return useMemo(() => (data ? todayProgress(data, today) : undefined), [data, today]);
}
