import { ApiHttpError } from "@/api/errors";
import { RepositoryError } from "../repositories";

/*
 * Shared by the live module adapters (Phase 05+): the seam's error codes for
 * the statuses the mock adapters reject with, cursor paging and the
 * "409 → refetch → re-send once" rule. Anything else (401, 5xx, network)
 * propagates unchanged; nothing here ever falls back to mock data.
 */

/** Runs `call`; 404 / 400·422 / 403 become the seam's not-found / invalid / forbidden. */
export async function mapErrors<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof ApiHttpError) {
      if (error.status === 404) throw new RepositoryError("not-found", "Not found");
      if (error.status === 400 || error.status === 422) throw new RepositoryError("invalid", "Rejected by the API");
      if (error.status === 403) throw new RepositoryError("forbidden", "Not allowed");
    }
    throw error;
  }
}

export const isConflict = (error: unknown): boolean => error instanceof ApiHttpError && error.status === 409;
export const isNotFound = (error: unknown): boolean => error instanceof ApiHttpError && error.status === 404;

/** Runs `attempt`; on a 409 runs `refresh` and tries exactly once more. */
export async function retryOnConflict<T>(attempt: () => Promise<T>, refresh: () => Promise<unknown>): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    if (!isConflict(error)) throw error;
    await refresh();
    return attempt();
  }
}

/** Follows `nextCursor` until the list ends. */
export async function pageAll<T>(fetchPage: (cursor: string | undefined) => Promise<{ items: T[]; nextCursor: string | null }>): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    all.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return all;
}

/** The documented revision ETag: the quoted revision number. */
export const revisionTag = (revision: number): string => `"${revision}"`;

export function unsupported(message: string): never {
  throw new RepositoryError("unsupported", message);
}

export function invalid(message: string): never {
  throw new RepositoryError("invalid", message);
}
