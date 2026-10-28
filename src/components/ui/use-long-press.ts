"use client";

import { useRef, type MouseEvent, type PointerEvent } from "react";

/**
 * Long-press (touch / pen) and the context menu (right-click, Shift+F10, the
 * Menu key) as one secondary action; the click that ends a long-press is
 * swallowed so the primary action does not run too. Spread the result onto
 * the element and guard its onClick with `consumeClick()`.
 */
export function useLongPress(onLongPress: (() => void) | undefined, delay = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return {
    handlers: {
      onPointerDown(event: PointerEvent) {
        fired.current = false;
        if (!onLongPress || event.pointerType === "mouse") return;
        cancel();
        timer.current = setTimeout(() => {
          fired.current = true;
          onLongPress();
        }, delay);
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onContextMenu(event: MouseEvent) {
        if (!onLongPress) return;
        event.preventDefault();
        cancel();
        if (fired.current) return;
        onLongPress();
      },
    },
    /** True (once) when the click ends a long-press. */
    consumeClick() {
      const was = fired.current;
      fired.current = false;
      return was;
    },
  };
}
