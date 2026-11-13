"use client";

import { useSyncExternalStore } from "react";
import { isLiveApi } from "@/api/runtime";
import type { CompanyAccessOptions } from "@/data/company-repositories";

/*
 * Company demo-state switch (same contract as Projects / Teams, SH-02 +
 * CS-01 company states): `?state=<id>` on /companies/[id]/… forces any
 * access/page state in mock mode, and `as-<role>` previews the screen with
 * that role's capabilities (SPEC permission tables). The gate writes the
 * value here so shell islands (rail, More) follow it.
 */

export const companyDemoStates = [
  "loading",
  "error",
  "offline",
  "unauthenticated",
  "not-available",
  "invite-pending",
  "left",
  "archived",
  "as-owner",
  "as-manager",
  "as-lead",
  "as-member",
  "as-viewer",
] as const;

export type CompanyDemoState = (typeof companyDemoStates)[number];

export function parseCompanyDemoState(value: string | null | undefined): CompanyDemoState | null {
  if (!value || isLiveApi()) return null;
  return (companyDemoStates as readonly string[]).includes(value) ? (value as CompanyDemoState) : null;
}

export function companyDemoAccessOptions(state: CompanyDemoState | null): CompanyAccessOptions {
  if (state === "archived") return { previewArchived: true };
  if (state?.startsWith("as-")) {
    const role = state.slice(3);
    return { previewRole: role === "manager" ? "manager" : (role as CompanyAccessOptions["previewRole"]) };
  }
  return {};
}

let current: CompanyDemoState | null = null;
const listeners = new Set<() => void>();

export function setCompanyDemoState(state: CompanyDemoState | null) {
  if (current === state) return;
  current = state;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCompanyDemoState(): CompanyDemoState | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
