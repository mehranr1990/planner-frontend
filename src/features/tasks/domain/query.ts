import type { TaskFilters, TaskSort } from "@/data/domain";
import type { TaskCountsQuery, TaskQuery } from "@/data/repositories";
import { normalizeFilters } from "@/data/task-query";
import type { TasksTab } from "./types";

/*
 * From the screen's URL state to the data layer's queries (a pure transform
 * so it is tested without React).
 */

export interface TasksQueryInput {
  tab: TasksTab;
  sort: TaskSort;
  q: string;
  filters: TaskFilters;
  /** The planner's today. */
  today: string;
}

export function buildTasksQuery({ tab, sort, q, filters, today }: TasksQueryInput): TaskQuery {
  const query: TaskQuery = { view: tab, day: today, sort };
  const narrowed = normalizeFilters(filters);
  if (narrowed) query.filters = narrowed;
  if (q.trim() !== "") query.search = q.trim();
  return query;
}

/** The tab badges follow the same filters and search as the list. */
export function buildCountsQuery({ q, filters, today }: Pick<TasksQueryInput, "q" | "filters" | "today">): TaskCountsQuery {
  const query: TaskCountsQuery = { day: today };
  const narrowed = normalizeFilters(filters);
  if (narrowed) query.filters = narrowed;
  if (q.trim() !== "") query.search = q.trim();
  return query;
}
