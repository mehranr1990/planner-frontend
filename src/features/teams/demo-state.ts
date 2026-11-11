"use client";

import { useSyncExternalStore } from "react";
import { isLiveApi } from "@/api/runtime";
import type { TeamAccessOptions } from "@/data/team-repositories";

/*
 * Team demo-state switch (same contract as Projects, SH-02 + TS-01 team
 * states): `?state=<id>` on /teams/[id]/… forces any access/page state in
 * mock mode. The gate writes the value here so shell islands (rail, More)
 * follow it. Live API mode ignores it.
 */

export const teamDemoStates = [
  "loading",
  "empty",
  "error",
  "offline",
  "unauthenticated",
  "not-available",
  "invite-pending",
  "removed",
  "archived",
  "read-only",
  "conflict",
] as const;

export type TeamDemoState = (typeof teamDemoStates)[number];

export function parseTeamDemoState(value: string | null | undefined): TeamDemoState | null {
  if (!value || isLiveApi()) return null;
  return (teamDemoStates as readonly string[]).includes(value) ? (value as TeamDemoState) : null;
}

/** The repository preview a demo state asks for (role / archived answers). */
export function teamDemoAccessOptions(state: TeamDemoState | null): TeamAccessOptions {
  if (state === "read-only") return { previewRole: "viewer" };
  if (state === "archived") return { previewArchived: true };
  return {};
}

let current: TeamDemoState | null = null;
const listeners = new Set<() => void>();

export function setTeamDemoState(state: TeamDemoState | null) {
  if (current === state) return;
  current = state;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTeamDemoState(): TeamDemoState | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
