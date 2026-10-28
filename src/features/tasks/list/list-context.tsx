"use client";

import { createContext, useContext } from "react";
import type { Task } from "@/data/domain";
import type { TasksQueryResult } from "../use-tasks-query";
import type { TaskActions } from "./use-task-actions";

/*
 * What the screen computes once and every list piece reads: the query
 * result, the actions (with the shared completion lifecycle), the tasks by
 * id, and the screen-level surfaces (Reschedule sheet, add-task input).
 */

export interface ListContextValue {
  data: TasksQueryResult;
  actions: TaskActions;
  byId: ReadonlyMap<string, Task>;
  /** Ids in the order they are visible (collapsed groups and collapsed done rows left out). */
  visibleIds: readonly string[];
  /** Opens the Reschedule sheet (phone swipe, phone bulk bar) for these tasks. */
  openReschedule(ids: readonly string[]): void;
  /** Focuses the add-task row (N, "Add first task"). */
  focusAdd(): void;
  /** Whether the done rows of a group that collapsed live are shown again. */
  isDoneShown(groupId: string): boolean;
  toggleDoneShown(groupId: string): void;
}

export const ListContext = createContext<ListContextValue | null>(null);

export function useList(): ListContextValue {
  const value = useContext(ListContext);
  if (!value) throw new Error("useList must be used inside the Tasks screen.");
  return value;
}
