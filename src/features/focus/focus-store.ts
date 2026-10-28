"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import { advance, type FocusSession } from "./domain/timer";

/*
 * The running Focus session, per viewer. One module-level store persisted to
 * localStorage (every access in try/catch), so leaving Focus keeps the timer
 * running and the schedule island / My Day Focus card can show it. The server
 * snapshot is null: nothing about the session renders until hydration.
 */

export const FOCUS_STORAGE_KEY = "mp-focus-session";

const sessionSchema = z.object({
  taskId: z.string().nullable(),
  config: z.object({
    focusMinutes: z.number().positive(),
    shortBreakMinutes: z.number().positive(),
    longBreakMinutes: z.number().positive(),
    cyclesBeforeLongBreak: z.number().int().positive(),
    autoStartNext: z.boolean(),
  }),
  phase: z.enum(["focus", "short", "long"]),
  cycle: z.number().int().positive(),
  status: z.enum(["running", "paused", "ready", "complete"]),
  durationMs: z.number().nonnegative(),
  accumulatedMs: z.number().nonnegative(),
  runningSince: z.number().nullable(),
  pausedSince: z.number().nullable(),
  completedCycles: z.number().int().nonnegative(),
  focusedMs: z.number().nonnegative(),
  unrecorded: z.number().int().nonnegative(),
  parked: z.array(z.string()),
  parkedCount: z.number().int().nonnegative(),
  startedAt: z.number(),
}) satisfies z.ZodType<FocusSession>;

export function parseFocusSession(raw: string | null): FocusSession | null {
  if (!raw) return null;
  try {
    const parsed = sessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();
let loaded = false;
let current: FocusSession | null = null;

function load(): FocusSession | null {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    try {
      current = parseFocusSession(window.localStorage.getItem(FOCUS_STORAGE_KEY));
    } catch {
      current = null;
    }
  }
  return current;
}

function persist(session: FocusSession | null) {
  try {
    if (session) window.localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(FOCUS_STORAGE_KEY);
  } catch {
    // Private mode or blocked storage: the session still lives for this tab.
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key !== FOCUS_STORAGE_KEY) return;
  current = parseFocusSession(event.newValue);
  emit();
}

function subscribe(listener: Listener) {
  if (listeners.size === 0 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export const focusStore = {
  get: load,
  /** Applies a transition to the latest session (no-op when there is none, unless `update` creates one). */
  update(update: (session: FocusSession | null) => FocusSession | null) {
    const next = update(load());
    if (next === current) return;
    current = next;
    persist(next);
    emit();
  },
  clear() {
    focusStore.update(() => null);
  },
  /** Test seam: forget the cached session so the next read comes from storage. */
  reset() {
    loaded = false;
    current = null;
  },
};

export type FocusClock = () => number;
const systemClock: FocusClock = () => Date.now();

/** The session (null on the server and before hydration). */
export function useFocusSession(): FocusSession | null {
  return useSyncExternalStore(subscribe, load, () => null);
}

/**
 * The session plus a `now` that re-renders once a second while it runs.
 * Elapsed time comes from timestamps; the interval only repaints. Ran-out
 * phases are caught up here, so any reader keeps the machine moving.
 */
export function useFocusTimer(clock: FocusClock = systemClock): { session: FocusSession | null; now: number } {
  const session = useFocusSession();
  const running = session?.status === "running";
  // Paused also repaints, for "Paused · 2m".
  const ticking = running || session?.status === "paused";
  const [now, setNow] = useState(() => clock());

  useEffect(() => {
    if (!ticking) return;
    const tick = () => {
      const at = clock();
      setNow(at);
      focusStore.update((latest) => (latest ? advance(latest, at) : latest));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [ticking, clock]);

  return { session, now: running ? Math.max(now, session.runningSince ?? now) : now };
}
