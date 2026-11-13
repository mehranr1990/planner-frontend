"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import { OPENED_KEY, SHEET_PARAM } from "@/features/sheets/sheet-params";

/*
 * Social sheet ids (SO-90 + SO-08 + SO-10 / SO-18): same URL contract as the
 * other contexts (`?sheet=<id>`, the opener pushes so Back closes), its own
 * id list and host under /social. Extra params: `group` (prefill a group),
 * `activity` (an activity scope), `thing` (lend that thing).
 */
export const socialSheetIds = ["group-new", "activity-new", "connect", "expense-propose", "item-lend", "thing-new"] as const;

export type SocialSheetId = (typeof socialSheetIds)[number];

const SCOPED_PARAMS = ["group", "activity", "thing", "scope"];

export function isSocialSheetId(value: unknown): value is SocialSheetId {
  return typeof value === "string" && (socialSheetIds as readonly string[]).includes(value);
}

export function socialSheetHref(pathname: string, search: string, id: SocialSheetId | null, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(search);
  if (id) params.set(SHEET_PARAM, id);
  else {
    params.delete(SHEET_PARAM);
    for (const key of SCOPED_PARAMS) params.delete(key);
  }
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Opens a Social sheet over the current route (push, so Back closes it). */
export function useOpenSocialSheet(): (id: SocialSheetId, extra?: Record<string, string>) => void {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (id: SocialSheetId, extra?: Record<string, string>) => {
      const href = socialSheetHref(pathname, window.location.search, id, extra);
      try {
        window.sessionStorage.setItem(OPENED_KEY, href);
      } catch {
        // Storage unavailable: closing falls back to replace.
      }
      router.push(href, { scroll: false });
    },
    [router, pathname],
  );
}
