/*
 * Time-zone handling without a dependency. The date formatters in this folder
 * read a Date's local fields, which differ between a UTC server and a browser
 * in Tehran for the same instant — a hydration mismatch waiting to happen.
 * Converting every instant to the app's wall-clock time first makes server
 * and client output identical.
 */

/** The planner's display time zone until a per-user setting exists. */
export const APP_TIME_ZONE = "Asia/Tehran";

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * A Date whose *local* fields equal the wall-clock time of `instant` in
 * `timeZone`. Only for display and calendar arithmetic; never send it back
 * to a server as an instant.
 */
export function toZonedTime(instant: Date, timeZone: string = APP_TIME_ZONE): Date {
  const parts: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return new Date(
    parts.year!,
    parts.month! - 1,
    parts.day!,
    parts.hour!,
    parts.minute!,
    parts.second!,
    instant.getMilliseconds(),
  );
}
