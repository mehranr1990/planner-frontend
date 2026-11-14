import { newIdempotencyKey, type ApiClient } from "@/api/client";
import type { OwnershipTransfer, ProjectRolePolicy, TaskComment, TaskDependency } from "../project-domain";
import type {
  CommentRepository,
  DependencyRepository,
  ProjectRepositories,
  ProjectRepository,
  ProjectSettingsRepository,
  ScheduleRepository,
} from "../project-repositories";
import { RepositoryError } from "../repositories";
import { invalid, mapErrors, pageAll, retryOnConflict, revisionTag } from "./api-shared";
import { createApiProjectMemberRepository, createApiProjectSummary } from "./api-project-members-repository";
import { createApiProjectDirectory, createApiProjectLifecycle } from "./api-project-directory-repository";
import { createApiProjectFieldRepository } from "./api-project-fields-repository";
import { createApiProjectImportRepository } from "./api-project-imports-repository";
import { createApiProjectTaskRepository, createApiProjectWorkflowRepository } from "./api-project-tasks-repository";
import {
  createApiProjectAssignmentRepository,
  createApiProjectCalendarRepository,
  createApiProjectReassignRepository,
  createApiProjectTaskDetailRepository,
} from "./api-project-task-work-repository";
import { createApiProjectScheduleRepository } from "./api-project-schedule-repository";
import { createApiProjectInvitations } from "./api-project-invitations";
import { createApiProjectCreateRepository } from "./api-project-create-repository";
import { createApiProjectMilestoneRepository } from "./api-project-milestones-repository";
import { createApiProjectFileRepository } from "./api-project-files-repository";
import { createApiProjectMemberInviteRepository } from "./api-project-member-invites";
import { createApiProjectWorkInsights } from "./api-project-work-insights";
import { createApiProjectRiskRepository } from "./api-project-risks-repository";
import { conflictAware, liveOnly, personOf, projectRoster, projectsClient, projectViewItems, toProjectPerson, type ProjectsData } from "./api-project-shared";

/*
 * Every Projects repository for live mode. Only what the contract can answer
 * truthfully is connected: members, the status-card KPIs, the schedule graph,
 * links and cascade reschedule, task comments and dependencies (writes), field
 * removal, template save and project deletion. Each other method is refused
 * with the missing read model named, never served from mock data.
 * `docs/integration/API_COVERAGE_MATRIX.md` lists the exact backend
 * requirements behind each gap.
 */

const NO_STATUS = "project health has no approved definition, so the status chip cannot be saved";

type ApiComponent = ProjectsData<"/api/v1/projects/{id}/components/{kind}", "get">["items"][number];
const ASSOCIATION_READS = 8;

type ApiHandover = ProjectsData<"/api/v1/projects/{id}/ownership-handovers", "get">["items"][number];
type ApiPolicy = ProjectsData<"/api/v1/projects/{id}/access-policy", "get">;

const toRolePolicy = (policy: ApiPolicy): ProjectRolePolicy => ({
  roleDefaults: {
    owner: policy.roleDefaults.OWNER,
    admin: policy.roleDefaults.ADMIN,
    manager: policy.roleDefaults.MANAGER,
    member: policy.roleDefaults.MEMBER,
    viewer: policy.roleDefaults.VIEWER,
  },
  exportMaxRecords: policy.exportMaxRecords,
  exportMaxBytes: policy.exportMaxBytes,
  version: policy.version,
});

function createApiProjectSettingsRepository(client: ApiClient): ProjectSettingsRepository {
  const api = projectsClient(client);
  const read = async (projectId: string) => {
    const { data, etag } = await api.request("get", "/api/v1/projects/{id}", { path: { id: projectId } });
    return { title: data.title, tag: etag ?? revisionTag(data.revision) };
  };
  const components = (projectId: string, kind: "phases" | "sections" | "milestones") =>
    pageAll<ApiComponent>(async (after) => (await api.request("get", "/api/v1/projects/{id}/components/{kind}", { path: { id: projectId, kind }, query: { limit: 100, after } })).data);

  /** The current owner's pending handover (the collection is owner-only; an accepted one has already moved custody). */
  const pending = async (projectId: string): Promise<ApiHandover | null> =>
    (
      await pageAll<ApiHandover>(
        async (after) => (await api.request("get", "/api/v1/projects/{id}/ownership-handovers", { path: { id: projectId }, query: { limit: 100, after } })).data,
      )
    ).find((handover) => handover.state === "PENDING") ?? null;
  const toTransfer = async (projectId: string, handover: ApiHandover): Promise<OwnershipTransfer> => ({
    successor: personOf(await projectRoster(api, projectId), handover.toAccessId),
    accepted: handover.state === "ACCEPTED",
  });

  return liveOnly<ProjectSettingsRepository>(
    "the access toggles (invite role, guests, grant expiry) are not served — the policy is role defaults (rolePolicy); the successor completes a handover with their own password (no owner confirmation step)",
    {
    ...createApiProjectLifecycle(client),
    // PJ-14 › Access: the server's role defaults. Publish = PUT with the version the user saw (no silent retry on 409).
    rolePolicy: (projectId) =>
      mapErrors(async () => toRolePolicy((await api.request("get", "/api/v1/projects/{id}/access-policy", { path: { id: projectId } })).data)),
    setRolePolicy: (projectId, roleDefaults, version) =>
      mapErrors(async () => {
        const { data: current } = await api.request("get", "/api/v1/projects/{id}/access-policy", { path: { id: projectId } });
        if (current.version !== version) throw new RepositoryError("conflict", "The access policy changed");
        const { data } = await conflictAware(() =>
          api.request("put", "/api/v1/projects/{id}/access-policy", {
            path: { id: projectId },
            header: { "If-Match": revisionTag(version) },
            body: {
              roleDefaults: {
                OWNER: [...roleDefaults.owner],
                ADMIN: [...roleDefaults.admin],
                MANAGER: [...roleDefaults.manager],
                MEMBER: [...roleDefaults.member],
                VIEWER: [...roleDefaults.viewer],
              },
              exportMaxRecords: current.exportMaxRecords,
              exportMaxBytes: current.exportMaxBytes,
            },
          }),
        );
        return toRolePolicy(data);
      }),
    transfer: (projectId) =>
      mapErrors(async () => {
        const handover = await pending(projectId);
        return handover ? toTransfer(projectId, handover) : null;
      }),

    requestTransfer: (projectId, personId) =>
      mapErrors(async () => {
        const { data: project } = await api.request("get", "/api/v1/projects/{id}", { path: { id: projectId } });
        const { data } = await api.request("post", "/api/v1/spaces/{spaceId}/ownership-handovers", {
          path: { spaceId: project.spaceId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { successorAccessId: personId },
        });
        return toTransfer(projectId, data);
      }),

    cancelTransfer: (projectId) =>
      mapErrors(async () => {
        let current = await pending(projectId);
        if (!current) return;
        const send = () =>
          api.request("post", "/api/v1/spaces/{spaceId}/ownership-handovers/{id}/revoke", {
            path: { spaceId: current!.spaceId, id: current!.id },
            header: { "If-Match": revisionTag(current!.revision) },
            body: {},
          });
        await conflictAware(() =>
          retryOnConflict(send, async () => {
            current = await pending(projectId);
            if (!current) throw new RepositoryError("conflict", "Changed elsewhere");
          }),
        );
      }),

    // A template version of the project's structure: phases, sections, milestones, live tasks and their links (keys = the items' ids).
    saveTemplate: (projectId) =>
      mapErrors(async () => {
        const [{ title }, phases, sections, milestones, items, graph] = await Promise.all([
          read(projectId),
          components(projectId, "phases"),
          components(projectId, "sections"),
          components(projectId, "milestones"),
          projectViewItems(api, projectId),
          api.request("get", "/api/v1/projects/{projectId}/dependencies", { path: { projectId } }),
        ]);
        const tasks = [];
        for (let at = 0; at < items.length; at += ASSOCIATION_READS) {
          const batch = items.slice(at, at + ASSOCIATION_READS);
          const places = await Promise.all(
            batch.map(async (item) => (await api.request("get", "/api/v1/projects/{id}/tasks/{taskId}/association", { path: { id: projectId, taskId: item.task.id } })).data),
          );
          tasks.push(
            ...batch.map(({ task, estimatedMinutes }, index) => ({
              key: task.id,
              title: task.title,
              description: task.description ?? null,
              priority: task.priority,
              estimatedMinutes: estimatedMinutes ?? null,
              sectionKey: places[index]!.sectionId ?? null,
              milestoneKey: places[index]!.milestoneId ?? null,
            })),
          );
        }
        const kept = new Set(tasks.map((task) => task.key));
        const { data } = await api.request("post", "/api/v1/projects/{projectId}/templates", {
          path: { projectId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: {
            id: crypto.randomUUID(),
            name: title,
            definition: {
              schemaVersion: 1,
              phases: phases.map((phase) => ({ key: phase.id, title: phase.title, position: phase.position })),
              sections: sections.map((section) => ({ key: section.id, title: section.title, position: section.position, phaseKey: section.phaseId ?? null })),
              milestones: milestones.map((milestone) => ({
                key: milestone.id,
                title: milestone.title,
                position: milestone.position,
                phaseKey: milestone.phaseId ?? null,
                targetDate: milestone.targetDate ?? null,
              })),
              tasks,
              dependencies: graph.data.edges
                .filter((edge) => edge.retiredAt === null && kept.has(edge.predecessorId) && kept.has(edge.successorId))
                .map((edge) => ({ predecessorKey: edge.predecessorId, successorKey: edge.successorId, kind: edge.kind, lagMinutes: edge.lagMinutes })),
            },
          },
        });
        return { name: data.name };
      }),


    // The project starts its deletion grace period; the API answers with the request, the seam with nothing.
    remove: (projectId, confirm) =>
      mapErrors(async () => {
        let current = await read(projectId);
        if (confirm.name.trim() !== current.title.trim()) invalid("name-mismatch");
        const send = () =>
          api.request("post", "/api/v1/projects/{id}/deletion-request", { path: { id: projectId }, header: { "If-Match": current.tag }, body: { password: confirm.password } });
        await conflictAware(() => retryOnConflict(send, async () => (current = await read(projectId))));
      }),
    },
  );
}

/** A task comment; the author is the member whose actor id wrote it. */
function createApiProjectCommentRepository(client: ApiClient): CommentRepository {
  const api = projectsClient(client);
  return {
    add: (projectId, taskId, body) =>
      mapErrors(async (): Promise<TaskComment> => {
        const { data } = await api.request("post", "/api/v1/projects/{projectId}/comments", {
          path: { projectId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { id: crypto.randomUUID(), body, target: { kind: "TASK", id: taskId } },
        });
        const author = (await projectRoster(api, projectId)).find((member) => member.actorId === data.createdByActorId);
        return { id: data.id, author: author ? toProjectPerson(author) : { id: data.createdByActorId, name: "", initials: "" }, at: data.createdAt, body: data.body };
      }),
  };
}

/** "This task depends on {predecessor}": the schedule's dependency edges, seen from the successor. */
function createApiProjectDependencyRepository(client: ApiClient, schedule: ScheduleRepository): DependencyRepository {
  const api = projectsClient(client);
  return {
    add: (projectId, taskId, input) =>
      mapErrors(async (): Promise<TaskDependency> => {
        const predecessor = (await api.request("get", "/api/v1/projects/{projectId}/views", { path: { projectId }, query: { kind: "LIST", taskId: input.predecessorId, limit: 1 } })).data.items[0];
        if (!predecessor) throw new RepositoryError("not-found", "Not found");
        const link = await schedule.addLink(projectId, { predecessorId: input.predecessorId, successorId: taskId, type: input.type, lagDays: input.lagDays });
        return { id: link.id, predecessorId: link.predecessorId, predecessorTitle: predecessor.task.title, type: link.type, lagDays: link.lagDays };
      }),
    remove: (projectId, _taskId, dependencyId) => schedule.removeLink(projectId, dependencyId),
  };
}

export function createApiProjectRepositories(client: ApiClient, options: { today(): string }): ProjectRepositories {
  const schedule = createApiProjectScheduleRepository(client);
  const insights = createApiProjectWorkInsights(client, options);
  return {
    projects: liveOnly<ProjectRepository>(NO_STATUS, {
      ...createApiProjectSummary(client, options),
      ...createApiProjectDirectory(client),
      restore: createApiProjectLifecycle(client).restore,
    }),
    projectCreate: createApiProjectCreateRepository(client),
    invitations: createApiProjectInvitations(client),
    memberInvites: createApiProjectMemberInviteRepository(client),
    members: createApiProjectMemberRepository(client),
    grants: liveOnly("no guest role, no list of task grants per person; a grant needs the recipient's user id"),
    milestones: createApiProjectMilestoneRepository(client, options),
    workflows: createApiProjectWorkflowRepository(client),
    workflowDrafts: liveOnly("the contract has workflow versions but no draft / publish-impact read model"),
    fields: createApiProjectFieldRepository(client),
    projectTasks: createApiProjectTaskRepository(client, options),
    taskDetails: createApiProjectTaskDetailRepository(client),
    comments: createApiProjectCommentRepository(client),
    dependencies: createApiProjectDependencyRepository(client, schedule),
    risks: createApiProjectRiskRepository(client),
    files: createApiProjectFileRepository(client),
    activity: liveOnly("activity `action` values are undocumented strings without the changed field / value or target title"),
    reports: insights.reports,
    workload: insights.workload,
    assignments: createApiProjectAssignmentRepository(client),
    reassign: createApiProjectReassignRepository(client),
    imports: createApiProjectImportRepository(client),
    settings: createApiProjectSettingsRepository(client),
    schedule,
    calendar: createApiProjectCalendarRepository(client),
  };
}
