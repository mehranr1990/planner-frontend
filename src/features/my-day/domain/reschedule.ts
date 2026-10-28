import type { TimeBlockKind } from "@/data/domain";
import {
  addDaysToDay,
  dayOfInstant,
  dayToLocalDate,
  formatClockTime,
  localDateToDay,
  minutesOfInstant,
  weekdayOfDay,
} from "@/lib/dates/clock-time";
import { getDayKind, getWeekDates, IRAN_WEEK, nextWorkingDay, type WeekConfig, type Weekday } from "@/lib/dates/week";
import { plannedMinutes, workWindow } from "./capacity";
import type { DayBlock, MinuteSpan } from "./day-blocks";
import { suggestFreeSlot } from "./placement";

/*
 * The Reschedule popover's rows (P18 E + P02, also Tasks P03). The
 * suggestions are relative to the planner's today (the day of `now`): Later
 * today, Tomorrow, the next working day after today — Thursday → Saturday,
 * Friday → Saturday, with a "Friday is weekend" note when the weekend was
 * skipped — and This week: the first working day left after those. The
 * whole-day helpers below are the one place "tomorrow" and "this week" are
 * resolved from the week config (the Tasks board columns use them too).
 */

/** The day a whole-day "Tomorrow" means: tomorrow, or the next working day when tomorrow is a weekend (Thu → Sat). */
export function workingTomorrow(today: string, week: WeekConfig = IRAN_WEEK): string {
  const tomorrow = addDaysToDay(today, 1);
  if (getDayKind(dayToLocalDate(tomorrow), week) !== "weekend") return tomorrow;
  const next = nextWorkingDay(dayToLocalDate(today), { config: week });
  return next ? localDateToDay(next) : tomorrow;
}

/** The last day of the week containing `day` (the config's week: Saturday → Friday for Iran). */
export function weekEndDay(day: string, week: WeekConfig = IRAN_WEEK): string {
  return localDateToDay(getWeekDates(dayToLocalDate(day), week)[6]!);
}

/** "This week": the working days after the working tomorrow up to the week's end (none on Wed / Thu of the Iran week). */
export function restOfWeekDays(today: string, week: WeekConfig = IRAN_WEEK): string[] {
  const end = weekEndDay(today, week);
  const days: string[] = [];
  for (let day = addDaysToDay(workingTomorrow(today, week), 1); day <= end; day = addDaysToDay(day, 1)) {
    if (getDayKind(dayToLocalDate(day), week) !== "weekend") days.push(day);
  }
  return days;
}

/** How long after work ends a suggested slot may still start (and fit). */
const AFTER_WORK_MINUTES = 180;

/** Suggestions start half an hour into the workday so the first slot is not the very first minute. */
const DEFAULT_START_OFFSET = 30;

export type RescheduleOptionId =
  | "later-today"
  | "tomorrow"
  | "next-working-day"
  | "this-week"
  | "pick"
  | "unscheduled";

/** My Day / Calendar (P02 · P04): every row but "This week". */
export const DEFAULT_RESCHEDULE_OPTIONS: readonly RescheduleOptionId[] = [
  "later-today",
  "tomorrow",
  "next-working-day",
  "pick",
  "unscheduled",
];

/** Tasks (P03) and Task detail (P06): the default rows plus "This week". */
export const TASK_RESCHEDULE_OPTIONS: readonly RescheduleOptionId[] = [
  "later-today",
  "tomorrow",
  "next-working-day",
  "this-week",
  "pick",
  "unscheduled",
];

interface Slot {
  /** Calendar day the option moves to. */
  day: string;
  startMinutes: number;
  /** "HH:mm" of startMinutes. */
  start: string;
}

export type RescheduleOption =
  | (Slot & { id: "later-today"; freeMinutes: number })
  | (Slot & { id: "tomorrow"; bestFit: boolean })
  | (Slot & {
      id: "next-working-day";
      /** JS weekday of the day, for its localised name ("Sat"). */
      weekday: Weekday;
      /** "fri-weekend" when a weekend day was skipped on the way. */
      note: "fri-weekend" | null;
      /** True when it is the same day as Tomorrow (the UI may fold the rows). */
      sameAsTomorrow: boolean;
      bestFit: boolean;
    })
  | (Slot & {
      id: "this-week";
      /** JS weekday of the day, for its localised name. */
      weekday: Weekday;
    })
  | { id: "pick" }
  | { id: "unscheduled" };

export interface RescheduleInput {
  /** The planner's now (ISO instant). */
  now: string;
  /** The day of `blocks`: the day the thing being rescheduled sits on. */
  day: string;
  /** Blocks of `day`. */
  blocks: readonly DayBlock[];
  /** Blocks of other days, when known (tomorrow's free slots and load); unknown days count as empty. */
  blocksByDay?: Readonly<Record<string, readonly DayBlock[]>>;
  /** What moves: its length and kind; `blockId` is ignored when looking for free time. */
  task: { durationMinutes: number; kind: TimeBlockKind; blockId?: string };
  week: WeekConfig;
  workHours: { start: string; end: string };
  /** The rows the caller offers; default DEFAULT_RESCHEDULE_OPTIONS (no "This week"). */
  allow?: readonly RescheduleOptionId[];
  /** The protected focus window: suggested slots avoid it when anything else fits. */
  protectedFocus?: MinuteSpan | null;
}

function slot(day: string, startMinutes: number): Slot {
  return { day, startMinutes, start: formatClockTime(startMinutes) };
}

/**
 * Ordered rows; the first is the preselected one. "Later today" is omitted when nothing fits, "unscheduled" for
 * non-task blocks, and any row the caller does not allow.
 */
export function rescheduleOptions(input: RescheduleInput): RescheduleOption[] {
  const { now, day, task, week } = input;
  const work = workWindow(input.workHours);
  const today = dayOfInstant(now);
  const duration = task.durationMinutes;
  const horizon = work.endMinutes + AFTER_WORK_MINUTES;

  const blocksOn = (target: string): DayBlock[] => {
    const known = target === day ? input.blocks : (input.blocksByDay?.[target] ?? []);
    return known.filter((block) => block.id !== task.blockId);
  };

  const options: RescheduleOption[] = [];

  // Later today: the first free slot from now + 15m, on :00 / :30.
  const todayBlocks = blocksOn(today);
  const avoid = input.protectedFocus ?? null;
  const laterStart = suggestFreeSlot(
    todayBlocks,
    minutesOfInstant(now) + 15,
    duration,
    { startMinutes: 0, endMinutes: horizon },
    avoid,
  );
  if (laterStart !== null) {
    const nextStart = todayBlocks
      .filter((block) => block.startMinutes > laterStart)
      .reduce((min, block) => Math.min(min, block.startMinutes), horizon);
    options.push({ id: "later-today", ...slot(today, laterStart), freeMinutes: Math.max(0, nextStart - laterStart) });
  }

  const defaultStart = work.startMinutes + DEFAULT_START_OFFSET;
  // A half day (Thursday) offers the first half of the workday only.
  const windowEndOn = (target: string): number =>
    getDayKind(dayToLocalDate(target), week) === "half"
      ? Math.floor((work.startMinutes + work.endMinutes) / 2)
      : horizon;
  const startOn = (target: string): number =>
    suggestFreeSlot(
      blocksOn(target),
      defaultStart,
      duration,
      { startMinutes: work.startMinutes, endMinutes: windowEndOn(target) },
      avoid,
    ) ?? defaultStart;

  const tomorrow = addDaysToDay(today, 1);
  const tomorrowIsWeekend = getDayKind(dayToLocalDate(tomorrow), week) === "weekend";
  const tomorrowSlot = slot(tomorrow, startOn(tomorrow));

  const followingDate = nextWorkingDay(dayToLocalDate(today), { config: week });
  const following = followingDate ? localDateToDay(followingDate) : null;
  let followingOption: Extract<RescheduleOption, { id: "next-working-day" }> | null = null;
  if (following && followingDate) {
    const skippedWeekend = daysBetween(today, following).some(
      (between) => getDayKind(dayToLocalDate(between), week) === "weekend",
    );
    followingOption = {
      id: "next-working-day",
      ...slot(following, startOn(following)),
      weekday: weekdayOfDay(following),
      note: skippedWeekend ? "fri-weekend" : null,
      sameAsTomorrow: following === tomorrow,
      bestFit: false,
    };
  }

  // Best fit: the lighter of the offered days (tomorrow wins a tie); a weekend never is.
  const load = (target: string) => plannedMinutes(blocksOn(target));
  const tomorrowBest =
    !tomorrowIsWeekend && (!following || load(tomorrow) <= load(following) || following === tomorrow);
  options.push({ id: "tomorrow", ...tomorrowSlot, bestFit: tomorrowBest });
  if (followingOption) {
    followingOption.bestFit = !tomorrowBest && following !== tomorrow;
    options.push(followingOption);
  }

  // This week: the first working day left after Tomorrow / the next working day.
  const allow = input.allow ?? DEFAULT_RESCHEDULE_OPTIONS;
  const [weekDay] = allow.includes("this-week")
    ? restOfWeekDays(today, week).filter((target) => target !== tomorrow && target !== following)
    : [];
  if (weekDay) options.push({ id: "this-week", ...slot(weekDay, startOn(weekDay)), weekday: weekdayOfDay(weekDay) });

  options.push({ id: "pick" });
  if (task.kind === "task") options.push({ id: "unscheduled" });
  return options.filter((option) => allow.includes(option.id));
}

/** Calendar days from `from` (inclusive) to `to` (exclusive). */
function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day < to; day = addDaysToDay(day, 1)) days.push(day);
  return days;
}
