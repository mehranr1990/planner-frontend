import { sampleTaskDetails } from "@/fixtures/project-work";
import type {
  ProjectTask,
  ProjectTaskActivity,
  ProjectTaskDetail,
  TaskComment,
  TaskDependency,
} from "../project-domain";
import type { CommentRepository, DependencyRepository, TaskDetailRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { CURRENT_USER_ID, type ProjectWorkStore } from "./mock-project-work";

/*
 * PJ-15 task detail for the mock adapter: properties beyond the row,
 * subtasks, dependencies (FS/SS/FF/SF + lag, cycle check), files, comments,
 * activity, and the assignee's own "Show in My Calendar" setting. Personal
 * notes and time blocks of the assignee are never part of this record.
 */

interface DetailState {
  start: string | null;
  section: string | null;
  customFields: { label: string; value: string }[];
  loggedHours: number;
  subtasks: { id: string; title: string; done: boolean }[];
  dependencies: { id: string; predecessorId: string; type: TaskDependency["type"]; lagDays: number }[];
  files: { id: string; name: string }[];
  comments: TaskComment[];
  unreadComments: number;
  assignedAt: string | null;
  showInCalendar: boolean;
}

export interface MockTaskDetailOptions {
  store: ProjectWorkStore;
  now: string;
  respond<T>(value: T): Promise<T>;
  /** Adds the per-task `can` flags for the current user. */
  withCan(task: ProjectTask): ProjectTask;
  /** The assignee's projection follows the calendar setting. */
  onCalendarChanged(task: ProjectTask, on: boolean): void;
}

export function createMockTaskDetail({ store, now, respond, withCan, onCalendarChanged }: MockTaskDetailOptions) {
  const states = new Map<string, DetailState>();
  let counter = 0;

  const state = (taskId: string): DetailState => {
    let found = states.get(taskId);
    if (!found) {
      const seed = structuredClone(sampleTaskDetails[taskId] ?? {});
      found = {
        start: seed.start ?? null,
        section: seed.section ?? null,
        customFields: seed.customFields ?? [],
        loggedHours: seed.loggedHours ?? 0,
        subtasks: seed.subtasks ?? [],
        dependencies: seed.dependencies ?? [],
        files: seed.files ?? [],
        comments: seed.comments ?? [],
        unreadComments: seed.unreadComments ?? 0,
        assignedAt: seed.assignedAt ?? null,
        showInCalendar: true,
      };
      states.set(taskId, found);
    }
    return found;
  };

  const taskOrThrow = (taskId: string) => {
    const task = store.findTask(taskId);
    if (!task) throw new RepositoryError("not-found", `No task ${taskId}`);
    return task;
  };

  function detail(taskId: string): ProjectTaskDetail {
    const task = taskOrThrow(taskId);
    const current = state(taskId);
    const assignedBy = task.assignees.find((assignee) => assignee.by)?.by;
    const activity: ProjectTaskActivity[] = [];
    if (assignedBy && current.assignedAt) {
      const person = task.assignees.find((assignee) => assignee.by)?.person.name ?? "";
      activity.push({ id: `${taskId}-assigned`, at: current.assignedAt, actor: assignedBy, kind: "assigned", person });
    }
    activity.push({
      id: `${taskId}-status`,
      at: task.updatedAt,
      actor: assignedBy ?? task.assignees[0]?.person ?? { id: "sara", name: "Sara P.", initials: "SP" },
      kind: "status",
      statusId: task.statusId,
    });
    return {
      task: withCan(task),
      start: current.start,
      section: current.section,
      customFields: current.customFields,
      loggedHours: current.loggedHours,
      subtasks: current.subtasks,
      dependencies: current.dependencies.map((dependency) => ({
        ...dependency,
        predecessorTitle: store.findTask(dependency.predecessorId)?.title ?? dependency.predecessorId,
      })),
      files: current.files,
      activity: activity.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
      comments: current.comments,
      unreadComments: current.unreadComments,
      showInCalendar: current.showInCalendar,
    };
  }

  /** Whether `from` (transitively) depends on `target`. */
  function dependsOn(from: string, target: string, seen = new Set<string>()): boolean {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    const predecessors = [
      ...state(from).dependencies.map((dependency) => dependency.predecessorId),
      ...(store.findTask(from)?.blockedBy ?? []),
    ];
    return predecessors.some((id) => dependsOn(id, target, seen));
  }

  const taskDetails: TaskDetailRepository = {
    get: (taskId) => respond(detail(taskId)),
    async toggleSubtask(taskId, subtaskId) {
      const task = taskOrThrow(taskId);
      if (!withCan(task).can?.edit) throw new RepositoryError("forbidden", "Not allowed");
      const current = state(taskId);
      current.subtasks = current.subtasks.map((item) => (item.id === subtaskId ? { ...item, done: !item.done } : item));
      task.subtasks = { done: current.subtasks.filter((item) => item.done).length, total: current.subtasks.length };
      return respond(detail(taskId));
    },
    async setShowInCalendar(taskId, on) {
      const task = taskOrThrow(taskId);
      if (!task.assignees.some((assignee) => assignee.person.id === CURRENT_USER_ID)) {
        throw new RepositoryError("forbidden", "Assignee only");
      }
      state(taskId).showInCalendar = on;
      onCalendarChanged(task, on);
      return respond(detail(taskId));
    },
  };

  const comments: CommentRepository = {
    async add(taskId, body) {
      const task = taskOrThrow(taskId);
      const text = body.trim();
      if (!text) throw new RepositoryError("invalid", "Empty comment");
      const comment: TaskComment = {
        id: `comment-${++counter}`,
        author: { id: CURRENT_USER_ID, name: "Mehran R.", initials: "MR" },
        at: now,
        body: text,
      };
      state(taskId).comments.push(comment);
      task.commentCount += 1;
      return respond(comment);
    },
  };

  const dependencies: DependencyRepository = {
    async add(taskId, { predecessorId, type, lagDays }) {
      const predecessor = taskOrThrow(predecessorId);
      taskOrThrow(taskId);
      // The predecessor already (transitively) waits for this task → a loop.
      if (dependsOn(predecessorId, taskId)) throw new RepositoryError("invalid", "cycle");
      const dependency = { id: `dep-${++counter}`, predecessorId, type, lagDays };
      state(taskId).dependencies.push(dependency);
      return respond({ ...dependency, predecessorTitle: predecessor.title });
    },
    async remove(taskId, dependencyId) {
      const current = state(taskId);
      current.dependencies = current.dependencies.filter((dependency) => dependency.id !== dependencyId);
      return respond(undefined);
    },
  };

  return { taskDetails, comments, dependencies, showInCalendar: (taskId: string) => state(taskId).showInCalendar };
}
