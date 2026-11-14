import { newIdempotencyKey, type ApiClient } from "@/api/client";
import { dayOfInstant } from "@/lib/dates/clock-time";
import type {
  AssignmentState,
  ProjectPriority,
  ProjectTask,
  ProjectWorkflow,
  TaskAssignee,
  WorkflowCategory,
  WorkflowStatus,
} from "../project-domain";
import type { ProjectTaskRepository, ProjectTaskView, WorkflowRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { localInstant } from "./api-tasks-repository";
import { invalid, mapErrors, pageAll, revisionTag, unsupported } from "./api-shared";
import { accessMe, conflictAware, personOf, projectRoster, projectsClient, type ApiProjectMember, type ApiViewItem, type ProjectsClient, type ProjectsData } from "./api-project-shared";
import { projectPeople } from "./api-project-members-repository";

/*
 * Project tasks and their workflow statuses over the versioned workflow model
 * (owner decision 2, 2026-11-12; ADR 0032):
 * - A task bound to a workflow version shows that version's state; versions
 *   are never merged or migrated. Status ids are "<workflowId>:<version>:<stateId>";
 *   unbound tasks use the base statuses "base:OPEN|IN_PROGRESS|DONE|CANCELED".
 *   `workflows.published` returns the catalogue of every status in use plus the
 *   base ones; `transitions` = the version's edges (base: any base status).
 * - A move follows the version edge (POST `…/workflow/transitions`, source
 *   If-Match); an edge that needs approval files a request and the task stays.
 *   Unbound tasks change their base status with PATCH.
 * - Rows join the LIST view (task, schedule, estimate, binding, dependencies),
 *   the task association (section → phase, milestone) and assignments (names
 *   from the roster). Priority NONE = null; no subtasks or comment counts are
 *   readable (null); no updatedAt.
 * - A phase is reached through a section: a task placed in a phase goes to the
 *   phase's first section (by position); a phase without sections cannot hold
 *   tasks ("invalid"). No delete or manual order exists (refused).
 */

type ApiTask = ProjectsData<"/api/v1/projects/{id}/tasks/{taskId}", "get">;
type ApiVersion = ProjectsData<"/api/v1/projects/{projectId}/workflows/{workflowId}/versions", "get">;
type ApiComponent = ProjectsData<"/api/v1/projects/{id}/components/{kind}", "get">["items"][number];
export type ApiAssignment = ProjectsData<"/api/v1/projects/{projectId}/tasks/{taskId}/assignments", "get">["items"][number];
type ApiAssociation = ProjectsData<"/api/v1/projects/{id}/tasks/{taskId}/association", "get">;
type ApiEdge = ProjectsData<"/api/v1/projects/{projectId}/views", "get">["dependencies"][number];
type BaseStatus = ApiTask["status"];
type Binding = NonNullable<ApiViewItem["workflow"]["binding"]>;

const PAGE = 100;
const READS = 8;
const BASE: readonly BaseStatus[] = ["OPEN", "IN_PROGRESS", "DONE", "CANCELED"];
const CATEGORY: Record<BaseStatus, WorkflowCategory> = { OPEN: "todo", IN_PROGRESS: "active", DONE: "done", CANCELED: "canceled" };
const BASE_KEY = { OPEN: "todo", IN_PROGRESS: "in-progress", DONE: "done", CANCELED: "canceled" } as const;

export const baseStatusId = (status: BaseStatus) => `base:${status}`;
const versionKey = (workflowId: string, version: number) => `${workflowId}:${version}`;
export const boundStatusId = (binding: Pick<Binding, "workflowId" | "version" | "stateId">) => `${versionKey(binding.workflowId, binding.version)}:${binding.stateId}`;

const toPriority = (priority: ApiTask["priority"]): ProjectPriority | null => (priority === "NONE" ? null : (priority.toLowerCase() as ProjectPriority));
const isClosed = (category: WorkflowCategory | undefined) => category === "done" || category === "canceled";

interface Catalogue {
  workflow: ProjectWorkflow;
  versions: Map<string, ApiVersion>;
  categoryOf(statusId: string): WorkflowCategory | undefined;
}

async function readVersions(api: ProjectsClient, projectId: string, bindings: Iterable<Binding>): Promise<Map<string, ApiVersion>> {
  const wanted = new Map<string, Binding>();
  for (const binding of bindings) wanted.set(versionKey(binding.workflowId, binding.version), binding);
  const versions = new Map<string, ApiVersion>();
  await Promise.all(
    [...wanted].map(async ([key, binding]) => {
      const { data } = await api.request("get", "/api/v1/projects/{projectId}/workflows/{workflowId}/versions", {
        path: { projectId, workflowId: binding.workflowId },
        query: { version: binding.version },
      });
      versions.set(key, data);
    }),
  );
  return versions;
}

/** Base statuses + every state of every version in use; a label used by two versions gets its version number. */
function catalogue(versions: Map<string, ApiVersion>): Catalogue {
  const statuses: WorkflowStatus[] = BASE.map((status) => ({ id: baseStatusId(status), name: status, key: BASE_KEY[status], category: CATEGORY[status] }));
  const transitions: Record<string, string[]> = Object.fromEntries(BASE.map((status) => [baseStatusId(status), BASE.filter((other) => other !== status).map(baseStatusId)]));
  const labels = new Map<string, number>();
  for (const version of versions.values()) for (const state of version.states) labels.set(state.label, (labels.get(state.label) ?? 0) + 1);
  for (const version of versions.values()) {
    for (const state of version.states) {
      const id = boundStatusId({ workflowId: version.workflowId, version: version.version, stateId: state.id });
      statuses.push({ id, name: (labels.get(state.label) ?? 0) > 1 ? `${state.label} · v${version.version}` : state.label, category: CATEGORY[state.status] });
      transitions[id] = version.edges
        .filter((edge) => edge.fromStateId === state.id)
        .map((edge) => boundStatusId({ workflowId: version.workflowId, version: version.version, stateId: edge.toStateId }));
    }
  }
  const byId = new Map(statuses.map((status) => [status.id, status.category]));
  const first = [...versions.values()][0];
  return {
    workflow: { version: first?.version ?? 0, statuses, transitions, ...(first ? { name: first.name, publishedAt: first.createdAt } : {}) },
    versions,
    categoryOf: (statusId) => byId.get(statusId),
  };
}

/** Live assignments plus declines nobody has replaced yet (shown as "declined" until reassigned). */
export function currentAssignments(list: readonly ApiAssignment[]): ApiAssignment[] {
  const live = list.filter((assignment) => !assignment.endedAt);
  const latest = live.reduce((max, assignment) => (assignment.createdAt > max ? assignment.createdAt : max), "");
  return [...live, ...list.filter((assignment) => assignment.endReason === "DECLINED" && (assignment.respondedAt ?? "") >= latest)];
}

const assigneeOf = (assignment: ApiAssignment, roster: readonly ApiProjectMember[]): TaskAssignee => {
  const by = roster.find((member) => member.actorId === assignment.createdByActorId);
  return {
    person: personOf(roster, assignment.recipientAccessId),
    state: assignment.decision.toLowerCase() as AssignmentState,
    ...(by ? { by: personOf(roster, by.id) } : {}),
    ...(assignment.declineReason ? { note: assignment.declineReason } : {}),
  };
};

export interface LoadedTasks {
  tasks: ProjectTask[];
  catalogue: Catalogue;
  /** Live assignments per task (for writes). */
  assignments: Map<string, ApiAssignment[]>;
  roster: ApiProjectMember[];
  /** Planned start day per task (null = none), for the workload spread. */
  starts: Map<string, string | null>;
}

/** LIST view pages with the dependency edges of every page. */
async function viewPages(api: ProjectsClient, projectId: string, taskId?: string): Promise<{ items: ApiViewItem[]; edges: ApiEdge[] }> {
  const items: ApiViewItem[] = [];
  const edges = new Map<string, ApiEdge>();
  let after: string | undefined;
  do {
    const { data } = await api.request("get", "/api/v1/projects/{projectId}/views", { path: { projectId }, query: { kind: "LIST", limit: PAGE, after, ...(taskId ? { taskId } : {}) } });
    items.push(...data.items.filter((item) => item.task.deletedAt === null));
    for (const edge of data.dependencies) edges.set(edge.id, edge);
    after = data.nextCursor ?? undefined;
  } while (after);
  return { items, edges: [...edges.values()] };
}

export async function loadProjectTasks(api: ProjectsClient, projectId: string, taskId?: string): Promise<LoadedTasks> {
  const [{ items, edges }, roster, sections] = await Promise.all([
    viewPages(api, projectId, taskId),
    projectRoster(api, projectId),
    pageAll<ApiComponent>(async (after) => (await api.request("get", "/api/v1/projects/{id}/components/{kind}", { path: { id: projectId, kind: "sections" }, query: { limit: PAGE, after } })).data),
  ]);
  const versions = await readVersions(api, projectId, items.flatMap((item) => (item.workflow.binding ? [item.workflow.binding] : [])));
  const places = new Map<string, ApiAssociation>();
  const assignments = new Map<string, ApiAssignment[]>();
  for (let at = 0; at < items.length; at += READS) {
    await Promise.all(
      items.slice(at, at + READS).map(async ({ task }) => {
        const [place, list] = await Promise.all([
          api.request("get", "/api/v1/projects/{id}/tasks/{taskId}/association", { path: { id: projectId, taskId: task.id } }).then((response) => response.data),
          pageAll<ApiAssignment>(
            async (after) => (await api.request("get", "/api/v1/projects/{projectId}/tasks/{taskId}/assignments", { path: { projectId, taskId: task.id }, query: { limit: PAGE, after } })).data,
          ),
        ]);
        places.set(task.id, place);
        assignments.set(task.id, currentAssignments(list));
      }),
    );
  }
  const phaseOfSection = new Map(sections.map((section) => [section.id, section.phaseId ?? null]));
  const live = edges.filter((edge) => edge.retiredAt === null);
  const tasks = items.map(({ task, schedule, estimatedMinutes, workflow }): ProjectTask => {
    const place = places.get(task.id);
    return {
      id: task.id,
      projectId,
      title: task.title,
      statusId: workflow.binding ? boundStatusId(workflow.binding) : baseStatusId(task.status),
      phaseId: place?.sectionId ? (phaseOfSection.get(place.sectionId) ?? null) : null,
      milestoneId: place?.milestoneId ?? null,
      assignees: (assignments.get(task.id) ?? []).map((assignment) => assigneeOf(assignment, roster)),
      priority: toPriority(task.priority),
      due: schedule.dueAt ? dayOfInstant(schedule.dueAt) : null,
      estimateHours: estimatedMinutes === null || estimatedMinutes === undefined ? null : estimatedMinutes / 60,
      blockedBy: live.filter((edge) => edge.successorId === task.id).map((edge) => edge.predecessorId),
      subtasks: null,
      commentCount: null,
      revision: task.revision,
      ...(task.completedAt ? { completedAt: task.completedAt } : {}),
    };
  });
  const starts = new Map(
    items.map(({ task, schedule }) => [task.id, schedule.plannedStartAt ? dayOfInstant(schedule.plannedStartAt) : (schedule.scheduledDate ?? null)] as const),
  );
  return { tasks, catalogue: catalogue(versions), assignments, roster, starts };
}

export function createApiProjectWorkflowRepository(client: ApiClient): WorkflowRepository {
  const api = projectsClient(client);
  return {
    published: (projectId) =>
      mapErrors(async () => {
        const { items } = await viewPages(api, projectId);
        return catalogue(await readVersions(api, projectId, items.flatMap((item) => (item.workflow.binding ? [item.workflow.binding] : [])))).workflow;
      }),
  };
}

export function createApiProjectTaskRepository(client: ApiClient, options: { today(): string }): ProjectTaskRepository {
  const api = projectsClient(client);

  const task = async (projectId: string, taskId: string) => {
    const { data, etag } = await api.request("get", "/api/v1/projects/{id}/tasks/{taskId}", { path: { id: projectId, taskId } });
    return { data, tag: etag ?? revisionTag(data.revision) };
  };
  const one = async (projectId: string, taskId: string): Promise<ProjectTask> => {
    const found = (await loadProjectTasks(api, projectId, taskId)).tasks.find((candidate) => candidate.id === taskId);
    if (!found) throw new RepositoryError("not-found", "Not found");
    return found;
  };

  /** The first section (by position) of a phase; a phase without sections cannot hold tasks. */
  const sectionFor = async (projectId: string, phaseId: string): Promise<string> => {
    const sections = await pageAll<ApiComponent>(
      async (after) => (await api.request("get", "/api/v1/projects/{id}/components/{kind}", { path: { id: projectId, kind: "sections" }, query: { limit: PAGE, after } })).data,
    );
    const first = sections.filter((section) => section.phaseId === phaseId).sort((a, b) => a.position - b.position)[0];
    if (!first) invalid("phase-has-no-section");
    return first.id;
  };

  const place = async (projectId: string, taskId: string, change: { phaseId?: string; milestoneId?: string | null }) => {
    const { data: current } = await api.request("get", "/api/v1/projects/{id}/tasks/{taskId}/association", { path: { id: projectId, taskId } });
    const body = {
      sectionId: change.phaseId !== undefined ? await sectionFor(projectId, change.phaseId) : (current.sectionId ?? null),
      milestoneId: change.milestoneId !== undefined ? change.milestoneId : (current.milestoneId ?? null),
    };
    await conflictAware(() =>
      api.request("put", "/api/v1/projects/{id}/tasks/{taskId}/association", { path: { id: projectId, taskId }, header: { "If-Match": revisionTag(current.revision) }, body }),
    );
  };

  const setDue = async (projectId: string, taskId: string, due: string | null) => {
    const [{ data: schedule }, { tag }] = await Promise.all([
      api.request("get", "/api/v1/projects/{projectId}/tasks/{taskId}/schedule", { path: { projectId, taskId } }),
      task(projectId, taskId),
    ]);
    await conflictAware(() =>
      api.request("put", "/api/v1/projects/{projectId}/tasks/{taskId}/schedule", {
        path: { projectId, taskId },
        header: { "If-Match": tag },
        body: { plannedStartAt: schedule.plannedStartAt ?? null, dueAt: due === null ? null : localInstant(due, "23:59"), scheduledDate: schedule.scheduledDate ?? null },
      }),
    );
  };

  const setEstimate = async (projectId: string, taskId: string, hours: number | null) => {
    const { tag } = await task(projectId, taskId);
    await conflictAware(() =>
      api.request("put", "/api/v1/projects/{projectId}/tasks/{taskId}/estimate", {
        path: { projectId, taskId },
        header: { "If-Match": tag },
        body: { estimatedMinutes: hours === null ? null : Math.round(hours * 60) },
      }),
    );
  };

  /** New people get a pending assignment (the first one PRIMARY when none is current); people left out are revoked. */
  const setAssignees = async (projectId: string, taskId: string, ids: readonly string[]) => {
    const [loaded, roster] = await Promise.all([loadProjectTasks(api, projectId, taskId), projectRoster(api, projectId)]);
    const current = loaded.assignments.get(taskId) ?? [];
    for (const assignment of current.filter((candidate) => candidate.decision !== "DECLINED" && !ids.includes(candidate.recipientAccessId)))
      await conflictAware(() =>
        api.request("post", "/api/v1/projects/{projectId}/tasks/{taskId}/assignments/{assignmentId}/revoke", {
          path: { projectId, taskId, assignmentId: assignment.id },
          header: { "If-Match": revisionTag(assignment.revision) },
          body: {},
        }),
      );
    let hasPrimary = current.some((assignment) => assignment.kind === "PRIMARY" && assignment.decision !== "DECLINED" && ids.includes(assignment.recipientAccessId));
    for (const id of ids.filter((candidate) => !current.some((assignment) => assignment.recipientAccessId === candidate && assignment.decision !== "DECLINED"))) {
      const member = roster.find((candidate) => candidate.id === id && candidate.state === "ACTIVE");
      if (!member) throw new RepositoryError("not-found", "Not found");
      const { tag } = await task(projectId, taskId);
      await conflictAware(() =>
        api.request("post", "/api/v1/projects/{projectId}/tasks/{taskId}/assignments", {
          path: { projectId, taskId },
          header: { "If-Match": tag, "Idempotency-Key": newIdempotencyKey() },
          body: { id: crypto.randomUUID(), recipientAccessId: member.id, recipientGeneration: member.generation, kind: hasPrimary ? "CONTRIBUTOR" : "PRIMARY" },
        }),
      );
      hasPrimary = true;
    }
  };

  const transition = async (projectId: string, taskId: string, toStatusId: string) => {
    const [{ data: bound, etag }, current] = await Promise.all([
      api.request("get", "/api/v1/projects/{projectId}/tasks/{taskId}/workflow", { path: { projectId, taskId } }),
      task(projectId, taskId),
    ]);
    const binding = bound.binding;
    if (!binding) {
      const target = BASE.find((status) => baseStatusId(status) === toStatusId);
      if (!target) unsupported("An unbound task moves between the base statuses only");
      await conflictAware(() =>
        api.request("patch", "/api/v1/projects/{id}/tasks/{taskId}", {
          path: { id: projectId, taskId },
          header: { "If-Match": current.tag, "Idempotency-Key": newIdempotencyKey() },
          body: { status: target },
        }),
      );
      return;
    }
    const version = (await readVersions(api, projectId, [binding])).get(versionKey(binding.workflowId, binding.version))!;
    const edge = version.edges.find((candidate) => candidate.fromStateId === binding.stateId && boundStatusId({ ...binding, stateId: candidate.toStateId }) === toStatusId);
    // Moving into another version's state would migrate the task: never done implicitly.
    if (!edge) unsupported("The task's workflow version has no such transition");
    await conflictAware(() =>
      api.request("post", "/api/v1/projects/{projectId}/tasks/{taskId}/workflow/transitions", {
        path: { projectId, taskId },
        header: { "If-Match": etag ?? current.tag, "Idempotency-Key": newIdempotencyKey() },
        body: { edgeId: edge.id },
      }),
    );
  };

  const repo: ProjectTaskRepository = {
    list: (projectId, query = {}) =>
      mapErrors(async () => {
        const [{ tasks, catalogue: statuses }, me] = await Promise.all([loadProjectTasks(api, projectId), accessMe(api, projectId)]);
        const today = options.today();
        const search = query.search?.trim().toLocaleLowerCase() ?? "";
        const filters = query.filters;
        const base = tasks.filter((task) => {
          if (search && !task.title.toLocaleLowerCase().includes(search)) return false;
          if (!filters) return true;
          if (filters.statusIds?.length && !filters.statusIds.includes(task.statusId)) return false;
          if (filters.priorities?.length && !(task.priority && filters.priorities.includes(task.priority))) return false;
          if (filters.milestoneIds?.length && !(task.milestoneId && filters.milestoneIds.includes(task.milestoneId))) return false;
          if (filters.assigneeIds?.length) {
            const ids = task.assignees.filter((assignee) => assignee.state !== "declined").map((assignee) => assignee.person.id);
            if (!(filters.assigneeIds.includes("none") && ids.length === 0) && !ids.some((id) => filters.assigneeIds!.includes(id))) return false;
          }
          return true;
        });
        const closed = (task: ProjectTask) => isClosed(statuses.categoryOf(task.statusId));
        const mine = (task: ProjectTask) => task.assignees.some((assignee) => assignee.person.id === me.accessId && assignee.state !== "declined");
        const inView: Record<ProjectTaskView, (task: ProjectTask) => boolean> = {
          all: () => true,
          mine: (task) => !closed(task) && mine(task),
          unassigned: (task) => !closed(task) && task.assignees.every((assignee) => assignee.state === "declined"),
          overdue: (task) => !closed(task) && task.due !== null && task.due < today,
          completed: (task) => statuses.categoryOf(task.statusId) === "done",
        };
        const counts = Object.fromEntries((Object.keys(inView) as ProjectTaskView[]).map((view) => [view, base.filter(inView[view]).length])) as Record<ProjectTaskView, number>;
        return { tasks: base.filter(inView[query.view ?? "all"]), counts };
      }),

    get: (projectId, taskId) => mapErrors(() => one(projectId, taskId)),

    members: (projectId) => mapErrors(() => projectPeople(api, projectId)),

    create: (projectId, input) =>
      mapErrors(async () => {
        if (!input.title.trim()) invalid("title");
        const sectionId = await sectionFor(projectId, input.phaseId);
        const { data } = await api.request("post", "/api/v1/projects/{id}/tasks", {
          path: { id: projectId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { id: crypto.randomUUID(), title: input.title.trim(), priority: input.priority ? (input.priority.toUpperCase() as ApiTask["priority"]) : "NONE", sectionId },
        });
        if (input.due) await setDue(projectId, data.id, input.due);
        if (input.estimateHours !== undefined) await setEstimate(projectId, data.id, input.estimateHours);
        if (input.assigneeId) await setAssignees(projectId, data.id, [input.assigneeId]);
        return one(projectId, data.id);
      }),

    update: (projectId, taskId, patch, revision) =>
      mapErrors(async () => {
        const current = await task(projectId, taskId);
        if (current.data.revision !== revision) throw new RepositoryError("conflict", "Changed elsewhere");
        if (patch.title !== undefined || patch.priority !== undefined) {
          if (patch.title !== undefined && !patch.title.trim()) invalid("title");
          await conflictAware(() =>
            api.request("patch", "/api/v1/projects/{id}/tasks/{taskId}", {
              path: { id: projectId, taskId },
              header: { "If-Match": current.tag, "Idempotency-Key": newIdempotencyKey() },
              body: {
                ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
                ...(patch.priority !== undefined ? { priority: patch.priority.toUpperCase() as ApiTask["priority"] } : {}),
              },
            }),
          );
        }
        if (patch.statusId !== undefined) await transition(projectId, taskId, patch.statusId);
        if (patch.phaseId !== undefined || patch.milestoneId !== undefined) await place(projectId, taskId, patch);
        if (patch.due !== undefined) await setDue(projectId, taskId, patch.due);
        if (patch.estimateHours !== undefined) await setEstimate(projectId, taskId, patch.estimateHours);
        if (patch.assigneeIds !== undefined) await setAssignees(projectId, taskId, patch.assigneeIds);
        return one(projectId, taskId);
      }),

    bulkUpdate: (projectId, taskIds, patch) =>
      mapErrors(async () => {
        const { tasks } = await loadProjectTasks(api, projectId);
        const updated: ProjectTask[] = [];
        const failedIds: string[] = [];
        for (const id of taskIds) {
          const found = tasks.find((candidate) => candidate.id === id);
          try {
            if (!found) throw new RepositoryError("not-found", "Not found");
            updated.push(await repo.update(projectId, id, patch, found.revision));
          } catch (error) {
            if (!(error instanceof RepositoryError)) throw error;
            failedIds.push(id);
          }
        }
        return { updated, failedIds };
      }),

    transition: (projectId, taskId, toStatusId, revision) =>
      mapErrors(async () => {
        const current = await task(projectId, taskId);
        if (current.data.revision !== revision) throw new RepositoryError("conflict", "Changed elsewhere");
        await transition(projectId, taskId, toStatusId);
        return one(projectId, taskId);
      }),

    countByStatus: (projectId) =>
      mapErrors(async () => {
        const counts: Record<string, number> = {};
        for (const task of (await loadProjectTasks(api, projectId)).tasks) counts[task.statusId] = (counts[task.statusId] ?? 0) + 1;
        return counts;
      }),

    remove: () => mapErrors(async () => unsupported("The API has no task deletion")),
    reorder: () => mapErrors(async () => unsupported("The API has no manual task order")),
  };
  return repo;
}
