"use client";

import { useMemo } from "react";
import { useHabits, useMoods, useTasks } from "@/data/queries";
import { isModuleVisible } from "@/features/planner-settings/planner-settings";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { todayProgress, type TodayProgress } from "@/features/tasks/domain/progress";
import { isDoneOn } from "./domain/habits";
import { todayRatio } from "./domain/live-slot";

/*
 * Today's numbers, shared by the hero, the phone's three numbers and the
 * live slot: tasks (the Today view, so it agrees with the Tasks badge),
 * habits done today and today's mood. A hidden module contributes nothing.
 */

export interface OverviewToday {
  status: "pending" | "error" | "ready";
  refetch: () => void;
  tasks: TodayProgress | undefined;
  habits: { done: number; total: number } | undefined;
  /** Today's mood check-in, if any (undefined while loading). */
  mood: { mood: number; energy: string } | null | undefined;
  /** 0–1 over tasks and (when visible) habits. */
  ratio: number;
  showHabits: boolean;
  showMood: boolean;
}

export function useOverviewToday(today: string): OverviewToday {
  const settings = usePlannerSettings();
  const showHabits = isModuleVisible(settings, "habits");
  const showMood = isModuleVisible(settings, "journal");
  const tasksQuery = useTasks({ view: "today", day: today });
  const habitsQuery = useHabits();
  const moodsQuery = useMoods(today, today);

  const tasks = useMemo(() => (tasksQuery.data ? todayProgress(tasksQuery.data, today) : undefined), [tasksQuery.data, today]);
  const habits = useMemo(() => {
    if (!showHabits) return { done: 0, total: 0 };
    const list = habitsQuery.data;
    return list ? { done: list.filter((habit) => isDoneOn(habit, today)).length, total: list.length } : undefined;
  }, [habitsQuery.data, showHabits, today]);
  const moodEntry = moodsQuery.data ? (moodsQuery.data.find((entry) => entry.day === today) ?? null) : undefined;

  const status = tasksQuery.isError ? "error" : tasks && habits ? "ready" : "pending";
  return {
    status,
    refetch: () => {
      void tasksQuery.refetch();
      void habitsQuery.refetch();
    },
    tasks,
    habits,
    mood: moodEntry ? { mood: moodEntry.mood, energy: moodEntry.energy } : moodEntry,
    ratio: tasks && habits ? todayRatio(tasks, habits) : 0,
    showHabits,
    showMood,
  };
}
