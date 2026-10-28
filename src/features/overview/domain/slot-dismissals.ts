import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { LiveSlot } from "./live-slot";

/*
 * Live-slot "Later" / "Dismiss" persist for the current planner day; the
 * first-run "Skip" persists for good. Per viewer, in this browser
 * (localStorage, every access guarded); the server snapshot is "nothing
 * dismissed", so SSR and hydration agree and the stored choice applies
 * right after hydration.
 */

export type SlotKind = LiveSlot["kind"];

export interface SlotDismissals {
  /** The planner day the `kinds` belong to (YYYY-MM-DD). */
  day: string | null;
  kinds: SlotKind[];
  /** First run skipped: never shown again. */
  firstRunSkipped: boolean;
}

const KINDS: readonly SlotKind[] = ["morning", "gap", "evening", "live"];
export const SLOT_DISMISSALS_KEY = "mp-overview-slot-dismissals";
const EVENT = "mp-overview-slot-dismissals";
const EMPTY: SlotDismissals = { day: null, kinds: [], firstRunSkipped: false };

export function parseSlotDismissals(raw: string | null): SlotDismissals {
  if (!raw) return EMPTY;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return EMPTY;
    const record = data as Record<string, unknown>;
    return {
      day: typeof record.day === "string" ? record.day : null,
      kinds: Array.isArray(record.kinds) ? KINDS.filter((kind) => (record.kinds as unknown[]).includes(kind)) : [],
      firstRunSkipped: record.firstRunSkipped === true,
    };
  } catch {
    return EMPTY;
  }
}

/** What is hidden today: the day's kinds (stale days drop) plus a permanent first-run skip. */
export function dismissedFor(state: SlotDismissals, day: string): ReadonlySet<SlotKind> {
  const set = new Set<SlotKind>(state.day === day ? state.kinds : []);
  if (state.firstRunSkipped) set.add("first-run");
  return set;
}

export function addDismissal(state: SlotDismissals, day: string, kind: SlotKind): SlotDismissals {
  if (kind === "first-run") return { ...state, firstRunSkipped: true };
  const kinds = state.day === day ? state.kinds : [];
  return { ...state, day, kinds: kinds.includes(kind) ? kinds : [...kinds, kind] };
}

function read(): string | null {
  try {
    return window.localStorage.getItem(SLOT_DISMISSALS_KEY);
  } catch {
    return null;
  }
}

function subscribe(listener: () => void): () => void {
  window.addEventListener("storage", listener);
  window.addEventListener(EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(EVENT, listener);
  };
}

function write(state: SlotDismissals) {
  try {
    window.localStorage.setItem(SLOT_DISMISSALS_KEY, JSON.stringify(state));
  } catch {
    // Blocked storage: the in-memory copy still hides it for this visit.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useSlotDismissals(day: string): [ReadonlySet<SlotKind>, (kind: SlotKind) => void] {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const stored = useMemo(() => parseSlotDismissals(raw), [raw]);
  const [memory, setMemory] = useState<{ raw: string | null; state: SlotDismissals }>({ raw, state: stored });
  const state = memory.raw === raw ? memory.state : stored;
  const dismissed = useMemo(() => dismissedFor(state, day), [state, day]);
  const dismiss = useCallback(
    (kind: SlotKind) => {
      const next = addDismissal(state, day, kind);
      write(next);
      setMemory({ raw: read(), state: next });
    },
    [state, day],
  );
  return [dismissed, dismiss];
}
