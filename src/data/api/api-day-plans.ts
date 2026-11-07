import type { ApiClient, ResponseData } from "@/api/client";
import { ApiHttpError } from "@/api/errors";

/*
 * Day plans (Phase 03): GET/POST /planning/days/{date}, item select/remove,
 * reorder (PATCH taskIds) and move. A plan is created only when the user acts
 * on it (reorder, priorities, a planned task moving to a missing day).
 * Every write sends the Day ETag; a 409 refetches the Day and re-sends the
 * same intent once. Task revisions for select/move are passed in by the caller
 * from its freshest Task row. Never creates Tasks or changes due dates.
 */

export type ApiDay = ResponseData<"/api/v1/planning/days/{date}", "get">;
export type ApiDayItem = ApiDay["items"][number];

interface Cached {
  plan: ApiDay | null;
  etag?: string;
  at: number;
}

const TTL_MS = 30_000;

export interface DayPlans {
  /** The day's plan (null when none exists), cached briefly. */
  get(date: string, fresh?: boolean): Promise<ApiDay | null>;
  /** Selects a task into the day (creating the Day when missing); no-op when already an item. */
  select(date: string, taskId: string, taskRevision: number, plannedMinutes: number | null): Promise<ApiDay>;
  /** Puts `first` at the top in that order, keeping the other items after them; selects missing ones first. */
  order(date: string, first: { taskId: string; taskRevision: number; plannedMinutes: number | null }[]): Promise<ApiDay>;
  /** Moves the task's item to another day (plan created there when missing); no-op when the task is not planned on `from`. */
  move(from: string, to: string | null, taskId: string, taskRevision: number): Promise<void>;
  invalidate(date?: string): void;
}

export function createDayPlans(client: ApiClient): DayPlans {
  const cache = new Map<string, Cached>();
  const store = (date: string, plan: ApiDay | null, etag?: string) => cache.set(date, { plan, etag, at: Date.now() });

  async function load(date: string): Promise<Cached> {
    try {
      const { data, etag } = await client.request("get", "/api/v1/planning/days/{date}", { path: { date } });
      store(date, data, etag);
    } catch (error) {
      if (!(error instanceof ApiHttpError && error.status === 404)) throw error;
      store(date, null);
    }
    return cache.get(date)!;
  }

  async function current(date: string, fresh = false) {
    const hit = cache.get(date);
    if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit;
    return load(date);
  }

  /** The Day with its ETag, created on demand (another tab may create it first: then read it). */
  async function ensure(date: string): Promise<Cached & { plan: ApiDay; etag: string }> {
    let hit = await current(date);
    if (!hit.plan || !hit.etag) hit = await load(date);
    if (hit.plan && hit.etag) return hit as Cached & { plan: ApiDay; etag: string };
    try {
      const { data, etag } = await client.request("post", "/api/v1/planning/days/{date}", { path: { date }, body: {} });
      store(date, data, etag);
    } catch (error) {
      if (!(error instanceof ApiHttpError && error.status === 409)) throw error;
      await load(date);
    }
    const created = cache.get(date)!;
    if (!created.plan || !created.etag) throw new Error("Day plan unavailable");
    return created as Cached & { plan: ApiDay; etag: string };
  }

  /** Day-scoped write with If-Match; on 409 refetch the Day and re-send once. */
  async function write<T extends { data: unknown; etag: string | undefined }>(
    date: string,
    send: (etag: string, plan: ApiDay) => Promise<T>,
    pick: (data: T["data"]) => ApiDay,
  ): Promise<ApiDay> {
    let day = await ensure(date);
    let result: T;
    try {
      result = await send(day.etag, day.plan);
    } catch (error) {
      if (!(error instanceof ApiHttpError && error.status === 409)) throw error;
      await load(date);
      day = await ensure(date);
      result = await send(day.etag, day.plan);
    }
    const plan = pick(result.data);
    store(date, plan, result.etag);
    return plan;
  }

  const hasItem = (plan: ApiDay | null, taskId: string) => !!plan?.items.some((item) => item.taskId === taskId);

  async function select(date: string, taskId: string, taskRevision: number, plannedMinutes: number | null) {
    const day = await ensure(date);
    if (hasItem(day.plan, taskId)) return day.plan;
    return write(
      date,
      (etag, plan) =>
        hasItem(plan, taskId)
          ? Promise.resolve({ data: plan, etag: etag as string | undefined })
          : client.request("put", "/api/v1/planning/days/{date}/items/{taskId}", {
              path: { date, taskId },
              header: { "If-Match": etag },
              body: { taskRevision, plannedMinutes: plannedMinutes === null ? null : Math.min(plannedMinutes, 1440) },
            }),
      (data) => data as ApiDay,
    );
  }

  return {
    async get(date, fresh = false) {
      return (await current(date, fresh)).plan;
    },
    select,
    async order(date, first) {
      for (const item of first) await select(date, item.taskId, item.taskRevision, item.plannedMinutes);
      const firstIds = first.map((item) => item.taskId);
      return write(
        date,
        (etag, plan) => {
          const rest = [...plan.items].sort((a, b) => a.position - b.position).map((item) => item.taskId).filter((id) => !firstIds.includes(id));
          return client.request("patch", "/api/v1/planning/days/{date}", {
            path: { date },
            header: { "If-Match": etag },
            body: { taskIds: [...firstIds, ...rest] },
          });
        },
        (data) => data as ApiDay,
      );
    },
    async move(from, to, taskId, taskRevision) {
      const source = await current(from, true);
      if (!hasItem(source.plan, taskId)) return;
      if (to === null) {
        // No day any more: only the plan reference goes (the Task stays).
        await write(
          from,
          (etag) =>
            client.request("delete", "/api/v1/planning/days/{date}/items/{taskId}", {
              path: { date: from, taskId },
              header: { "If-Match": etag },
              body: {},
            }),
          (data) => data as ApiDay,
        );
        return;
      }
      const target = await current(to, true);
      await write(
        from,
        (etag) =>
          client.request("post", "/api/v1/planning/days/{date}/items/{taskId}/move", {
            path: { date: from, taskId },
            header: { "If-Match": etag },
            // targetRevision 0 = no Day yet on the target date (created by the move).
            body: { targetDate: to, targetRevision: target.plan?.revision ?? 0, taskRevision },
          }),
        (data) => (data as { source: ApiDay }).source,
      );
      cache.delete(to);
    },
    invalidate(date) {
      if (date) cache.delete(date);
      else cache.clear();
    },
  };
}
