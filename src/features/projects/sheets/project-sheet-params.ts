"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import { OPENED_KEY, SHEET_PARAM } from "@/features/sheets/sheet-params";

/*
 * Project sheet ids (D10). Same URL contract as the Personal sheet host
 * (`?sheet=<id>`, opener pushes so Back closes), but a separate id list and
 * host under /projects, so the Personal host never sees these ids.
 */

export const projectSheetIds = ["project-new", "project-invite", "assignment-reassign"] as const;

export type ProjectSheetId = (typeof projectSheetIds)[number];

export function isProjectSheetId(value: unknown): value is ProjectSheetId {
  return typeof value === "string" && (projectSheetIds as readonly string[]).includes(value);
}

/** Parameters that ride along with a sheet and leave with it. */
export const projectSheetScopedParams: Readonly<Record<ProjectSheetId, readonly string[]>> = {
  "project-new": [],
  "project-invite": [],
  "assignment-reassign": ["task"],
};

export function projectSheetHref(
  pathname: string,
  search: string,
  id: ProjectSheetId | null,
  extra: Readonly<Record<string, string>> = {},
): string {
  const params = new URLSearchParams(search);
  if (id) {
    params.set(SHEET_PARAM, id);
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
  } else {
    const open = params.get(SHEET_PARAM);
    if (isProjectSheetId(open)) for (const key of projectSheetScopedParams[open]) params.delete(key);
    params.delete(SHEET_PARAM);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Opens a project sheet over the current route (push, so Back closes it). */
export function useOpenProjectSheet(): (id: ProjectSheetId, extra?: Readonly<Record<string, string>>) => void {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (id: ProjectSheetId, extra?: Readonly<Record<string, string>>) => {
      const href = projectSheetHref(pathname, window.location.search, id, extra);
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
