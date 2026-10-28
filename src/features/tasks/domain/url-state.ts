import type { TaskFilters, TaskSort } from "@/data/domain";
import { filtersFromParams, FILTER_KINDS, FILTER_PARAMS, writeFiltersToParams, type ParamReader } from "./filters";
import {
  defaultGroup,
  groupFitsLayout,
  isBoardGroup,
  isListGroup,
  TASKS_TABS,
  type TasksGroup,
  type TasksLayout,
  type TasksTab,
} from "./types";

/*
 * The Tasks screen's URL contract. Everything that is a view of the list
 * lives in the query string so a view can be linked, reloaded and navigated
 * back to; only values that differ from the defaults are written.
 *
 *   ?view=list|board   ?tab=today|upcoming|all|completed
 *   ?group=time|date|area|priority|none (list) · horizon|time|status (board)
 *   ?sort=smart|manual|priority|duration|created   ?q=search text
 *   + the filter params (see filters.ts)
 *
 * `?view=board&group=horizon` (the older board link) reads as the board
 * grouped by horizon. Unknown values fall back to the default, and a group
 * the layout does not offer is ignored.
 */

export const VIEW_PARAM = "view";
export const TAB_PARAM = "tab";
export const GROUP_PARAM = "group";
export const SORT_PARAM = "sort";
export const SEARCH_PARAM = "q";

export const TASK_SORTS: readonly TaskSort[] = ["smart", "manual", "priority", "duration", "created"];

export interface TasksUrlState {
  layout: TasksLayout;
  tab: TasksTab;
  /** The group the person chose; null = the default for the layout and tab. */
  group: TasksGroup | null;
  sort: TaskSort;
  /** Search text as typed. */
  q: string;
  filters: TaskFilters;
}

export const DEFAULT_TASKS_STATE: TasksUrlState = {
  layout: "list",
  tab: "today",
  group: null,
  sort: "smart",
  q: "",
  filters: {},
};

export function layoutFromParam(value: string | null): TasksLayout {
  return value === "board" ? "board" : "list";
}

export function tabFromParam(value: string | null): TasksTab {
  return TASKS_TABS.find((tab) => tab === value) ?? "today";
}

export function sortFromParam(value: string | null): TaskSort {
  return TASK_SORTS.find((sort) => sort === value) ?? "smart";
}

/** A group param valid for the layout, else null. */
export function groupFromParam(value: string | null, layout: TasksLayout): TasksGroup | null {
  if (layout === "list") return isListGroup(value) ? value : null;
  return isBoardGroup(value) ? value : null;
}

export function parseTasksUrlState(params: ParamReader): TasksUrlState {
  const layout = layoutFromParam(params.get(VIEW_PARAM));
  return {
    layout,
    tab: tabFromParam(params.get(TAB_PARAM)),
    group: groupFromParam(params.get(GROUP_PARAM), layout),
    sort: sortFromParam(params.get(SORT_PARAM)),
    q: params.get(SEARCH_PARAM) ?? "",
    filters: filtersFromParams(params),
  };
}

/**
 * `search` with the state applied: defaults leave no param, unrelated params
 * (?sheet=…) are kept. Returns the query string without the "?".
 */
export function writeTasksUrlState(search: string, state: TasksUrlState): string {
  const params = new URLSearchParams(search);
  const set = (name: string, value: string | null) => {
    if (value === null || value === "") params.delete(name);
    else params.set(name, value);
  };
  set(VIEW_PARAM, state.layout === "list" ? null : state.layout);
  set(TAB_PARAM, state.tab === "today" ? null : state.tab);
  set(GROUP_PARAM, state.group !== null && groupFitsLayout(state.group, state.layout) ? state.group : null);
  set(SORT_PARAM, state.sort === "smart" ? null : state.sort);
  set(SEARCH_PARAM, state.q.trim() === "" ? null : state.q);
  writeFiltersToParams(params, state.filters);
  return params.toString();
}

/** The grouping in effect: the chosen one when it fits the layout, else the layout and tab default. */
export function effectiveGroup(state: Pick<TasksUrlState, "layout" | "tab" | "group">): TasksGroup {
  return state.group !== null && groupFitsLayout(state.group, state.layout)
    ? state.group
    : defaultGroup(state.layout, state.tab);
}

/** The URL params this module owns (to strip them when linking elsewhere). */
export const TASKS_PARAMS: readonly string[] = [
  VIEW_PARAM,
  TAB_PARAM,
  GROUP_PARAM,
  SORT_PARAM,
  SEARCH_PARAM,
  ...FILTER_KINDS.map((kind) => FILTER_PARAMS[kind]),
];

/** Two states mean the same view (search compared trimmed, filters normalised by the readers). */
export function sameTasksUrlState(a: TasksUrlState, b: TasksUrlState): boolean {
  return writeTasksUrlState("", a) === writeTasksUrlState("", b);
}
