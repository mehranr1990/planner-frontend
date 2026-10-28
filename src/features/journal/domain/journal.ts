import type { JournalEntry, JournalPrompt } from "@/data/domain";
import { addDaysToDay, dayToLocalDate, localDateToDay, parseDay } from "@/lib/dates/clock-time";
import type { CalendarSystem } from "@/lib/dates/format";
import { addCalendarMonths, getDaysInCalendarMonth, startOfCalendarMonth } from "@/lib/dates/month-grid";

/*
 * P14 Journal rules, pure: which day the route shows, the month a list
 * covers, the "Prompt me" order, search and the sparse-trend threshold.
 */

export const JOURNAL_HREF = "/personal/journal";

/** Fewer check-ins than this in the window: mood dots instead of the terrain (no invented terrain). */
export const TERRAIN_MIN_CHECKINS = 3;
/** The compact terrain covers the last seven days. */
export const TERRAIN_DAYS = 7;

/** "Prompt me" offers these in order, skipping the ones already on the entry. */
export const JOURNAL_PROMPTS = ["grateful", "energy", "learned", "proud", "tomorrow"] as const;
export type JournalPromptId = (typeof JOURNAL_PROMPTS)[number];

export function isPromptId(value: string): value is JournalPromptId {
  return (JOURNAL_PROMPTS as readonly string[]).includes(value);
}

export function nextPrompt(prompts: readonly JournalPrompt[]): JournalPromptId | null {
  return JOURNAL_PROMPTS.find((id) => !prompts.some((prompt) => prompt.id === id)) ?? null;
}

/** /personal/journal/:date — a real day up to today; anything else (missing, malformed, future) is today. */
export function resolveJournalDay(param: string | null | undefined, today: string): string {
  return param && parseDay(param) !== null && param <= today ? param : today;
}

export function journalHref(day: string, today: string): string {
  return day === today ? JOURNAL_HREF : `${JOURNAL_HREF}/${day}`;
}

export interface MonthRange {
  start: string;
  end: string;
}

/** The month (in the user's calendar) containing `day`. */
export function monthOf(day: string, calendar: CalendarSystem): MonthRange {
  const date = dayToLocalDate(day);
  const start = localDateToDay(startOfCalendarMonth(date, calendar));
  return { start, end: addDaysToDay(start, getDaysInCalendarMonth(date, calendar) - 1) };
}

export function shiftMonthOf(range: MonthRange, amount: number, calendar: CalendarSystem): MonthRange {
  return monthOf(localDateToDay(addCalendarMonths(dayToLocalDate(range.start), amount, calendar)), calendar);
}

/** Free text search over the words and tags ("#calm" or "calm"). */
export function matchesSearch(entry: JournalEntry, query: string): boolean {
  const needle = query.trim().replace(/^#/, "").toLocaleLowerCase();
  if (!needle) return true;
  const haystack = [entry.text, entry.wentWell, ...entry.prompts.map((prompt) => prompt.answer), ...entry.tags].join("\n").toLocaleLowerCase();
  return haystack.includes(needle);
}

/** Written something (text, went well, a prompt answer)? Otherwise a check-in-only entry. */
export function hasWriting(entry: JournalEntry): boolean {
  return Boolean(entry.text.trim() || entry.wentWell.trim() || entry.prompts.some((prompt) => prompt.answer.trim()));
}

/** The first written line, for the list excerpt. */
export function excerpt(entry: JournalEntry): string {
  const source = entry.text.trim() || entry.wentWell.trim() || entry.prompts.find((prompt) => prompt.answer.trim())?.answer.trim() || "";
  return source.split("\n")[0] ?? "";
}
