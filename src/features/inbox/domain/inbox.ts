import type { InboxDestination, InboxItem } from "@/data/domain";
import { addDaysToDay, dayOfInstant, dayToLocalDate, instantAt, localDateToDay, minutesOfInstant } from "@/lib/dates/clock-time";
import { nextWorkingDay, type WeekConfig } from "@/lib/dates/week";
import { quickParse, type QuickParseResult } from "@/features/tasks/domain/quick-parse";

/*
 * P07 Inbox, pure: suggestions (date → Task, URL → note), Today / Earlier
 * groups, snooze options, the keyboard map and the processing summary.
 * No clock: `today` / `now` are passed in.
 */

/** Every destination the Process card offers (Snooze / Archive / Drop are separate). */
export type InboxTarget = InboxDestination | "brain-dump";
export const INBOX_TARGETS: readonly InboxTarget[] = ["task", "event", "note", "journal", "reminder", "brain-dump"];

/** P07 Keyboard: T E N J R B destinations. */
export const TARGET_KEYS: Record<InboxTarget, string> = {
  task: "t",
  event: "e",
  note: "n",
  journal: "j",
  reminder: "r",
  "brain-dump": "b",
};

const URL_PATTERN = /(^|\s)(https?:\/\/|www\.)?[\w-]+(\.[\w-]+)+\/\S*/i;

export function looksLikeUrl(text: string): boolean {
  return URL_PATTERN.test(text);
}

export interface InboxSuggestion {
  /** Pre-selected destination; null when parsing found nothing to go on. */
  target: InboxTarget | null;
  parsed: QuickParseResult;
}

/** The stored suggestion wins; otherwise a URL → read-later note, a parsed date or time → task. */
export function suggestFor(item: Pick<InboxItem, "text" | "suggested">, today: string): InboxSuggestion {
  const parsed = quickParse(item.text, today);
  if (item.suggested) return { target: item.suggested, parsed };
  if (looksLikeUrl(item.text)) return { target: "note", parsed };
  if (parsed.date || parsed.time) return { target: "task", parsed };
  return { target: null, parsed };
}

export interface InboxGroups {
  today: InboxItem[];
  earlier: InboxItem[];
}

/** Back-from-snooze items and today's captures are "Today"; the rest "Earlier". Order is kept. */
export function groupInbox(items: readonly InboxItem[], today: string): InboxGroups {
  const groups: InboxGroups = { today: [], earlier: [] };
  for (const item of items) {
    (item.backFromSnooze || dayOfInstant(item.capturedAt) === today ? groups.today : groups.earlier).push(item);
  }
  return groups;
}

/** Days since the oldest capture ("oldest 3 days"), 0 for none or today. */
export function oldestAgeDays(items: readonly InboxItem[], today: string): number {
  let oldest = 0;
  const base = dayToLocalDate(today).getTime();
  for (const item of items) {
    const days = Math.round((base - dayToLocalDate(dayOfInstant(item.capturedAt)).getTime()) / 86_400_000);
    oldest = Math.max(oldest, days);
  }
  return oldest;
}

export type SnoozeOptionId = "evening" | "tomorrow" | "nextWorkingDay" | "nextWeek";

export interface SnoozeOption {
  id: SnoozeOptionId;
  day: string;
  minutes: number;
  /** The instant the item returns. */
  until: string;
}

const EVENING = 18 * 60;
const MORNING = 9 * 60;

/** Days from `day` to the next week start (1–7). */
function daysToNextWeekStart(day: string, weekStartsOn: number): number {
  const weekday = dayToLocalDate(day).getDay();
  return ((weekStartsOn - weekday + 7) % 7) || 7;
}

/**
 * The snooze popover: This evening (only before 18:00), Tomorrow morning,
 * Next working day (hidden when it is tomorrow, like Reschedule) and Next
 * week (its first day). "Pick date…" is the caller's date picker.
 */
export function snoozeOptions(now: string, week: WeekConfig): SnoozeOption[] {
  const today = dayOfInstant(now);
  const tomorrow = addDaysToDay(today, 1);
  const working = nextWorkingDay(dayToLocalDate(today), { config: week });
  const workingDay = working ? localDateToDay(working) : null;
  const nextWeek = addDaysToDay(today, daysToNextWeekStart(today, week.weekStartsOn));
  const at = (id: SnoozeOptionId, day: string, minutes: number): SnoozeOption => ({ id, day, minutes, until: instantAt(day, minutes) });
  return [
    ...(minutesOfInstant(now) < EVENING ? [at("evening", today, EVENING)] : []),
    at("tomorrow", tomorrow, MORNING),
    ...(workingDay && workingDay !== tomorrow ? [at("nextWorkingDay", workingDay, MORNING)] : []),
    at("nextWeek", nextWeek, MORNING),
  ];
}

/** A picked day: back at 09:00. */
export function snoozeUntilDay(day: string): string {
  return instantAt(day, MORNING);
}

export interface ProcessSummary {
  total: number;
  tasks: number;
  events: number;
  archived: number;
  /** Everything else: notes, journal, reminders, Brain Dump, snoozed, dropped. */
  other: number;
}

export type ProcessOutcome = InboxTarget | "snooze" | "archive" | "drop";

/** "Processed 6 items · 4 tasks · 1 event · 1 archived". */
export function summarize(outcomes: readonly ProcessOutcome[]): ProcessSummary {
  const summary: ProcessSummary = { total: outcomes.length, tasks: 0, events: 0, archived: 0, other: 0 };
  for (const outcome of outcomes) {
    if (outcome === "task") summary.tasks += 1;
    else if (outcome === "event") summary.events += 1;
    else if (outcome === "archive") summary.archived += 1;
    else summary.other += 1;
  }
  return summary;
}
