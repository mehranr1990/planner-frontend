import { isLiveApi } from "@/api/runtime";
import { SAMPLE_DAY, SAMPLE_NOW } from "@/fixtures/personal/sample-day";
import { dayOfInstant } from "@/lib/dates/clock-time";

/*
 * The planner's clock seam. Mock mode: the boards' sample day (Tue 21 Mehr
 * 1405 · 13 Oct 2026, 14:35 Tehran), so fixtures line up and server/client
 * render the same day. Live API mode: the real clock in the planner zone (the
 * account timezone, see lib/dates/zone.ts); private screens render only on
 * the client behind the auth gate, so there is no server/client day mismatch.
 */

/** Today as a local calendar day, "YYYY-MM-DD". */
export function getPlannerToday(): string {
  return isLiveApi() ? dayOfInstant(new Date().toISOString()) : SAMPLE_DAY;
}

/** The current instant (ISO string with offset). */
export function getPlannerNow(): string {
  return isLiveApi() ? new Date().toISOString() : SAMPLE_NOW;
}

/** Local midnight of a "YYYY-MM-DD" day. */
export function dayToDate(day: string): Date {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, date);
}
