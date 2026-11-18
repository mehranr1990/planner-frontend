import type { ApiClient } from "@/api/client";
import { ApiHttpError } from "@/api/errors";
import type { ProjectMilestone, ProjectPhase } from "../project-domain";
import type { MilestoneRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { computeMilestoneRows, computePhaseRows } from "../mock/mock-project-work";
import { mapErrors, pageAll, retryOnConflict, revisionTag } from "./api-shared";
import { conflictAware, projectsClient, type ProjectsClient, type ProjectsData } from "./api-project-shared";
import { loadProjectTasks } from "./api-project-tasks-repository";

/*
 * Phases and milestones as the project's components (`components/phases`,
 * `components/milestones`, in position order): what the task list, board,
 * task detail, overview and timeline group and filter by.
 *
 * Lists join `structure/progress` (P2 gap closure): phase start / end dates,
 * the server's progress percent (canceled excluded; no eligible task = null)
 * and a milestone's open-task count. A phase's delay is not served (null);
 * a caller without full task.read gets the components only (progress null).
 *
 * PJ-08 rows (gap closure 2026-11-14): done / all counts per phase and per
 * milestone from every task the caller can see (section → phase, association
 * → milestone), and the SPEC status rule (Reached · At risk · Next · Planned)
 * over them. Register items link to no milestone, so "at risk" comes from the
 * 14-day / half-done rule only. Rename = PATCH title, phase order = PATCH
 * positions (If-Match = component revision); each phase that moves is one
 * request, a failure part-way reloads the order the server kept.
 */

type ApiComponent = ProjectsData<"/api/v1/projects/{id}/components/{kind}", "get">["items"][number];
type ApiProgress = ProjectsData<"/api/v1/projects/{projectId}/structure/progress", "get">["items"][number];

/** Server progress per phase / milestone id; empty when the caller may not read it (403). */
const progressOf = async (api: ProjectsClient, projectId: string): Promise<Map<string, ApiProgress>> => {
  try {
    const { data } = await api.request("get", "/api/v1/projects/{projectId}/structure/progress", { path: { projectId } });
    return new Map(data.items.map((item) => [item.id, item]));
  } catch (error) {
    if (error instanceof ApiHttpError && error.status === 403) return new Map();
    throw error;
  }
};

const components = async (api: ProjectsClient, projectId: string, kind: "phases" | "milestones") =>
  (
    await pageAll<ApiComponent>(
      async (after) => (await api.request("get", "/api/v1/projects/{id}/components/{kind}", { path: { id: projectId, kind }, query: { limit: 100, after } })).data,
    )
  ).sort((a, b) => a.position - b.position);

const toPhase = (phase: ApiComponent, progress?: ApiProgress): ProjectPhase => ({
  id: phase.id,
  name: phase.title,
  start: progress?.startDate ?? null,
  end: progress?.endDate ?? null,
  progress: progress?.progressPercent === null || progress?.progressPercent === undefined ? null : Math.round(progress.progressPercent),
  done: phase.completed === true,
  behindDays: null,
});

const toMilestone = (milestone: ApiComponent, progress?: ApiProgress): ProjectMilestone => ({
  id: milestone.id,
  title: milestone.title,
  due: milestone.targetDate ?? null,
  phaseId: milestone.phaseId ?? null,
  done: milestone.completed === true,
  tasksLeft: progress ? progress.openTasks : null,
  revision: milestone.revision,
});

export function createApiProjectMilestoneRepository(client: ApiClient, options: { today(): string }): MilestoneRepository {
  const api = projectsClient(client);
  const patch = (projectId: string, kind: "phases" | "milestones", component: ApiComponent, body: { title?: string; position?: number }) =>
    api.request("patch", "/api/v1/projects/{id}/components/{kind}/{componentId}", {
      path: { id: projectId, kind, componentId: component.id },
      header: { "If-Match": revisionTag(component.revision) },
      body,
    });

  return {
    listPhases: (projectId) =>
      mapErrors(async () => {
        const [phases, progress] = await Promise.all([components(api, projectId, "phases"), progressOf(api, projectId)]);
        return phases.map((phase) => toPhase(phase, progress.get(phase.id)));
      }),
    listMilestones: (projectId) =>
      mapErrors(async () => {
        const [milestones, progress] = await Promise.all([components(api, projectId, "milestones"), progressOf(api, projectId)]);
        return milestones.map((milestone) => toMilestone(milestone, progress.get(milestone.id)));
      }),

    phaseRows: (projectId) =>
      mapErrors(async () => {
        const [phases, loaded, progress] = await Promise.all([components(api, projectId, "phases"), loadProjectTasks(api, projectId), progressOf(api, projectId)]);
        return computePhaseRows(phases.map((phase) => toPhase(phase, progress.get(phase.id))), loaded.tasks, loaded.catalogue.workflow);
      }),

    milestoneRows: (projectId) =>
      mapErrors(async () => {
        const [milestones, loaded, progress] = await Promise.all([components(api, projectId, "milestones"), loadProjectTasks(api, projectId), progressOf(api, projectId)]);
        return computeMilestoneRows({
          milestones: milestones.map((milestone) => toMilestone(milestone, progress.get(milestone.id))),
          tasks: loaded.tasks,
          workflow: loaded.catalogue.workflow,
          risks: [],
          today: options.today(),
        });
      }),

    updateMilestone: (projectId, milestoneId, { title }, revision) =>
      mapErrors(async () => {
        const find = async () => {
          const found = (await components(api, projectId, "milestones")).find((milestone) => milestone.id === milestoneId);
          if (!found) throw new RepositoryError("not-found", "Not found");
          return found;
        };
        let current = await find();
        if (current.revision !== revision) throw new RepositoryError("conflict", "Changed elsewhere");
        const { data } = await conflictAware(() => retryOnConflict(() => patch(projectId, "milestones", current, { title: title.trim() }), async () => (current = await find())));
        return toMilestone(data, (await progressOf(api, projectId)).get(data.id));
      }),

    reorderPhases: (projectId, phaseIds) =>
      mapErrors(async () => {
        const phases = await components(api, projectId, "phases");
        if (phaseIds.length !== phases.length || !phases.every((phase) => phaseIds.includes(phase.id))) throw new RepositoryError("invalid", "phases");
        // The unchanged leading phases keep their positions; every phase from the first change on moves
        // above all current positions, in order, so no two phases share a position mid-way.
        const base = Math.max(0, ...phases.map((phase) => phase.position)) + 1;
        const first = phaseIds.findIndex((id, index) => phases[index]!.id !== id);
        if (first >= 0)
          for (const [index, id] of phaseIds.entries()) {
            if (index < first) continue;
            const phase = phases.find((candidate) => candidate.id === id)!;
            await conflictAware(() => patch(projectId, "phases", phase, { position: base + index }));
          }
        const [after, progress] = await Promise.all([components(api, projectId, "phases"), progressOf(api, projectId)]);
        return after.map((phase) => toPhase(phase, progress.get(phase.id)));
      }),
  };
}
