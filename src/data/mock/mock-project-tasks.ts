import type { ProjectPerson, ProjectRole, ProjectTask, TaskCan } from "../project-domain";
import type {
  ProjectAccessOptions,
  ProjectTaskFilters,
  ProjectTaskPatch,
  ProjectTaskQuery,
  ProjectTaskRepository,
  ProjectTaskView,
} from "../project-repositories";
import { RepositoryError } from "../repositories";
import { CURRENT_USER_ID, isMine, isTaskDone, type ProjectWorkStore } from "./mock-project-work";

/*
 * Project tasks for the mock adapter (PJ-02): list with server counts per
 * view pill, per-task `can` flags for the current user (SPEC PJ-02
 * Permissions), create with a pending assignment, revision-checked update
 * (409 "conflict"), capability-checked bulk update (never a silent partial:
 * refused tasks come back in failedIds), delete (Owner/Admin).
 */

const RANK: Record<ProjectRole, number> = { owner: 5, admin: 4, manager: 3, member: 2, viewer: 1, guest: 0 };

export interface MockProjectTasksOptions {
  store: ProjectWorkStore;
  today: string;
  now: string;
  respond<T>(value: T): Promise<T>;
  /** The current user's role in a project and whether it is archived. */
  roleOf(projectId: string): { role: ProjectRole; archived: boolean } | undefined;
  membersOf(projectId: string): readonly ProjectPerson[];
}

function taskCan(task: ProjectTask, role: ProjectRole, archived: boolean): TaskCan {
  if (archived) return { edit: false, status: false, assign: false, delete: false };
  const rank = RANK[role];
  const mine = isMine(task);
  const assigned = mine && (rank >= RANK.member || role === "guest");
  return {
    edit: rank >= RANK.manager || assigned,
    status: rank >= RANK.manager || assigned,
    assign: rank >= RANK.manager,
    delete: rank >= RANK.admin,
  };
}

function matchesFilters(task: ProjectTask, filters: ProjectTaskFilters | undefined): boolean {
  if (!filters) return true;
  if (filters.statusIds?.length && !filters.statusIds.includes(task.statusId)) return false;
  if (filters.priorities?.length && !filters.priorities.includes(task.priority)) return false;
  if (filters.milestoneIds?.length && !(task.milestoneId && filters.milestoneIds.includes(task.milestoneId)))
    return false;
  if (filters.assigneeIds?.length) {
    const ids = task.assignees
      .filter((assignee) => assignee.state !== "declined")
      .map((assignee) => assignee.person.id);
    const wantsUnassigned = filters.assigneeIds.includes("none") && ids.length === 0;
    if (!wantsUnassigned && !ids.some((id) => filters.assigneeIds!.includes(id))) return false;
  }
  return true;
}

export function createMockProjectTasks({ store, today, now, respond, roleOf, membersOf }: MockProjectTasksOptions) {
  let counter = 0;

  const access = (projectId: string, options: ProjectAccessOptions = {}) => {
    const found = roleOf(projectId);
    if (!found) throw new RepositoryError("not-found", `No project ${projectId}`);
    return { role: options.previewRole ?? found.role, archived: options.previewArchived === true || found.archived };
  };

  const withCan = (task: ProjectTask, options?: ProjectAccessOptions): ProjectTask => {
    const { role, archived } = access(task.projectId, options);
    return { ...task, can: taskCan(task, role, archived) };
  };

  const taskOrThrow = (taskId: string) => {
    const task = store.findTask(taskId);
    if (!task) throw new RepositoryError("not-found", `No task ${taskId}`);
    return task;
  };

  const personById = (projectId: string, id: string) => membersOf(projectId).find((person) => person.id === id);

  function applyPatch(task: ProjectTask, patch: ProjectTaskPatch) {
    const workflow = store.workflow(task.projectId);
    if (patch.statusId !== undefined) {
      if (!workflow.statuses.some((status) => status.id === patch.statusId)) {
        throw new RepositoryError("invalid", `Unknown status ${patch.statusId}`);
      }
      task.statusId = patch.statusId;
    }
    if (patch.title !== undefined) {
      const title = patch.title.trim();
      if (!title) throw new RepositoryError("invalid", "Title is required");
      task.title = title;
    }
    if (patch.phaseId !== undefined) task.phaseId = patch.phaseId;
    if (patch.milestoneId !== undefined) task.milestoneId = patch.milestoneId;
    if (patch.priority !== undefined) task.priority = patch.priority;
    if (patch.due !== undefined) task.due = patch.due;
    if (patch.estimateHours !== undefined) task.estimateHours = patch.estimateHours;
    if (patch.assigneeIds !== undefined) {
      const me = { id: CURRENT_USER_ID, name: "Mehran R.", initials: "MR" };
      task.assignees = patch.assigneeIds.map((id) => {
        const kept = task.assignees.find((assignee) => assignee.person.id === id && assignee.state !== "declined");
        if (kept) return kept;
        const person = personById(task.projectId, id);
        if (!person) throw new RepositoryError("invalid", `Not a member: ${id}`);
        // Assigning someone else is a pending assignment; assigning yourself is accepted.
        return id === CURRENT_USER_ID
          ? { person, state: "accepted" as const }
          : { person, state: "pending" as const, by: me };
      });
    }
    task.revision += 1;
    task.updatedAt = now;
  }

  /** Which capability a patch needs. */
  const needs = (patch: ProjectTaskPatch): (keyof TaskCan)[] => {
    const keys: (keyof TaskCan)[] = [];
    if (patch.statusId !== undefined) keys.push("status");
    if (patch.assigneeIds !== undefined) keys.push("assign");
    const { statusId, assigneeIds, ...rest } = patch;
    void statusId;
    void assigneeIds;
    if (Object.values(rest).some((value) => value !== undefined)) keys.push("edit");
    return keys;
  };

  const repo: ProjectTaskRepository = {
    list(projectId, query: ProjectTaskQuery = {}, options = {}) {
      const { role } = access(projectId, options);
      const workflow = store.workflow(projectId);
      const search = query.search?.trim().toLocaleLowerCase() ?? "";
      // Guests only see tasks shared with them.
      const visible = (store.tasks.get(projectId) ?? []).filter((task) => role !== "guest" || isMine(task));
      const base = visible.filter(
        (task) => matchesFilters(task, query.filters) && (!search || task.title.toLocaleLowerCase().includes(search)),
      );
      const done = (task: ProjectTask) => isTaskDone(task, workflow);
      const inView: Record<ProjectTaskView, (task: ProjectTask) => boolean> = {
        all: () => true,
        mine: (task) => !done(task) && isMine(task),
        unassigned: (task) => !done(task) && task.assignees.length === 0,
        overdue: (task) => !done(task) && task.due !== null && task.due < today,
        completed: done,
      };
      const counts = Object.fromEntries(
        (Object.keys(inView) as ProjectTaskView[]).map((view) => [view, base.filter(inView[view]).length]),
      ) as Record<ProjectTaskView, number>;
      const tasks = base.filter(inView[query.view ?? "all"]).map((task) => withCan(task, options));
      return respond({ tasks, counts });
    },
    get(taskId, options) {
      return respond(withCan(taskOrThrow(taskId), options));
    },
    members(projectId) {
      return respond(membersOf(projectId));
    },
    async create(projectId, input) {
      const { role, archived } = access(projectId);
      if (archived || RANK[role] < RANK.member) throw new RepositoryError("forbidden", "Cannot create tasks");
      const title = input.title.trim();
      if (!title) throw new RepositoryError("invalid", "Title is required");
      const list = store.tasks.get(projectId) ?? [];
      store.tasks.set(projectId, list);
      const task: ProjectTask = {
        id: `ptask-${++counter}`,
        projectId,
        title,
        statusId: store.workflow(projectId).statuses[0]!.id,
        phaseId: input.phaseId,
        milestoneId: null,
        assignees: [],
        priority: input.priority ?? "medium",
        due: input.due ?? null,
        estimateHours: input.estimateHours ?? null,
        blockedBy: [],
        subtasks: { done: 0, total: 0 },
        commentCount: 0,
        revision: 0,
        updatedAt: now,
      };
      if (input.assigneeId) applyPatch(task, { assigneeIds: [input.assigneeId] });
      else task.revision = 1;
      list.push(task);
      return respond(withCan(task));
    },
    async update(taskId, patch, revision) {
      const task = taskOrThrow(taskId);
      if (task.revision !== revision) throw new RepositoryError("conflict", `Task ${taskId} changed`, {});
      const { role, archived } = access(task.projectId);
      const can = taskCan(task, role, archived);
      if (needs(patch).some((key) => !can[key])) throw new RepositoryError("forbidden", "Not allowed for your role");
      if (patch.statusId !== undefined && patch.statusId !== task.statusId) {
        const allowed = store.workflow(task.projectId).transitions[task.statusId] ?? [];
        if (!allowed.includes(patch.statusId)) throw new RepositoryError("invalid", "Transition not allowed");
      }
      applyPatch(task, patch);
      return respond(withCan(task));
    },
    async bulkUpdate(projectId, taskIds, patch) {
      const { role, archived } = access(projectId);
      const updated: ProjectTask[] = [];
      const failedIds: string[] = [];
      for (const id of taskIds) {
        const task = store.findTask(id);
        const can = task ? taskCan(task, role, archived) : undefined;
        const transitionOk =
          !task ||
          patch.statusId === undefined ||
          patch.statusId === task.statusId ||
          (store.workflow(projectId).transitions[task.statusId] ?? []).includes(patch.statusId);
        if (!task || !can || needs(patch).some((key) => !can[key]) || !transitionOk) {
          failedIds.push(id);
          continue;
        }
        applyPatch(task, patch);
        updated.push(withCan(task));
      }
      return respond({ updated, failedIds });
    },
    async remove(taskIds) {
      for (const id of taskIds) {
        const task = taskOrThrow(id);
        const { role, archived } = access(task.projectId);
        if (!taskCan(task, role, archived).delete) throw new RepositoryError("forbidden", "Owner/Admin only");
      }
      for (const [projectId, list] of store.tasks) {
        store.tasks.set(
          projectId,
          list.filter((task) => !taskIds.includes(task.id)),
        );
      }
      return respond(undefined);
    },
  };
  return repo;
}
