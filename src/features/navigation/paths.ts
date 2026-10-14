import { appContexts, getAppContext } from "./contexts";
import type { AppContext, ContextId, NavItem } from "./types";

/*
 * Pure URL → navigation mapping. The pathname is the single source of truth
 * for the active context and item; nothing here keeps state.
 */

/** Drops query/hash, collapses repeated slashes and removes trailing slashes ("/" stays "/"). */
export function normalizePathname(pathname: string | null | undefined): string {
  if (!pathname) return "/";
  const path = pathname.split(/[?#]/, 1)[0]!.replace(/\/{2,}/g, "/");
  const trimmed = path.replace(/\/+$/, "");
  if (trimmed === "") return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/** True when `pathname` is `base` itself or a route below it (segment-aware: /projects ≠ /projectsx). */
function isWithin(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function getContextFromPathname(pathname: string | null | undefined): AppContext | undefined {
  const path = normalizePathname(pathname);
  return appContexts.find((context) => isWithin(path, context.basePath));
}

/**
 * Whether `item` is the current page. The overview matches its base path
 * only; other items also match their nested routes (/projects/board/42).
 */
export function isNavItemActive(item: NavItem, pathname: string | null | undefined): boolean {
  const path = normalizePathname(pathname);
  const href = normalizePathname(item.href);
  return item.id === "overview" ? path === href : isWithin(path, href);
}

export interface ActiveNavigation {
  context: AppContext;
  item: NavItem | undefined;
}

/**
 * The context and nav item for a pathname. Returns undefined outside every
 * context; `item` is undefined for an unknown route inside a context.
 */
export function getNavItemForPathname(pathname: string | null | undefined): ActiveNavigation | undefined {
  const context = getContextFromPathname(pathname);
  if (!context) return undefined;
  const item = context.nav.find((candidate) => isNavItemActive(candidate, pathname));
  return { context, item };
}

/** The overview route of a context. */
export function contextHref(id: ContextId): string {
  return getAppContext(id).basePath;
}

/** Bottom-bar items for a context, in slot order. */
export function getMobileNavItems(context: AppContext): NavItem[] {
  return context.nav
    .filter((item): item is NavItem & { mobileOrder: number } => item.mobileOrder !== undefined)
    .sort((a, b) => a.mobileOrder - b.mobileOrder);
}
