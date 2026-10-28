import type { TaskPriority } from "@/data/domain";

/*
 * The Tasks keyboard map as a pure function, so it is testable and the same
 * on every keyboard layout: letters are read from the physical key
 * (`event.code`, "KeyN") before the character, so N, J, K… work on a Persian
 * layout too.
 *
 *   N new · / search · J K (or ↓ ↑) move · X select · E edit · D date
 *   S schedule · 1–4 priority (urgent…low) · ⌘↵ complete · B toggle Board
 *   Space open detail · ⌘A select group · Esc clear selection
 */

export type TasksAction =
  | { type: "new" }
  | { type: "search" }
  | { type: "move"; delta: 1 | -1 }
  | { type: "select" }
  | { type: "edit" }
  | { type: "date" }
  | { type: "schedule" }
  | { type: "priority"; priority: TaskPriority }
  | { type: "complete" }
  | { type: "toggle-layout" }
  | { type: "open-detail" }
  | { type: "select-all" }
  | { type: "clear" };

/** The parts of a KeyboardEvent the map reads. */
export interface KeyEventLike {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
}

export interface ShortcutContext {
  /** Focus is in an input, textarea, select or editable text: letters are text. */
  typing: boolean;
  /** Some row is selected (Esc clears it). */
  hasSelection?: boolean;
  /** A dialog, sheet or popover is open above the list. */
  overlayOpen?: boolean;
}

const PRIORITY_KEYS: Record<string, TaskPriority> = {
  "1": "urgent",
  "2": "high",
  "3": "medium",
  "4": "low",
};

const LETTERS: Record<string, TasksAction> = {
  n: { type: "new" },
  j: { type: "move", delta: 1 },
  k: { type: "move", delta: -1 },
  x: { type: "select" },
  e: { type: "edit" },
  d: { type: "date" },
  s: { type: "schedule" },
  b: { type: "toggle-layout" },
};

/** "a" for code "KeyA" or key "A"; null for anything that is not a plain letter key. */
function letterOf(event: KeyEventLike): string | null {
  const fromCode = event.code?.startsWith("Key") ? event.code.slice(3).toLowerCase() : null;
  if (fromCode) return fromCode;
  return event.key.length === 1 && /[a-z]/i.test(event.key) ? event.key.toLowerCase() : null;
}

function digitOf(event: KeyEventLike): string | null {
  if (event.code?.startsWith("Digit")) return event.code.slice(5);
  return /^[1-9]$/.test(event.key) ? event.key : null;
}

/** True for the event targets where typing must not trigger shortcuts. */
export function isTypingTarget(target: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

/**
 * The action for a key press, or null when it is not ours. Nothing fires
 * while typing or over an overlay (⌘↵ is the one exception while typing: it
 * completes from the inline editor).
 */
export function resolveShortcut(event: KeyEventLike, context: ShortcutContext): TasksAction | null {
  const command = Boolean(event.metaKey || event.ctrlKey);
  if (context.overlayOpen) return null;

  if (command && event.key === "Enter" && !event.altKey) return { type: "complete" };
  if (context.typing) return null;

  if (command) {
    return letterOf(event) === "a" && !event.shiftKey && !event.altKey ? { type: "select-all" } : null;
  }
  if (event.altKey) return null;

  if (event.key === "Escape") return context.hasSelection ? { type: "clear" } : null;
  if (event.key === "ArrowDown") return { type: "move", delta: 1 };
  if (event.key === "ArrowUp") return { type: "move", delta: -1 };
  if (event.key === " " || event.code === "Space") return { type: "open-detail" };
  if (event.key === "/" || event.code === "Slash") return event.shiftKey ? null : { type: "search" };

  const digit = digitOf(event);
  if (digit && !event.shiftKey) {
    const priority = PRIORITY_KEYS[digit];
    return priority ? { type: "priority", priority } : null;
  }
  if (event.shiftKey) return null;
  const letter = letterOf(event);
  return letter ? (LETTERS[letter] ?? null) : null;
}

/** The focused row index after a move; clamps at the ends. -1 (nothing focused) enters at the first or last row. */
export function nextFocusIndex(current: number, length: number, delta: 1 | -1): number {
  if (length === 0) return -1;
  if (current < 0) return delta === 1 ? 0 : length - 1;
  return Math.max(0, Math.min(length - 1, current + delta));
}
