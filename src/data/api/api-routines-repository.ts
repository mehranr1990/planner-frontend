import type { ApiClient, ResponseData } from "@/api/client";
import { newIdempotencyKey } from "@/api/client";
import type { Routine, RoutineInput, RoutinesRepository } from "../personal-services";
import { invalid, mapErrors, pageAll, retryOnConflict, revisionTag } from "./api-shared";

/*
 * Routines over /routines: a persisted, ordered group of the owner's habits
 * (title + habitIds + ACTIVE / ARCHIVED). The contract has no schedule,
 * time or check-in of its own: a routine is done through its habits.
 * Delete archives (the server keeps it and never touches habits or entries).
 */

type ApiRoutine = ResponseData<"/api/v1/routines/{id}", "get">;

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
  };
}
