import type { ApiClient } from "@/api/client";
import type { ProjectActivity } from "../project-domain";
import type { ActivityRepository } from "../project-repositories";
import { mapErrors } from "./api-shared";
import { personOf, projectRoster, projectsClient, type ProjectsData } from "./api-project-shared";
import { baseStatusId } from "./api-project-tasks-repository";

/*
 * PJ-01 Recent activity over GET `/projects/{id}/activity` (newest first,
 * per-target authorization on the server). Only events the overview line can
 * state truthfully are shown: TASK_STATUS ("moved", the base status from the
 * `status` change) and TASK_COMPLETED. STATUS_NOTE carries no health,
 * MILESTONE_REACHED has no milestone title or date and is not "added" —
 * those and SCOPE_CHANGED / CONTENT / OTHER events are left out, as are
 * events whose target title the server withholds (null). Actor names come
 * from the roster; an actor it no longer shows stays blank.
 */

type ApiActivity = ProjectsData<"/api/v1/projects/{projectId}/activity", "get">["items"][number];

const BASE = new Set(["OPEN", "IN_PROGRESS", "DONE", "CANCELED"]);

export function createApiProjectActivityRepository(client: ApiClient): ActivityRepository {
  const api = projectsClient(client);
  return {
    list: (projectId, options = {}) =>
      mapErrors(async () => {
        const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
        const [{ data }, roster] = await Promise.all([
          api.request("get", "/api/v1/projects/{projectId}/activity", { path: { projectId }, query: { limit } }),
          projectRoster(api, projectId),
        ]);
        const actorOf = (event: ApiActivity) => {
          const member = roster.find((candidate) => candidate.actorId === event.actorId);
          return member ? personOf(roster, member.id) : { id: event.actorId, name: "", initials: "" };
        };
        return data.items.flatMap((event): ProjectActivity[] => {
          const task = event.target.title;
          if (event.entityType !== "TASK" || task === null) return [];
          if (event.kind === "TASK_COMPLETED") return [{ id: event.id, kind: "completed", actor: actorOf(event), at: event.at, task }];
          if (event.kind !== "TASK_STATUS") return [];
          const to = event.changes.find((change) => change.field === "status")?.to;
          if (typeof to !== "string") return [];
          return [{ id: event.id, kind: "moved", actor: actorOf(event), at: event.at, task, status: BASE.has(to) ? baseStatusId(to as "OPEN") : to }];
        });
      }),
  };
}
