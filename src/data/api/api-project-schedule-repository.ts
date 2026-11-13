import { newIdempotencyKey, type ApiClient } from "@/api/client";
import { MINUTES_PER_DAY, dayOfInstant, diffDays } from "@/lib/dates/clock-time";
import type { ScheduleGraph, ScheduleItem, ScheduleLink, ScheduleMove, SchedulePreview } from "../project-domain";
import type { ScheduleRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { isConflict, mapErrors, pageAll, retryOnConflict, revisionTag, unsupported } from "./api-shared";
import { conflictAware, liveOnly, projectsClient, projectViewItems, type ProjectsData } from "./api-project-shared";

/*
 * PJ-06/07 schedule over the P6-01 Projects contract:
 * - graph: project tasks that have both a planned start and a due instant
 *   (`…/tasks/{taskId}/schedule`, one read per task), milestones with a target
 *   date (`…/components/milestones`) and the live dependency edges.
 * - links: `…/dependencies` (the API takes a client id and a lag in minutes).
 *   A link's type cannot change (PATCH carries the lag only): refused.
 *   The API names no "cycle" / "duplicate" code: both arrive as "invalid".
 * - preview / apply: `…/reschedule-previews` moves one timed task and shifts
 *   its affected descendants (the "cascade" mode). The API applies a preview by
 *   id + manifest hash while the seam applies a list of moves, so the last
 *   preview per project is kept here and `apply` must carry exactly its moves.
 *   "Only this task" and milestone moves have no operation: refused.
 * - overlaps and the critical path have no read model: refused.
 */

type ApiEdge = ProjectsData<"/api/v1/projects/{projectId}/dependencies", "get">["edges"][number];
type ApiTask = ProjectsData<"/api/v1/projects/{id}/tasks", "get">["items"][number];
type ApiMilestone = ProjectsData<"/api/v1/projects/{id}/components/{kind}", "get">["items"][number];

const PAGE = 100;
const SCHEDULE_READS = 8;
const GAP = "the contract has no assignee overlaps and no critical path";
const DAY_MS = MINUTES_PER_DAY * 60_000;

/** The instant moved by whole days, keeping its time of day. */
const shiftToDay = (instant: string, day: string): string => new Date(Date.parse(instant) + diffDays(dayOfInstant(instant), day) * DAY_MS).toISOString();
const signature = (moves: readonly ScheduleMove[]): string =>
  moves
    .map((move) => `${move.id}:${move.to.start}:${move.to.end}:${move.revision}`)
    .sort()
    .join("|");

const toLink = (edge: ApiEdge): ScheduleLink => ({
  id: edge.id,
  predecessorId: edge.predecessorId,
  successorId: edge.successorId,
  type: edge.kind,
  lagDays: edge.lagMinutes / MINUTES_PER_DAY,
});

export function createApiProjectScheduleRepository(client: ApiClient): ScheduleRepository {
  const api = projectsClient(client);

  const edges = async (projectId: string): Promise<ApiEdge[]> =>
    (await api.request("get", "/api/v1/projects/{projectId}/dependencies", { path: { projectId } })).data.edges.filter((edge) => edge.retiredAt === null);

  const edge = async (projectId: string, linkId: string): Promise<ApiEdge> => {
    const found = (await edges(projectId)).find((candidate) => candidate.id === linkId);
    if (!found) throw new RepositoryError("not-found", "Not found");
    return found;
  };

  const taskItems = async (projectId: string): Promise<ScheduleItem[]> => {
    const tasks = (
      await pageAll<ApiTask>(async (after) => (await api.request("get", "/api/v1/projects/{id}/tasks", { path: { id: projectId }, query: { limit: PAGE, after } })).data)
    ).filter((task) => task.deletedAt === null);
    const items: ScheduleItem[] = [];
    for (let at = 0; at < tasks.length; at += SCHEDULE_READS) {
      const batch = tasks.slice(at, at + SCHEDULE_READS);
      const schedules = await Promise.all(
        batch.map(async (task) => (await api.request("get", "/api/v1/projects/{projectId}/tasks/{taskId}/schedule", { path: { projectId, taskId: task.id } })).data),
      );
      batch.forEach((task, index) => {
        const schedule = schedules[index]!;
        if (!schedule.plannedStartAt || !schedule.dueAt) return;
        items.push({ id: task.id, kind: "task", title: task.title, start: dayOfInstant(schedule.plannedStartAt), end: dayOfInstant(schedule.dueAt), revision: schedule.revision });
      });
    }
    return items;
  };

  const milestoneItems = async (projectId: string): Promise<ScheduleItem[]> =>
    (
      await pageAll<ApiMilestone>(
        async (after) => (await api.request("get", "/api/v1/projects/{id}/components/{kind}", { path: { id: projectId, kind: "milestones" }, query: { limit: PAGE, after } })).data,
      )
    ).flatMap((milestone) => {
      if (!milestone.targetDate) return [];
      const day = milestone.targetDate.length === 10 ? milestone.targetDate : dayOfInstant(milestone.targetDate);
      return [{ id: milestone.id, kind: "milestone" as const, title: milestone.title, start: day, end: day, revision: milestone.revision }];
    });

  /** The last preview per project: what `apply` needs and the seam does not carry. */
  const previews = new Map<string, { id: string; tag: string; manifestHash: string; signature: string }>();

  return liveOnly<ScheduleRepository>(GAP, {
    preview: (projectId, change, mode) =>
      mapErrors(async (): Promise<SchedulePreview> => {
        if (mode !== "cascade") unsupported('The API has no "only this task" reschedule');
        const [items, links] = await Promise.all([projectViewItems(api, projectId), edges(projectId)]);
        const byId = new Map(items.map((item) => [item.task.id, item]));
        const anchor = byId.get(change.itemId);
        if (!anchor) unsupported("The API reschedules tasks only");
        const { plannedStartAt, dueAt } = anchor.schedule;
        if (!plannedStartAt || !dueAt) unsupported("The API reschedules timed tasks only");
        const { data, etag } = await api.request("post", "/api/v1/projects/{projectId}/reschedule-previews", {
          path: { projectId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: {
            id: crypto.randomUUID(),
            taskId: anchor.task.id,
            sourceRevision: anchor.task.revision,
            schedule: { plannedStartAt: shiftToDay(plannedStartAt, change.start), dueAt: shiftToDay(dueAt, change.end), scheduledDate: anchor.schedule.scheduledDate ?? null },
          },
        });
        const moves = data.items.flatMap((item): ScheduleMove[] => {
          const before = byId.get(item.taskId);
          if (!item.changed || !before?.schedule.plannedStartAt || !before.schedule.dueAt || !item.plannedStartAt || !item.dueAt) return [];
          return [
            {
              id: item.taskId,
              kind: "task",
              title: before.task.title,
              from: { start: dayOfInstant(before.schedule.plannedStartAt), end: dayOfInstant(before.schedule.dueAt) },
              to: { start: dayOfInstant(item.plannedStartAt), end: dayOfInstant(item.dueAt) },
              revision: item.sourceRevision,
            },
          ];
        });
        moves.sort((a, b) => Number(b.id === change.itemId) - Number(a.id === change.itemId));
        previews.set(projectId, { id: data.id, tag: etag ?? revisionTag(data.revision), manifestHash: data.manifestHash, signature: signature(moves) });
        return {
          change,
          mode,
          deltaDays: diffDays(dayOfInstant(dueAt), change.end),
          moves,
          conflicts: [],
          hasDependents: links.some((link) => link.predecessorId === change.itemId),
        };
      }),

    apply: (projectId, moves) =>
      mapErrors(async () => {
        const preview = previews.get(projectId);
        if (!preview || preview.signature !== signature(moves)) unsupported("The API applies a reschedule preview as a whole; preview the change again");
        previews.delete(projectId);
        try {
          await api.request("post", "/api/v1/projects/{projectId}/reschedule-previews/{previewId}/apply", {
            path: { projectId, previewId: preview.id },
            header: { "If-Match": preview.tag },
            body: { manifestHash: preview.manifestHash },
          });
        } catch (error) {
          // Anything that changed since the preview invalidates it.
          if (isConflict(error)) throw new RepositoryError("conflict", "Changed elsewhere");
          throw error;
        }
      }),

    graph: (projectId) =>
      mapErrors(async (): Promise<ScheduleGraph> => {
        const [tasks, milestones, links] = await Promise.all([taskItems(projectId), milestoneItems(projectId), edges(projectId)]);
        return { items: [...tasks, ...milestones], links: links.map(toLink) };
      }),

    addLink: (projectId, input) =>
      mapErrors(async () =>
        toLink(
          (
            await api.request("post", "/api/v1/projects/{projectId}/dependencies", {
              path: { projectId },
              body: { id: crypto.randomUUID(), predecessorId: input.predecessorId, successorId: input.successorId, kind: input.type, lagMinutes: Math.round(input.lagDays * MINUTES_PER_DAY) },
            })
          ).data,
        ),
      ),

    updateLink: (projectId, linkId, patch) =>
      mapErrors(async () => {
        let current = await edge(projectId, linkId);
        if (patch.type !== current.kind) unsupported("The API cannot change a dependency's type");
        const send = async () =>
          (
            await api.request("patch", "/api/v1/projects/{projectId}/dependencies/{dependencyId}", {
              path: { projectId, dependencyId: linkId },
              header: { "If-Match": revisionTag(current.revision) },
              body: { lagMinutes: Math.round(patch.lagDays * MINUTES_PER_DAY) },
            })
          ).data;
        return toLink(await conflictAware(() => retryOnConflict(send, async () => (current = await edge(projectId, linkId)))));
      }),

    removeLink: (projectId, linkId) =>
      mapErrors(async () => {
        let current = await edge(projectId, linkId);
        const send = () =>
          api.request("delete", "/api/v1/projects/{projectId}/dependencies/{dependencyId}", {
            path: { projectId, dependencyId: linkId },
            header: { "If-Match": revisionTag(current.revision) },
          });
        await conflictAware(() => retryOnConflict(send, async () => (current = await edge(projectId, linkId))));
      }),
  });
}
