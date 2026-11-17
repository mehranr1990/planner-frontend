import type { ApiClient, ResponseDataIn } from "@/api/client";
import { newIdempotencyKey, typedAs } from "@/api/client";
import type { paths as PersonalPaths } from "@/api/generated/openapi-p6-personal";
import { addDaysToDay, parseDay } from "@/lib/dates/clock-time";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import type { FocusSummary } from "../domain";
import { RepositoryError, type FocusRecoveryRepository, type PlanRepository, type ServerFocusSession } from "../repositories";
import { invalid, mapErrors, retryOnConflict, revisionTag, unsupported } from "./api-shared";

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
 * - Recoverable sessions (gap closure): the Focus timer mirrors each focus
 *   cycle as one recoverable STOPWATCH session (features/focus/focus-recovery).
 *   A cycle its session FINISHed is claimed: the server already recorded its
 *   TRACKED entry, so no manual entry is written for it (no double count).
 *   Unclaimed spans (no server session, e.g. created offline) keep the legacy
 *   manual entry. Session totals are never added to time-entry totals.
 */

type ApiSession = ResponseDataIn<PersonalPaths, "/api/v1/focus/sessions/{id}/recovery", "post">;

const toServerSession = (dto: Pick<ApiSession, "id" | "revision" | "state" | "workMs"> & { recoveryState?: ApiSession["recoveryState"] }): ServerFocusSession => ({
  id: dto.id,
  revision: dto.revision,
  state: dto.state,
  recoveryState: dto.recoveryState ?? null,
  workMs: dto.workMs,
});

export function createApiFocusRecovery(client: ApiClient): FocusRecoveryRepository & { claimed(spanEndAt: number): boolean; settled(): Promise<void> } {
  const api = typedAs<PersonalPaths>(client);
  const claims = new Set<number>();
  let queue: Promise<unknown> = Promise.resolve();
  const get = async (id: string) => toServerSession((await api.request("get", "/api/v1/focus/sessions/{id}", { path: { id } })).data);
  return {
    create: (title) =>
      mapErrors(async () => {
        const { data } = await api.request("post", "/api/v1/focus/sessions", {
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { title: title.trim().slice(0, 300) || "Focus", mode: "STOPWATCH", timezone: getPlannerTimeZone(), recoverable: true },
        });
        return toServerSession(data);
      }),
    get: (id) => mapErrors(() => get(id)),
    command: (session, action, key, minutes) =>
      mapErrors(async () => {
        if (action === "EXTEND" && !(Number.isInteger(minutes) && minutes! >= 1 && minutes! <= 180)) invalid("EXTEND needs 1–180 minutes");
        let revision = session.revision;
        const dto = await retryOnConflict(
          async () =>
            (
              await api.request("post", "/api/v1/focus/sessions/{id}/recovery", {
                path: { id: session.id },
                header: { "If-Match": revisionTag(revision), "Idempotency-Key": key },
                body: { action, ...(action === "EXTEND" ? { minutes } : {}) },
              })
            ).data,
          async () => {
            revision = (await get(session.id)).revision;
          },
        );
        return toServerSession(dto);
      }),
    claim: (spanEndAt) => void claims.add(spanEndAt),
    claimed: (spanEndAt) => claims.has(spanEndAt),
    track: (work) => {
      queue = queue.then(() => work).catch(() => undefined);
    },
    settled: () => queue.then(() => undefined),
  };
}

/** The API rejects zero-length entries; a cycle skipped at once is not work. */
const MIN_ENTRY_MS = 1000;

export function createApiFocus(client: ApiClient): Pick<PlanRepository, "focusToday" | "recordFocusSessions" | "focusRecovery"> {
  const cycles = new Map<string, number>();
  const recovery = createApiFocusRecovery(client);

  async function focusToday(day: string): Promise<FocusSummary> {
    if (parseDay(day) === null) invalid(`Bad day "${day}"`);
    const { data } = await mapErrors(() => client.request("get", "/api/v1/productivity/summary", { query: { from: day, to: addDaysToDay(day, 1), timezone: getPlannerTimeZone() } }));
    return { sessionsCompleted: data.days.find((entry) => entry.localDate === day)?.entryCount ?? 0, cycle: cycles.get(day) ?? 1 };
  }

  return {
    focusToday,
    focusRecovery: recovery,
    async recordFocusSessions(day, { count, cycle, spans }) {
      if (parseDay(day) === null) invalid(`Bad day "${day}"`);
      if (!Number.isInteger(count) || count < 1 || !Number.isInteger(cycle) || cycle < 1) invalid("Focus sessions need a positive count and cycle");
      if (!spans || spans.length !== count) unsupported("The API records focus work only with its actual times");
      if (spans.some((span) => !Number.isFinite(span.endAt) || !(span.ms >= 0))) invalid("Bad focus span");
      const timezone = getPlannerTimeZone();
      let failed = 0;
      for (const span of spans) {
        const ms = Math.round(span.ms);
        // Recorded by its recoverable session's FINISH (TRACKED entry): never a second, manual one.
        if (recovery.claimed(span.endAt)) continue;
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
      // Totals after the claimed sessions' FINISH has committed.
      await recovery.settled();
      if (failed) throw new RepositoryError(failed === spans.length ? "invalid" : "partial", "Some focus cycles were rejected by the API");
      return focusToday(day);
    },
  };
}
