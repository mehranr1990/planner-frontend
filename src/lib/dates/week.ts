import { addDays, startOfDay, startOfWeek } from "date-fns";

/** JS weekday numbers: 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/*
 * The week is configuration, not a constant: Settings (P17) lets the user
 * change the first day and the weekend. Every helper takes an optional
 * config and defaults to the Iranian week.
 */
export interface WeekConfig {
  weekStartsOn: Weekday;
  /** Full working days. */
  workDays: readonly Weekday[];
  /** Short working days (Thursday in Iran): working, but not full. */
  halfDays: readonly Weekday[];
  /** Shown in red in calendars. */
  weekendDays: readonly Weekday[];
}

/** Iranian week: Saturday first, Saturday–Wednesday work days, Thursday half, Friday off. */
export const IRAN_WEEK: WeekConfig = {
  weekStartsOn: 6,
  workDays: [6, 0, 1, 2, 3],
  halfDays: [4],
  weekendDays: [5],
};

// Iranian defaults kept for existing imports; new code takes a WeekConfig.
export const WEEK_STARTS_ON: Weekday = IRAN_WEEK.weekStartsOn;
export const WORK_DAYS: readonly Weekday[] = IRAN_WEEK.workDays;
export const WEEKEND_DAYS: readonly Weekday[] = IRAN_WEEK.weekendDays;

/** `off` = neither working nor weekend (a day a custom config leaves out). */
export type DayKind = "work" | "half" | "weekend" | "off";

function weekday(date: Date): Weekday {
  return date.getDay() as Weekday;
}

/** Weekend wins over work, so an inconsistent config still renders the day red. */
export function getDayKind(date: Date, config: WeekConfig = IRAN_WEEK): DayKind {
  const day = weekday(date);
  if (config.weekendDays.includes(day)) return "weekend";
  if (config.workDays.includes(day)) return "work";
  if (config.halfDays.includes(day)) return "half";
  return "off";
}

export function isWeekend(date: Date, config: WeekConfig = IRAN_WEEK): boolean {
  return getDayKind(date, config) === "weekend";
}

/** A full work day; a half day (Thursday) is not. See isWorkingDay. */
export function isWorkday(date: Date, config: WeekConfig = IRAN_WEEK): boolean {
  return getDayKind(date, config) === "work";
}

export function isHalfDay(date: Date, config: WeekConfig = IRAN_WEEK): boolean {
  return getDayKind(date, config) === "half";
}

export interface WorkingDayOptions {
  config?: WeekConfig;
  /** Count half days (Thursday) as working days. Default true. */
  includeHalfDays?: boolean;
}

/** A day work can be scheduled on: full work days, plus half days unless excluded. */
export function isWorkingDay(
  date: Date,
  { config = IRAN_WEEK, includeHalfDays = true }: WorkingDayOptions = {},
): boolean {
  const kind = getDayKind(date, config);
  return kind === "work" || (includeHalfDays && kind === "half");
}

/**
 * Local midnight of the first working day strictly after `from`:
 * Wednesday → Thursday, Thursday → Saturday, Friday → Saturday
 * (Wednesday → Saturday without half days). Null when the config has no
 * working days at all, so callers never loop forever.
 */
export function nextWorkingDay(from: Date, options: WorkingDayOptions = {}): Date | null {
  const start = startOfDay(from);
  for (let offset = 1; offset <= 7; offset++) {
    const day = addDays(start, offset);
    if (isWorkingDay(day, options)) return day;
  }
  return null;
}

/** The seven dates of the week containing `date`, from the config's first day. */
export function getWeekDates(date: Date, config: WeekConfig = IRAN_WEEK): Date[] {
  const start = startOfWeek(date, { weekStartsOn: config.weekStartsOn });
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}
