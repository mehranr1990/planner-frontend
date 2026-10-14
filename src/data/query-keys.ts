import type { TaskQuery } from "./repositories";

/*
 * React Query key factories. Hierarchical so a mutation can invalidate a
 * whole family (taskKeys.all) or one entry (taskKeys.detail(id)). Kept free
 * of "use client" so server code can prefetch with the same keys later.
 */

export const taskKeys = {
  all: ["tasks"] as const,
  lists: () => [...taskKeys.all, "list"] as const,
  list: (query: TaskQuery) =>
    // Normalised so {} and { view: undefined } share a cache entry.
    [...taskKeys.lists(), { view: query.view ?? null, day: query.day ?? null, status: query.status ?? null }] as const,
  details: () => [...taskKeys.all, "detail"] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
};

export const blockKeys = {
  all: ["blocks"] as const,
  day: (day: string) => [...blockKeys.all, "day", day] as const,
};

export const inboxKeys = {
  all: ["inbox"] as const,
  count: () => [...inboxKeys.all, "count"] as const,
};
