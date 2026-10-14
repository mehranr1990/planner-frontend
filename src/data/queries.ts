"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useIsClient } from "@/hooks/use-is-client";
import { useRepositories } from "./provider";
import { blockKeys, inboxKeys, taskKeys } from "./query-keys";
import type { TaskQuery } from "./repositories";

/*
 * Read hooks over the repositories. They only wire keys to repository calls;
 * filtering lives in the adapter and freshness in the app QueryClient
 * (staleTime 60s), so components never hold data rules.
 *
 * Hydration: the server renders every query as pending (nothing is prefetched
 * yet). A query that resolves on the client before a later streamed boundary
 * hydrates would otherwise render data where the server rendered "loading" —
 * a hydration mismatch. So each hook reports pending until hydration is over;
 * server prefetch (HydrationBoundary) replaces this when the API client lands.
 */

function afterHydration<TData, TError>(
  result: UseQueryResult<TData, TError>,
  hydrated: boolean,
): UseQueryResult<TData, TError> {
  if (hydrated) return result;
  return {
    ...result,
    data: undefined,
    status: "pending",
    isPending: true,
    isLoading: true,
    isSuccess: false,
    isError: false,
    error: null,
  } as UseQueryResult<TData, TError>;
}

export { blockKeys, inboxKeys, taskKeys } from "./query-keys";

export function useTasks(query: TaskQuery = {}) {
  const { tasks } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: taskKeys.list(query), queryFn: () => tasks.list(query) }), hydrated);
}

/** One task; idle while `id` is null (no drawer open). */
export function useTask(id: string | null) {
  const { tasks } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: taskKeys.detail(id ?? ""),
      queryFn: () => tasks.get(id!),
      enabled: id !== null,
    }),
    hydrated,
  );
}

export function useBlocks(day: string) {
  const { blocks } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: blockKeys.day(day), queryFn: () => blocks.listForDay(day) }), hydrated);
}

/** Untriaged Inbox items — the rail and More badge. */
export function useInboxCount() {
  const { inbox } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: inboxKeys.count(), queryFn: () => inbox.count() }), hydrated);
}
