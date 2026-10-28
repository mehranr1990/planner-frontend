"use client";

import { useEffect, useMemo } from "react";
import type { Task } from "@/data/domain";
import { useTaskCounts, useTasks } from "@/data/queries";
import type { TaskCounts, TaskQuery } from "@/data/repositories";
import { hasActiveFilters } from "@/data/task-query";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { groupedIds, groupTasks, type TaskGroup } from "./domain/group";
import { buildCountsQuery, buildTasksQuery } from "./domain/query";
import { isListGroup } from "./domain/types";
import { useTasksState } from "./tasks-context";

/*
 * The screen's data in one hook: the state (tab, sort, search, filters)
 * becomes a TaskQuery, the repository answers, the pure groupTasks turns the
 * answer into groups. The previous answer stays on screen while a changed
 * query loads (a typing search, a filter click), so rows do not flash away.
 */

export interface TasksQueryResult {
  /** The query sent to the data layer. */
  query: TaskQuery;
  /** Flat, in list order; empty while loading. */
  tasks: Task[];
  /** The list's groups. Empty while loading, and for the board-only groupings (the Board step builds its own). */
  groups: TaskGroup[];
  /** Every id in group order (⇧ ranges, J / K), including rows inside collapsed groups. */
  orderedIds: string[];
  /** Tab badges after the active filters and search. */
  counts: TaskCounts | undefined;
  /** Tab badges with no filters or search: tells "no tasks at all" from "no match". */
  totalCounts: TaskCounts | undefined;
  /** Filters or search narrow the list. */
  isFiltered: boolean;
  /** The first load is still pending (no answer to show yet). */
  isPending: boolean;
  /** A refetch for a changed query is under way and the old answer is shown. */
  isPlaceholder: boolean;
  isError: boolean;
  error: Error | null;
  refetch(): void;
}

export function useTasksQuery(): TasksQueryResult {
  const { today, layout, tab: urlTab, sort, q, filters, effectiveGroup, pruneSelection } = useTasksState();
  // The board spans every horizon: it reads the "all" view and builds its own columns.
  const tab = layout === "board" ? "all" : urlTab;
  const settings = usePlannerSettings();

  const query = useMemo(() => buildTasksQuery({ tab, sort, q, filters, today }), [tab, sort, q, filters, today]);
  const countsQuery = useMemo(() => buildCountsQuery({ q, filters, today }), [q, filters, today]);
  const tasksResult = useTasks(query, { keepPrevious: true });
  const countsResult = useTaskCounts(countsQuery, { keepPrevious: true });
  const totalResult = useTaskCounts({ day: today });

  const data = tasksResult.data;
  const groups = useMemo(() => {
    if (!data || layout !== "list" || !isListGroup(effectiveGroup)) return [];
    return groupTasks(data, {
      mode: effectiveGroup,
      day: today,
      week: settings.week,
      workHours: settings.workHours,
      basis: tab === "completed" ? "completed" : "planned",
      weekendMarkers: tab === "upcoming",
    });
  }, [data, layout, effectiveGroup, today, settings.week, settings.workHours, tab]);

  const tasks = useMemo(() => data ?? [], [data]);
  const orderedIds = useMemo(() => groupedIds(groups), [groups]);

  // A task that left the data (completed away, deleted, filtered out) leaves the selection too.
  const idsKey = tasks.map((task) => task.id).join("|");
  useEffect(() => {
    if (data) pruneSelection(new Set(idsKey ? idsKey.split("|") : []));
    // idsKey stands for the id list; `data` only gates the first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, Boolean(data)]);

  return {
    query,
    tasks,
    groups,
    orderedIds,
    counts: countsResult.data,
    totalCounts: totalResult.data,
    isFiltered: hasActiveFilters(filters) || q.trim() !== "",
    isPending: tasksResult.isPending,
    isPlaceholder: tasksResult.isPlaceholderData,
    isError: tasksResult.isError,
    error: tasksResult.error,
    refetch: () => void tasksResult.refetch(),
  };
}
