import { MINUTES_PER_DAY } from "@/lib/dates/clock-time";
import { KEYBOARD_STEP_MINUTES } from "../drag";

/*
 * The virtual cursor of a keyboard drag. Space lifts, the arrows move this
 * target (up/down by 15 minutes, left/right to the next column), Enter drops
 * it, Escape cancels. The dnd-kit coordinate getter turns the target into a
 * pixel position so the lifted card follows it.
 */

export interface KeyboardTarget {
  day: string;
  startMinutes: number;
}

export interface KeyboardMoveContext {
  /** Registered day columns in ascending order. */
  days: readonly string[];
  /** Reading direction: in rtl the columns run right to left, so ArrowLeft is the next day. */
  rtl: boolean;
  durationMinutes: number;
}

/** The target after an arrow key, or null when the key is not a move (or nothing changes). */
export function moveKeyboardTarget(
  target: KeyboardTarget,
  key: string,
  { days, rtl, durationMinutes }: KeyboardMoveContext,
): KeyboardTarget | null {
  if (key === "ArrowUp" || key === "ArrowDown") {
    const delta = key === "ArrowDown" ? KEYBOARD_STEP_MINUTES : -KEYBOARD_STEP_MINUTES;
    const latest = Math.max(0, MINUTES_PER_DAY - durationMinutes);
    const startMinutes = Math.min(latest, Math.max(0, target.startMinutes + delta));
    return startMinutes === target.startMinutes ? null : { ...target, startMinutes };
  }
  if (key === "ArrowLeft" || key === "ArrowRight") {
    // Columns left to right are ascending in ltr and descending in rtl.
    const visual = rtl ? [...days].reverse() : [...days];
    const index = visual.indexOf(target.day);
    if (index === -1) return null;
    const next = visual[index + (key === "ArrowRight" ? 1 : -1)];
    return next === undefined ? null : { ...target, day: next };
  }
  return null;
}
