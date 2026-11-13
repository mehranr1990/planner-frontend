"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsClient } from "@/hooks/use-is-client";
import type { FileUploadInput } from "./project-repositories";
import type { ActivityFilter, ExpenseScope, GroupTopic } from "./social-domain";
import { afterHydration } from "./queries";
import { useSocialAvailable, useSocialRepository } from "./social-provider";
import type { SocialRepository } from "./social-repositories";

/*
 * React Query hooks for Social (Phase 6 mock). Every key starts with
 * ["social"] (one private cache per signed-in person, never shared with the
 * work contexts); every Social command refreshes them all, so balances,
 * needs-you and rail badges never disagree.
 */

export const socialKeys = { all: ["social"] as const };

function useRead<T>(key: readonly unknown[], fn: (repo: SocialRepository) => Promise<T>, enabled = true) {
  const repo = useSocialRepository();
  const available = useSocialAvailable();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: [...socialKeys.all, ...key], queryFn: () => fn(repo), enabled: enabled && available, retry: false }), hydrated);
}

/** A Social command; refreshes every Social query when it settles. */
export function useSocialMutation<TVars, TResult = void>(fn: (repo: SocialRepository, vars: TVars) => Promise<TResult>) {
  const repo = useSocialRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVars) => fn(repo, vars),
    onSettled: () => client.invalidateQueries({ queryKey: socialKeys.all }),
  });
}

const scopeKey = (scope: ExpenseScope | null | undefined) => (scope ? `${scope.kind}:${scope.id}` : "none");

export const useSocialDirectory = () => useRead(["directory"], (r) => r.groups.directory());
export const useGroupAccess = (id: string | undefined) => useRead(["access", id], (r) => r.groups.access(id!), id !== undefined);
export const useDiscoverGroups = (query: string, topic: GroupTopic | "all") => useRead(["discover", query, topic], (r) => r.groups.discover(query, topic));
export const useJoinRequests = (groupId: string, enabled = true) => useRead(["join-requests", groupId], (r) => r.groups.joinRequests(groupId), enabled);
export const useGroupEvents = (groupId: string) => useRead(["events", groupId], (r) => r.groups.events(groupId));
export const useGroupInvites = (groupId: string) => useRead(["invites", groupId], (r) => r.groups.invites(groupId));
export const useLeaveChecklist = (groupId: string, enabled = true) => useRead(["leave", groupId], (r) => r.groups.leaveChecklist(groupId), enabled);

export const useConnections = () => useRead(["connections"], (r) => r.connections.list());
export const useConnectionRequests = () => useRead(["connection-requests"], (r) => r.connections.requests());
export const useRequestPrivacy = () => useRead(["privacy"], (r) => r.connections.privacy());
export const useCircles = () => useRead(["circles"], (r) => r.circles.list());
export const useBalanceBetween = (personId: string | undefined) => useRead(["between", personId], (r) => r.balances.between(personId!), personId !== undefined);

export const useActivities = (filter: ActivityFilter, groupId?: string) => useRead(["activities", filter, groupId ?? null], (r) => r.activities.mine(filter, groupId));
export const useActivity = (id: string | undefined) => useRead(["activity", id], (r) => r.activities.get(id!), id !== undefined);
export const useSocialProjections = (from: string, to: string) => useRead(["projections", from, to], (r) => r.activities.projections(from, to));
export const useActivityFiles = (activityId: string) => useRead(["activity-files", activityId], (r) => r.files.list(activityId));

/** Same shape as the PJ-10 `useFileActions`, so the shared Files component drives activity files. */
export function useActivityFileActions(activityId: string) {
  const repo = useSocialRepository();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: socialKeys.all });
  return {
    upload: useMutation({ mutationFn: (input: FileUploadInput) => repo.files.upload(activityId, input), onSettled: refresh }),
    cancel: useMutation({ mutationFn: (fileId: string) => repo.files.cancel(activityId, fileId), onSettled: refresh }),
    retry: useMutation({ mutationFn: (fileId: string) => repo.files.retry(activityId, fileId), onSettled: refresh }),
    restoreVersion: useMutation({ mutationFn: ({ fileId, version }: { fileId: string; version: number }) => repo.files.restoreVersion(activityId, fileId, version), onSettled: refresh }),
    download: (fileId: string) => repo.files.download(activityId, fileId),
  };
}

export const usePoll = (id: string | null | undefined) => useRead(["poll", id], (r) => r.polls.get(id!), Boolean(id));
export const useFreeBusy = (activityId: string) => useRead(["free-busy", activityId], (r) => r.freeBusy.range(activityId));

export const useExpenseScopes = (groupId: string | undefined) => useRead(["expense-scopes", groupId], (r) => r.expenses.scopes(groupId!), groupId !== undefined);
export const useSharedExpenses = (scope: ExpenseScope) => useRead(["expenses", scopeKey(scope)], (r) => r.expenses.list(scope));
export const useSharedExpense = (id: string) => useRead(["expense", id], (r) => r.expenses.get(id));
export const useScopeParticipants = (scope: ExpenseScope | null) => useRead(["participants", scopeKey(scope)], (r) => r.expenses.participants(scope!), scope !== null);
export const useScopeBalance = (scope: ExpenseScope | null) => useRead(["balance", scopeKey(scope)], (r) => r.balances.forScope(scope!), scope !== null);
export const useMyBalances = () => useRead(["balances-all"], (r) => r.balances.mineAll());
export const useSettlements = (scope: ExpenseScope | null) => useRead(["settlements", scopeKey(scope)], (r) => r.settlements.list(scope));

export const useGroupThings = (groupId: string) => useRead(["things", groupId], (r) => r.lending.groupThings(groupId));
export const useMyThings = () => useRead(["things-mine"], (r) => r.lending.mine());
export const useLoans = (groupId: string | null) => useRead(["loans", groupId], (r) => r.lending.loans(groupId));
export const useLostFound = (groupId: string | null) => useRead(["lost-found", groupId], (r) => r.lostFound.list(groupId));

export const useAlbums = (groupId: string) => useRead(["albums", groupId], (r) => r.albums.list(groupId));
export const usePhotos = (albumId: string) => useRead(["photos", albumId], (r) => r.albums.photos(albumId));
export const useChallenges = (groupId: string) => useRead(["challenges", groupId], (r) => r.challenges.list(groupId));
export const useNeedsYou = () => useRead(["needs-you"], (r) => r.inbox.list());
