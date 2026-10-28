/*
 * The completion lifecycle of a row, for the UI's timers: complete (check
 * fills, title struck) → held for 1.2s → collapsed into the group's "· N done"
 * counter. Undo (or un-checking) cancels it. A reducer with an injected clock,
 * so tests step time by hand; the React side only schedules `tick`.
 */

/** How long a just-completed row stays visible, struck, before it collapses. */
export const COMPLETION_HOLD_MS = 1200;

export type CompletionPhase = "none" | "holding" | "collapsed";

export interface CompletionState {
  /** Epoch ms each id was completed at, split by phase. */
  holding: Readonly<Record<string, number>>;
  collapsed: readonly string[];
}

export const INITIAL_COMPLETION: CompletionState = { holding: {}, collapsed: [] };

export type CompletionAction =
  | { type: "complete"; id: string; now: number }
  /** Undo, or the person un-checks the row: back to a normal row. */
  | { type: "reopen"; id: string }
  /** Moves every row whose hold has passed to collapsed. */
  | { type: "tick"; now: number }
  /** Forget everything (leaving the screen, changing tab). */
  | { type: "reset" };

export function completionReducer(state: CompletionState, action: CompletionAction): CompletionState {
  switch (action.type) {
    case "complete": {
      if (action.id in state.holding || state.collapsed.includes(action.id)) return state;
      return { ...state, holding: { ...state.holding, [action.id]: action.now } };
    }
    case "reopen": {
      if (!(action.id in state.holding) && !state.collapsed.includes(action.id)) return state;
      const holding = { ...state.holding };
      delete holding[action.id];
      return { holding, collapsed: state.collapsed.filter((id) => id !== action.id) };
    }
    case "tick": {
      const ready = Object.keys(state.holding).filter((id) => action.now - state.holding[id]! >= COMPLETION_HOLD_MS);
      if (ready.length === 0) return state;
      const holding = { ...state.holding };
      for (const id of ready) delete holding[id];
      return { holding, collapsed: [...state.collapsed, ...ready] };
    }
    default:
      return state.collapsed.length === 0 && Object.keys(state.holding).length === 0 ? state : INITIAL_COMPLETION;
  }
}

export function completionPhase(state: CompletionState, id: string): CompletionPhase {
  if (id in state.holding) return "holding";
  return state.collapsed.includes(id) ? "collapsed" : "none";
}

/** Milliseconds until the next hold ends (for setTimeout); null when nothing is held. Never negative. */
export function nextCompletionDelay(state: CompletionState, now: number): number | null {
  const starts = Object.values(state.holding);
  if (starts.length === 0) return null;
  return Math.max(0, Math.min(...starts) + COMPLETION_HOLD_MS - now);
}
