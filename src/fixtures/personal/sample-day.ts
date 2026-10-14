/*
 * SAMPLE DATA — the fixed sample day shared by every Personal fixture:
 * Tue 13 Oct 2026 (21 Mehr 1405), now 14:35 in Tehran. Matches the shell
 * fixtures (src/fixtures/shell.ts) so the schedule island and the Personal
 * pages tell the same day.
 */

/** Marks every export in this module as sample content. */
export const isSampleData = true;

/** The sample "today" as a calendar day. */
export const SAMPLE_DAY = "2026-10-13";

/** The sample "now" as an instant. */
export const SAMPLE_NOW = "2026-10-13T14:35:00+03:30";

const pad = (value: number) => String(value).padStart(2, "0");

/** An ISO instant for Tehran wall-clock time on `day` (Tehran has no DST). */
export function sampleInstant(day: string, hours: number, minutes = 0): string {
  return `${day}T${pad(hours)}:${pad(minutes)}:00+03:30`;
}

/** Calendar days around the sample day, named as the boards say them. */
export const sampleDays = {
  /** Sat 18 Mehr */
  saturday: "2026-10-10",
  /** Sun 19 Mehr */
  sunday: "2026-10-11",
  /** Mon 20 Mehr — "Yesterday" */
  yesterday: "2026-10-12",
  /** Tue 21 Mehr */
  today: SAMPLE_DAY,
  /** Wed 22 Mehr */
  tomorrow: "2026-10-14",
  /** Thu 23 Mehr */
  thursday: "2026-10-15",
  /** Fri 24 Mehr (weekend) */
  friday: "2026-10-16",
  /** Sat 25 Mehr — "Next week" in the snooze popover */
  nextSaturday: "2026-10-17",
} as const;
