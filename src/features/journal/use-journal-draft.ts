"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EnergyLevel, JournalEntry, JournalPrompt, MoodLevel } from "@/data/domain";
import { useSaveJournalEntry } from "@/data/queries";
import type { JournalEntryPatch } from "@/data/repositories";
import { AUTOSAVE_MS } from "@/features/brain-dump/domain/brain-dump";
import type { SaveStatus } from "@/features/brain-dump/use-brain-dump-draft";

/*
 * The composer's draft (P14 Auto-save), on Brain Dump's pattern: typing edits
 * it locally and a 600ms pause saves it; a mood, tag or prompt change saves
 * at once. Leaving the day (or the page) saves what is pending.
 *
 * Saves are field-level patches of what the composer changed, never the
 * whole draft, so a newer mood (sheet), Shutdown reflection or Inbox / Brain
 * Dump line written elsewhere survives. Text carries `baseText` (the stored
 * text it grew from) so lines appended meanwhile are re-appended. Fields the
 * composer has not touched follow the stored entry.
 */

export interface JournalDraftValue {
  mood: MoodLevel | null;
  energy: EnergyLevel;
  wentWell: string;
  text: string;
  prompts: JournalPrompt[];
  tags: string[];
}

type DraftField = keyof JournalDraftValue;

export interface JournalDraft {
  value: JournalDraftValue;
  status: SaveStatus;
  savedAt: string | null;
  /** `immediate`: save now instead of after the pause (choices, not typing). */
  edit(patch: Partial<JournalDraftValue>, immediate?: boolean): void;
  flush(): Promise<void>;
}

export function draftOf(entry: JournalEntry | null): JournalDraftValue {
  return {
    mood: entry?.mood ?? null,
    energy: entry?.energy ?? "medium",
    wentWell: entry?.wentWell ?? "",
    text: entry?.text ?? "",
    prompts: entry?.prompts ?? [],
    tags: entry?.tags ?? [],
  };
}

/** The save patch for the changed fields; mood and energy travel together when the mood changed. */
export function draftPatch(value: JournalDraftValue, fields: ReadonlySet<DraftField>, baseText: string): JournalEntryPatch {
  const patch: JournalEntryPatch = {};
  if (fields.has("mood")) {
    patch.mood = value.mood;
    patch.energy = value.mood === null ? null : value.energy;
  } else if (fields.has("energy")) patch.energy = value.energy;
  if (fields.has("wentWell")) patch.wentWell = value.wentWell;
  if (fields.has("text")) Object.assign(patch, { text: value.text, baseText });
  if (fields.has("prompts")) patch.prompts = value.prompts;
  if (fields.has("tags")) patch.tags = value.tags;
  return patch;
}

const FIELDS: readonly DraftField[] = ["mood", "energy", "wentWell", "text", "prompts", "tags"];

export function useJournalDraft(day: string, entry: JournalEntry | null): JournalDraft {
  const [value, setValue] = useState(() => draftOf(entry));
  const [status, setStatus] = useState<SaveStatus>(entry ? "saved" : "idle");
  const [savedAt, setSavedAt] = useState<string | null>(entry?.updatedAt ?? null);
  const { mutateAsync: save } = useSaveJournalEntry();
  const latest = useRef(value);
  /** Changed since the last save. */
  const dirty = useRef(new Set<DraftField>());
  /** Being saved now. */
  const saving = useRef(new Set<DraftField>());
  /** The stored text the draft's text grew from. */
  const baseText = useRef(entry?.text ?? "");
  const seen = useRef(entry);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** Takes the stored value of every field the composer is not editing or saving. */
  const adopt = useCallback((stored: JournalEntry | null) => {
    const busy = (field: DraftField) => dirty.current.has(field) || saving.current.has(field);
    const fresh = draftOf(stored);
    const next = { ...latest.current };
    let changed = false;
    for (const field of FIELDS) {
      const moodPair = field === "mood" || field === "energy";
      if (moodPair ? busy("mood") || busy("energy") : busy(field)) continue;
      if (next[field] !== fresh[field]) {
        Object.assign(next, { [field]: fresh[field] });
        changed = true;
      }
    }
    if (!busy("text")) baseText.current = fresh.text;
    if (!changed) return;
    latest.current = next;
    setValue(next);
  }, []);

  // A newer stored entry (the mood sheet, Inbox, Shutdown…) shows in the fields not being edited.
  useEffect(() => {
    if (entry === seen.current) return;
    seen.current = entry;
    adopt(entry);
  }, [entry, adopt]);

  const saveDirty = useCallback(async () => {
    if (!dirty.current.size) return;
    const fields = dirty.current;
    dirty.current = new Set();
    saving.current = fields;
    setStatus("saving");
    const sentText = latest.current.text;
    try {
      const saved = await save({ day, patch: draftPatch(latest.current, fields, baseText.current) });
      // Text typed during the save grew from what was sent; otherwise the stored text is the base.
      if (fields.has("text")) baseText.current = sentText;
      saving.current = new Set();
      adopt(saved);
      setSavedAt(saved.updatedAt);
      setStatus(dirty.current.size ? "saving" : "saved");
    } catch {
      saving.current = new Set();
      for (const field of fields) dirty.current.add(field);
      setStatus("error");
    }
  }, [adopt, day, save]);

  // One save at a time, so each patch rebases on the one before.
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    queue.current = queue.current.then(saveDirty);
    return queue.current;
  }, [saveDirty]);

  const edit = useCallback(
    (patch: Partial<JournalDraftValue>, immediate = false) => {
      const next = { ...latest.current, ...patch };
      latest.current = next;
      setValue(next);
      for (const field of Object.keys(patch) as DraftField[]) dirty.current.add(field);
      clearTimeout(timer.current);
      if (immediate) void flush();
      else timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
    },
    [flush],
  );

  // Leaving the day saves what is pending.
  useEffect(() => () => void flush(), [flush]);

  return { value, status, savedAt, edit, flush };
}
