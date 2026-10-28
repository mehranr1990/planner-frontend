"use client";

import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { useRepositories } from "@/data/provider";
import { blockKeys, useTasks } from "@/data/queries";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { toDayBlocks, type DayBlock } from "@/features/my-day/domain/day-blocks";
import type { RescheduleOption, RescheduleOptionId } from "@/features/my-day/domain/reschedule";
import { usePlannerNow, type RescheduleRequest } from "@/features/my-day/my-day-context";
import {
  rescheduleRows,
  resolveTarget,
  sessionDays,
  type RescheduleRows,
  type ResolvedTarget,
} from "./plan-reschedule";

/*
 * Everything an open Reschedule needs, fetched through the usual block and
 * task queries (they are cached: the timeline already holds most of them).
 * The days are the screen's days plus the days a suggestion can land on, so
 * "Tomorrow 09:30" is the first free slot of tomorrow's real plan.
 */

export type RescheduleSession =
  | { status: "loading" }
  | { status: "error" }
  /** The block or task is gone (moved on another tab, deleted). */
  | { status: "missing" }
  | {
      status: "ready";
      resolved: ResolvedTarget;
      blocksByDay: Record<string, DayBlock[]>;
      rows: RescheduleRows;
      /** Where the "Pick date & time" step starts: the Tomorrow suggestion. */
      pickDefault: { day: string; startMinutes: number };
    };

/**
 * `day` is the day the caller shows (My Day's day; the planner's today for a
 * sheet opened by URL). Suggestions are computed around it and today.
 * `allow` is the consumer's rows (default: My Day / Calendar's set).
 */
export function useRescheduleSession(
  request: Pick<RescheduleRequest, "target" | "preselect">,
  day: string,
  allow?: readonly RescheduleOptionId[],
): RescheduleSession {
  const now = usePlannerNow();
  const { blocks } = useRepositories();
  const { week, workHours, planning } = usePlannerSettings();
  const tasks = useTasks({ view: "all" });

  const days = useMemo(() => sessionDays(day, now.day), [day, now.day]);
  const fetched = useQueries({
    queries: days.map((target) => ({
      queryKey: blockKeys.day(target),
      queryFn: () => blocks.listForDay(target),
    })),
    combine: (results) => ({
      data: results.map((result) => result.data),
      pending: results.some((result) => result.isPending),
      failed: results.some((result) => result.isError),
    }),
  });

  const { target, preselect } = request;
  const { start, end } = workHours;
  const defaultDuration = planning.defaultDurationMinutes;
  const taskList = tasks.data;
  const failed = fetched.failed || tasks.isError;
  const pending = fetched.pending || tasks.isPending;

  return useMemo<RescheduleSession>(() => {
    if (failed) return { status: "error" };
    if (pending || !taskList) return { status: "loading" };
    const blocksByDay: Record<string, DayBlock[]> = {};
    days.forEach((blockDay, index) => {
      blocksByDay[blockDay] = toDayBlocks(fetched.data[index] ?? [], blockDay, taskList);
    });
    const resolved = resolveTarget(target, {
      day,
      blocksByDay,
      tasks: taskList,
      defaultDurationMinutes: defaultDuration,
    });
    if (!resolved) return { status: "missing" };
    const rows = rescheduleRows({
      now: now.instant,
      resolved,
      blocksByDay,
      week,
      workHours: { start, end },
      preselect,
      allow,
    });
    const slots = rows.options.filter((option): option is Extract<RescheduleOption, { startMinutes: number }> =>
      "startMinutes" in option,
    );
    const slot = slots.find((option) => option.id === "tomorrow") ?? slots[0];
    return {
      status: "ready",
      resolved,
      blocksByDay,
      rows,
      pickDefault: slot ? { day: slot.day, startMinutes: slot.startMinutes } : { day, startMinutes: 540 },
    };
  }, [failed, pending, taskList, days, fetched.data, target, day, defaultDuration, now.instant, week, start, end, preselect, allow]);
}
