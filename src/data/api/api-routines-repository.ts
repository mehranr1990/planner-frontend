import type { ApiClient, ResponseData, ResponseDataIn } from "@/api/client";
import { newIdempotencyKey, typedAs } from "@/api/client";
import type { paths as PersonalPaths } from "@/api/generated/openapi-p6-personal";
import type { Routine, RoutineInput, RoutineOccurrence, RoutineSchedule, RoutinesRepository } from "../personal-services";
import { invalid, mapErrors, pageAll, retryOnConflict, revisionTag } from "./api-shared";

/*
 * Routines over /routines: a persisted, ordered group of the owner's habits
 * (title + habitIds + ACTIVE / ARCHIVED). Delete archives (the server keeps
 * it and never touches habits or entries). The optional schedule lives on
 * /routines/{id}/schedule (Routine ETag, advances its revision); days come
 * from /occurrences (half-open range, ≤ 100 per page, continue with
 * nextDate) and are executed with START / COMPLETE / SKIP (If-Match = the
 * day's revision + Idempotency-Key). Progress counts the linked habits'
 * real records; completing a routine never writes habit entries.
 */

type ApiRoutine = ResponseData<"/api/v1/routines/{id}", "get">;
type ApiSchedule = NonNullable<ResponseDataIn<PersonalPaths, "/api/v1/routines/{id}/schedule", "get">["schedule"]>;
type ApiOccurrence = ResponseDataIn<PersonalPaths, "/api/v1/routines/{id}/occurrences/{date}/execute", "post">;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const toSchedule = (dto: ApiSchedule): RoutineSchedule => ({
  kind: dto.kind,
  startDate: dto.startDate,
  endDate: dto.endDate ?? null,
  weekdays: dto.weekdays ?? [],
  startTime: dto.startTime,
  expectedMinutes: dto.expectedMinutes ?? null,
  reminder: dto.reminder ?? false,
  timezone: dto.timezone,
});

function scheduleToApi(schedule: RoutineSchedule): ApiSchedule {
  const { kind, startDate, endDate, weekdays, startTime, expectedMinutes, reminder, timezone } = schedule;
  if (!DAY.test(startDate) || (endDate !== null && (!DAY.test(endDate) || endDate < startDate))) invalid("The end day must not be before the start day");
  if (!TIME.test(startTime)) invalid("A routine time is HH:mm");
  if (expectedMinutes !== null && (!Number.isInteger(expectedMinutes) || expectedMinutes < 1 || expectedMinutes > 1440)) invalid("Expected minutes are 1–1440");
  const days = [...new Set(weekdays)].sort();
  if (kind === "WEEKDAYS" && (days.length === 0 || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6))) invalid("Pick at least one weekday");
  return {
    kind,
    startDate,
    startTime,
    timezone,
    reminder,
    ...(endDate !== null ? { endDate } : {}),
    ...(kind === "WEEKDAYS" ? { weekdays: days } : {}),
    ...(expectedMinutes !== null ? { expectedMinutes } : {}),
  };
}

const toOccurrence = (dto: ApiOccurrence): RoutineOccurrence => ({
  routineId: dto.routineId,
  date: dto.localDate,
  scheduledAt: dto.scheduledAt,
  state: dto.state,
  revision: dto.revision,
  startedAt: dto.startedAt,
  completedAt: dto.completedAt,
  linkedHabits: dto.linkedHabitCount,
  completedHabits: dto.completedHabitCount,
  percent: dto.completionPercentage,
});

const PAGE = "100";
const MAX_HABITS = 100;

const toRoutine = (dto: ApiRoutine): Routine => ({
  id: dto.id,
  revision: dto.revision,
  title: dto.title,
  habits: [...dto.habits]
    .sort((a, b) => a.position - b.position)
    .map((habit) => ({ id: habit.habitId, title: habit.title, archived: habit.status === "ARCHIVED" || habit.status === null })),
});

function check(input: Partial<RoutineInput>) {
  if (input.title !== undefined && (!input.title.trim() || input.title.length > 300)) invalid("A routine needs a title (≤ 300)");
  if (input.habitIds !== undefined && (input.habitIds.length > MAX_HABITS || new Set(input.habitIds).size !== input.habitIds.length)) invalid("Habits must be distinct (≤ 100)");
}

export function createApiRoutinesRepository(client: ApiClient): RoutinesRepository {
  const api = typedAs<PersonalPaths>(client);
  async function write(routine: Routine, send: (ifMatch: string) => Promise<ApiRoutine>): Promise<Routine> {
    let revision = routine.revision;
    return toRoutine(
      await retryOnConflict(
        () => send(revisionTag(revision)),
        async () => {
          revision = (await client.request("get", "/api/v1/routines/{id}", { path: { id: routine.id } })).data.revision;
        },
      ),
    );
  }

  return {
    list: () =>
      mapErrors(async () =>
        (await pageAll(async (cursor) => (await client.request("get", "/api/v1/routines", { query: { limit: PAGE, cursor } })).data))
          .filter((dto) => dto.status === "ACTIVE")
          .map(toRoutine),
      ),

    create: (input) =>
      mapErrors(async () => {
        check(input);
        const { data } = await client.request("post", "/api/v1/routines", {
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { title: input.title.trim(), habitIds: input.habitIds },
        });
        return toRoutine(data);
      }),

    update: (routine, patch) =>
      mapErrors(async () => {
        check(patch);
        const body = { ...(patch.title !== undefined ? { title: patch.title.trim() } : {}), ...(patch.habitIds !== undefined ? { habitIds: patch.habitIds } : {}) };
        return write(routine, async (ifMatch) => (await client.request("patch", "/api/v1/routines/{id}", { path: { id: routine.id }, header: { "If-Match": ifMatch }, body })).data);
      }),

    remove: (routine) =>
      mapErrors(async () => {
        await write(routine, async (ifMatch) => (await client.request("delete", "/api/v1/routines/{id}", { path: { id: routine.id }, header: { "If-Match": ifMatch }, body: {} })).data);
      }),

    schedule: (routineId) =>
      mapErrors(async () => {
        const { data } = await api.request("get", "/api/v1/routines/{id}/schedule", { path: { id: routineId } });
        return data.schedule ? toSchedule(data.schedule) : null;
      }),

    setSchedule: (routine, schedule) =>
      mapErrors(async () => {
        const body = { schedule: schedule ? scheduleToApi(schedule) : null };
        let revision = routine.revision;
        const saved = await retryOnConflict(
          async () => (await api.request("patch", "/api/v1/routines/{id}/schedule", { path: { id: routine.id }, header: { "If-Match": revisionTag(revision) }, body })).data,
          async () => {
            revision = (await client.request("get", "/api/v1/routines/{id}", { path: { id: routine.id } })).data.revision;
          },
        );
        return { ...routine, revision: saved.revision };
      }),

    occurrences: (routineId, from, to) =>
      mapErrors(async () => {
        if (!DAY.test(from) || !DAY.test(to) || to <= from) invalid("A routine range is [from, to)");
        const items: RoutineOccurrence[] = [];
        let afterDate: string | undefined;
        for (let page = 0; page < 10; page += 1) {
          const { data } = await api.request("get", "/api/v1/routines/{id}/occurrences", {
            path: { id: routineId },
            query: { from, to, limit: PAGE, ...(afterDate ? { afterDate } : {}) },
          });
          items.push(...data.items.map(toOccurrence));
          if (!data.nextDate) break;
          afterDate = data.nextDate;
        }
        return items;
      }),

    execute: (occurrence, action) =>
      mapErrors(async () => {
        // One key per logical command; terminal days are refused by the server (409), never re-sent.
        const { data } = await api.request("post", "/api/v1/routines/{id}/occurrences/{date}/execute", {
          path: { id: occurrence.routineId, date: occurrence.date },
          header: { "If-Match": revisionTag(occurrence.revision), "Idempotency-Key": newIdempotencyKey() },
          body: { action },
        });
        return toOccurrence(data);
      }),
  };
}
