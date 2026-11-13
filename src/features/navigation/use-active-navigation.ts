"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { getContextFromPathname, getNavItemForPathname, normalizePathname } from "./paths";
import type { AppContext, NavItem } from "./types";

/*
 * Client hooks over usePathname(). With Cache Components, usePathname()
 * suspends below routes with unknown dynamic params, so wrap navigation that
 * renders in a shared layout in <Suspense> (see the Next.js usePathname docs).
 */

/** Last context path seen in this tab (client only): /messages keeps the switcher on it (MS-01). */
const lastContext = { path: null as string | null, listeners: new Set<() => void>() };
const subscribeLast = (listener: () => void) => {
  lastContext.listeners.add(listener);
  return () => lastContext.listeners.delete(listener);
};

/** The context the URL is in, or undefined outside every context (e.g. "/"). On /messages: the last context. */
export function useActiveContext(): AppContext | undefined {
  const pathname = usePathname();
  const context = getContextFromPathname(pathname);
  const last = useSyncExternalStore(subscribeLast, () => lastContext.path, () => null);
  const hasContext = context !== undefined;
  useEffect(() => {
    if (!hasContext || lastContext.path === pathname) return;
    lastContext.path = pathname;
    lastContext.listeners.forEach((listener) => listener());
  }, [hasContext, pathname]);
  if (context) return context;
  const path = normalizePathname(pathname);
  if ((path === "/messages" || path.startsWith("/messages/")) && last) return getContextFromPathname(last);
  return undefined;
}

/** The nav item for the current URL, or undefined for an unknown route. */
export function useActiveNavItem(): NavItem | undefined {
  return getNavItemForPathname(usePathname())?.item;
}
