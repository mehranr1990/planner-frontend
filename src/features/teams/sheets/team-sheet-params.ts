"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import { OPENED_KEY, SHEET_PARAM } from "@/features/sheets/sheet-params";

/*
 * Team sheet ids (TM-90): same URL contract as Personal and Projects
 * (`?sheet=<id>`, the opener pushes so Back closes), a separate id list and
 * host under /teams — no collision with Personal or Project sheet ids.
 */

export const teamSheetIds = ["team-new", "team-invite", "team-status"] as const;

export type TeamSheetId = (typeof teamSheetIds)[number];

export function isTeamSheetId(value: unknown): value is TeamSheetId {
  return typeof value === "string" && (teamSheetIds as readonly string[]).includes(value);
}

export function teamSheetHref(pathname: string, search: string, id: TeamSheetId | null): string {
  const params = new URLSearchParams(search);
  if (id) params.set(SHEET_PARAM, id);
  else params.delete(SHEET_PARAM);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Opens a team sheet over the current route (push, so Back closes it). */
export function useOpenTeamSheet(): (id: TeamSheetId) => void {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (id: TeamSheetId) => {
      const href = teamSheetHref(pathname, window.location.search, id);
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
