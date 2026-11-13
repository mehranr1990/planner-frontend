"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { getApiClient, isLiveApi } from "@/api/runtime";
import { useSession } from "@/features/auth/session";
import { createApiMessaging, createUnavailableMessaging } from "./api/api-messaging-repository";
import type { MessagingRepository } from "./messaging-repositories";
import { createMockMessaging } from "./mock/mock-messaging";

/*
 * Messages & Meetings data source (Phase 5). Mock Mode: the typed mock (with
 * its simulated stream). Live API mode: the HTTP adapter
 * (`api/api-messaging-repository.ts`) — no mock conversations, receipts,
 * presence or events; what the API cannot serve is refused ("unavailable").
 * Kept apart from the Personal / Project / Team / Company repositories (it
 * never writes to them; tasks from minutes are created by the caller through
 * the workspace's own engine). Tests wrap with <MessagingDataProvider repository={…}>.
 */

interface MessagingContextValue {
  repository: MessagingRepository;
  available: boolean;
}

const MessagingContext = createContext<MessagingContextValue | null>(null);

let shared: MessagingContextValue | null = null;

export function MessagingDataProvider({ repository, children }: { repository?: MessagingRepository; children: ReactNode }) {
  const [value] = useState<MessagingContextValue>(() => ({ repository: repository ?? createMockMessaging(), available: true }));
  return <MessagingContext.Provider value={value}>{children}</MessagingContext.Provider>;
}

let live: { userId: string; value: MessagingContextValue } | null = null;
let signedOut: MessagingContextValue | null = null;

/** One live repository per signed-in user (a different user gets a fresh one: no shared caches). */
function liveFor(user: { id: string; name: string }): MessagingContextValue {
  if (live?.userId !== user.id) live = { userId: user.id, value: { repository: createApiMessaging(getApiClient(), user), available: true } };
  return live.value;
}

function signedOutValue(): MessagingContextValue {
  return (signedOut ??= { repository: createUnavailableMessaging(), available: false });
}

function mockValue(): MessagingContextValue {
  return (shared ??= { repository: createMockMessaging({ simulate: true }), available: true });
}

function useMessagingContext(): MessagingContextValue {
  const value = useContext(MessagingContext);
  const isLive = isLiveApi();
  // Live identity = the signed-in session user (read from the shared session query, never guessed).
  const session = useSession({ enabled: isLive && !value });
  if (value) return value;
  if (!isLive) return mockValue();
  if (session.status !== "active") return signedOutValue();
  return liveFor({ id: session.session.user.id, name: session.session.user.name });
}

export function useMessagingRepository(): MessagingRepository {
  return useMessagingContext().repository;
}

/** False only in live mode without a signed-in session (identity unknown); otherwise served (unsupported parts refused). */
export function useMessagingAvailable(): boolean {
  return useMessagingContext().available;
}
