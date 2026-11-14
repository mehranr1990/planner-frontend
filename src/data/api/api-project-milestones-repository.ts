import type { ApiClient } from "@/api/client";
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
 * The API serves a phase's title and completion only, and a milestone's title,
 * optional phase, optional target day and completion: phase dates, progress
 * and delay and the list's open-task count stay null (never derived).
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

const components = async (api: ProjectsClient, projectId: string, kind: "phases" | "milestones") =>
  (
    await pageAll<ApiComponent>(
      async (after) => (await api.request("get", "/api/v1/projects/{id}/components/{kind}", { path: { id: projectId, kind }, query: { limit: 100, after } })).data,
    )
  ).sort((a, b) => a.position - b.position);

const toPhase = (phase: ApiComponent): ProjectPhase => ({
  id: phase.id,
  name: phase.title,
  start: null,
  end: null,
  progress: null,
  done: phase.completed === true,
  behindDays: null,
});

const toMilestone = (milestone: ApiComponent): ProjectMilestone => ({
  id: milestone.id,
  title: milestone.title,
  due: milestone.targetDate ?? null,
  phaseId: milestone.phaseId ?? null,
  done: milestone.completed === true,
  tasksLeft: null,
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
    listPhases: (projectId) => mapErrors(async () => (await components(api, projectId, "phases")).map(toPhase)),
    listMilestones: (projectId) => mapErrors(async () => (await components(api, projectId, "milestones")).map(toMilestone)),

    phaseRows: (projectId) =>
      mapErrors(async () => {
        const [phases, loaded] = await Promise.all([components(api, projectId, "phases"), loadProjectTasks(api, projectId)]);
        return computePhaseRows(phases.map(toPhase), loaded.tasks, loaded.catalogue.workflow);
      }),

    milestoneRows: (projectId) =>
      mapErrors(async () => {
        const [milestones, loaded] = await Promise.all([components(api, projectId, "milestones"), loadProjectTasks(api, projectId)]);
        return computeMilestoneRows({
          milestones: milestones.map(toMilestone),
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
        return toMilestone(data);
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
        return (await components(api, projectId, "phases")).map(toPhase);
      }),
  };
}
