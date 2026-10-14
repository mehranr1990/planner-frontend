"use client";

import { useQuery } from "@tanstack/react-query";
import { useRepositories } from "./provider";
import { blockKeys, inboxKeys, taskKeys } from "./query-keys";
import type { TaskQuery } from "./repositories";

/*
 * Read hooks over the repositories. They only wire keys to repository calls;
 * filtering lives in the adapter and freshness in the app QueryClient
 * (staleTime 60s), so components never hold data rules.
 */

export { blockKeys, inboxKeys, taskKeys } from "./query-keys";

export function useTasks(query: TaskQuery = {}) {
  const { tasks } = useRepositories();
  return useQuery({ queryKey: taskKeys.list(query), queryFn: () => tasks.list(query) });
}

/** One task; idle while `id` is null (no drawer open). */
export function useTask(id: string | null) {
  const { tasks } = useRepositories();
  return useQuery({
    queryKey: taskKeys.detail(id ?? ""),
    queryFn: () => tasks.get(id!),
    enabled: id !== null,
  });
}

export function useBlocks(day: string) {
  const { blocks } = useRepositories();
  return useQuery({ queryKey: blockKeys.day(day), queryFn: () => blocks.listForDay(day) });
}

/** Untriaged Inbox items — the rail and More badge. */
export function useInboxCount() {
  const { inbox } = useRepositories();
  return useQuery({ queryKey: inboxKeys.count(), queryFn: () => inbox.count() });
}
