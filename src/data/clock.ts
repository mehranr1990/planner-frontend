import { SAMPLE_DAY, SAMPLE_NOW } from "@/fixtures/personal/sample-day";

/*
 * The planner's clock seam. Until real data exists, "today" is the boards'
 * sample day (Tue 21 Mehr 1405 · 13 Oct 2026, 14:35 Tehran), so server and
 * client render the same day and fixtures line up with it. Swap these for a
 * real clock (APP_TIME_ZONE wall time) together with the API client.
 */

/** Today as a local calendar day, "YYYY-MM-DD". */
export function getPlannerToday(): string {
  return SAMPLE_DAY;
}

/** The current instant (ISO string with offset). */
export function getPlannerNow(): string {
  return SAMPLE_NOW;
}

/** Local midnight of a "YYYY-MM-DD" day. */
export function dayToDate(day: string): Date {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, date);
}
