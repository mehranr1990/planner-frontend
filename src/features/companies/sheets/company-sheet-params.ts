"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import { OPENED_KEY, SHEET_PARAM } from "@/features/sheets/sheet-params";

/*
 * Company sheet ids (CO-90 + CO-08): same URL contract as Personal, Projects
 * and Teams (`?sheet=<id>`, the opener pushes so Back closes), a separate id
 * list and host under /companies — no collision with other sheet ids.
 */
export const companySheetIds = ["company-new", "company-invite", "department-new", "expense-new"] as const;

export type CompanySheetId = (typeof companySheetIds)[number];

export function isCompanySheetId(value: unknown): value is CompanySheetId {
  return typeof value === "string" && (companySheetIds as readonly string[]).includes(value);
}

export function companySheetHref(pathname: string, search: string, id: CompanySheetId | null, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(search);
  if (id) params.set(SHEET_PARAM, id);
  else {
    params.delete(SHEET_PARAM);
    params.delete("expense");
  }
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Opens a company sheet over the current route (push, so Back closes it). `extra`: e.g. { expense: id } to edit. */
export function useOpenCompanySheet(): (id: CompanySheetId, extra?: Record<string, string>) => void {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (id: CompanySheetId, extra?: Record<string, string>) => {
      const href = companySheetHref(pathname, window.location.search, id, extra);
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
