"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";

/*
 * The global sheet contract (P00PersonalIA Routes · P18): any Personal route
 * can carry `?sheet=<id>`; the SheetHost renders the matching container and
 * closing removes the parameter, so the page underneath never changes.
 *
 * Openers read the current query string at click time instead of calling
 * useSearchParams(), which would make every shell island suspend under
 * Cache Components.
 */

export const SHEET_PARAM = "sheet";

export const sheetIds = ["quick-add", "expense", "habit", "goal", "mood", "reschedule", "note", "voice"] as const;

export type SheetId = (typeof sheetIds)[number];

export function isSheetId(value: unknown): value is SheetId {
  return typeof value === "string" && (sheetIds as readonly string[]).includes(value);
}

/** `pathname?…&sheet=id` (or without the parameter when `id` is null), keeping every other parameter. */
export function sheetHref(pathname: string, search: string, id: SheetId | null): string {
  const params = new URLSearchParams(search);
  if (id) params.set(SHEET_PARAM, id);
  else params.delete(SHEET_PARAM);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/*
 * A sheet opened in this tab is a history entry: closing goes Back, so the
 * entry is consumed and Back never "does nothing". A sheet that arrived with
 * the URL (shared link, reload) has no entry to go back to and is closed by
 * replacing the URL. The marker remembers which URL the opener pushed.
 */
const OPENED_KEY = "mp-sheet-opened";

function rememberOpened(href: string) {
  try {
    window.sessionStorage.setItem(OPENED_KEY, href);
  } catch {
    // Storage unavailable: closing falls back to replace.
  }
}

/** True (once) when the current URL is the sheet this tab pushed. */
export function consumeOpenedSheet(): boolean {
  try {
    const href = window.sessionStorage.getItem(OPENED_KEY);
    window.sessionStorage.removeItem(OPENED_KEY);
    return href === window.location.pathname + window.location.search;
  } catch {
    return false;
  }
}

/** Opens a sheet over the current route (push, so Back closes it). */
export function useOpenSheet(): (id: SheetId) => void {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (id: SheetId) => {
      const href = sheetHref(pathname, window.location.search, id);
      rememberOpened(href);
      router.push(href, { scroll: false });
    },
    [router, pathname],
  );
}
