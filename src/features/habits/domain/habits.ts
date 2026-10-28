import type { Habit } from "@/data/domain";
import type { HabitFieldCellState } from "@/design-system/data-display/habit-field";
import type { StreakRibbonState } from "@/design-system/data-display/habit-streak-ribbon";
import { addDaysToDay, dayToLocalDate, diffDays, localDateToDay, weekdayOfDay } from "@/lib/dates/clock-time";
import type { CalendarSystem } from "@/lib/dates/format";
import { addCalendarMonths, createCalendarDate, getCalendarParts, getDaysInCalendarMonth, startOfCalendarMonth } from "@/lib/dates/month-grid";
import { getWeekDates, IRAN_WEEK, type WeekConfig } from "@/lib/dates/week";

/*
 * Habit maths shared by Overview (P01), Goals (P11) and Habits (P12). A rest
 * day (scheduled weekday or one-off) and a skipped day never break a streak
 * and never count in it; today still open does not break it either.
 */

type DaysOf = Pick<Habit, "doneDays" | "restWeekdays" | "restDays" | "skippedDays">;

export function isDoneOn(habit: Pick<Habit, "doneDays">, day: string): boolean {
  return habit.doneDays.includes(day);
}

/** A scheduled rest weekday (frequency) — not something the user marked. */
export function isScheduledRest(habit: Pick<Habit, "restWeekdays">, day: string): boolean {
  return habit.restWeekdays.includes(weekdayOfDay(day));
}

export function isRestDay(habit: Pick<Habit, "restWeekdays" | "restDays">, day: string): boolean {
  return isScheduledRest(habit, day) || (habit.restDays?.includes(day) ?? false);
}

export function isSkipped(habit: Pick<Habit, "skippedDays">, day: string): boolean {
  return habit.skippedDays?.includes(day) ?? false;
}

/** Excused: rested or skipped — neither breaks nor counts. */
const isExcused = (habit: DaysOf, day: string) => isRestDay(habit, day) || isSkipped(habit, day);

/** Consecutive done days up to today (or yesterday while today is open), rest / skipped days passed over. */
export function habitStreak(habit: DaysOf, today: string): number {
  let streak = 0;
  let day = isDoneOn(habit, today) ? today : addDaysToDay(today, -1);
  // A year is plenty; it also stops a habit that rests every day from looping forever.
  for (let guard = 0; guard < 366; guard += 1) {
    if (isDoneOn(habit, day)) streak += 1;
    else if (!isExcused(habit, day)) break;
    day = addDaysToDay(day, -1);
  }
  return streak;
}

/** The longest run ever (through today), rest / skipped days passed over. */
export function bestStreak(habit: DaysOf & Pick<Habit, "startDay">, today: string): number {
  const first = habit.startDay ?? [...habit.doneDays].sort()[0];
  if (!first) return 0;
  let best = 0;
  let run = 0;
  for (let day = first, guard = 0; day <= today && guard < 3660; day = addDaysToDay(day, 1), guard += 1) {
    if (isDoneOn(habit, day)) best = Math.max(best, (run += 1));
    else if (!isExcused(habit, day) && day !== today) run = 0;
  }
  return best;
}

export type RibbonDayState = StreakRibbonState;

export interface RibbonDay {
  day: string;
  state: RibbonDayState;
}

/** The week containing `today` (Saturday first by default), one ribbon state per day. */
export function streakWeek(habit: DaysOf & Pick<Habit, "startDay">, today: string, week: WeekConfig = IRAN_WEEK): RibbonDay[] {
  return getWeekDates(dayToLocalDate(today), week).map((date) => {
    const day = localDateToDay(date);
    const done = isDoneOn(habit, day);
    let state: RibbonDayState;
    if (day === today) state = done ? "today-done" : isExcused(habit, day) ? "rest" : "today-open";
    // A new habit: the days before it started are blank, not missed.
    else if (habit.startDay && day < habit.startDay) state = "upcoming";
    else if (done) state = "done";
    else if (isExcused(habit, day)) state = "rest";
    else state = day < today ? "missed" : "upcoming";
    return { day, state };
  });
}

/** The ribbon CTA copy (HabitStreakRibbon board): adapts to the week. */
export type RibbonCopy = "perfect" | "keep" | "restart" | "rest" | "checkIn";

export function ribbonCopy(days: readonly RibbonDay[], streak: number, today: string): RibbonCopy {
  const past = days.filter((entry) => entry.day <= today);
  if (past.every((entry) => entry.state === "upcoming" || entry.state === "today-open") && streak === 0) return "checkIn";
  if (streak === 0) return "restart";
  if (past.some((entry) => entry.state === "rest") && !past.some((entry) => entry.state === "missed")) return "rest";
  if (past.every((entry) => entry.state === "done" || entry.state === "today-done")) return "perfect";
  return "keep";
}

// ── Habit Field ──────────────────────────────────────────────────────────

export type FieldPeriod = "14d" | "month" | "year";

export const FIELD_PERIODS: readonly FieldPeriod[] = ["14d", "month", "year"];

export function isFieldPeriod(value: string | null | undefined): value is FieldPeriod {
  return value === "14d" || value === "month" || value === "year";
}

function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDaysToDay(day, 1)) days.push(day);
  return days;
}

/**
 * The Field's columns: 14 days (10 back, today, 3 ahead — the board's
 * 11–24 Mehr around Tue 21), 7 on phones (the last week); Month and Year
 * are the calendar month / year containing today.
 */
export function fieldDays(period: FieldPeriod, today: string, calendar: CalendarSystem, compact = false): string[] {
  if (period === "14d") return compact ? daysBetween(addDaysToDay(today, -6), today) : daysBetween(addDaysToDay(today, -10), addDaysToDay(today, 3));
  const date = dayToLocalDate(today);
  if (period === "month") {
    const start = startOfCalendarMonth(date, calendar);
    const first = localDateToDay(start);
    return daysBetween(first, addDaysToDay(first, getDaysInCalendarMonth(start, calendar) - 1));
  }
  const { year } = getCalendarParts(date, calendar);
  const first = localDateToDay(createCalendarDate(calendar, year, 1, 1));
  const next = localDateToDay(createCalendarDate(calendar, year + 1, 1, 1));
  return daysBetween(first, addDaysToDay(next, -1));
}

/** Drops the columns before every habit started (sparse first week: hidden, not grey). */
export function trimBeforeStart(days: readonly string[], habits: readonly Pick<Habit, "startDay">[]): string[] {
  if (habits.length === 0 || habits.some((habit) => !habit.startDay)) return [...days];
  const earliest = habits.map((habit) => habit.startDay!).sort()[0]!;
  return days.filter((day) => day >= earliest);
}

export function cellState(habit: DaysOf & Pick<Habit, "startDay">, day: string, today: string): HabitFieldCellState {
  if (habit.startDay && day < habit.startDay) return "hidden";
  if (isDoneOn(habit, day)) return "done";
  if (day > today) return isRestDay(habit, day) ? "rest" : "future";
  if (isRestDay(habit, day)) return "rest";
  if (isSkipped(habit, day)) return "skipped";
  return day === today ? "open" : "missed";
}

/** Past / today after the start, and not a scheduled rest weekday (a one-off rest can be undone). */
export function isCellInteractive(habit: Pick<Habit, "restWeekdays" | "startDay">, day: string, today: string): boolean {
  return day <= today && !(habit.startDay && day < habit.startDay) && !isScheduledRest(habit, day);
}

export interface Completion {
  done: number;
  possible: number;
  /** done / possible, or null with nothing possible yet. */
  ratio: number | null;
}

/** Done ÷ days that counted (from the start, through today; rest / skipped days don't count). */
export function completion(habit: DaysOf & Pick<Habit, "startDay">, days: readonly string[], today: string): Completion {
  let done = 0;
  let possible = 0;
  for (const day of days) {
    if (day > today || (habit.startDay && day < habit.startDay)) continue;
    if (isDoneOn(habit, day)) {
      done += 1;
      possible += 1;
    } else if (!isExcused(habit, day) && day !== today) possible += 1;
  }
  return { done, possible, ratio: possible ? Math.min(1, done / possible) : null };
}

/** Days of data since the habit started (sparse below 7: the ring stays hidden). */
export function daysOfData(habit: Pick<Habit, "startDay" | "doneDays">, today: string): number {
  const first = habit.startDay ?? [...habit.doneDays].sort()[0];
  return first ? Math.max(0, diffDays(first, today) + 1) : 0;
}

export const RING_MIN_DAYS = 7;

export interface MonthHistory {
  /** First day of the month, "YYYY-MM-DD". */
  start: string;
  days: string[];
  completion: Completion;
}

/** The last `count` calendar months through today's, oldest first (RingCard History). */
export function monthHistory(habit: DaysOf & Pick<Habit, "startDay">, today: string, calendar: CalendarSystem, count = 4): MonthHistory[] {
  const current = startOfCalendarMonth(dayToLocalDate(today), calendar);
  const months: MonthHistory[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const startDate = addCalendarMonths(current, -offset, calendar);
    const start = localDateToDay(startDate);
    const days = daysBetween(start, addDaysToDay(start, getDaysInCalendarMonth(startDate, calendar) - 1));
    months.push({ start, days, completion: completion(habit, days, today) });
  }
  return months;
}

/** The scheduled weekdays (frequency), in the week's order. */
export function scheduledWeekdays(habit: Pick<Habit, "restWeekdays">, week: WeekConfig = IRAN_WEEK): number[] {
  return Array.from({ length: 7 }, (_, index) => (week.weekStartsOn + index) % 7).filter((day) => !habit.restWeekdays.includes(day));
}

/** The day on or after `from` that falls on a JS weekday (for weekday names). */
export function dayOfWeekday(from: string, weekday: number): string {
  return addDaysToDay(from, (weekday - weekdayOfDay(from) + 7) % 7);
}
