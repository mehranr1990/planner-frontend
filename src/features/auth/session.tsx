"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { ApiHttpError, ApiNetworkError } from "@/api/errors";
import { getApiClient } from "@/api/runtime";
import { probeSession, type SessionState } from "@/api/session";
import { FOCUS_STORAGE_KEY } from "@/features/focus/focus-store";
import { SLOT_DISMISSALS_KEY } from "@/features/overview/domain/slot-dismissals";
import { OPENED_KEY } from "@/features/sheets/sheet-params";
import { signOut } from "./auth-api";
import { hardNavigate, signInHref, type SignInReason } from "./navigation";

/*
 * The browser session, revalidated through GET /auth/get-session (cookie
 * only). Status follows FRONTEND_TYPES_AND_STATE "Session and cache
 * boundaries": loading · anonymous · active (verified) · unavailable
 * (403: closed / quarantined / unverified) · offline (no answer yet).
 */

export const sessionQueryKey = ["auth", "session"] as const;

/** Account-scoped keys: every private cache entry carries the user id. */
export const accountKeys = {
  all: (userId: string) => ["account", userId] as const,
  me: (userId: string) => ["account", userId, "me"] as const,
  settings: (userId: string) => ["account", userId, "settings"] as const,
  space: (userId: string) => ["account", userId, "space"] as const,
  sessions: (userId: string) => ["account", userId, "sessions"] as const,
};

export type SessionStatus =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "active"; session: SessionState }
  | { status: "unavailable" }
  | { status: "offline"; retry: () => void };

async function fetchSession(signal: AbortSignal): Promise<SessionState | null> {
  try {
    return await probeSession(getApiClient(), signal);
  } catch (error) {
    // A rejected/expired cookie is simply "signed out".
    if (error instanceof ApiHttpError && error.status === 401) return null;
    throw error;
  }
}

export function useSession(options: { enabled?: boolean } = {}): SessionStatus {
  const query = useQuery({
    queryKey: sessionQueryKey,
    queryFn: ({ signal }) => fetchSession(signal),
    staleTime: 30_000,
    // Coming back to the tab revalidates: a session revoked elsewhere ends here.
    refetchOnWindowFocus: true,
    retry: (count, error) => error instanceof ApiNetworkError && count < 2,
    enabled: options.enabled ?? true,
  });
  if (query.data !== undefined) return query.data ? { status: "active", session: query.data } : { status: "anonymous" };
  if (query.error instanceof ApiHttpError && query.error.status === 403) return { status: "unavailable" };
  if (query.error) return { status: "offline", retry: () => void query.refetch() };
  return { status: "loading" };
}

/**
 * Browser-stored keys that hold account data: the running Focus session,
 * Overview slot dismissals and the last opened sheet URL. Device UI state
 * (calendar layer visibility, Task-create "more" toggle) and the display
 * preference cookies are not account data and stay.
 */
export const ACCOUNT_STORAGE_KEYS: readonly string[] = [FOCUS_STORAGE_KEY, SLOT_DISMISSALS_KEY, OPENED_KEY];

function clearPrivateStorage() {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      for (const key of ACCOUNT_STORAGE_KEYS) storage.removeItem(key);
    } catch {
      // storage unavailable (private mode): nothing persisted to clear
    }
  }
}

let leaving = false;

/** Cancel private work, drop caches and browser-persisted app state, then reload on the sign-in page. */
export function leaveToSignIn(queryClient: QueryClient, reason?: SignInReason, next?: string | null) {
  if (leaving) return;
  leaving = true;
  void queryClient.cancelQueries();
  queryClient.getMutationCache().clear();
  queryClient.clear();
  clearPrivateStorage();
  hardNavigate(signInHref(reason, next));
}

/** Test seam: allow another leave after a simulated navigation. */
export function resetLeaveGuardForTests() {
  leaving = false;
}

/** Global handler for query/mutation errors in live mode: a 401 anywhere means the session is gone. */
export function handleApiErrorGlobally(queryClient: QueryClient, error: unknown, meta?: Record<string, unknown>) {
  if (meta?.authFlow) return;
  if (error instanceof ApiHttpError && error.status === 401) {
    leaveToSignIn(queryClient, "expired", window.location.pathname + window.location.search);
  }
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    try {
      await signOut(getApiClient());
    } catch (error) {
      // Already signed out server-side is fine; anything else keeps the user here to retry.
      if (!(error instanceof ApiHttpError && error.status === 401)) throw error;
    }
    leaveToSignIn(queryClient, "signed-out");
  }, [queryClient]);
}
