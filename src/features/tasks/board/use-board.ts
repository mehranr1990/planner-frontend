"use client";

import { useMemo } from "react";
import type { Task } from "@/data/domain";
import { useTasks } from "@/data/queries";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { buildBoard, type BoardModel } from "../domain/board";
import { isBoardGroup, type BoardGroupMode } from "../domain/types";
import { useTasksState } from "../tasks-context";
import type { TasksQueryResult } from "../use-tasks-query";

/*
 * The board's columns from the screen's (filtered) answer, plus, while
 * filters or search narrow it, each column's unfiltered count for the
 * "2 of 11 match" line.
 */

export interface BoardData {
  mode: BoardGroupMode;
  model: BoardModel;
  /** Column id → card count without filters; null when nothing narrows the board. */
  totals: ReadonlyMap<string, number> | null;
}

export function useBoard(data: TasksQueryResult, enabled: boolean): BoardData {
  const { today, effectiveGroup, sort } = useTasksState();
  const { week, workHours } = usePlannerSettings();
  const mode: BoardGroupMode = isBoardGroup(effectiveGroup) ? effectiveGroup : "horizon";
  const unfiltered = useTasks({ view: "all", day: today, sort }, { keepPrevious: true });
  const narrowed = enabled && data.isFiltered;

  const model = useMemo(
    () => buildBoard(data.tasks, { mode, day: today, week, workHours }),
    [data.tasks, mode, today, week, workHours],
  );
  const all: readonly Task[] | undefined = narrowed ? unfiltered.data : undefined;
  const totals = useMemo(() => {
    if (!all) return null;
    const full = buildBoard(all, { mode, day: today, week, workHours });
    return new Map([...full.columns, full.done].map((column) => [column.id as string, column.count]));
  }, [all, mode, today, week, workHours]);

  return { mode, model, totals };
}
