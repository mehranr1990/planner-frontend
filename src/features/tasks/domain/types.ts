import type { TaskView } from "@/data/repositories";

/*
 * Vocabulary shared by the Tasks screen: which layout, which tab, how rows
 * are grouped. The URL names (?view= ?tab= ?group=) are these values.
 */

export type TasksLayout = "list" | "board";

/** The tabs of the list: today, upcoming, all, completed (the data layer's views). */
export type TasksTab = TaskView;

export const TASKS_TABS: readonly TasksTab[] = ["today", "upcoming", "all", "completed"];

/** Groupings of the list. */
export type ListGroupMode = "time" | "date" | "area" | "priority" | "none";

/** Groupings of the board (the Board step reads them; the list ignores them). */
export type BoardGroupMode = "horizon" | "time" | "status";

export type TasksGroup = ListGroupMode | BoardGroupMode;

export const LIST_GROUPS: readonly ListGroupMode[] = ["time", "date", "area", "priority", "none"];
export const BOARD_GROUPS: readonly BoardGroupMode[] = ["horizon", "time", "status"];

export function isListGroup(value: string | null | undefined): value is ListGroupMode {
  return LIST_GROUPS.includes(value as ListGroupMode);
}

export function isBoardGroup(value: string | null | undefined): value is BoardGroupMode {
  return BOARD_GROUPS.includes(value as BoardGroupMode);
}

/** Whether `group` is a grouping the layout offers. */
export function groupFitsLayout(group: TasksGroup, layout: TasksLayout): boolean {
  return layout === "list" ? isListGroup(group) : isBoardGroup(group);
}

/**
 * The grouping a layout and tab start with: Today by time of day, Upcoming by
 * date, All by area, Completed by day (the date grouping reads completion
 * days there); the board by horizon.
 */
export function defaultGroup(layout: TasksLayout, tab: TasksTab): TasksGroup {
  if (layout === "board") return "horizon";
  switch (tab) {
    case "upcoming":
    case "completed":
      return "date";
    case "all":
      return "area";
    default:
      return "time";
  }
}
