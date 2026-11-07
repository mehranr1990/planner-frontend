"use client";

import { useSyncExternalStore } from "react";
import { isLiveApi } from "@/api/runtime";
import type { ProjectAccessOptions } from "@/data/project-repositories";

/*
 * SH-02 demo-state switch (README rule 6): every access/page state is
 * reachable on the project routes in mock mode with `?state=<id>` (same idea
 * as /styleguide/my-day?state=…). The project gate writes the URL value here
 * so shell islands outside the page (rail, Quick create) follow it without
 * reading search params themselves. Live API mode ignores it.
 */

export const projectDemoStates = [
  "loading",
  "empty",
  "filtered",
  "error",
  "offline",
  "unauthenticated",
  "not-available",
  "invite-pending",
  "guest",
  "revoked",
  "archived",
  "read-only",
  "conflict",
  "deleted",
  "pending",
  "quota",
] as const;

export type ProjectDemoState = (typeof projectDemoStates)[number];

export function parseProjectDemoState(value: string | null | undefined): ProjectDemoState | null {
  if (!value || isLiveApi()) return null;
  return (projectDemoStates as readonly string[]).includes(value) ? (value as ProjectDemoState) : null;
}

/** The repository preview a demo state asks for (role / archived answers). */
export function demoAccessOptions(state: ProjectDemoState | null): ProjectAccessOptions {
  if (state === "read-only") return { previewRole: "viewer" };
  if (state === "guest") return { previewRole: "guest" };
  if (state === "archived") return { previewArchived: true };
  return {};
}

let current: ProjectDemoState | null = null;
const listeners = new Set<() => void>();

export function setProjectDemoState(state: ProjectDemoState | null) {
  if (current === state) return;
  current = state;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The demo state the project gate is showing (null = real data). */
export function useProjectDemoState(): ProjectDemoState | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
