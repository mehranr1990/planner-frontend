import { KEYBOARD_STEP_MINUTES, pxToMinutes } from "../drag";
import type { MinuteSpan } from "../domain/day-blocks";
import { resizeFromEdge } from "../domain/placement";

/*
 * Resize math for a block's edges: pointer deltas in pixels and the
 * Shift+Arrow keys both end in resizeFromEdge, so the 15-minute grid and the
 * 15-minute floor are the domain's rules, not this file's.
 */

export type ResizeEdge = "start" | "end";

/** The span after dragging `edge` by `deltaPx` (positive = down) at this scale. */
export function resizeByPixels(
  span: MinuteSpan,
  edge: ResizeEdge,
  deltaPx: number,
  pxPerMinute: number,
  window: MinuteSpan,
): MinuteSpan {
  return resizeFromEdge(span, edge, pxToMinutes(deltaPx, pxPerMinute), window);
}

export interface ResizeKey {
  edge: ResizeEdge;
  /** +1 grows the end / shrinks the start (arrow down), -1 the reverse. */
  direction: 1 | -1;
}

/** Shift+Up/Down resizes the end; Alt+Shift+Up/Down the start. Anything else is not a resize. */
export function resizeKey(event: Pick<KeyboardEvent, "key" | "shiftKey" | "altKey" | "ctrlKey" | "metaKey">): ResizeKey | null {
  if (!event.shiftKey || event.ctrlKey || event.metaKey) return null;
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return null;
  return { edge: event.altKey ? "start" : "end", direction: event.key === "ArrowDown" ? 1 : -1 };
}

export function resizeByKey(span: MinuteSpan, key: ResizeKey, window: MinuteSpan): MinuteSpan {
  return resizeFromEdge(span, key.edge, key.direction * KEYBOARD_STEP_MINUTES, window);
}

/** Whether two spans are the same. */
export const sameSpan = (a: MinuteSpan, b: MinuteSpan): boolean =>
  a.startMinutes === b.startMinutes && a.endMinutes === b.endMinutes;
