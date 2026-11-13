import { newIdempotencyKey, type ApiClient } from "@/api/client";
import { MINUTES_PER_DAY, dayOfInstant } from "@/lib/dates/clock-time";
import type { ProjectCalendarItem, ProjectTask, ProjectTaskActivity, ProjectTaskDetail } from "../project-domain";
import type { AssignmentRepository, ProjectCalendarRepository, ReassignRepository, TaskDetailRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { mapErrors, pageAll, revisionTag, unsupported } from "./api-shared";
import { accessMe, conflictAware, liveOnly, personOf, projectsClient, type ProjectsClient, type ProjectsData } from "./api-project-shared";
import { loadProjectTasks, type ApiAssignment, type LoadedTasks } from "./api-project-tasks-repository";

/*
 * What hangs off a project task row: the task detail drawer, my assignments
 * (accept / decline), reassign and the project calendar. All of it reuses the
 * task loader (`api-project-tasks-repository.ts`).
 * - Detail: start day, section, logged hours (non-voided work logs), the
 *   predecessors, and assignment events as activity. The API lists no task
 *   comments, files or shared subtasks (empty) and has no personal calendar
 *   projection switch (refused).
 * - Accept / decline act on the caller's own pending assignment (access id
 *   from `access/me`); there is no "back to pending" and no reminder (refused).
 * - Calendar: open tasks on their due day and dated milestones; no project
 *   events and no project-scoped busy read (refused).
 */

type ApiMilestone = ProjectsData<"/api/v1/projects/{id}/components/{kind}", "get">["items"][number];
type ApiWorkLog = ProjectsData<"/api/v1/projects/{projectId}/tasks/{taskId}/work-logs", "get">["items"][number];

const PAGE = 100;

const closedIds = (loaded: LoadedTasks) => new Set(loaded.catalogue.workflow.statuses.filter((status) => status.category === "done" || status.category === "canceled").map((status) => status.id));

const rowOf = (loaded: LoadedTasks, taskId: string): ProjectTask => {
  const found = loaded.tasks.find((task) => task.id === taskId);
  if (!found) throw new RepositoryError("not-found", "Not found");
  return found;
};

export function createApiProjectTaskDetailRepository(client: ApiClient): TaskDetailRepository {
  const api = projectsClient(client);
  return liveOnly<TaskDetailRepository>("the API has no shared subtasks and no personal calendar projection switch", {
    get: (projectId, taskId) =>
      mapErrors(async (): Promise<ProjectTaskDetail> => {
        const [loaded, all, schedule, place, logs, graph] = await Promise.all([
          loadProjectTasks(api, projectId, taskId),
          loadProjectTasks(api, projectId).then((everything) => everything.tasks),
          api.request("get", "/api/v1/projects/{projectId}/tasks/{taskId}/schedule", { path: { projectId, taskId } }).then((response) => response.data),
          api.request("get", "/api/v1/projects/{id}/tasks/{taskId}/association", { path: { id: projectId, taskId } }).then((response) => response.data),
          pageAll<ApiWorkLog>(
            async (after) => (await api.request("get", "/api/v1/projects/{projectId}/tasks/{taskId}/work-logs", { path: { projectId, taskId }, query: { limit: PAGE, after } })).data,
          ),
          api.request("get", "/api/v1/projects/{projectId}/dependencies", { path: { projectId } }).then((response) => response.data.edges),
        ]);
        const task = rowOf(loaded, taskId);
        const sections = place.sectionId
          ? await pageAll<ApiMilestone>(
              async (after) => (await api.request("get", "/api/v1/projects/{id}/components/{kind}", { path: { id: projectId, kind: "sections" }, query: { limit: PAGE, after } })).data,
            )
          : [];
        const seconds = logs.filter((log) => !log.voidedAt).reduce((sum, log) => sum + (Date.parse(log.endedAt) - Date.parse(log.startedAt)) / 1000, 0);
        const activity: ProjectTaskActivity[] = (loaded.assignments.get(taskId) ?? []).flatMap((assignment: ApiAssignment) => {
          const actor = loaded.roster.find((member) => member.actorId === assignment.createdByActorId);
          return actor
            ? [{ id: assignment.id, at: assignment.createdAt, actor: personOf(loaded.roster, actor.id), kind: "assigned" as const, person: personOf(loaded.roster, assignment.recipientAccessId).name }]
            : [];
        });
        return {
          task,
          start: schedule.plannedStartAt ? dayOfInstant(schedule.plannedStartAt) : (schedule.scheduledDate ?? null),
          section: sections.find((section) => section.id === place.sectionId)?.title ?? null,
          customFields: [],
          loggedHours: Math.round((seconds / 3600) * 10) / 10,
          subtasks: [],
          dependencies: graph
            .filter((edge) => edge.retiredAt === null && edge.successorId === taskId)
            .map((edge) => ({
              id: edge.id,
              predecessorId: edge.predecessorId,
              predecessorTitle: all.find((candidate) => candidate.id === edge.predecessorId)?.title ?? "",
              type: edge.kind,
              lagDays: Math.round(edge.lagMinutes / MINUTES_PER_DAY),
            })),
          files: [],
          activity: activity.sort((a, b) => b.at.localeCompare(a.at)),
          comments: [],
          unreadComments: 0,
          showInCalendar: false,
        };
      }),
  });
}

/** The caller's own current assignment on a task. */
async function mine(api: ProjectsClient, projectId: string, taskId: string, decision: ApiAssignment["decision"]) {
  const [loaded, me] = await Promise.all([loadProjectTasks(api, projectId, taskId), accessMe(api, projectId)]);
  const own = (loaded.assignments.get(taskId) ?? []).find((assignment) => assignment.recipientAccessId === me.accessId && assignment.decision === decision && !assignment.endedAt);
  if (!own) throw new RepositoryError("not-found", "Not found");
  return { loaded, own };
}

export function createApiProjectAssignmentRepository(client: ApiClient): AssignmentRepository {
  const api = projectsClient(client);
  const checkRevision = (task: ProjectTask, revision: number) => {
    if (task.revision !== revision) throw new RepositoryError("conflict", "Changed elsewhere");
  };
  const reload = async (projectId: string, taskId: string) => rowOf(await loadProjectTasks(api, projectId, taskId), taskId);

  return liveOnly<AssignmentRepository>("an accepted assignment cannot go back to pending and the API sends no reminders", {
    listMine: (projectId) =>
      mapErrors(async () => {
        const [loaded, me] = await Promise.all([loadProjectTasks(api, projectId), accessMe(api, projectId)]);
        const closed = closedIds(loaded);
        const stateOf = (task: ProjectTask) => task.assignees.find((assignee) => assignee.person.id === me.accessId)?.state;
        return {
          pending: loaded.tasks.filter((task) => stateOf(task) === "pending"),
          open: loaded.tasks.filter((task) => stateOf(task) === "accepted" && !closed.has(task.statusId)),
        };
      }),

    accept: (projectId, taskId, revision) =>
      mapErrors(async () => {
        const { loaded, own } = await mine(api, projectId, taskId, "PENDING");
        checkRevision(rowOf(loaded, taskId), revision);
        await conflictAware(() =>
          api.request("post", "/api/v1/projects/{projectId}/tasks/{taskId}/assignments/{assignmentId}/accept", {
            path: { projectId, taskId, assignmentId: own.id },
            header: { "If-Match": revisionTag(own.revision) },
            body: {},
          }),
        );
        return reload(projectId, taskId);
      }),

    decline: (projectId, taskId, input) =>
      mapErrors(async () => {
        const { loaded, own } = await mine(api, projectId, taskId, "PENDING");
        checkRevision(rowOf(loaded, taskId), input.revision);
        // The API keeps one free-text reason: the chosen reason key, then the note.
        const reason = [input.reason, input.note?.trim()].filter(Boolean).join(" — ").slice(0, 2000);
        await conflictAware(() =>
          api.request("post", "/api/v1/projects/{projectId}/tasks/{taskId}/assignments/{assignmentId}/decline", {
            path: { projectId, taskId, assignmentId: own.id },
            header: { "If-Match": revisionTag(own.revision) },
            body: { reason },
          }),
        );
        return reload(projectId, taskId);
      }),
  });
}

export function createApiProjectReassignRepository(client: ApiClient): ReassignRepository {
  const api = projectsClient(client);
  return {
    // Replaces the pending (or most recently declined) assignment of the task.
    reassign: (projectId, taskId, input) =>
      mapErrors(async () => {
        const loaded = await loadProjectTasks(api, projectId, taskId);
        const task = rowOf(loaded, taskId);
        const list = loaded.assignments.get(taskId) ?? [];
        const from = list.find((assignment) => assignment.decision === "PENDING" && !assignment.endedAt) ?? list.filter((assignment) => assignment.decision === "DECLINED").at(-1);
        if (!from) unsupported("The task has no pending or declined assignment to replace");
        const member = loaded.roster.find((candidate) => candidate.id === input.personId && candidate.state === "ACTIVE");
        if (!member) throw new RepositoryError("not-found", "Not found");
        await conflictAware(() =>
          api.request("post", "/api/v1/projects/{projectId}/tasks/{taskId}/assignments/{assignmentId}/reassign", {
            path: { projectId, taskId, assignmentId: from.id },
            header: { "If-Match": revisionTag(from.revision), "Idempotency-Key": newIdempotencyKey() },
            body: { id: crypto.randomUUID(), recipientAccessId: member.id, recipientGeneration: member.generation, sourceRevision: task.revision },
          }),
        );
        return rowOf(await loadProjectTasks(api, projectId, taskId), taskId);
      }),
  };
}

export function createApiProjectCalendarRepository(client: ApiClient): ProjectCalendarRepository {
  const api = projectsClient(client);
  return liveOnly<ProjectCalendarRepository>("the API has no project-scoped read of the user's own busy blocks", {
    range: (projectId, from, to) =>
      mapErrors(async (): Promise<ProjectCalendarItem[]> => {
        const within = (day: string) => day >= from && day <= to;
        const [loaded, milestones] = await Promise.all([
          loadProjectTasks(api, projectId),
          pageAll<ApiMilestone>(
            async (after) => (await api.request("get", "/api/v1/projects/{id}/components/{kind}", { path: { id: projectId, kind: "milestones" }, query: { limit: PAGE, after } })).data,
          ),
        ]);
        const closed = closedIds(loaded);
        return [
          ...loaded.tasks
            .filter((task) => task.due !== null && within(task.due) && !closed.has(task.statusId))
            .map((task): ProjectCalendarItem => ({ id: `task:${task.id}`, kind: "task", day: task.due!, title: task.title, task })),
          ...milestones.flatMap((milestone): ProjectCalendarItem[] => {
            const day = milestone.targetDate?.slice(0, 10);
            return day && within(day) ? [{ id: `milestone:${milestone.id}`, kind: "milestone", day, title: milestone.title, milestoneId: milestone.id }] : [];
          }),
        ];
      }),
  });
}
