"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  completionPhase,
  completionReducer,
  INITIAL_COMPLETION,
  nextCompletionDelay,
  type CompletionPhase,
} from "./domain/completion";

/*
 * Schedules the completion lifecycle (domain/completion.ts) on real timers:
 * `complete(id)` starts the 1.2s hold, `reopen(id)` (Undo, un-check) cancels
 * it, and `phase(id)` says whether the row is a normal row, a struck row on
 * hold, or collapsed into the group's "· N done" counter. Reduced motion does
 * not change the timing (the spec keeps the 1.2s hold; only the collapse
 * animation is instant), so this hook does not read it. `now` is injectable
 * for tests.
 */

export interface CompletionLifecycle {
  phase(id: string): CompletionPhase;
  complete(id: string): void;
  reopen(id: string): void;
  reset(): void;
}

export function useCompletionLifecycle(now: () => number = Date.now): CompletionLifecycle {
  const [state, dispatch] = useReducer(completionReducer, INITIAL_COMPLETION);
  const clock = useRef(now);
  useEffect(() => {
    clock.current = now;
  }, [now]);

  // One timer, aimed at the next hold to end.
  useEffect(() => {
    const delay = nextCompletionDelay(state, clock.current());
    if (delay === null) return;
    const timer = setTimeout(() => dispatch({ type: "tick", now: clock.current() }), delay);
    return () => clearTimeout(timer);
  }, [state]);

  const phase = useCallback((id: string) => completionPhase(state, id), [state]);
  const complete = useCallback((id: string) => dispatch({ type: "complete", id, now: clock.current() }), []);
  const reopen = useCallback((id: string) => dispatch({ type: "reopen", id }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  return { phase, complete, reopen, reset };
}
