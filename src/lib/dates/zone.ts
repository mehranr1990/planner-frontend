/*
 * Time-zone handling without a dependency. The date formatters in this folder
 * read a Date's local fields, which differ between a UTC server and a browser
 * in Tehran for the same instant — a hydration mismatch waiting to happen.
 * Converting every instant to the app's wall-clock time first makes server
 * and client output identical.
 */

/** The default planner time zone (mock mode, server render, before the account loads). */
export const APP_TIME_ZONE = "Asia/Tehran";

let plannerTimeZone = APP_TIME_ZONE;

/** The zone that defines "today", day boundaries and wall-clock times: the account zone in live mode. */
export function getPlannerTimeZone(): string {
  return plannerTimeZone;
}

/** Live mode: the account settings zone (IANA). Invalid names are ignored. Returns whether it changed. */
export function setPlannerTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    return false;
  }
  const changed = timeZone !== plannerTimeZone;
  plannerTimeZone = timeZone;
  return changed;
}

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
export function toZonedTime(instant: Date, timeZone: string = getPlannerTimeZone()): Date {
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
