import type { Area, Scope, Task, TaskPriority } from "@/data/domain";
import {
  addDaysToDay,
  dayOfInstant,
  dayToLocalDate,
  diffDays,
  localDateToDay,
  parseClockTime,
} from "@/lib/dates/clock-time";
import { getDayKind, getWeekDates, IRAN_WEEK, type WeekConfig } from "@/lib/dates/week";
import { TIME_WINDOWS, timeWindowOf, type TimeWindow } from "./time-of-day";
import type { ListGroupMode } from "./types";

/*
 * Turns a sorted task list into the groups the list shows. Pure: labels are
 * data (GroupLabel), the UI turns them into words with its messages and the
 * person's calendar. Empty groups are left out, except the weekend days of an
 * Upcoming date grouping. Done tasks stay in their group (the "· 1 done"
 * collapse is UI); durations count open tasks only.
 */

export type RelativeDay = "yesterday" | "today" | "tomorrow";

/** "yesterday" | "today" | "tomorrow" when `day` is next to `today`. */
export function relativeDay(day: string, today: string): RelativeDay | null {
  switch (diffDays(today, day)) {
    case -1:
      return "yesterday";
    case 0:
      return "today";
    case 1:
      return "tomorrow";
    default:
      return null;
  }
}

export type GroupLabel =
  | { type: "window"; window: TimeWindow }
  /** `day` null = tasks with no date. */
  | { type: "date"; day: string | null; relative: RelativeDay | null }
  /** `area` null = no area (a personal task filed nowhere). */
  | { type: "area"; area: Area | null }
  /** A task in no area whose context is not Personal is grouped by that context. */
  | { type: "scope"; scope: Scope }
  | { type: "priority"; priority: TaskPriority | null }
  | { type: "all" };

export interface TaskGroup {
  /** Stable across data changes: "overdue", "date:2026-10-14", "area:home", "priority:high", "all"… */
  id: string;
  kind: "overdue" | "morning" | "afternoon" | "evening" | "unscheduled" | "date" | "area" | "priority" | "none";
  label: GroupLabel;
  tasks: Task[];
  /** All tasks, done or open. */
  count: number;
  openCount: number;
  doneCount: number;
  /** Minutes of the open tasks. */
  totalMinutes: number;
  /** Minutes of the done tasks. */
  doneMinutes: number;
  /** Time-of-day groups. */
  window?: TimeWindow;
  /** Date groups: the day (null = no date). */
  day?: string | null;
  /** Date groups on a weekend day (red header). */
  weekend?: boolean;
  /** Date groups, when work hours were given: the day's workable minutes (0 on a weekend). */
  capacityMinutes?: number;
  /** Area groups: the area (null = none). */
  area?: Area | null;
  /** Scope fallback groups of the area grouping. */
  scope?: Scope;
  /** Priority groups: the priority (null = none). */
  priority?: TaskPriority | null;
  /** Old completed days start collapsed. */
  collapsedByDefault?: boolean;
}

export interface GroupOptions {
  mode: ListGroupMode;
  /** The planner's today. */
  day: string;
  week?: WeekConfig;
  /** Gives date groups a `capacityMinutes`. */
  workHours?: { start: string; end: string };
  /** "completed": the date grouping reads completion days, newest first. */
  basis?: "planned" | "completed";
  /** Adds an empty header for each weekend day up to the end of the week (or the last group). */
  weekendMarkers?: boolean;
}

const PRIORITY_ORDER: readonly TaskPriority[] = ["urgent", "high", "medium", "low"];
const SCOPE_ORDER: readonly Scope[] = ["personal", "project", "team", "company"];
const OLD_COMPLETED_DAYS = 7;

function emptyGroup(id: string, kind: TaskGroup["kind"], label: GroupLabel, extra: Partial<TaskGroup> = {}): TaskGroup {
  return {
    id,
    kind,
    label,
    tasks: [],
    count: 0,
    openCount: 0,
    doneCount: 0,
    totalMinutes: 0,
    doneMinutes: 0,
    ...extra,
  };
}

function add(group: TaskGroup, task: Task): void {
  group.tasks.push(task);
  group.count += 1;
  if (task.status === "done") {
    group.doneCount += 1;
    group.doneMinutes += task.durationMinutes ?? 0;
  } else {
    group.openCount += 1;
    group.totalMinutes += task.durationMinutes ?? 0;
  }
}

function groupByTime(tasks: readonly Task[], day: string): TaskGroup[] {
  const groups = new Map<TimeWindow, TaskGroup>();
  for (const task of tasks) {
    const window = timeWindowOf(task, day);
    let group = groups.get(window);
    if (!group) {
      group = emptyGroup(window, window, { type: "window", window }, { window });
      groups.set(window, group);
    }
    add(group, task);
  }
  return TIME_WINDOWS.flatMap((window) => groups.get(window) ?? []);
}

/** Workable minutes of a day: a full day, half of it on a half day, none on a weekend or an off day. */
export function dayCapacityMinutes(
  day: string,
  week: WeekConfig,
  workHours: { start: string; end: string },
): number {
  const start = parseClockTime(workHours.start);
  const end = parseClockTime(workHours.end);
  const full = start !== null && end !== null && end > start ? end - start : 0;
  switch (getDayKind(dayToLocalDate(day), week)) {
    case "work":
      return full;
    case "half":
      return Math.round(full / 2);
    default:
      return 0;
  }
}

function groupByDate(tasks: readonly Task[], options: GroupOptions): TaskGroup[] {
  const { day: today, week = IRAN_WEEK, workHours, basis = "planned", weekendMarkers = false } = options;
  const completed = basis === "completed";
  const byDay = new Map<string | null, TaskGroup>();

  const groupFor = (key: string | null): TaskGroup => {
    let group = byDay.get(key);
    if (!group) {
      const weekend = key !== null && getDayKind(dayToLocalDate(key), week) === "weekend";
      group = emptyGroup(`date:${key ?? "none"}`, "date", { type: "date", day: key, relative: key ? relativeDay(key, today) : null }, {
        day: key,
        weekend,
      });
      if (key !== null && workHours) group.capacityMinutes = dayCapacityMinutes(key, week, workHours);
      if (completed && key !== null && diffDays(key, today) > OLD_COMPLETED_DAYS) group.collapsedByDefault = true;
      byDay.set(key, group);
    }
    return group;
  };

  for (const task of tasks) {
    const key = completed && task.completedAt ? dayOfInstant(task.completedAt) : task.date;
    add(groupFor(key), task);
  }

  if (weekendMarkers && !completed && byDay.size > 0) {
    const dated = [...byDay.keys()].filter((key): key is string => key !== null).sort();
    const weekEnd = localDateToDay(getWeekDates(dayToLocalDate(today), week)[6]!);
    const last = dated.length > 0 && dated[dated.length - 1]! > weekEnd ? dated[dated.length - 1]! : weekEnd;
    for (let cursor = addDaysToDay(today, 1); cursor <= last; cursor = addDaysToDay(cursor, 1)) {
      if (getDayKind(dayToLocalDate(cursor), week) === "weekend") groupFor(cursor);
    }
  }

  const keys = [...byDay.keys()];
  const dated = keys.filter((key): key is string => key !== null).sort();
  if (completed) dated.reverse();
  const ordered = dated.map((key) => byDay.get(key)!);
  return byDay.has(null) ? [...ordered, byDay.get(null)!] : ordered;
}

function groupByArea(tasks: readonly Task[]): TaskGroup[] {
  const areas = new Map<string, TaskGroup>();
  const scopes = new Map<Scope, TaskGroup>();
  let none: TaskGroup | undefined;
  for (const task of tasks) {
    if (task.area) {
      let group = areas.get(task.area.id);
      if (!group) {
        group = emptyGroup(`area:${task.area.id}`, "area", { type: "area", area: task.area }, { area: task.area });
        areas.set(task.area.id, group);
      }
      add(group, task);
    } else if (task.scope !== "personal") {
      let group = scopes.get(task.scope);
      if (!group) {
        group = emptyGroup(`scope:${task.scope}`, "area", { type: "scope", scope: task.scope }, { area: null, scope: task.scope });
        scopes.set(task.scope, group);
      }
      add(group, task);
    } else {
      none ??= emptyGroup("area:none", "area", { type: "area", area: null }, { area: null });
      add(none, task);
    }
  }
  const named = [...areas.values()].sort((a, b) => a.area!.name.localeCompare(b.area!.name, "en"));
  const byScope = SCOPE_ORDER.flatMap((scope) => scopes.get(scope) ?? []);
  return [...named, ...byScope, ...(none ? [none] : [])];
}

function groupByPriority(tasks: readonly Task[]): TaskGroup[] {
  const groups = new Map<TaskPriority | null, TaskGroup>();
  for (const task of tasks) {
    let group = groups.get(task.priority);
    if (!group) {
      group = emptyGroup(`priority:${task.priority ?? "none"}`, "priority", { type: "priority", priority: task.priority }, { priority: task.priority });
      groups.set(task.priority, group);
    }
    add(group, task);
  }
  return [...PRIORITY_ORDER, null].flatMap((priority) => groups.get(priority) ?? []);
}

export function groupTasks(tasks: readonly Task[], options: GroupOptions): TaskGroup[] {
  switch (options.mode) {
    case "time":
      return groupByTime(tasks, options.day);
    case "date":
      return groupByDate(tasks, options);
    case "area":
      return groupByArea(tasks);
    case "priority":
      return groupByPriority(tasks);
    default: {
      if (tasks.length === 0) return [];
      const group = emptyGroup("all", "none", { type: "all" });
      for (const task of tasks) add(group, task);
      return [group];
    }
  }
}

/** Every task id in group order: the order rows appear in, for ⇧ ranges and J / K. */
export function groupedIds(groups: readonly TaskGroup[]): string[] {
  return groups.flatMap((group) => group.tasks.map((task) => task.id));
}
