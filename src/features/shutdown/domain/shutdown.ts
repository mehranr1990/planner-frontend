import type { EnergyLevel, Task, TaskPriority } from "@/data/domain";
import type { TaskPatch } from "@/data/repositories";
import type { DayBlock, MinuteSpan } from "@/features/my-day/domain/day-blocks";
import { freeGaps, type Gap } from "@/features/my-day/domain/gaps";
import { nextFreeSlot } from "@/features/my-day/domain/placement";
import type { Rollover } from "@/features/planner-settings/planner-settings";
import { addDaysToDay, dayToLocalDate, localDateToDay } from "@/lib/dates/clock-time";
import { getWeekDates, isWorkingDay, nextWorkingDay, type WeekConfig } from "@/lib/dates/week";

/*
 * P10 Daily shutdown, pure. Routing is a draft: every unfinished task gets a
 * destination chip, the outcome tiles and the Tomorrow card follow it live,
 * and nothing is written until Finish day commits the whole draft.
 */

export type RouteDestination = "tomorrow" | "next-working-day" | "pick" | "this-week" | "inbox" | "keep" | "drop";

/** The destination menu, in board order. */
export const ROUTE_DESTINATIONS: readonly RouteDestination[] = [
  "tomorrow",
  "next-working-day",
  "pick",
  "this-week",
  "inbox",
  "keep",
  "drop",
];

/** The "Send all to" row: one tap for every unfinished task. */
export const SEND_ALL_DESTINATIONS: readonly RouteDestination[] = ["tomorrow", "next-working-day", "this-week", "inbox"];

/** A task's draft route; `day` is set for "pick" only. */
export interface Route {
  to: RouteDestination;
  day?: string;
}

/** Task id → route. A task without an entry stays where it is (rollover "keep"). */
export type RouteDraft = Readonly<Record<string, Route>>;

export interface RouteDays {
  tomorrow: string;
  /** Thursday evening → Saturday (Friday is skipped unless it is a work day). */
  nextWorkingDay: string;
  /** The last working day left this week, else tomorrow ("Sat–Thu"). */
  thisWeek: string;
  /** Whether tomorrow is a working day; a weekend tomorrow is shown in red. */
  tomorrowIsWorkDay: boolean;
}

export function routeDays(today: string, week: WeekConfig): RouteDays {
  const tomorrow = addDaysToDay(today, 1);
  const next = nextWorkingDay(dayToLocalDate(today), { config: week });
  const left = getWeekDates(dayToLocalDate(today), week)
    .map(localDateToDay)
    .filter((day) => day > today && isWorkingDay(dayToLocalDate(day), { config: week }));
  return {
    tomorrow,
    nextWorkingDay: next ? localDateToDay(next) : tomorrow,
    thisWeek: left.at(-1) ?? tomorrow,
    tomorrowIsWorkDay: isWorkingDay(dayToLocalDate(tomorrow), { config: week }),
  };
}

/** The day a route lands on; null for routes that leave the calendar (inbox, keep, drop). */
export function routeDay(route: Route, days: RouteDays): string | null {
  switch (route.to) {
    case "tomorrow":
      return days.tomorrow;
    case "next-working-day":
      return days.nextWorkingDay;
    case "this-week":
      return days.thisWeek;
    case "pick":
      return route.day ?? null;
    default:
      return null;
  }
}

/** The patch a calendar route writes (time cleared: it is re-planned on its new day). */
export function routePatch(route: Route, days: RouteDays): TaskPatch | null {
  if (route.to === "keep") return { date: null, time: null };
  const day = routeDay(route, days);
  return day ? { date: day, time: null } : null;
}

/** The pre-filled draft: Tomorrow for every unfinished task, unless the rollover rule keeps tasks where they are. */
export function initialDraft(tasks: readonly Task[], rollover: Rollover): RouteDraft {
  if (rollover === "keep") return {};
  return Object.fromEntries(tasks.map((task) => [task.id, { to: "tomorrow" } satisfies Route]));
}

/** Moved this many times or more: the rose "Repeat offender" hint (suggest Drop or This week). */
export const REPEAT_MOVES = 3;

export function isRepeatOffender(task: Pick<Task, "movedCount">): boolean {
  return (task.movedCount ?? 0) >= REPEAT_MOVES;
}

// ── Outcome ("What happened to today's plan") ───────────────────────────

export interface Outcome {
  /** Done today + unfinished. */
  planned: number;
  completed: number;
  /** Routed to tomorrow or the next working day. */
  tomorrow: number;
  /** Left where they are: still overdue tomorrow morning. */
  overdue: number;
  inbox: number;
  /** This week, a picked date or unscheduled. */
  later: number;
  dropped: number;
}

export function outcome(doneCount: number, unfinished: readonly Task[], draft: RouteDraft): Outcome {
  const result: Outcome = { planned: doneCount + unfinished.length, completed: doneCount, tomorrow: 0, overdue: 0, inbox: 0, later: 0, dropped: 0 };
  for (const task of unfinished) {
    const to = draft[task.id]?.to;
    if (to === "tomorrow" || to === "next-working-day") result.tomorrow += 1;
    else if (to === "inbox") result.inbox += 1;
    else if (to === "drop") result.dropped += 1;
    else if (to) result.later += 1;
    else result.overdue += 1;
  }
  return result;
}

// ── Tomorrow ─────────────────────────────────────────────────────────────

/** A task waiting for an hour slot on tomorrow. */
export interface PendingTask {
  id: string;
  title: string;
  durationMinutes: number;
  energy: EnergyLevel | null;
  priority: TaskPriority | null;
  /** Routed from today in this shutdown (false: already dated tomorrow). */
  routed: boolean;
}

export type Placements = Readonly<Record<string, number>>;

/** Blocks plus placed pending tasks as busy spans, in time order. */
export function busySpans(blocks: readonly DayBlock[], pending: readonly PendingTask[], placements: Placements): MinuteSpan[] {
  const placed = pending
    .filter((task) => placements[task.id] !== undefined)
    .map((task) => ({ startMinutes: placements[task.id]!, endMinutes: placements[task.id]! + task.durationMinutes }));
  return [...blocks, ...placed].sort((a, b) => a.startMinutes - b.startMinutes);
}

/** Free gaps of at least 15 minutes inside the work window ("Drop here · 1h 15m free"). */
export function tomorrowGaps(spans: readonly MinuteSpan[], window: MinuteSpan): Gap[] {
  return freeGaps(spans as DayBlock[], window, 15);
}

const ENERGY_RANK: Record<EnergyLevel | "none", number> = { high: 0, medium: 1, low: 2, none: 3 };
const PRIORITY_RANK: Record<TaskPriority | "none", number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

/**
 * Auto-arrange: high-energy work first (it takes the morning gaps), then by
 * priority; each task goes into the first free gap that holds it inside
 * the work window. Tasks that do not fit stay unplaced.
 */
export function autoArrange(
  blocks: readonly DayBlock[],
  pending: readonly PendingTask[],
  placements: Placements,
  window: MinuteSpan,
): Placements {
  const next: Record<string, number> = { ...placements };
  const order = pending
    .filter((task) => next[task.id] === undefined)
    .sort(
      (a, b) =>
        ENERGY_RANK[a.energy ?? "none"] - ENERGY_RANK[b.energy ?? "none"] ||
        PRIORITY_RANK[a.priority ?? "none"] - PRIORITY_RANK[b.priority ?? "none"],
    );
  for (const task of order) {
    const start = nextFreeSlot(busySpans(blocks, pending, next), window.startMinutes, task.durationMinutes, window, 15);
    if (start !== null) next[task.id] = start;
  }
  return next;
}

/** The first free start that holds `task` inside `gap`, or null. */
export function placeInGap(gap: MinuteSpan, task: PendingTask): number | null {
  return gap.endMinutes - gap.startMinutes >= task.durationMinutes ? gap.startMinutes : null;
}

export interface TomorrowLoad {
  plannedMinutes: number;
  totalMinutes: number;
  overMinutes: number;
}

/** Blocks (breaks excluded) plus every pending task, placed or not, against the work hours. */
export function tomorrowLoad(blocks: readonly DayBlock[], pending: readonly PendingTask[], totalMinutes: number): TomorrowLoad {
  const planned =
    blocks.reduce((sum, block) => (block.kind === "break" ? sum : sum + block.durationMinutes), 0) +
    pending.reduce((sum, task) => sum + task.durationMinutes, 0);
  return { plannedMinutes: planned, totalMinutes, overMinutes: Math.max(0, planned - totalMinutes) };
}

/**
 * "Tomorrow is full": the routed tasks to move on to This week, lowest
 * priority and longest first, until the day fits. Empty when it already fits.
 */
export function overloadSuggestion(load: TomorrowLoad, pending: readonly PendingTask[]): PendingTask[] {
  if (load.overMinutes <= 0) return [];
  const candidates = pending
    .filter((task) => task.routed)
    .sort(
      (a, b) =>
        PRIORITY_RANK[b.priority ?? "none"] - PRIORITY_RANK[a.priority ?? "none"] || b.durationMinutes - a.durationMinutes,
    );
  const moves: PendingTask[] = [];
  let over = load.overMinutes;
  for (const task of candidates) {
    if (over <= 0) break;
    moves.push(task);
    over -= task.durationMinutes;
  }
  return moves;
}
