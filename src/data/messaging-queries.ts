"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useIsClient } from "@/hooks/use-is-client";
import type { ConversationTab, MeetingTab, MsgSource, MsgSourceKind, SearchFilters } from "./messaging-domain";
import { useMessagingAvailable, useMessagingRepository } from "./messaging-provider";
import type { MessagingRepository } from "./messaging-repositories";
import { afterHydration } from "./queries";

/*
 * React Query hooks for Messages & Meetings (Phase 5 mock). Every key starts
 * with ["messaging"]; any mutation or simulated live event refreshes them all
 * (one private cache per signed-in user, never shared with other contexts).
 */

export const messagingKeys = { all: ["messaging"] as const };

/** `fresh`: re-read on every mount (server capability hints that change with membership). */
function useRead<T>(key: readonly unknown[], fn: (repo: MessagingRepository) => Promise<T>, enabled = true, fresh = false) {
  const repo = useMessagingRepository();
  const available = useMessagingAvailable();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: [...messagingKeys.all, ...key], queryFn: () => fn(repo), enabled: enabled && available, ...(fresh ? { staleTime: 0 } : {}) }), hydrated);
}

/** A messaging command; refreshes every messaging query when it settles. */
export function useMessagingMutation<TVars, TResult>(fn: (repo: MessagingRepository, vars: TVars) => Promise<TResult>) {
  const repo = useMessagingRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVars) => fn(repo, vars),
    onSettled: () => client.invalidateQueries({ queryKey: messagingKeys.all }),
  });
}

/** Simulated live stream (mock): events refresh the messaging cache. */
export function useMessagingEvents() {
  const repo = useMessagingRepository();
  const available = useMessagingAvailable();
  const client = useQueryClient();
  useEffect(() => {
    if (!available) return;
    return repo.subscribe(() => void client.invalidateQueries({ queryKey: messagingKeys.all }));
  }, [repo, client, available]);
}

export const useConversations = (tab: ConversationTab) => useRead(["list", tab], (r) => r.conversations.list(tab));
export const useConversation = (id: string | undefined) => useRead(["conversation", id], (r) => r.conversations.get(id!), id !== undefined);
export const useParticipants = (id: string, enabled = true) => useRead(["participants", id], (r) => r.conversations.participants(id), enabled);
export const useUnreadConversations = () => useRead(["unread"], (r) => r.conversations.unreadCount());
export const useWorkspaceMentions = (workspaceId: string | undefined) =>
  useRead(["mentions", workspaceId], (r) => r.conversations.workspaceMentions(workspaceId!), workspaceId !== undefined);
export const useConversationInvitations = () => useRead(["conversation-invitations"], (r) => r.conversations.invitations(), true, true);
/** Bell: messaging notices + announcement reminders (polled like the personal badge; no stream exists). */
export function useMessagingNotices() {
  const repo = useMessagingRepository();
  const available = useMessagingAvailable();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: [...messagingKeys.all, "notices"],
      queryFn: async () => {
        const [notices, reminders] = await Promise.all([repo.conversations.notices(), repo.announcements.reminders()]);
        return { notices, reminders };
      },
      enabled: available,
      refetchInterval: 60_000,
    }),
    hydrated,
  );
}
export const useMessagePage =(id: string | undefined, enabled = true) => useRead(["page", id], (r) => r.messages.page(id!), id !== undefined && enabled);
export const useThread = (cid: string, parentId: string | undefined) =>
  useRead(["thread", cid, parentId], (r) => r.messages.thread(cid, parentId!), parentId !== undefined);
export const usePinnedMessages = (id: string, enabled = true) => useRead(["pinned", id], (r) => r.messages.pinned(id), enabled);
export const useConversationMedia = (id: string, enabled = true) => useRead(["media", id], (r) => r.messages.media(id), enabled);
export const useForwardTargets = (messageId: string | undefined) =>
  useRead(["forward", messageId], (r) => r.messages.forwardTargets(messageId!), messageId !== undefined);
export const useMessageSearch = (query: string, filters: SearchFilters) =>
  useRead(["search", query, filters], (r) => r.messages.search(query, filters), Boolean(query.trim() || filters.from || filters.has || filters.in));
export const useLookup = (query: string) => useRead(["lookup", query], (r) => r.conversations.lookup(query), query.trim().length > 0);
export const useChannels = (workspaceId: string | undefined) => useRead(["channels", workspaceId], (r) => r.channels.list(workspaceId!), workspaceId !== undefined);
export const useChannelWorkspace = (workspaceId: string | undefined) =>
  useRead(["channel-ws", workspaceId], (r) => r.channels.workspace(workspaceId!), workspaceId !== undefined);
export const useMessagingSettings = () => useRead(["settings"], (r) => r.settings.get());
export const useBlockedPeople = () => useRead(["blocked"], (r) => r.settings.blocked());
export const useMeetings = (tab: MeetingTab) => useRead(["meetings", tab], (r) => r.meetings.list(tab));
export const useMeetingInvitations = (enabled = true) => useRead(["meeting-invitations"], (r) => r.meetings.invitations(), enabled);
export const useMeeting = (id: string | undefined) => useRead(["meeting", id], (r) => r.meetings.get(id!), id !== undefined);
export const useMeetingsForCalendar = (source: MsgSource | undefined, from: string, to: string) =>
  useRead(["meetings-cal", source?.kind, source?.workspaceId, from, to], (r) => r.meetings.forCalendar(source!, from, to), source !== undefined);
export const useMeetingSources = (enabled = true) => useRead(["meeting-sources"], (r) => r.meetings.sources(), enabled, true);
export const useInvitable = (source: MsgSource | undefined) =>
  useRead(["invitable", source?.kind, source?.workspaceId], (r) => r.meetings.invitable(source!), source !== undefined, true);
export const useMinutes = (meetingId: string | undefined) => useRead(["minutes", meetingId], (r) => r.minutes.get(meetingId!), meetingId !== undefined);
export const useAnnouncements = (workspaceId: string | undefined, kind?: MsgSourceKind) =>
  useRead(["announcements", workspaceId, kind], (r) => r.announcements.list(workspaceId!, kind), workspaceId !== undefined);
export const useAnnouncementAccess = (workspaceId: string | undefined, kind?: MsgSourceKind) =>
  useRead(["announcement-access", workspaceId, kind], (r) => r.announcements.access(workspaceId!, kind), workspaceId !== undefined);

/** Idempotent client op id for one command (retries reuse it). */
export function newClientOpId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
