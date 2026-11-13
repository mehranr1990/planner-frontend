import type { ApiClient } from "@/api/client";
import { newIdempotencyKey } from "@/api/client";
import { addDaysToDay, parseDay } from "@/lib/dates/clock-time";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import type { FocusSummary } from "../domain";
import { RepositoryError, type PlanRepository } from "../repositories";
import { invalid, mapErrors, unsupported } from "./api-shared";

/*
 * Focus stats (Phase 07). The Focus timer runs in the browser (P09), while the
 * API's own focus sessions are clocked by the server and refuse client times,
 * so a finished cycle is stored as what the API accepts from a client: one
 * manual time entry (POST /time-entries) with the cycle's actual end and
 * focused length. Nothing is written without those actual times.
 * - sessionsCompleted = the day's recorded time entries (GET
 *   /productivity/summary, one day in the planner zone); it also counts
 *   entries recorded elsewhere, and a cross-midnight entry on both days.
 * - `cycle` is the browser timer's own position, not server data: it is echoed
 *   for the running page only (1 after a reload).
 * - Server focus sessions (start / pause / finish) have no UI to drive them.
 */

/** The API rejects zero-length entries; a cycle skipped at once is not work. */
const MIN_ENTRY_MS = 1000;

export function createApiFocus(client: ApiClient): Pick<PlanRepository, "focusToday" | "recordFocusSessions"> {
  const cycles = new Map<string, number>();

  async function focusToday(day: string): Promise<FocusSummary> {
    if (parseDay(day) === null) invalid(`Bad day "${day}"`);
    const { data } = await mapErrors(() => client.request("get", "/api/v1/productivity/summary", { query: { from: day, to: addDaysToDay(day, 1), timezone: getPlannerTimeZone() } }));
    return { sessionsCompleted: data.days.find((entry) => entry.localDate === day)?.entryCount ?? 0, cycle: cycles.get(day) ?? 1 };
  }

  return {
    focusToday,
    async recordFocusSessions(day, { count, cycle, spans }) {
      if (parseDay(day) === null) invalid(`Bad day "${day}"`);
      if (!Number.isInteger(count) || count < 1 || !Number.isInteger(cycle) || cycle < 1) invalid("Focus sessions need a positive count and cycle");
      if (!spans || spans.length !== count) unsupported("The API records focus work only with its actual times");
      if (spans.some((span) => !Number.isFinite(span.endAt) || !(span.ms >= 0))) invalid("Bad focus span");
      const timezone = getPlannerTimeZone();
      let failed = 0;
      for (const span of spans) {
        const ms = Math.round(span.ms);
        if (ms < MIN_ENTRY_MS) continue;
        try {
          await mapErrors(() =>
            client.request("post", "/api/v1/time-entries", {
              header: { "Idempotency-Key": newIdempotencyKey() },
              body: { startAt: new Date(span.endAt - ms).toISOString(), endAt: new Date(span.endAt).toISOString(), timezone },
            }),
          );
        } catch (error) {
          if (!(error instanceof RepositoryError)) throw error;
          failed += 1;
        }
      }
      cycles.set(day, cycle);
      if (failed) throw new RepositoryError(failed === spans.length ? "invalid" : "partial", "Some focus cycles were rejected by the API");
      return focusToday(day);
    },
  };
}
