import { addDays, startOfWeek } from "date-fns";

/** JS weekday numbers: 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Iranian week: Saturday first, Saturday–Wednesday work days, Friday off. */
export const WEEK_STARTS_ON: Weekday = 6;
export const WORK_DAYS: readonly Weekday[] = [6, 0, 1, 2, 3];
export const WEEKEND_DAYS: readonly Weekday[] = [5];

export function isWeekend(date: Date): boolean {
  return WEEKEND_DAYS.includes(date.getDay() as Weekday);
}

export function isWorkday(date: Date): boolean {
  return WORK_DAYS.includes(date.getDay() as Weekday);
}

/** The seven dates of the Saturday-first week containing `date`. */
export function getWeekDates(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON });
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}
