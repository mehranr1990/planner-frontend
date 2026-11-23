import type { ApiClient } from "@/api/client";
import type { ProjectCapacityDay, ProjectMemberCapacity } from "../project-domain";
import type { ProjectCapacityRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { invalid, mapErrors, revisionTag } from "./api-shared";
import { conflictAware, projectRoster, projectsClient, type ProjectsClient, type ProjectsData } from "./api-project-shared";

/*
 * Project member capacity over `/projects/{id}/capacity-templates/{accessId}`.
 * The person id is the member's access id; every call names the member's
 * current generation (read from the roster), so a revoked / re-added member
 * never sees an old override. Weekdays are Sunday = 0 … Saturday = 6 minutes;
 * null inherits (owning Team template, else Sat–Wed 480 / Thu–Fri 0). Saves
 * send the template revision as If-Match and are never retried: a stale
 * revision surfaces as "conflict" so the editor reloads instead of
 * overwriting someone else's pattern. Overbooking is advisory only.
 */

type ApiTemplate = ProjectsData<"/api/v1/projects/{projectId}/capacity-templates/{accessId}", "get">;

const generationOf = async (api: ProjectsClient, projectId: string, personId: string): Promise<number> => {
  const member = (await projectRoster(api, projectId)).find((candidate) => candidate.id === personId && candidate.state === "ACTIVE");
  if (!member) throw new RepositoryError("not-found", "Member not found");
  return member.generation;
};

const toCapacity = (dto: ApiTemplate): ProjectMemberCapacity => ({
  personId: dto.member.accessId,
  template: dto.template ? { timezone: dto.template.timezone, effectiveFrom: dto.template.effectiveFrom, weekdays: [...dto.template.weekdays] } : null,
  revision: dto.revision,
});

export function createApiProjectCapacityRepository(client: ApiClient): ProjectCapacityRepository {
  const api = projectsClient(client);
  return {
    template: (projectId, personId) =>
      mapErrors(async () => {
        const generation = await generationOf(api, projectId, personId);
        const { data } = await api.request("get", "/api/v1/projects/{projectId}/capacity-templates/{accessId}", {
          path: { projectId, accessId: personId },
          query: { generation },
        });
        return toCapacity(data);
      }),

    saveTemplate: (projectId, current, template) =>
      mapErrors(async () => {
        if (template) {
          if (template.weekdays.length !== 7) invalid("weekdays");
          for (const minutes of template.weekdays) if (minutes !== null && (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440)) invalid("minutes");
        }
        const generation = await generationOf(api, projectId, current.personId);
        const { data } = await conflictAware(() =>
          api.request("put", "/api/v1/projects/{projectId}/capacity-templates/{accessId}", {
            path: { projectId, accessId: current.personId },
            header: { "If-Match": revisionTag(current.revision) },
            body: {
              member: { accessId: current.personId, generation },
              template: template ? { timezone: template.timezone, effectiveFrom: template.effectiveFrom, weekdays: [...template.weekdays] } : null,
            },
          }),
        );
        return toCapacity(data);
      }),

    effective: (projectId, personId, range) =>
      mapErrors(async (): Promise<ProjectCapacityDay[]> => {
        const generation = await generationOf(api, projectId, personId);
        const { data } = await api.request("get", "/api/v1/projects/{projectId}/capacity-templates/{accessId}/effective", {
          path: { projectId, accessId: personId },
          query: { generation, fromDate: range.from, toDate: range.to, timezone: range.timezone },
        });
        return data.rows
          .filter((row) => row.member.accessId === personId)
          .map((row) => ({
            date: row.date,
            capacityMinutes: row.capacityMinutes,
            allocatedMinutes: row.allocatedMinutes,
            overbookedMinutes: row.overbookedMinutes,
            taskCount: row.taskCount,
            estimatedMinutes: row.estimatedMinutes,
            unknownEstimates: row.unknownEstimates,
          }))
          .sort((a, b) => a.date.localeCompare(b.date));
      }),
  };
}
