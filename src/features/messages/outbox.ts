"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Attachment } from "@/data/messaging-domain";
import { useMessagingAvailable, useMessagingRepository } from "@/data/messaging-provider";
import { useQueryClient } from "@tanstack/react-query";
import { messagingKeys } from "@/data/messaging-queries";
import type { MessagingRepository } from "@/data/messaging-repositories";

/*
 * Client outbox (MS-02 sending states, MS-05 offline queue). Each send has an
 * idempotent client op id, so Retry never duplicates. MOCK MODE ONLY: while
 * the browser is offline (or the ?state=offline demo), sends queue in this
 * tab and go out in order on reconnect. Nothing is persisted or delivered
 * outside this tab — there is no real offline delivery until Phase 5 sync.
 */

export interface OutboxEntry {
  clientOpId: string;
  conversationId: string;
  body: string;
  replyToId?: string;
  parentId?: string;
  alsoToConversation?: boolean;
  attachments?: Attachment[];
  createdAt: string;
  status: "sending" | "queued" | "failed";
}

let entries: OutboxEntry[] = [];
const listeners = new Set<() => void>();
let forcedOffline = false;

function emit() {
  listeners.forEach((listener) => listener());
}
function set(next: OutboxEntry[]) {
  entries = next;
  emit();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function isOffline(): boolean {
  return forcedOffline || (typeof navigator !== "undefined" && navigator.onLine === false);
}

/** Demo state (?state=offline) — mock only. */
export function setForcedOffline(value: boolean) {
  forcedOffline = value;
  emit();
}

export function useOutbox(conversationId: string, parentId?: string): OutboxEntry[] {
  const all = useSyncExternalStore(subscribe, () => entries, () => entries);
  return all.filter((e) => e.conversationId === conversationId && (e.parentId ?? undefined) === parentId);
}

export function useQueuedCount(): number {
  return useSyncExternalStore(subscribe, () => entries.filter((e) => e.status === "queued").length, () => 0);
}

export function useOfflineState(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const off = subscribe(listener);
      window.addEventListener("online", listener);
      window.addEventListener("offline", listener);
      return () => {
        off();
        window.removeEventListener("online", listener);
        window.removeEventListener("offline", listener);
      };
    },
    isOffline,
    () => false,
  );
}

async function deliver(repo: MessagingRepository, entry: OutboxEntry, onSent: () => void) {
  set(entries.map((e) => (e.clientOpId === entry.clientOpId ? { ...e, status: "sending" } : e)));
  try {
    await repo.messages.send(entry.conversationId, {
      clientOpId: entry.clientOpId,
      body: entry.body,
      replyToId: entry.replyToId,
      parentId: entry.parentId,
      alsoToConversation: entry.alsoToConversation,
      attachments: entry.attachments,
    });
    set(entries.filter((e) => e.clientOpId !== entry.clientOpId));
    onSent();
    return true;
  } catch {
    set(entries.map((e) => (e.clientOpId === entry.clientOpId ? { ...e, status: "failed" } : e)));
    return false;
  }
}

/** Send (or queue while offline) one message; retry reuses the same client op id. */
export function useSendMessage() {
  const repo = useMessagingRepository();
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: messagingKeys.all });
  return {
    send(entry: Omit<OutboxEntry, "status" | "createdAt">) {
      const full: OutboxEntry = { ...entry, createdAt: new Date().toISOString(), status: isOffline() ? "queued" : "sending" };
      set([...entries, full]);
      if (full.status === "sending") return deliver(repo, full, refresh);
      return Promise.resolve(false);
    },
    retry(clientOpId: string) {
      const entry = entries.find((e) => e.clientOpId === clientOpId);
      if (!entry) return Promise.resolve(false);
      if (isOffline()) {
        set(entries.map((e) => (e.clientOpId === clientOpId ? { ...e, status: "queued" } : e)));
        return Promise.resolve(false);
      }
      return deliver(repo, entry, refresh);
    },
    discard(clientOpId: string) {
      set(entries.filter((e) => e.clientOpId !== clientOpId));
    },
  };
}

/** Flushes queued messages in order when the tab is back online (mounted once by the conversation view). */
export function useOutboxFlush() {
  const repo = useMessagingRepository();
  const available = useMessagingAvailable();
  const client = useQueryClient();
  const offline = useOfflineState();
  useEffect(() => {
    if (offline || !available) return;
    const queued = entries.filter((e) => e.status === "queued");
    if (!queued.length) return;
    void (async () => {
      for (const entry of queued) {
        const ok = await deliver(repo, entry, () => undefined);
        if (!ok) break; // keep order: stop at the first failure
      }
      void client.invalidateQueries({ queryKey: messagingKeys.all });
    })();
  }, [offline, repo, available, client]);
}

/** Test hook. */
export function resetOutbox() {
  entries = [];
  forcedOffline = false;
  emit();
}
