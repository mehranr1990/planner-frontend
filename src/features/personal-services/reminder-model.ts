import type { Weekday } from "@/lib/dates/week";
import { parseClockTime } from "@/lib/dates/clock-time";

export { dayOfInstant, instantToClockTime } from "@/lib/dates/clock-time";

/** "HH:MM" (24h). */
export const isClockTimeString = (value: string): boolean => parseClockTime(value) !== null;

/** Iran week order (Saturday first) of JS weekday numbers. */
export const WEEK_ORDER: readonly Weekday[] = [6, 0, 1, 2, 3, 4, 5];

/** Toggles a weekday, keeping the list sorted. */
export function toggleWeekday(days: readonly Weekday[], day: Weekday): Weekday[] {
  return (days.includes(day) ? days.filter((item) => item !== day) : [...days, day]).sort((a, b) => a - b);
}
