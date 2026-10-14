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

/** Opens a sheet over the current route (push, so Back closes it). */
export function useOpenSheet(): (id: SheetId) => void {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (id: SheetId) => router.push(sheetHref(pathname, window.location.search, id), { scroll: false }),
    [router, pathname],
  );
}
