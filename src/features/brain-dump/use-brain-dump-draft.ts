"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { BrainDumpLine, BrainDumpPage } from "@/data/domain";
import { useSaveBrainDump } from "@/data/queries";
import { AUTOSAVE_MS, mergeTags } from "./domain/brain-dump";

/*
 * The page's editable draft. Typing changes it locally; a pause of 600ms
 * saves it (P08 Auto-save). Sorting flushes first, then takes the store's
 * tags back without touching what is being typed.
 */

export type SaveStatus = "idle" | "saving" | "saved" | "error";

let lineCounter = 0;

/** Client-made ids: a new id is a new line for the store. Only called on interaction or after hydration. */
export function newLineId(): string {
  lineCounter += 1;
  return `bd-${Date.now().toString(36)}-${lineCounter}`;
}

/** There is always somewhere to type: a blank last line when the page is empty or ends on a sorted line. */
function withBlank(lines: readonly BrainDumpLine[]): BrainDumpLine[] {
  const last = lines[lines.length - 1];
  return last && !last.sortedTo && !last.struck ? [...lines] : [...lines, { id: newLineId(), text: "" }];
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** navigator.onLine, SSR-safe (online on the server). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

export interface BrainDumpDraft {
  lines: BrainDumpLine[];
  status: SaveStatus;
  savedAt: string | null;
  /** Edits the draft and schedules a save. */
  edit(update: (lines: BrainDumpLine[]) => BrainDumpLine[]): void;
  /** Saves now if anything is pending. */
  flush(): Promise<void>;
  /** Takes the store's sort tags (after sort / strike / send). */
  applyTags(page: BrainDumpPage): void;
  /** Replaces the draft with the store's page (after clear / restore). */
  replace(page: BrainDumpPage): void;
}

export function useBrainDumpDraft(page: BrainDumpPage): BrainDumpDraft {
  const { day } = page;
  const [lines, setLines] = useState<BrainDumpLine[]>(() => withBlank(page.lines));
  const [status, setStatus] = useState<SaveStatus>(page.savedAt ? "saved" : "idle");
  const [savedAt, setSavedAt] = useState(page.savedAt);
  const { mutateAsync: save } = useSaveBrainDump();
  const latest = useRef(lines);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    latest.current = lines;
  }, [lines]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    setStatus("saving");
    try {
      const saved = await save({ day, lines: latest.current.map(({ id, text }) => ({ id, text })) });
      setSavedAt(saved.savedAt);
      setStatus(dirty.current ? "saving" : "saved");
    } catch {
      dirty.current = true;
      setStatus("error");
    }
  }, [day, save]);

  const edit = useCallback(
    (update: (current: BrainDumpLine[]) => BrainDumpLine[]) => {
      setLines((current) => withBlank(update(current)));
      dirty.current = true;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
    },
    [flush],
  );

  // Leaving the page (or switching day) saves what was typed.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (dirty.current) void save({ day, lines: latest.current.map(({ id, text }) => ({ id, text })) }).catch(() => undefined);
    },
    [day, save],
  );

  const applyTags = useCallback((stored: BrainDumpPage) => {
    setLines((current) => withBlank(mergeTags(current, stored)));
    setSavedAt(stored.savedAt);
  }, []);

  const replace = useCallback((stored: BrainDumpPage) => {
    clearTimeout(timer.current);
    dirty.current = false;
    setLines(withBlank(stored.lines));
    setSavedAt(stored.savedAt);
    setStatus(stored.savedAt ? "saved" : "idle");
  }, []);

  return { lines, status, savedAt, edit, flush, applyTags, replace };
}
