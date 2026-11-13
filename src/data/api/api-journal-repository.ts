import type { ApiClient, ResponseData } from "@/api/client";
import { newIdempotencyKey } from "@/api/client";
import { addDaysToDay, parseDay } from "@/lib/dates/clock-time";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import { appendJournalLine, normalizeJournalTags, rebaseJournalText, type EnergyLevel, type JournalEntry, type MoodEntry, type MoodLevel } from "../domain";
import { RepositoryError, type JournalChange, type JournalEntryPatch, type JournalRepository } from "../repositories";
import { invalid, isNotFound, mapErrors, pageAll, retryOnConflict, revisionTag } from "./api-shared";

/*
 * Journal (Phase 08): the day's entry is the day's daily check-in
 * (/journal/daily-checkins, one per local date) with its linked mood (/moods).
 * - Mood 1–5 as is; energy low / medium / high ⇄ 1 / 3 / 5 (read: ≤2 low, 3
 *   medium, ≥4 high; a mood without energy reads as medium).
 * - The API entry has one Markdown text. "What went well", prompt answers and
 *   tags have no field of their own, so they are kept as trailing sections of
 *   that text ("## Went well", "## Prompt: <id>", "## Tags"); a user line that
 *   looks like one of those headings is escaped with a backslash.
 * - A day left blank is deleted (entry soft-deleted, mood voided). Undo writes
 *   a new check-in with the same content (the API keeps the deleted revision).
 * - Days in the future have no entry (the API refuses future dates).
 * - Private data: nothing is cached between calls and nothing is logged.
 */

type ApiEntry = ResponseData<"/api/v1/journal/entries/{id}", "patch">;
type ApiMood = ResponseData<"/api/v1/moods/{id}", "patch">;

interface Stored {
  entry: ApiEntry | null;
  mood: ApiMood | null;
}

const PAGE = "100";
const MAX_CONTENT = 50_000;
const MARKER = /^## (?:Went well|Prompt: \S+|Tags)$/;
const ENERGY: Record<EnergyLevel, number> = { low: 1, medium: 3, high: 5 };
const MOODS: readonly unknown[] = [1, 2, 3, 4, 5];

const escapeLines = (text: string) => text.replace(/^(\\*## (?:Went well|Prompt: \S+|Tags))$/gm, "\\$1");
const unescapeLines = (text: string) => text.replace(/^\\(\\*## (?:Went well|Prompt: \S+|Tags))$/gm, "$1");

/** The entry's fields as the one Markdown text the API stores. */
export function encodeJournalContent(entry: Pick<JournalEntry, "text" | "wentWell" | "prompts" | "tags">): string {
  const sections: string[] = [];
  if (entry.wentWell.trim()) sections.push(`## Went well\n${escapeLines(entry.wentWell)}`);
  for (const prompt of entry.prompts) sections.push(`## Prompt: ${encodeURIComponent(prompt.id)}\n${escapeLines(prompt.answer)}`);
  if (entry.tags.length) sections.push(`## Tags\n${entry.tags.map((tag) => `#${tag}`).join(" ")}`);
  return escapeLines(entry.text) + sections.map((section) => `\n\n${section}`).join("");
}

export function decodeJournalContent(content: string): Pick<JournalEntry, "text" | "wentWell" | "prompts" | "tags"> {
  const lines = content.split("\n");
  const starts = lines.flatMap((line, index) => (MARKER.test(line) ? [index] : []));
  const out: Pick<JournalEntry, "text" | "wentWell" | "prompts" | "tags"> = { text: "", wentWell: "", prompts: [], tags: [] };
  if (starts.length === 0) return { ...out, text: unescapeLines(content) };
  // Each part before a heading ends with the blank separator line.
  const part = (from: number, to: number, separated: boolean) => unescapeLines(lines.slice(from, separated ? to - 1 : to).join("\n"));
  out.text = part(0, starts[0], true);
  starts.forEach((start, index) => {
    const last = index === starts.length - 1;
    const body = part(start + 1, last ? lines.length : starts[index + 1], !last);
    const heading = lines[start].slice(3);
    if (heading === "Went well") out.wentWell = body;
    else if (heading === "Tags") out.tags = normalizeJournalTags(body.split(/\s+/).filter(Boolean).map((tag) => tag.replace(/^#/, "")));
    else out.prompts.push({ id: decodeURIComponent(heading.slice("Prompt: ".length)), answer: body });
  });
  return out;
}

function checkDay(day: string): void {
  if (parseDay(day) === null) invalid(`Bad day "${day}"`);
}

function checkLevels(mood: unknown, energy: unknown): void {
  if ((mood !== undefined && mood !== null && !MOODS.includes(mood)) || (energy !== undefined && energy !== null && !(String(energy) in ENERGY))) {
    invalid("Mood must be 1-5 and energy low, medium or high");
  }
}

const blankEntry = (day: string, now: string): JournalEntry => ({ day, mood: null, energy: null, checkedInAt: null, wentWell: "", text: "", prompts: [], tags: [], updatedAt: now });

const isBlank = (entry: JournalEntry) => entry.mood === null && !entry.text.trim() && !entry.wentWell.trim() && entry.tags.length === 0 && entry.prompts.every((prompt) => !prompt.answer.trim());

const energyOf = (value: number | null): EnergyLevel => (value === null || value === 3 ? "medium" : value < 3 ? "low" : "high");

function toEntry(day: string, { entry, mood }: Stored): JournalEntry | null {
  if (!entry && !mood) return null;
  const updatedAt = [entry?.recordedAt, mood?.recordedAt].filter((value): value is string => !!value).sort().at(-1)!;
  const out: JournalEntry = {
    ...blankEntry(day, updatedAt),
    ...(entry ? decodeJournalContent(entry.content.content) : {}),
    ...(mood ? { mood: mood.mood as MoodLevel, energy: energyOf(mood.energy), checkedInAt: mood.recordedAt } : {}),
  };
  return isBlank(out) ? null : out;
}

function moodRow(entry: JournalEntry): MoodEntry | null {
  if (entry.mood === null || entry.energy === null) return null;
  const row: MoodEntry = { day: entry.day, mood: entry.mood, energy: entry.energy, at: entry.checkedInAt ?? entry.updatedAt };
  if (entry.wentWell.trim()) row.wentWell = entry.wentWell;
  return row;
}

/** The day's mood: the one linked to the entry, else the latest recorded that day. */
function pickMood(moods: readonly ApiMood[], day: string, entryId: string | undefined): ApiMood | null {
  const ofDay = moods.filter((mood) => mood.localDate === day && mood.state === "RECORDED").sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  return ofDay.findLast((mood) => entryId !== undefined && mood.journalEntryId === entryId) ?? ofDay.at(-1) ?? null;
}

export function createApiJournalRepository(client: ApiClient, { today }: { today: () => string }): JournalRepository {
  const moodsBetween = (from: string, to: string) =>
    pageAll(async (cursor) => (await client.request("get", "/api/v1/moods", { query: { limit: PAGE, cursor, from, to: addDaysToDay(to, 1), state: "RECORDED" } })).data);

  async function load(day: string): Promise<Stored> {
    if (day > today()) return { entry: null, mood: null };
    let entry: ApiEntry | null = null;
    let mood: ApiMood | null = null;
    try {
      const { data } = await client.request("get", "/api/v1/journal/daily-checkins/{date}", { path: { date: day } });
      entry = data.entry.deleted ? null : data.entry;
      mood = entry && data.mood?.state === "RECORDED" ? data.mood : null;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    mood ??= pickMood(await moodsBetween(day, day), day, entry?.id);
    return { entry, mood };
  }

  async function range(from: string, to: string): Promise<JournalEntry[]> {
    checkDay(from);
    checkDay(to);
    const last = to > today() ? today() : to;
    if (from > last) return [];
    const [checkins, moods] = await mapErrors(() =>
      Promise.all([
        pageAll(async (cursor) => (await client.request("get", "/api/v1/journal/daily-checkins", { query: { limit: PAGE, cursor, from, to: addDaysToDay(last, 1), deleted: "false" } })).data),
        moodsBetween(from, last),
      ]),
    );
    const entries = new Map(checkins.filter((entry) => !entry.deleted).map((entry) => [entry.localDate, entry]));
    const days = new Set([...entries.keys(), ...moods.map((mood) => mood.localDate)]);
    return [...days]
      .filter((day) => from <= day && day <= last)
      .map((day) => toEntry(day, { entry: entries.get(day) ?? null, mood: pickMood(moods, day, entries.get(day)?.id) }))
      .filter((entry): entry is JournalEntry => entry !== null);
  }

  /** Makes the stored day equal `next`; returns what is stored afterwards. */
  async function persist(day: string, next: JournalEntry, stored: Stored): Promise<Stored> {
    let { entry, mood } = stored;
    const blank = isBlank(next);
    const content = { format: "MARKDOWN", version: 1, content: encodeJournalContent(next) } as const;
    if (content.content.length > MAX_CONTENT) invalid("The entry is too long");
    const timezone = getPlannerTimeZone();
    const moodBody = next.mood === null ? null : { mood: next.mood, energy: next.energy ? ENERGY[next.energy] : null };

    if (blank) {
      if (entry) await client.request("delete", "/api/v1/journal/entries/{id}", { path: { id: entry.id }, header: { "If-Match": revisionTag(entry.revision) } });
      entry = null;
    } else if (!entry) {
      const { data } = await client.request("post", "/api/v1/journal/daily-checkins", {
        header: { "Idempotency-Key": newIdempotencyKey() },
        body: { content, localDate: day, timezone, ...(moodBody && !mood ? { mood: moodBody } : {}) },
      });
      entry = data.entry;
      mood ??= data.mood;
    } else if (entry.content.content !== content.content) {
      entry = (await client.request("patch", "/api/v1/journal/entries/{id}", { path: { id: entry.id }, header: { "If-Match": revisionTag(entry.revision) }, body: { content } })).data;
    }

    if (mood && !moodBody) {
      await client.request("patch", "/api/v1/moods/{id}", { path: { id: mood.id }, header: { "If-Match": revisionTag(mood.revision) }, body: { void: true } });
      mood = null;
    } else if (mood && moodBody && (mood.mood !== moodBody.mood || energyOf(mood.energy) !== next.energy)) {
      mood = (await client.request("patch", "/api/v1/moods/{id}", { path: { id: mood.id }, header: { "If-Match": revisionTag(mood.revision) }, body: moodBody })).data;
    } else if (!mood && moodBody && entry) {
      mood = (await client.request("post", "/api/v1/moods", { header: { "Idempotency-Key": newIdempotencyKey() }, body: { ...moodBody, localDate: day, timezone, journalEntryId: entry.id } })).data;
    }
    return { entry, mood };
  }

  /** Read → compute → write; a 409 reads again and repeats the same intent once. */
  async function mutate(day: string, compute: (before: JournalEntry | null, now: string) => JournalEntry): Promise<JournalChange> {
    checkDay(day);
    return mapErrors(() =>
      retryOnConflict(
        async () => {
          const stored = await load(day);
          const previous = toEntry(day, stored);
          const next = compute(previous, new Date().toISOString());
          return { entry: toEntry(day, await persist(day, next, stored)) ?? next, previous };
        },
        async () => undefined,
      ),
    );
  }

  const checkedIn = (before: JournalEntry | null, day: string, now: string, mood: MoodLevel, energy: EnergyLevel): JournalEntry => ({ ...(before ?? blankEntry(day, now)), mood, energy, updatedAt: now });

  return {
    async moods(from, to) {
      return (await range(from, to)).map(moodRow).filter((row): row is MoodEntry => row !== null).sort((a, b) => a.day.localeCompare(b.day));
    },

    async saveReflection(day, { mood, energy, wentWell, note }) {
      checkLevels(mood, energy);
      const { entry } = await mutate(day, (before, now) => {
        const next = checkedIn(before, day, now, mood, energy);
        if (wentWell?.trim()) next.wentWell = wentWell.trim();
        if (note?.trim()) next.text = appendJournalLine(next.text, note.trim());
        return next;
      });
      const row = moodRow(entry)!;
      if (note?.trim()) row.note = note.trim();
      return row;
    },

    async entries(from, to) {
      return (await range(from, to)).sort((a, b) => b.day.localeCompare(a.day));
    },

    async entry(day) {
      checkDay(day);
      return toEntry(day, await mapErrors(() => load(day)));
    },

    async saveEntry(day, { baseText, ...fields }: JournalEntryPatch) {
      checkLevels(fields.mood, fields.energy);
      const patch = Object.fromEntries(Object.entries(structuredClone(fields)).filter(([, value]) => value !== undefined)) as typeof fields;
      const { entry } = await mutate(day, (stored, now) => {
        const before = stored ?? blankEntry(day, now);
        const next: JournalEntry = { ...before, ...patch, updatedAt: now };
        if (patch.text !== undefined && baseText !== undefined) next.text = rebaseJournalText(patch.text, baseText, before.text);
        if (patch.tags) next.tags = normalizeJournalTags(patch.tags);
        if (patch.mood !== undefined && patch.mood !== before.mood && patch.mood !== null) next.energy ??= "medium";
        if (next.mood === null) {
          next.energy = null;
          next.checkedInAt = null;
        }
        return next;
      });
      return entry;
    },

    async checkIn(day, { mood, energy, note }) {
      checkLevels(mood, energy);
      return mutate(day, (before, now) => {
        const next = checkedIn(before, day, now, mood, energy);
        if (note?.trim()) next.text = appendJournalLine(next.text, note.trim());
        return next;
      });
    },

    async append(day, text) {
      const line = text.trim();
      if (!line) invalid("Nothing to append");
      return mutate(day, (before, now) => {
        const base = before ?? blankEntry(day, now);
        return { ...base, text: appendJournalLine(base.text, line), updatedAt: now };
      });
    },

    async removeEntry(day) {
      const { previous } = await mutate(day, (before, now) => {
        if (!before) throw new RepositoryError("not-found", `No journal entry on "${day}"`);
        return blankEntry(day, now);
      });
      return previous!;
    },

    async restoreEntry(entry) {
      checkLevels(entry.mood, entry.energy);
      return (await mutate(entry.day, () => structuredClone(entry))).entry;
    },
  };
}
