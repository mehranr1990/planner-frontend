import type { BrainDumpLine, BrainDumpPage } from "@/data/domain";
import { addDaysToDay, dayOfInstant, minutesOfInstant } from "@/lib/dates/clock-time";
import { quickParse, type QuickParseResult } from "@/features/tasks/domain/quick-parse";

/*
 * P08 rules that are pure: which page "today" is (a new page starts at
 * 04:00), what counts as unsorted, the Markdown shortcuts ("- " list,
 * "[] " checkbox) and keeping the editor's draft in step with the store.
 */

/** A new page starts at 04:00: writing at 01:30 still lands on yesterday's page. */
export const PAGE_START_MINUTES = 4 * 60;

/** Auto-save fires on every pause this long (P08 Auto-save rule). */
export const AUTOSAVE_MS = 600;

export function pageDayOf(instant: string): string {
  const day = dayOfInstant(instant);
  return minutesOfInstant(instant) < PAGE_START_MINUTES ? addDaysToDay(day, -1) : day;
}

export const isBlank = (line: Pick<BrainDumpLine, "text">) => line.text.trim() === "";

export const isSorted = (line: BrainDumpLine) => Boolean(line.sortedTo || line.struck);

export const isUnsorted = (line: BrainDumpLine) => !isBlank(line) && !isSorted(line);

export interface PageStats {
  lines: number;
  sorted: number;
  unsorted: number;
}

export function pageStats(lines: readonly BrainDumpLine[]): PageStats {
  const written = lines.filter((line) => !isBlank(line));
  const unsorted = written.filter((line) => !isSorted(line)).length;
  return { lines: written.length, sorted: written.length - unsorted, unsorted };
}

export type LineKind = "plain" | "bullet" | "todo" | "done";

const TODO = /^\[\s?\]\s/;
const DONE = /^\[[xX]\]\s/;

/** The Markdown shortcuts — the only markup the page knows. */
export function lineKind(text: string): LineKind {
  if (DONE.test(text)) return "done";
  if (TODO.test(text)) return "todo";
  if (/^[-*]\s/.test(text)) return "bullet";
  return "plain";
}

/** The text without its shortcut prefix (for parsing and for sending elsewhere). */
export function lineBody(text: string): string {
  return text.replace(DONE, "").replace(TODO, "").replace(/^[-*]\s/, "").trim();
}

/** Ticks or unticks a checkbox line; other lines are returned as they are. */
export function toggleTodo(text: string): string {
  if (DONE.test(text)) return text.replace(DONE, "[] ");
  if (TODO.test(text)) return text.replace(TODO, "[x] ");
  return text;
}

/** The Convert popover's pre-fill: quick-parse of the body, title sentence-cased. */
export function parseLine(text: string, today: string): QuickParseResult {
  const parsed = quickParse(lineBody(text), today);
  const title = parsed.title || lineBody(text);
  return { ...parsed, title: title.charAt(0).toLocaleUpperCase() + title.slice(1) };
}

const TAG_FIELDS = ["sortedTo", "sortedDay", "taskId", "inboxItemId", "struck"] as const;

/**
 * The editor keeps its own text (the user may be typing); sort tags come from
 * the store. Lines the store no longer has keep their draft state.
 */
export function mergeTags(draft: readonly BrainDumpLine[], page: BrainDumpPage): BrainDumpLine[] {
  const stored = new Map(page.lines.map((line) => [line.id, line]));
  return draft.map((line) => {
    const from = stored.get(line.id);
    if (!from) return line;
    const next: BrainDumpLine = { id: line.id, text: line.text };
    for (const field of TAG_FIELDS) if (from[field] !== undefined) Object.assign(next, { [field]: from[field] });
    return next;
  });
}

/** Splits pasted text into lines (CRLF-safe). */
export function splitLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}
