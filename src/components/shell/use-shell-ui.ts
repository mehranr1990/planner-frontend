"use client";

import { usePathname } from "next/navigation";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { defaultContextId } from "@/features/navigation/contexts";
import type { ContextId } from "@/features/navigation/types";
import { useActiveContext } from "@/features/navigation/use-active-navigation";

/*
 * Small client hooks shared by the shell's overlays.
 */

/** The context the URL is in, or Personal outside every context. Also the scope for portalled overlays. */
export function useShellScope(): ContextId {
  return useActiveContext()?.id ?? defaultContextId;
}

/**
 * Open state that closes itself when the pathname changes (sheets, popovers,
 * menus). It remembers the pathname it was opened on; once the URL moves on,
 * the state resets during render, so returning to that page never reopens it.
 */
export function useRouteScopedOpen(): readonly [boolean, (open: boolean) => void] {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  // Adjusting state while rendering (React's documented pattern) avoids an effect.
  if (openOn !== null && openOn !== pathname) setOpenOn(null);
  const setOpen = useCallback((open: boolean) => setOpenOn(open ? pathname : null), [pathname]);
  return [openOn !== null && openOn === pathname, setOpen] as const;
}

/** AppShell's <main> id (a literal there: AppShell is server-compatible). */
const MAIN_CONTENT_ID = "main-content";

/**
 * Focus return for overlays opened by something other than their Radix
 * Trigger (a keyboard shortcut, a button owned by another component). Radix
 * only restores focus to its own trigger, so capture the element before
 * opening and hand `onCloseAutoFocus` to the overlay content.
 *
 * When there is nothing to return to (opened with nothing focused, or the
 * opener unmounted or is hidden now), focus goes to the main landmark
 * (#main-content, focusable with tabindex=-1) rather than <body>, so keyboard
 * and screen reader users keep their place in the page.
 */
export function useReturnFocus() {
  const elementRef = useRef<HTMLElement | null>(null);

  const capture = useCallback(() => {
    const active = document.activeElement;
    elementRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, []);

  const onCloseAutoFocus = useCallback((event: Event) => {
    const element = elementRef.current;
    event.preventDefault();
    if (element?.isConnected) {
      element.focus();
      if (document.activeElement === element) return;
    }
    document.getElementById(MAIN_CONTENT_ID)?.focus();
  }, []);

  return { capture, onCloseAutoFocus };
}

const noSubscription = () => () => {};

/**
 * Whether to show ⌘ (Apple) or Ctrl in shortcut hints. The server and the
 * hydration pass render ⌘K (as on the boards); the client then corrects it.
 */
export function useIsApplePlatform(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent),
    () => true,
  );
}
