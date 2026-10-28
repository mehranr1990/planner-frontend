import { parseDay } from "@/lib/dates/clock-time";
import { appendJournalLine as appendLine, normalizeJournalTags as normalizeTags, rebaseJournalText, type EnergyLevel, type JournalEntry, type MoodEntry, type MoodLevel } from "../domain";
import { RepositoryError, type JournalChange, type JournalEntryPatch, type JournalRepository } from "../repositories";

/*
 * In-memory Journal (P14): one entry per day. Mood rows (Overview, Shutdown,
 * the terrain) are derived from the entries that carry a check-in, so every
 * source (composer, mood sheet, Shutdown, Inbox / Brain Dump lines) moves
 * the same record.
 */

interface MockJournalOptions {
  moods: readonly MoodEntry[];
  entries: readonly JournalEntry[];
  now: string;
  respond<T>(value: T): Promise<T>;
}

const MOODS: readonly number[] = [1, 2, 3, 4, 5];
const ENERGIES: readonly string[] = ["low", "medium", "high"];

function checkLevels(mood: unknown, energy: unknown): void {
  if ((mood !== undefined && mood !== null && !MOODS.includes(mood as number)) || (energy !== undefined && energy !== null && !ENERGIES.includes(energy as string))) {
    throw new RepositoryError("invalid", "Mood must be 1-5 and energy low, medium or high");
  }
}

function checkDay(day: string): void {
  if (parseDay(day) === null) throw new RepositoryError("invalid", `Bad day "${day}"`);
}

export function blankEntry(day: string, now: string): JournalEntry {
  return { day, mood: null, energy: null, checkedInAt: null, wentWell: "", text: "", prompts: [], tags: [], updatedAt: now };
}

/** Nothing written and no check-in: the entry does not exist. */
export function isBlankEntry(entry: JournalEntry): boolean {
  return entry.mood === null && !entry.text.trim() && !entry.wentWell.trim() && entry.tags.length === 0 && entry.prompts.every((prompt) => !prompt.answer.trim());
}

function moodRow(entry: JournalEntry): MoodEntry | null {
  if (entry.mood === null || entry.energy === null) return null;
  const row: MoodEntry = { day: entry.day, mood: entry.mood, energy: entry.energy, at: entry.checkedInAt ?? entry.updatedAt };
  if (entry.wentWell.trim()) row.wentWell = entry.wentWell;
  return row;
}

export function createMockJournal({ moods, entries: seed, now, respond }: MockJournalOptions): JournalRepository {
  const byDay = new Map<string, JournalEntry>();
  for (const mood of moods) {
    byDay.set(mood.day, { ...blankEntry(mood.day, mood.at), mood: mood.mood, energy: mood.energy, checkedInAt: mood.at, wentWell: mood.wentWell ?? "", text: mood.note ?? "" });
  }
  for (const entry of structuredClone([...seed])) byDay.set(entry.day, { ...byDay.get(entry.day), ...entry });

  const current = (day: string) => byDay.get(day) ?? null;

  /** Writes `next` (or deletes the day when it is blank) and returns it with the entry before. */
  function commit(day: string, next: JournalEntry): JournalChange {
    const previous = current(day);
    if (isBlankEntry(next)) byDay.delete(day);
    else byDay.set(day, next);
    return { entry: next, previous: previous ? structuredClone(previous) : null };
  }

  function checkedIn(day: string, mood: MoodLevel, energy: EnergyLevel): JournalEntry {
    return { ...(current(day) ?? blankEntry(day, now)), mood, energy, checkedInAt: now, updatedAt: now };
  }

  return {
    moods(from, to) {
      const rows = [...byDay.values()]
        .filter((entry) => from <= entry.day && entry.day <= to)
        .map(moodRow)
        .filter((row): row is MoodEntry => row !== null)
        .sort((a, b) => a.day.localeCompare(b.day));
      return respond(rows);
    },
    async saveReflection(day, { mood, energy, wentWell, note }) {
      checkDay(day);
      checkLevels(mood, energy);
      const next = checkedIn(day, mood, energy);
      if (wentWell?.trim()) next.wentWell = wentWell.trim();
      if (note?.trim()) next.text = appendLine(next.text, note.trim());
      commit(day, next);
      const row = moodRow(next)!;
      if (note?.trim()) row.note = note.trim();
      return respond(row);
    },
    entries(from, to) {
      return respond([...byDay.values()].filter((entry) => from <= entry.day && entry.day <= to).sort((a, b) => b.day.localeCompare(a.day)));
    },
    entry(day) {
      return respond(current(day));
    },
    async saveEntry(day, { baseText, ...fields }: JournalEntryPatch) {
      checkDay(day);
      checkLevels(fields.mood, fields.energy);
      // Only the fields given move; undefined never erases the stored value.
      const patch = Object.fromEntries(Object.entries(structuredClone(fields)).filter(([, value]) => value !== undefined)) as typeof fields;
      const before = current(day) ?? blankEntry(day, now);
      const next: JournalEntry = { ...before, ...patch, updatedAt: now };
      if (patch.text !== undefined && baseText !== undefined) next.text = rebaseJournalText(patch.text, baseText, before.text);
      if (patch.tags) next.tags = normalizeTags(patch.tags);
      if (patch.mood !== undefined && patch.mood !== before.mood) {
        next.checkedInAt = patch.mood === null ? null : now;
        if (patch.mood === null) next.energy = null;
        else next.energy ??= "medium";
      }
      if (next.mood === null) next.energy = null;
      return respond(commit(day, next).entry);
    },
    async checkIn(day, { mood, energy, note }) {
      checkDay(day);
      checkLevels(mood, energy);
      const next = checkedIn(day, mood, energy);
      if (note?.trim()) next.text = appendLine(next.text, note.trim());
      return respond(commit(day, next));
    },
    async append(day, text) {
      checkDay(day);
      const line = text.trim();
      if (!line) throw new RepositoryError("invalid", "Nothing to append");
      const before = current(day) ?? blankEntry(day, now);
      return respond(commit(day, { ...before, text: appendLine(before.text, line), updatedAt: now }));
    },
    async removeEntry(day) {
      const entry = current(day);
      if (!entry) throw new RepositoryError("not-found", `No journal entry on "${day}"`);
      byDay.delete(day);
      return respond(entry);
    },
    async restoreEntry(entry) {
      checkDay(entry.day);
      byDay.set(entry.day, structuredClone(entry));
      return respond(entry);
    },
  };
}
