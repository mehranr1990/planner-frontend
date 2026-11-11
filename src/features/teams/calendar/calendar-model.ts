import type { TeamCalendarOverlay, TeamEventDetail, TeamRsvp } from "@/data/team-domain";

/*
 * TM-03 pure helpers: layer filtering, the hour window of the time grid and
 * where a timed item sits in it, the RSVP summary, and which event the detail
 * card shows by default. No React; tested in team-calendar-screen.test.tsx.
 */

export type TeamCalLayer = "events" | "dues" | "timeOff" | "projects";
export const TEAM_CAL_LAYERS: readonly TeamCalLayer[] = ["events", "dues", "timeOff", "projects"];

export type TeamCalItem =
  | { layer: "events" | "timeOff"; event: TeamEventDetail }
  | { layer: "dues" | "projects"; overlay: TeamCalendarOverlay };

export const minutesOf = (time: string): number => {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
};

export function layerOfEvent(event: TeamEventDetail): "events" | "timeOff" {
  return event.kind === "time-off" ? "timeOff" : "events";
}

/** Every item of the shown layers, by day, in time order (all-day first). */
export function itemsByDay(
  events: readonly TeamEventDetail[],
  overlays: readonly TeamCalendarOverlay[],
  shown: ReadonlySet<TeamCalLayer>,
): Map<string, TeamCalItem[]> {
  const items: TeamCalItem[] = [
    ...events.map((event): TeamCalItem => ({ layer: layerOfEvent(event), event })),
    ...overlays.map((overlay): TeamCalItem => ({ layer: overlay.kind === "task-due" ? "dues" : "projects", overlay })),
  ].filter((item) => shown.has(item.layer));
  const map = new Map<string, TeamCalItem[]>();
  for (const item of items) map.set(dayOf(item), [...(map.get(dayOf(item)) ?? []), item]);
  for (const list of map.values()) list.sort((a, b) => (startOf(a) ?? -1) - (startOf(b) ?? -1));
  return map;
}

export const dayOf = (item: TeamCalItem): string => ("event" in item ? item.event.day : item.overlay.day);

/** Start minutes, or null for all-day items (time off, task dues, untimed events). */
export function startOf(item: TeamCalItem): number | null {
  if ("event" in item) return item.event.time ? minutesOf(item.event.time) : null;
  return item.overlay.kind === "project-event" ? minutesOf(item.overlay.time) : null;
}

/** End minutes; a point-in-time item (no end) takes one hour on the grid. */
export function endOf(item: TeamCalItem): number | null {
  const start = startOf(item);
  if (start === null) return null;
  const end = "event" in item ? item.event.end : item.overlay.kind === "project-event" ? item.overlay.end : null;
  return end ? Math.max(minutesOf(end), start + 15) : start + 60;
}

/** Whole hours shown by the grid: 09–18 widened to fit every timed item. */
export function hourWindow(items: Iterable<TeamCalItem>, busy: readonly { start: string; end: string }[] = []) {
  let from = 9 * 60;
  let to = 18 * 60;
  for (const item of items) {
    const start = startOf(item);
    if (start === null) continue;
    from = Math.min(from, start);
    to = Math.max(to, endOf(item)!);
  }
  for (const slot of busy) {
    from = Math.min(from, minutesOf(slot.start));
    to = Math.max(to, minutesOf(slot.end));
  }
  return { from: Math.floor(from / 60) * 60, to: Math.min(24 * 60, Math.ceil(to / 60) * 60) };
}

export function rsvpCounts(event: TeamEventDetail): Record<TeamRsvp | "none", number> {
  const counts = { going: 0, maybe: 0, no: 0, none: 0 };
  for (const invitee of event.invitees) counts[invitee.rsvp ?? "none"] += 1;
  return counts;
}

/** The detail card's event: the one in the URL, else the first meeting with an agenda, else the first meeting. */
export function pickEvent(events: readonly TeamEventDetail[], requested: string | null): TeamEventDetail | null {
  const meetings = events.filter((event) => event.kind === "meeting");
  return (
    (requested ? events.find((event) => event.id === requested) : undefined) ??
    meetings.find((event) => event.agenda.length > 0) ??
    meetings[0] ??
    null
  );
}
