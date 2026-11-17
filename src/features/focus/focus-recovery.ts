"use client";

import { useEffect } from "react";
import { newIdempotencyKey } from "@/api/client";
import { useRepositories } from "@/data/provider";
import type { FocusRecoveryAction, FocusRecoveryRepository, ServerFocusSession } from "@/data/repositories";
import type { FocusSession } from "./domain/timer";
import { focusStore, subscribeFocus } from "./focus-store";

/*
 * Live mode: mirrors the browser Focus timer onto recoverable server
 * sessions, one STOPWATCH session per focus cycle (breaks are not work).
 * - A focus cycle that starts running → create(recoverable) + START; pause /
 *   resume → PAUSE / RESUME; HEARTBEAT every 30 s while running.
 * - The cycle closes as finished (timer end or "finish early") → its span is
 *   claimed synchronously, then FINISH records the TRACKED entry (the Focus
 *   adapter writes no manual entry for a claimed span). Any other end (End
 *   focus mid-cycle, switch to a break, back) → DISCARD, as before nothing
 *   is recorded for a partial cycle.
 * - After a reload or a gap the server answers INTERRUPTED (no heartbeat
 *   for 60 s) → RECOVER (pauses at the last acknowledged work) and, when the
 *   browser is still running, RESUME (a fresh span).
 * - Commands run one at a time; each logical command keeps one retry key,
 *   persisted with the session id so a reload can resume the same command.
 * +5 min is browser-only: the server's EXTEND applies to POMODORO sessions,
 * and a stopwatch records the actual time anyway. Mock mode: no-op.
 */

const MIRROR_KEY = "mp-focus-server";
const HEARTBEAT_MS = 30_000;
/** After a refused or failed command, wait before trying again (the timer ticks every second). */
const BACKOFF_MS = 30_000;

interface Mirror {
  /** The mirrored browser cycle: `${startedAt}:${cycle}`. */
  cycle: string;
  session: ServerFocusSession;
  /** The cycle closed as finished: FINISH (else DISCARD). */
  finished: boolean;
  /** The in-flight command and its stable retry key. */
  pending: { action: FocusRecoveryAction; key: string } | null;
}

const cycleOf = (session: FocusSession) => `${session.startedAt}:${session.cycle}`;
const mirrors = (session: FocusSession | null): session is FocusSession =>
  session !== null && session.phase === "focus" && (session.status === "running" || session.status === "paused");
const terminal = (session: ServerFocusSession) => session.state === "FINISHED" || session.state === "ABANDONED" || session.recoveryState === "TERMINAL";

function load(): Mirror | null {
  try {
    const raw = window.localStorage.getItem(MIRROR_KEY);
    return raw ? (JSON.parse(raw) as Mirror) : null;
  } catch {
    return null;
  }
}

function save(mirror: Mirror | null) {
  try {
    if (mirror) window.localStorage.setItem(MIRROR_KEY, JSON.stringify(mirror));
    else window.localStorage.removeItem(MIRROR_KEY);
  } catch {
    // Storage blocked: the mirror still works for this page.
  }
}

/** One controller per page, shared by every mounted Focus reader. */
function createController(api: FocusRecoveryRepository) {
  let mirror: Mirror | null = load();
  let fresh = false;
  let previous: FocusSession | null = focusStore.get();
  let chain: Promise<void> = Promise.resolve();
  let blockedUntil = 0;

  const enqueue = (step: () => Promise<void>) => {
    const work = chain.then(step).catch(() => {
      // Re-read the server session on the next pass (stale revision, gap, network), after a pause.
      fresh = false;
      blockedUntil = Date.now() + BACKOFF_MS;
    });
    chain = work;
    api.track(work);
  };

  const run = async (action: FocusRecoveryAction) => {
    if (!mirror) return;
    const key = mirror.pending?.action === action ? mirror.pending.key : newIdempotencyKey();
    mirror.pending = { action, key };
    save(mirror);
    const next = await api.command(mirror.session, action, key);
    mirror = { ...mirror, session: next, pending: null };
    save(mirror);
  };

  const reconcile = async (): Promise<void> => {
    if (Date.now() < blockedUntil) return;
    const browser = focusStore.get();
    if (!mirror) {
      if (!mirrors(browser)) return;
      mirror = { cycle: cycleOf(browser), session: await api.create("Focus"), finished: false, pending: null };
      fresh = true;
      save(mirror);
    } else if (!fresh) {
      mirror = { ...mirror, session: await api.get(mirror.session.id) };
      fresh = true;
      save(mirror);
    }
    if (terminal(mirror.session)) {
      mirror = null;
      save(null);
      return reconcile();
    }
    if (mirror.session.recoveryState === "INTERRUPTED") await run("RECOVER");
    if (!mirrors(browser) || cycleOf(browser) !== mirror.cycle) {
      // FINISH needs work behind it; a cycle never started on the server is discarded.
      await run(mirror.finished && mirror.session.state !== "IDLE" ? "FINISH" : "DISCARD");
      mirror = null;
      save(null);
      return reconcile();
    }
    const { state } = mirror.session;
    if (browser.status === "running" && state === "IDLE") await run("START");
    else if (browser.status === "running" && state === "PAUSED") await run("RESUME");
    else if (browser.status === "paused" && state === "RUNNING") await run("PAUSE");
    else if (browser.status === "paused" && state === "IDLE") {
      await run("START");
      await run("PAUSE");
    }
  };

  const onChange = () => {
    const next = focusStore.get();
    // Synchronous claim, before any reader drains the span into a manual entry.
    if (mirror && previous && cycleOf(previous) === mirror.cycle && next && next.completedCycles > previous.completedCycles) {
      const span = next.spans?.[previous.spans?.length ?? 0];
      if (span) {
        api.claim(span.endAt);
        mirror = { ...mirror, finished: true };
        save(mirror);
      }
    }
    previous = next;
    enqueue(reconcile);
  };

  const heartbeat = () => {
    if (mirror?.session.state !== "RUNNING") return;
    enqueue(async () => {
      try {
        await run("HEARTBEAT");
      } catch {
        // Over 60 s without a heartbeat (FOCUS_RECOVERY_REQUIRED) or a stale revision: re-read and recover.
        fresh = false;
        await reconcile();
      }
    });
  };

  return { onChange, heartbeat };
}

let active: { api: FocusRecoveryRepository; controller: ReturnType<typeof createController>; refs: number; stop: () => void } | null = null;

function attach(api: FocusRecoveryRepository) {
  if (active && active.api === api) {
    active.refs += 1;
  } else {
    active?.stop();
    const controller = createController(api);
    const unsubscribe = subscribeFocus(controller.onChange);
    const timer = window.setInterval(controller.heartbeat, HEARTBEAT_MS);
    active = {
      api,
      controller,
      refs: 1,
      stop: () => {
        unsubscribe();
        window.clearInterval(timer);
      },
    };
    controller.onChange();
  }
  return () => {
    if (!active || active.api !== api) return;
    active.refs -= 1;
    if (active.refs === 0) {
      active.stop();
      active = null;
    }
  };
}

/** Mounted by every Focus reader (Focus screen, My Day rail); a no-op in mock mode. */
export function useFocusRecovery() {
  const { plan } = useRepositories();
  const api = plan.focusRecovery;
  useEffect(() => (api ? attach(api) : undefined), [api]);
}
