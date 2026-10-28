"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { DayBlock, MinuteSpan } from "../domain/day-blocks";
import { planResize } from "./drop-plan";
import { useDropActions } from "./drag-state";
import { resizeByKey, resizeByPixels, resizeKey, sameSpan, type ResizeEdge } from "./resize";

/*
 * Edge resize for one block. A pointer drag on the top or bottom handle (or
 * Shift+Up/Down, Alt+Shift for the start) changes a live span that the block
 * draws at once; releasing the pointer, or a short pause after the last key,
 * commits it through the controller (toast with Undo, overlap flag). The span
 * stays on screen until that save has settled, so the block never jumps back
 * and forth. Snapping (15m) and the 15m floor come from the domain.
 */

/** How long the keyboard waits after the last Shift+Arrow before saving. */
export const KEY_COMMIT_DELAY_MS = 600;

export interface ResizeHandleProps {
  onPointerDown(event: PointerEvent<HTMLElement>): void;
  onPointerMove(event: PointerEvent<HTMLElement>): void;
  onPointerUp(event: PointerEvent<HTMLElement>): void;
  onPointerCancel(event: PointerEvent<HTMLElement>): void;
}

export interface BlockResize {
  /** The span to draw: live while resizing, else the block's own. */
  span: MinuteSpan;
  /** The edge being dragged with the pointer, for the live duration label. */
  resizing: ResizeEdge | null;
  /** The span has been changed and is being saved or is still under the pointer. */
  active: boolean;
  handleProps(edge: ResizeEdge): ResizeHandleProps;
  /** Handles Shift(+Alt)+Up/Down; true when the key was a resize. */
  onKeyDown(event: KeyboardEvent<HTMLElement>): boolean;
  /** Saves a pending keyboard resize now (focus left the block). */
  flush(): void;
}

interface PointerSession {
  edge: ResizeEdge;
  startY: number;
  base: MinuteSpan;
}

export function useBlockResize(options: {
  block: Pick<DayBlock, "id" | "title" | "taskId" | "startMinutes" | "endMinutes">;
  day: string;
  /** The span the block may grow inside (the visible window). */
  window: MinuteSpan;
  pxPerMinute: number;
  disabled?: boolean;
  /** Called with the final span's announcement while keys are pressed. */
  onKeyChange?: (span: MinuteSpan) => void;
}): BlockResize {
  const { block, day, window, pxPerMinute, disabled = false, onKeyChange } = options;
  const actions = useDropActions();
  const own: MinuteSpan = { startMinutes: block.startMinutes, endMinutes: block.endMinutes };

  const [live, setLive] = useState<MinuteSpan | null>(null);
  const [resizing, setResizing] = useState<ResizeEdge | null>(null);
  const session = useRef<PointerSession | null>(null);
  // The span before a run of key presses, and the timer that will save the run.
  const keyBase = useRef<MinuteSpan | null>(null);
  const keyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveRef = useRef<MinuteSpan | null>(null);
  useLayoutEffect(() => {
    liveRef.current = live;
  }, [live]);

  const { id, title, taskId } = block;
  const commit = useCallback(
    async (before: MinuteSpan, after: MinuteSpan) => {
      const plan = planResize({ block: { id, title, taskId }, day, before, after, blocksForDay: actions.readDay });
      try {
        await actions.commit(plan);
      } finally {
        setLive(null);
      }
    },
    [actions, id, title, taskId, day],
  );

  const flush = useCallback(() => {
    if (keyTimer.current) clearTimeout(keyTimer.current);
    keyTimer.current = null;
    const before = keyBase.current;
    const after = liveRef.current;
    keyBase.current = null;
    if (!before || !after) return;
    if (sameSpan(before, after)) setLive(null);
    else void commit(before, after);
  }, [commit]);

  useEffect(
    () => () => {
      if (keyTimer.current) clearTimeout(keyTimer.current);
    },
    [],
  );

  const handleProps = (edge: ResizeEdge): ResizeHandleProps => ({
    onPointerDown(event) {
      if (disabled || event.button !== 0) return;
      // The handle is not the block's drag activator.
      event.stopPropagation();
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      session.current = { edge, startY: event.clientY, base: live ?? own };
      setResizing(edge);
      setLive(live ?? own);
    },
    onPointerMove(event) {
      const current = session.current;
      if (!current) return;
      const next = resizeByPixels(current.base, current.edge, event.clientY - current.startY, pxPerMinute, window);
      setLive((previous) => (previous && sameSpan(previous, next) ? previous : next));
    },
    onPointerUp(event) {
      const current = session.current;
      if (!current) return;
      session.current = null;
      setResizing(null);
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      const next = resizeByPixels(current.base, current.edge, event.clientY - current.startY, pxPerMinute, window);
      if (sameSpan(next, current.base)) setLive(null);
      else {
        setLive(next);
        void commit(current.base, next);
      }
    },
    onPointerCancel() {
      session.current = null;
      setResizing(null);
      setLive(null);
    },
  });

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): boolean => {
    const key = resizeKey(event.nativeEvent);
    if (!key || disabled) return false;
    event.preventDefault();
    keyBase.current ??= live ?? own;
    const next = resizeByKey(live ?? own, key, window);
    setLive(next);
    onKeyChange?.(next);
    if (keyTimer.current) clearTimeout(keyTimer.current);
    keyTimer.current = setTimeout(flush, KEY_COMMIT_DELAY_MS);
    return true;
  };

  return { span: live ?? own, resizing, active: live !== null, handleProps, onKeyDown, flush };
}
