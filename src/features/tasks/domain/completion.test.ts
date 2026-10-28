import { describe, expect, it } from "vitest";
import {
  COMPLETION_HOLD_MS,
  completionPhase,
  completionReducer,
  INITIAL_COMPLETION,
  nextCompletionDelay,
  type CompletionState,
} from "./completion";

const run = (state: CompletionState, ...actions: Parameters<typeof completionReducer>[1][]) =>
  actions.reduce(completionReducer, state);

describe("completion lifecycle", () => {
  it("holds a completed row for 1.2s, then collapses it", () => {
    let state = run(INITIAL_COMPLETION, { type: "complete", id: "a", now: 1000 });
    expect(completionPhase(state, "a")).toBe("holding");
    state = completionReducer(state, { type: "tick", now: 1000 + COMPLETION_HOLD_MS - 1 });
    expect(completionPhase(state, "a")).toBe("holding");
    state = completionReducer(state, { type: "tick", now: 1000 + COMPLETION_HOLD_MS });
    expect(completionPhase(state, "a")).toBe("collapsed");
    expect(completionPhase(state, "b")).toBe("none");
  });

  it("collapses each row on its own clock", () => {
    let state = run(INITIAL_COMPLETION, { type: "complete", id: "a", now: 0 }, { type: "complete", id: "b", now: 800 });
    state = completionReducer(state, { type: "tick", now: 1300 });
    expect(completionPhase(state, "a")).toBe("collapsed");
    expect(completionPhase(state, "b")).toBe("holding");
  });

  it("undo cancels the hold, and brings a collapsed row back", () => {
    const held = run(INITIAL_COMPLETION, { type: "complete", id: "a", now: 0 }, { type: "reopen", id: "a" });
    expect(completionPhase(held, "a")).toBe("none");
    const collapsed = run(
      INITIAL_COMPLETION,
      { type: "complete", id: "a", now: 0 },
      { type: "tick", now: 5000 },
      { type: "reopen", id: "a" },
    );
    expect(completionPhase(collapsed, "a")).toBe("none");
    expect(collapsed).toEqual(INITIAL_COMPLETION);
  });

  it("completing twice keeps the first clock; unrelated actions return the same state", () => {
    const once = run(INITIAL_COMPLETION, { type: "complete", id: "a", now: 0 });
    expect(completionReducer(once, { type: "complete", id: "a", now: 900 })).toBe(once);
    expect(completionReducer(once, { type: "tick", now: 10 })).toBe(once);
    expect(completionReducer(once, { type: "reopen", id: "zzz" })).toBe(once);
    expect(completionReducer(INITIAL_COMPLETION, { type: "reset" })).toBe(INITIAL_COMPLETION);
    expect(completionReducer(once, { type: "reset" })).toBe(INITIAL_COMPLETION);
  });

  it("says how long until the next collapse", () => {
    expect(nextCompletionDelay(INITIAL_COMPLETION, 0)).toBeNull();
    const state = run(INITIAL_COMPLETION, { type: "complete", id: "a", now: 100 }, { type: "complete", id: "b", now: 600 });
    expect(nextCompletionDelay(state, 100)).toBe(COMPLETION_HOLD_MS);
    expect(nextCompletionDelay(state, 900)).toBe(COMPLETION_HOLD_MS - 800);
    expect(nextCompletionDelay(state, 9999)).toBe(0);
  });
});
