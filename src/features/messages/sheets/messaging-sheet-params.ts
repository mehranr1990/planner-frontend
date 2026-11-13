"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import { OPENED_KEY, SHEET_PARAM } from "@/features/sheets/sheet-params";

/*
 * Messaging sheet ids (MS-90, MT-02): `?sheet=conversation-new ·
 * channel-new · meeting-new` on any route (global host in the app layout).
 * channel-new carries `&ws=<kind>:<id>`; meeting-new carries `&source=…`
 * (the calendar it was opened from) and optionally `&day=YYYY-MM-DD`.
 */
export const messagingSheetIds = ["conversation-new", "channel-new", "meeting-new"] as const;
export type MessagingSheetId = (typeof messagingSheetIds)[number];
const SCOPED = ["ws", "source", "day"];

export function isMessagingSheetId(value: unknown): value is MessagingSheetId {
  return typeof value === "string" && (messagingSheetIds as readonly string[]).includes(value);
}

export function messagingSheetHref(pathname: string, search: string, id: MessagingSheetId | null, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(search);
  if (id) params.set(SHEET_PARAM, id);
  else {
    params.delete(SHEET_PARAM);
    for (const key of SCOPED) params.delete(key);
  }
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** "project:website-redesign" ⇄ source key in URLs. */
export const sourceParam = (kind: string, workspaceId: string | null) => (workspaceId ? `${kind}:${workspaceId}` : "personal");

export function useOpenMessagingSheet(): (id: MessagingSheetId, extra?: Record<string, string>) => void {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (id: MessagingSheetId, extra?: Record<string, string>) => {
      const href = messagingSheetHref(pathname, window.location.search, id, extra);
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
