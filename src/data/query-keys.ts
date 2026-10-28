import { normalizeFilters, searchTerms } from "./task-query";
import type { TaskCountsQuery, TaskQuery, UnscheduledRange } from "./repositories";

/*
 * React Query key factories. Hierarchical so a mutation can invalidate a
 * whole family (taskKeys.all) or one entry (taskKeys.detail(id)). Kept free
 * of "use client" so server code can prefetch with the same keys later.
 */

function searchKey(search: string | undefined): string | null {
  const terms = searchTerms(search);
  return terms.length > 0 ? terms.join(" ") : null;
}

export const taskKeys = {
  all: ["tasks"] as const,
  lists: () => [...taskKeys.all, "list"] as const,
  list: (query: TaskQuery) =>
    // Normalised so {} and { view: undefined } share a cache entry; filters and search are folded too.
    [
      ...taskKeys.lists(),
      {
        view: query.view ?? null,
        day: query.day ?? null,
        status: query.status ?? null,
        filters: normalizeFilters(query.filters),
        search: searchKey(query.search),
        sort: query.sort ?? null,
      },
    ] as const,
  /** Badge counts for the Tasks tabs; they follow the active filters and search. */
  counts: (query: TaskCountsQuery = {}) =>
    [
      ...taskKeys.all,
      "counts",
      { day: query.day ?? null, filters: normalizeFilters(query.filters), search: searchKey(query.search) },
    ] as const,
  areas: () => [...taskKeys.all, "areas"] as const,
  /** Per range; the week range also depends on which day the week starts. */
  unscheduled: (day: string, range: UnscheduledRange, weekStartsOn: number | null = null) =>
    [...taskKeys.all, "unscheduled", day, range, range === "week" ? weekStartsOn : null] as const,
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
  list: (state: string) => [...inboxKeys.all, "list", state] as const,
};

export const planKeys = {
  all: ["plan"] as const,
  priorities: (day: string) => [...planKeys.all, "priorities", day] as const,
  focus: (day: string) => [...planKeys.all, "focus", day] as const,
};

/** Module reads Overview shows (P01); the module screens reuse them. */
export const moduleKeys = {
  habits: ["habits"] as const,
  goals: ["goals"] as const,
  moods: (from: string, to: string) => ["journal", "moods", from, to] as const,
  journal: ["journal"] as const,
  journalEntries: (from: string, to: string) => ["journal", "entries", from, to] as const,
  journalEntry: (day: string) => ["journal", "entry", day] as const,
  finance: (day: string) => ["finance", "month", day] as const,
  insight: (day: string) => ["insights", "highlight", day] as const,
};

/** Brain Dump (P08): the pages list and one page per day. */
export const brainDumpKeys = {
  all: ["brain-dump"] as const,
  pages: () => [...brainDumpKeys.all, "pages"] as const,
  page: (day: string) => [...brainDumpKeys.all, "page", day] as const,
};

/** Goals (P11). Every key sits under moduleKeys.goals; linked tasks sit under taskKeys so task edits refresh them. */
export const goalKeys = {
  all: moduleKeys.goals,
  list: (lifecycle: string) => [...moduleKeys.goals, "list", lifecycle] as const,
  detail: (id: string) => [...moduleKeys.goals, "detail", id] as const,
  tasks: (id: string) => [...taskKeys.all, "goal", id] as const,
};

/** Finance (P13). Everything sits under ["finance"] (with Overview's summary), so one write refreshes it all. */
export const financeKeys = {
  all: ["finance"] as const,
  month: (start: string) => [...financeKeys.all, "detail", start] as const,
  transactions: (from: string, to: string) => [...financeKeys.all, "transactions", from, to] as const,
  bills: (from: string) => [...financeKeys.all, "bills", from] as const,
  transaction: (id: string) => [...financeKeys.all, "transaction", id] as const,
};
