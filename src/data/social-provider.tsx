"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { getApiClient, isLiveApi } from "@/api/runtime";
import { useSession } from "@/features/auth/session";
import { createApiSocial, createUnavailableSocial } from "./api/api-social-repository";
import { createMockSocial } from "./mock/mock-social";
import type { SocialRepository } from "./social-repositories";

/*
 * Social data source (Phase 6). Mock Mode: the typed mock. Live API mode:
 * the HTTP adapter over P6-01 (`api/api-social-repository.ts`) for the
 * signed-in session user — never mock data; what the contract does not
 * serve is refused ("unsupported") and screens show "not available yet".
 * Without a session in live mode nothing is served (`available` false).
 * Kept apart from every other repository (social and work never mix).
 * Tests wrap with <SocialDataProvider repository={…}> for a fresh store.
 */

interface SocialContextValue {
  repository: SocialRepository;
  available: boolean;
}

const SocialContext = createContext<SocialContextValue | null>(null);

let shared: SocialContextValue | null = null;
let live: { userId: string; value: SocialContextValue } | null = null;
let signedOut: SocialContextValue | null = null;

export function SocialDataProvider({ repository, children }: { repository?: SocialRepository; children: ReactNode }) {
  const [value] = useState<SocialContextValue>(() => ({ repository: repository ?? createMockSocial(), available: true }));
  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

/** One live repository per signed-in user (another user gets a fresh one: no shared caches). */
function liveFor(user: { id: string; name: string }): SocialContextValue {
  if (live?.userId !== user.id) live = { userId: user.id, value: { repository: createApiSocial(getApiClient(), user), available: true } };
  return live.value;
}

function useSocialContext(): SocialContextValue {
  const value = useContext(SocialContext);
  const isLive = isLiveApi();
  const session = useSession({ enabled: isLive && !value });
  if (value) return value;
  if (!isLive) return (shared ??= { repository: createMockSocial(), available: true });
  if (session.status !== "active") return (signedOut ??= { repository: createUnavailableSocial(), available: false });
  return liveFor({ id: session.session.user.id, name: session.session.user.name });
}

export function useSocialRepository(): SocialRepository {
  return useSocialContext().repository;
}

/** False only in live mode without a signed-in session. */
export function useSocialAvailable(): boolean {
  return useSocialContext().available;
}
