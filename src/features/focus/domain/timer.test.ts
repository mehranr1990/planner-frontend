import { describe, expect, it } from "vitest";
import {
  advance,
  complete,
  drain,
  elapsedMs,
  extend,
  park,
  pause,
  phaseEndsAt,
  reconfigure,
  remainingMs,
  resume,
  skip,
  startSession,
  summaryCycle,
  switchPhase,
  type FocusConfig,
} from "./timer";

const MIN = 60_000;
const config: FocusConfig = { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cyclesBeforeLongBreak: 2, autoStartNext: true };
const T0 = 1_000_000;

describe("focus timer", () => {
  it("computes elapsed from timestamps and pauses without losing time", () => {
    let s = startSession(config, "t1", T0);
    expect(remainingMs(s, T0 + 6 * MIN)).toBe(19 * MIN);
    s = pause(s, T0 + 6 * MIN);
    expect(elapsedMs(s, T0 + 60 * MIN)).toBe(6 * MIN);
    expect(phaseEndsAt(s, T0 + 60 * MIN)).toBeNull();
    s = resume(s, T0 + 10 * MIN);
    expect(remainingMs(s, T0 + 11 * MIN)).toBe(18 * MIN);
    expect(phaseEndsAt(s, T0 + 11 * MIN)).toBe(T0 + 29 * MIN);
  });

  it("auto-starts the next phase at the instant the last one ended and records the cycle", () => {
    const s = advance(startSession(config, "t1", T0), T0 + 27 * MIN);
    expect(s).toMatchObject({ phase: "short", cycle: 1, status: "running", completedCycles: 1, unrecorded: 1 });
    expect(elapsedMs(s, T0 + 27 * MIN)).toBe(2 * MIN);
    expect(s.focusedMs).toBe(25 * MIN);
  });

  it("runs a whole round while away: short break, long break after N cycles, then complete", () => {
    const s0 = startSession(config, "t1", T0);
    expect(advance(s0, T0 + 31 * MIN)).toMatchObject({ phase: "focus", cycle: 2 });
    expect(advance(s0, T0 + 56 * MIN)).toMatchObject({ phase: "long", cycle: 2, completedCycles: 2 });
    const done = advance(s0, T0 + 80 * MIN);
    expect(done).toMatchObject({ status: "complete", completedCycles: 2, focusedMs: 50 * MIN });
    expect(advance(done, T0 + 999 * MIN)).toBe(done);
  });

  it("waits, ready, when autoStartNext is off", () => {
    const s = advance(startSession({ ...config, autoStartNext: false }, null, T0), T0 + 40 * MIN);
    expect(s).toMatchObject({ phase: "short", status: "ready" });
    expect(remainingMs(s, T0 + 90 * MIN)).toBe(5 * MIN);
    expect(resume(s, T0 + 90 * MIN).status).toBe("running");
  });

  it("extends, skips a break and switches phase", () => {
    let s = extend(startSession(config, "t1", T0), 5);
    expect(remainingMs(s, T0)).toBe(30 * MIN);
    s = advance(s, T0 + 30 * MIN);
    expect(s.phase).toBe("short");
    s = skip(s, T0 + 31 * MIN);
    expect(s).toMatchObject({ phase: "focus", cycle: 2, status: "running" });
    s = switchPhase(s, "long", T0 + 33 * MIN);
    expect(s).toMatchObject({ phase: "long", cycle: 2, focusedMs: 32 * MIN });
  });

  it("completes early with focused time banked, then drains cycles and parked distractions once", () => {
    let s = park(park(startSession(config, "t1", T0), "Reply to Sara"), "  ");
    s = advance(s, T0 + 26 * MIN);
    s = complete(s, T0 + 30 * MIN);
    expect(s).toMatchObject({ status: "complete", focusedMs: 25 * MIN, parkedCount: 1 });
    const first = drain(s);
    expect(first).toMatchObject({ cycles: 1, parked: ["Reply to Sara"] });
    expect(drain(first.session)).toMatchObject({ cycles: 0, parked: [] });
    expect(summaryCycle(s)).toBe(2);
  });

  it("keeps parked items until the session ends", () => {
    const s = park(startSession(config, null, T0), "Car insurance");
    expect(drain(s).parked).toEqual([]);
    expect(drain(s).session.parked).toEqual(["Car insurance"]);
  });

  it("reconfigures the current phase, keeping extensions", () => {
    const s = reconfigure(extend(startSession(config, null, T0), 5), { ...config, focusMinutes: 50 });
    expect(remainingMs(s, T0)).toBe(55 * MIN);
  });
});
