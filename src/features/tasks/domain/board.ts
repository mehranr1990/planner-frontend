import type { Task } from "@/data/domain";
import type { TaskPatch } from "@/data/repositories";
import { isOverdue } from "@/data/task-query";
import { dayOfInstant } from "@/lib/dates/clock-time";
import { IRAN_WEEK, type WeekConfig } from "@/lib/dates/week";
import { restOfWeekDays, weekEndDay, workingTomorrow } from "@/features/my-day/domain/reschedule";
import { dayCapacityMinutes } from "./group";
import { moveInList, patchForWindow } from "./reorder";
import { defaultTimeForWindow, windowOfTime } from "./time-of-day";
import type { BoardGroupMode } from "./types";

/*
 * The P03 board as data. Columns are decisions, not workflow stages:
 *
 *   horizon  Today · Tomorrow · This week · Later   (drag = reschedule)
 *   time     Morning · Afternoon · Evening · Unscheduled of today (drag = time window)
 *   status   To do · Planned (has a time)            (drag = plan / unplan)
 *
 * plus the Done rail (today's completed tasks; a drop completes). Overdue
 * tasks pin to the first column's rose strip. "Tomorrow" on a weekend skips
 * to the next working day (Thursday → Saturday with the Iran week). Pure: the
 * UI hit-tests a drop, asks planBoardDrop and runs the plan.
 */

export type BoardColumnKind =
  | "today"
  | "tomorrow"
  | "week"
  | "later"
  | "morning"
  | "afternoon"
  | "evening"
  | "unscheduled"
  | "todo"
  | "planned"
  | "done";

export const DONE_COLUMN_ID = "done";

export interface BoardColumn {
  id: BoardColumnKind;
  /** Open tasks in board order (overdue ones are in `overdue`, not here). */
  tasks: Task[];
  /** Today / the first time column: open tasks dated before today. */
  overdue: Task[];
  /** Cards in the column, overdue included. */
  count: number;
  /** Minutes of the column's cards. */
  totalMinutes: number;
  /** Today / Tomorrow of the horizon grouping: the day's workable minutes. */
  capacityMinutes?: number;
  /** Horizon: the day a drop sets (null = no date for Later; undefined = keeps the date). */
  day?: string | null;
  /** This week: the last working day of the week (the "until Thu 23" label). */
  untilDay?: string;
}

export interface BoardModel {
  columns: BoardColumn[];
  /** Today's completed tasks. */
  done: BoardColumn;
}

export interface BoardOptions {
  mode: BoardGroupMode;
  /** The planner's today. */
  day: string;
  week?: WeekConfig;
  workHours: { start: string; end: string };
}

const COLUMNS: Record<BoardGroupMode, readonly BoardColumnKind[]> = {
  horizon: ["today", "tomorrow", "week", "later"],
  time: ["morning", "afternoon", "evening", "unscheduled"],
  status: ["todo", "planned"],
};

/** The day the Tomorrow column means (the shared Reschedule rule: Thu → Sat with the Iran week). */
export const boardTomorrow = workingTomorrow;

function horizonOf(task: Task, day: string, tomorrow: string, end: string): BoardColumnKind {
  if (task.date === null) return "later";
  if (task.date <= day) return "today";
  if (task.date === tomorrow) return "tomorrow";
  // A weekend day skipped by Tomorrow (Friday after Thursday) still belongs to this week.
  return task.date <= end ? "week" : "later";
}

function columnOf(task: Task, mode: BoardGroupMode, day: string, tomorrow: string, end: string): BoardColumnKind | null {
  switch (mode) {
    case "horizon":
      return horizonOf(task, day, tomorrow, end);
    case "time":
      // Today's board: tasks dated today, plus the overdue strip.
      if (task.date === null || task.date > day) return null;
      if (task.date < day) return "morning";
      return windowOfTime(task.time) ?? "unscheduled";
    case "status":
      return task.time ? "planned" : "todo";
  }
}

function emptyColumn(id: BoardColumnKind): BoardColumn {
  return { id, tasks: [], overdue: [], count: 0, totalMinutes: 0 };
}

export function buildBoard(tasks: readonly Task[], { mode, day, week = IRAN_WEEK, workHours }: BoardOptions): BoardModel {
  const tomorrow = boardTomorrow(day, week);
  const end = weekEndDay(day, week);
  const columns = new Map(COLUMNS[mode].map((id) => [id, emptyColumn(id)]));
  const done = emptyColumn("done");

  for (const task of tasks) {
    if (task.status === "done") {
      if (task.completedAt && dayOfInstant(task.completedAt) === day) {
        done.tasks.push(task);
        done.count += 1;
        done.totalMinutes += task.durationMinutes ?? 0;
      }
      continue;
    }
    const id = columnOf(task, mode, day, tomorrow, end);
    const column = id ? columns.get(id) : undefined;
    if (!column) continue;
    if (mode !== "status" && isOverdue(task, day)) column.overdue.push(task);
    else column.tasks.push(task);
    column.count += 1;
    column.totalMinutes += task.durationMinutes ?? 0;
  }

  if (mode === "horizon") {
    const today = columns.get("today")!;
    today.day = day;
    today.capacityMinutes = dayCapacityMinutes(day, week, workHours);
    const next = columns.get("tomorrow")!;
    next.day = tomorrow;
    next.capacityMinutes = dayCapacityMinutes(tomorrow, week, workHours);
    const days = restOfWeekDays(day, week);
    const thisWeek = columns.get("week")!;
    thisWeek.day = days[0];
    thisWeek.untilDay = days[days.length - 1];
    columns.get("later")!.day = null;
  }
  return { columns: [...columns.values()], done };
}

/** Every card id in board order (⇧ ranges, the bulk bar). */
export function boardIds(model: BoardModel, withDone: boolean): string[] {
  const columns = withDone ? [...model.columns, model.done] : model.columns;
  return columns.flatMap((column) => [...column.overdue, ...column.tasks].map((task) => task.id));
}

/** Minutes over capacity (0 when it fits or the column has no capacity). */
export function overloadMinutes(column: Pick<BoardColumn, "totalMinutes" | "capacityMinutes">): number {
  return column.capacityMinutes ? Math.max(0, column.totalMinutes - column.capacityMinutes) : 0;
}

// ── Drops ────────────────────────────────────────────────────────────────

export interface BoardDropTarget {
  columnId: string;
  /** Insertion position among the column's tasks without the dragged one. */
  index: number;
}

export type BoardDropPlan =
  | { kind: "complete"; id: string }
  | { kind: "reorder"; ids: string[] }
  | { kind: "move"; id: string; patch: TaskPatch }
  | { kind: "none"; reason: "unknown" | "unchanged" | "closed" };

export interface BoardDropInput {
  taskId: string;
  model: BoardModel;
  target: BoardDropTarget;
  day: string;
  workHours: { start: string; end: string };
}

function patchForColumn(task: Task, column: BoardColumn, input: Pick<BoardDropInput, "day" | "workHours">): TaskPatch | null {
  const { day, workHours } = input;
  switch (column.id) {
    case "today":
    case "tomorrow":
    case "week":
    case "later": {
      // Undefined day: This week has no working day left (Thursday): no target.
      if (column.day === undefined) return null;
      // Rescheduling keeps the time (clearing the date clears it in the data layer).
      return column.day === task.date ? {} : { date: column.day };
    }
    case "morning":
    case "afternoon":
    case "evening":
      return patchForWindow(task, column.id, { day, workHours });
    case "unscheduled": {
      const patch: TaskPatch = {};
      if (task.date !== day) patch.date = day;
      if (task.time !== null) patch.time = null;
      return patch;
    }
    case "todo":
      return task.time === null ? {} : { time: null };
    case "planned": {
      if (task.time !== null) return {};
      const patch: TaskPatch = { time: defaultTimeForWindow("morning", workHours) };
      if (task.date === null) patch.date = day;
      return patch;
    }
    default:
      return null;
  }
}

/** What a task added from a column's "Add" gets (date / time), or null when the column takes none. */
export function columnDefaults(
  column: BoardColumn,
  day: string,
  workHours: { start: string; end: string },
): { date: string | null; time: string | null } | null {
  if (column.id === "done") return null;
  const blank: Task = { id: "", title: "", scope: "personal", priority: null, energy: null, durationMinutes: null, date: null, time: null, status: "open" };
  const patch = patchForColumn(blank, column, { day, workHours });
  return patch === null ? null : { date: patch.date ?? null, time: patch.time ?? null };
}

export function planBoardDrop(input: BoardDropInput): BoardDropPlan {
  const { taskId, model, target } = input;
  const all = [...model.columns, model.done];
  const source = all.find((column) => column.tasks.some((task) => task.id === taskId) || column.overdue.some((task) => task.id === taskId));
  const task = source && [...source.overdue, ...source.tasks].find((item) => item.id === taskId);
  if (!source || !task) return { kind: "none", reason: "unknown" };

  if (target.columnId === DONE_COLUMN_ID) {
    return source.id === "done" ? { kind: "none", reason: "unchanged" } : { kind: "complete", id: taskId };
  }
  const destination = model.columns.find((column) => column.id === target.columnId);
  if (!destination || source.id === "done") return { kind: "none", reason: "unknown" };

  if (destination.id === source.id && !source.overdue.includes(task)) {
    const ids = destination.tasks.map((item) => item.id);
    const order = moveInList(ids, taskId, target.index);
    return order.every((id, index) => id === ids[index]) ? { kind: "none", reason: "unchanged" } : { kind: "reorder", ids: order };
  }

  const patch = patchForColumn(task, destination, input);
  if (patch === null) return { kind: "none", reason: "closed" };
  if (Object.keys(patch).length === 0) return { kind: "none", reason: "unchanged" };
  return { kind: "move", id: taskId, patch };
}
