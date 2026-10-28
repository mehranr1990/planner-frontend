/*
 * The Focus timer (P09) as a pure state machine. No intervals: elapsed time
 * is computed from timestamps, and every transition takes `now` (epoch ms)
 * from the caller, so tests and the store inject their own clock.
 *
 * A round is N focus cycles (settings focus.cyclesBeforeLongBreak) with a
 * short break after each but the last, then a long break; when the long
 * break ends the session is complete. A finished phase either starts the
 * next one at the instant it ended (autoStartNext) or waits, "ready", until
 * the user starts it.
 */

export type FocusPhase = "focus" | "short" | "long";
export type FocusStatus = "running" | "paused" | "ready" | "complete";

export interface FocusConfig {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
  autoStartNext: boolean;
}

export interface FocusSession {
  taskId: string | null;
  config: FocusConfig;
  phase: FocusPhase;
  /** Current focus cycle, 1-based; during a break, the cycle just finished. */
  cycle: number;
  status: FocusStatus;
  /** Length of the current phase, including any "+5 min" / "+1 min". */
  durationMs: number;
  /** Time run in this phase before the current running stretch. */
  accumulatedMs: number;
  /** When the current running stretch began (status "running"), else null. */
  runningSince: number | null;
  /** When the current pause began (status "paused"), else null. */
  pausedSince: number | null;
  /** Focus cycles finished this session. */
  completedCycles: number;
  /** Focused time this session (finished and finished-early focus phases). */
  focusedMs: number;
  /** Finished focus cycles not yet written to the plan repository. */
  unrecorded: number;
  /** Distractions parked this session; they go to Inbox when it ends. */
  parked: string[];
  /** Distractions parked this session, including those already sent. */
  parkedCount: number;
  startedAt: number;
}

const MINUTE = 60_000;

export function phaseMinutes(config: FocusConfig, phase: FocusPhase): number {
  if (phase === "focus") return config.focusMinutes;
  return phase === "short" ? config.shortBreakMinutes : config.longBreakMinutes;
}

function freshPhase(session: FocusSession, phase: FocusPhase, cycle: number, now: number, run: boolean): FocusSession {
  return {
    ...session,
    phase,
    cycle,
    status: run ? "running" : "ready",
    durationMs: phaseMinutes(session.config, phase) * MINUTE,
    accumulatedMs: 0,
    runningSince: run ? now : null,
    pausedSince: null,
  };
}

export function startSession(config: FocusConfig, taskId: string | null, now: number): FocusSession {
  const base: FocusSession = {
    taskId,
    config,
    phase: "focus",
    cycle: 1,
    status: "running",
    durationMs: 0,
    accumulatedMs: 0,
    runningSince: null,
    pausedSince: null,
    completedCycles: 0,
    focusedMs: 0,
    unrecorded: 0,
    parked: [],
    parkedCount: 0,
    startedAt: now,
  };
  return freshPhase(base, "focus", 1, now, true);
}

export function elapsedMs(session: FocusSession, now: number): number {
  const running = session.status === "running" && session.runningSince !== null ? now - session.runningSince : 0;
  return Math.min(session.durationMs, Math.max(0, session.accumulatedMs + running));
}

export function remainingMs(session: FocusSession, now: number): number {
  return Math.max(0, session.durationMs - elapsedMs(session, now));
}

/** 0–1 share of the current phase already run. */
export function phaseProgress(session: FocusSession, now: number): number {
  return session.durationMs > 0 ? elapsedMs(session, now) / session.durationMs : 0;
}

/** Instant the running phase ends, or null when it is not running. */
export function phaseEndsAt(session: FocusSession, now: number): number | null {
  return session.status === "running" ? now + remainingMs(session, now) : null;
}

export function pause(session: FocusSession, now: number): FocusSession {
  if (session.status !== "running") return session;
  return { ...session, status: "paused", accumulatedMs: elapsedMs(session, now), runningSince: null, pausedSince: now };
}

/** Resumes a paused phase or starts a ready one. */
export function resume(session: FocusSession, now: number): FocusSession {
  if (session.status !== "paused" && session.status !== "ready") return session;
  return { ...session, status: "running", runningSince: now, pausedSince: null };
}

/** "+5 min" in focus, "+1 min" on a break. */
export function extend(session: FocusSession, minutes: number): FocusSession {
  if (session.status === "complete") return session;
  return { ...session, durationMs: session.durationMs + minutes * MINUTE };
}

/** What follows `phase` in `cycle`. */
function nextAfter(session: FocusSession): { phase: FocusPhase; cycle: number } | null {
  if (session.phase === "focus") {
    return session.cycle >= session.config.cyclesBeforeLongBreak
      ? { phase: "long", cycle: session.cycle }
      : { phase: "short", cycle: session.cycle };
  }
  if (session.phase === "short") return { phase: "focus", cycle: session.cycle + 1 };
  return null;
}

/** Closes the current phase at `endedAt`; a focus phase counts as a finished cycle. */
function closePhase(session: FocusSession, endedAt: number, run: boolean): FocusSession {
  let next = session;
  if (session.phase === "focus") {
    next = {
      ...session,
      completedCycles: session.completedCycles + 1,
      unrecorded: session.unrecorded + 1,
      focusedMs: session.focusedMs + elapsedMs(session, endedAt),
    };
  }
  const following = nextAfter(next);
  if (!following) return complete(next, endedAt);
  return freshPhase(next, following.phase, following.cycle, endedAt, run);
}

/**
 * Catches the session up with `now`: every phase that ran out is closed at
 * the instant it ended, and the next starts there (autoStartNext) or waits.
 * Idempotent, so any reader can call it.
 */
export function advance(session: FocusSession, now: number): FocusSession {
  let current = session;
  // Bounded: a phase is at least a minute, so a day away is ~1000 steps at most.
  for (let guard = 0; guard < 2000; guard += 1) {
    if (current.status !== "running" || remainingMs(current, now) > 0) return current;
    const endedAt = (current.runningSince ?? now) + current.durationMs - current.accumulatedMs;
    current = closePhase(current, endedAt, current.config.autoStartNext);
  }
  return current;
}

/** Ends the current phase now: Skip break, or finishing a focus cycle early. */
export function skip(session: FocusSession, now: number): FocusSession {
  if (session.status === "complete") return session;
  return closePhase(session, now, session.status === "running" || session.config.autoStartNext);
}

/** Jumps to a phase (the Focus / Short break / Long break pills), keeping the cycle count. */
export function switchPhase(session: FocusSession, phase: FocusPhase, now: number): FocusSession {
  if (session.status === "complete" || phase === session.phase) return session;
  const banked = session.phase === "focus" ? { ...session, focusedMs: session.focusedMs + elapsedMs(session, now) } : session;
  return freshPhase(banked, phase, session.cycle, now, session.status === "running");
}

/** Finish session / End focus: banks focused time, stops the clock. */
export function complete(session: FocusSession, now: number): FocusSession {
  if (session.status === "complete") return session;
  const focusedMs =
    session.phase === "focus" && session.status !== "ready"
      ? session.focusedMs + elapsedMs(session, now)
      : session.focusedMs;
  return { ...session, status: "complete", focusedMs, accumulatedMs: elapsedMs(session, now), runningSince: null, pausedSince: null };
}

/** Changes the timer settings mid-session; the current phase takes the new length, keeping time already run. */
export function reconfigure(session: FocusSession, config: FocusConfig): FocusSession {
  const previous = phaseMinutes(session.config, session.phase) * MINUTE;
  const extra = session.durationMs - previous;
  return { ...session, config, durationMs: phaseMinutes(config, session.phase) * MINUTE + Math.max(0, extra) };
}

export function park(session: FocusSession, text: string): FocusSession {
  const trimmed = text.trim();
  return trimmed ? { ...session, parked: [...session.parked, trimmed], parkedCount: session.parkedCount + 1 } : session;
}

/** Takes the cycles to record and the distractions to send, leaving none behind. */
export function drain(session: FocusSession): { session: FocusSession; cycles: number; parked: string[] } {
  const parked = session.status === "complete" ? session.parked : [];
  return {
    session: { ...session, unrecorded: 0, parked: session.status === "complete" ? [] : session.parked },
    cycles: session.unrecorded,
    parked,
  };
}

/** Next cycle position for the plan's FocusSummary, 1-based. */
export function summaryCycle(session: FocusSession): number {
  return (session.completedCycles % session.config.cyclesBeforeLongBreak) + 1;
}
