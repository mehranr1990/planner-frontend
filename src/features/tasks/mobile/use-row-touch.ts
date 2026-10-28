"use client";

import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";

/*
 * Phone row gestures (PM01): swipe toward inline-end = complete, toward
 * inline-start = reschedule (so in RTL a swipe LEFT completes), long-press
 * (~350ms, under 8px of movement) = select. Pure geometry is exported for
 * tests. Reduced motion keeps the gestures; only the row's slide animation
 * is dropped by the caller.
 */

export const SWIPE_THRESHOLD = 90;
export const SWIPE_MAX = 140;
export const LONG_PRESS_MS = 350;
const SLOP = 8;

export type SwipeOutcome = "complete" | "reschedule" | null;

/** What releasing at `dx` (physical px, + = right) does, read logically. */
export function swipeOutcome(dx: number, rtl: boolean): SwipeOutcome {
  const endward = rtl ? -dx : dx;
  if (endward >= SWIPE_THRESHOLD) return "complete";
  if (endward <= -SWIPE_THRESHOLD) return "reschedule";
  return null;
}

export interface RowTouchOptions {
  enabled: boolean;
  rtl: boolean;
  /** No swipe while selecting: taps toggle instead. */
  swipe: boolean;
  onComplete(): void;
  onReschedule(): void;
  onLongPress(): void;
}

export function useRowTouch({ enabled, rtl, swipe, onComplete, onReschedule, onLongPress }: RowTouchOptions) {
  const [offset, setOffset] = useState(0);
  const start = useRef<{ x: number; y: number; mode: "idle" | "swipe" | "scroll" } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A long-press fired: swallow the click that follows the touch. */
  const suppressClick = useRef(false);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clearTimer, []);

  const onTouchStart = useCallback(
    (event: TouchEvent) => {
      if (!enabled) return;
      const touch = event.touches[0];
      if (!touch) return;
      start.current = { x: touch.clientX, y: touch.clientY, mode: "idle" };
      suppressClick.current = false;
      clearTimer();
      timer.current = setTimeout(() => {
        suppressClick.current = true;
        start.current = null;
        setOffset(0);
        onLongPress();
      }, LONG_PRESS_MS);
    },
    [enabled, onLongPress],
  );

  const onTouchMove = useCallback(
    (event: TouchEvent) => {
      const origin = start.current;
      const touch = event.touches[0];
      if (!origin || !touch) return;
      const dx = touch.clientX - origin.x;
      const dy = touch.clientY - origin.y;
      if (Math.abs(dx) > SLOP || Math.abs(dy) > SLOP) clearTimer();
      if (origin.mode === "idle" && (Math.abs(dx) > SLOP || Math.abs(dy) > SLOP)) {
        origin.mode = swipe && Math.abs(dx) > Math.abs(dy) ? "swipe" : "scroll";
      }
      if (origin.mode === "swipe") setOffset(Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, dx)));
    },
    [swipe],
  );

  const onTouchEnd = useCallback(() => {
    clearTimer();
    const origin = start.current;
    start.current = null;
    if (origin?.mode === "swipe") {
      const outcome = swipeOutcome(offset, rtl);
      if (outcome === "complete") onComplete();
      else if (outcome === "reschedule") onReschedule();
      suppressClick.current = true;
    }
    setOffset(0);
  }, [offset, rtl, onComplete, onReschedule]);

  /** True once for the click that ends a long-press or a swipe. */
  const consumeClick = useCallback(() => {
    const swallow = suppressClick.current;
    suppressClick.current = false;
    return swallow;
  }, []);

  return {
    offset,
    handlers: enabled ? { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd } : {},
    consumeClick,
  };
}
