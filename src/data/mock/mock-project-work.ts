import { projectWorkFixtures, sampleWorkflow } from "@/fixtures/project-work";
import type {
  MilestoneRow,
  MilestoneStatus,
  ProjectActivity,
  ProjectKpis,
  ProjectMilestone,
  ProjectPhase,
  ProjectRisk,
  ProjectTask,
  ProjectWorkflow,
  WorkloadEntry,
} from "../project-domain";
import type {
  ActivityRepository,
  AssignmentRepository,
  MilestoneRepository,
  RiskRepository,
  WorkflowRepository,
  WorkloadRepository,
} from "../project-repositories";
import { RepositoryError } from "../repositories";

/*
 * Work inside a project for the mock adapter (PJ-01 now; PJ-02/PJ-15 reuse
 * the same task store): phases, milestones, tasks, risks, activity, team
 * load, and my assignments. Counts (KPIs) are computed here, as the server
 * would, never in the UI. Writes check the task revision (If-Match → 409).
 */

export const CURRENT_USER_ID = "me";

export interface ProjectWorkStore {
  phases: Map<string, ProjectPhase[]>;
  milestones: Map<string, ProjectMilestone[]>;
  tasks: Map<string, ProjectTask[]>;
  risks: Map<string, ProjectRisk[]>;
  activity: Map<string, ProjectActivity[]>;
  workload: Map<string, WorkloadEntry[]>;
  workflow(projectId: string): ProjectWorkflow;
  findTask(taskId: string): ProjectTask | undefined;
}

export function createProjectWorkStore(): ProjectWorkStore {
  const entries = Object.entries(structuredClone(projectWorkFixtures));
  const map = <K extends keyof (typeof projectWorkFixtures)[string]>(key: K) =>
    new Map(entries.map(([id, work]) => [id, [...work[key]]])) as unknown as Map<
      string,
      (typeof projectWorkFixtures)[string][K] extends readonly (infer T)[] ? T[] : never
    >;
  const tasks = map("tasks");
  return {
    phases: map("phases"),
    milestones: map("milestones"),
    tasks,
    risks: map("risks"),
    activity: map("activity"),
    workload: map("workload"),
    workflow: () => sampleWorkflow,
    findTask: (taskId) => {
      for (const list of tasks.values()) {
        const found = list.find((task) => task.id === taskId);
        if (found) return found;
      }
      return undefined;
    },
  };
}

const DAY = 86_400_000;
const dayNumber = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / DAY;

/** Iran week (Sat–Fri) containing `today`, as [start, end] day numbers. */
function weekOf(today: string): [number, number] {
  const n = dayNumber(today);
  const weekday = new Date(n * DAY).getUTCDay(); // 0 Sun … 6 Sat
  const sinceSaturday = (weekday + 1) % 7;
  return [n - sinceSaturday, n - sinceSaturday + 6];
}

export function isTaskDone(task: ProjectTask, workflow: ProjectWorkflow): boolean {
  return workflow.statuses.find((status) => status.id === task.statusId)?.category === "done";
}

export function isMine(task: ProjectTask): boolean {
  return task.assignees.some((assignee) => assignee.person.id === CURRENT_USER_ID && assignee.state !== "declined");
}

export function computeKpis(store: ProjectWorkStore, projectId: string, today: string): ProjectKpis {
  const workflow = store.workflow(projectId);
  const tasks = store.tasks.get(projectId) ?? [];
  const open = tasks.filter((task) => !isTaskDone(task, workflow));
  const now = dayNumber(today);
  const overdue = open.filter((task) => task.due && dayNumber(task.due) < now);
  const [weekStart, weekEnd] = weekOf(today);
  const milestones = store.milestones.get(projectId) ?? [];
  const next = milestones.filter((milestone) => !milestone.done).sort((a, b) => a.due.localeCompare(b.due))[0];
  const risks = (store.risks.get(projectId) ?? []).filter((risk) => risk.open);
  return {
    milestonesDone: milestones.filter((milestone) => milestone.done).length,
    milestonesTotal: milestones.length,
    nextMilestone: next ? { id: next.id, title: next.title, due: next.due } : null,
    overdueTasks: overdue.length,
    oldestOverdueDays: overdue.reduce((max, task) => Math.max(max, now - dayNumber(task.due!)), 0),
    openRisks: risks.length,
    highRisks: risks.filter((risk) => risk.severity === "high" || risk.severity === "critical").length,
    dueThisWeek: open.filter((task) => task.due && dayNumber(task.due) >= weekStart && dayNumber(task.due) <= weekEnd)
      .length,
    openTasks: open.length,
  };
}

export interface MockProjectWorkOptions {
  store: ProjectWorkStore;
  now: string;
  respond<T>(value: T): Promise<T>;
  /** Whether the current user may see team load in a project (capabilities). */
  canSeeTeamLoad(projectId: string): boolean;
  /** Whether the current user may create / edit phases and milestones (Manager+, not archived). */
  canEditMilestones?(projectId: string): boolean;
  /** Mock "today" ("YYYY-MM-DD") for milestone status. */
  today?: string;
  /** Called after my assignments change (the directory's "n for you"). */
  onAssignmentsChanged(projectId: string, delta: number): void;
  /** My acceptance changed: the task enters / leaves my Personal projection. */
  onAcceptance?(task: ProjectTask, accepted: boolean): void;
}

export function createMockProjectWork({
  store,
  now,
  respond,
  canSeeTeamLoad,
  canEditMilestones = () => false,
  today = "2026-10-13",
  onAssignmentsChanged,
  onAcceptance,
}: MockProjectWorkOptions) {
  const editGuard = (projectId: string) => {
    if (!canEditMilestones(projectId)) throw new RepositoryError("forbidden", "Manager+ only");
  };

  /** SPEC PJ-08 status: Reached · At risk · Next (earliest open) · Planned, computed here like the server. */
  function milestoneRows(projectId: string): MilestoneRow[] {
    const workflow = store.workflow(projectId);
    const tasks = store.tasks.get(projectId) ?? [];
    const risks = store.risks.get(projectId) ?? [];
    const list = [...(store.milestones.get(projectId) ?? [])].sort((a, b) => a.due.localeCompare(b.due));
    const base = list.map((milestone) => {
      const linked = tasks.filter((task) => task.milestoneId === milestone.id);
      const done = linked.filter((task) => isTaskDone(task, workflow)).length;
      const reached = milestone.done || (linked.length > 0 && done === linked.length);
      return { milestone, linked: linked.length, done, reached };
    });
    const nextId = base.find((row) => !row.reached)?.milestone.id;
    return base.map(({ milestone, linked, done, reached }) => {
      const days = dayNumber(milestone.due) - dayNumber(today);
      const highRisk = risks.some(
        (risk) =>
          risk.open && risk.milestoneId === milestone.id && (risk.severity === "high" || risk.severity === "critical"),
      );
      const behind = days <= 14 && (linked === 0 ? 0 : done / linked) < 0.5;
      const status: MilestoneStatus = reached
        ? "reached"
        : highRisk || behind
          ? "risk"
          : milestone.id === nextId
            ? "next"
            : "planned";
      return { milestone, status, tasksDone: done, tasksTotal: linked };
    });
  }

  const milestones: MilestoneRepository = {
    listPhases: (projectId) => respond(store.phases.get(projectId) ?? []),
    listMilestones: (projectId) => respond(store.milestones.get(projectId) ?? []),
    phaseRows: (projectId) => {
      const workflow = store.workflow(projectId);
      const tasks = store.tasks.get(projectId) ?? [];
      return respond(
        (store.phases.get(projectId) ?? []).map((phase) => {
          const inPhase = tasks.filter((task) => task.phaseId === phase.id);
          return {
            phase,
            tasksDone: inPhase.filter((task) => isTaskDone(task, workflow)).length,
            tasksTotal: inPhase.length,
          };
        }),
      );
    },
    milestoneRows: (projectId) => respond(milestoneRows(projectId)),
    async reorderPhases(projectId, phaseIds) {
      editGuard(projectId);
      const list = store.phases.get(projectId) ?? [];
      if (phaseIds.length !== list.length || !list.every((phase) => phaseIds.includes(phase.id))) {
        throw new RepositoryError("invalid", "Order must list every phase");
      }
      const next = phaseIds.map((id) => list.find((phase) => phase.id === id)!);
      store.phases.set(projectId, next);
      return respond(next);
    },
    async updateMilestone(milestoneId, { title }, revision) {
      for (const [projectId, list] of store.milestones) {
        const milestone = list.find((item) => item.id === milestoneId);
        if (!milestone) continue;
        editGuard(projectId);
        if ((milestone.revision ?? 1) !== revision) throw new RepositoryError("conflict", `Milestone ${milestoneId} changed`);
        const trimmed = title.trim();
        if (!trimmed) throw new RepositoryError("invalid", "Title is required");
        milestone.title = trimmed;
        milestone.revision = (milestone.revision ?? 1) + 1;
        return respond(milestone);
      }
      throw new RepositoryError("not-found", `No milestone ${milestoneId}`);
    },
  };

  const workflows: WorkflowRepository = {
    published: (projectId) => respond(store.workflow(projectId)),
  };

  const activity: ActivityRepository = {
    list: (projectId, { limit } = {}) => {
      const list = [...(store.activity.get(projectId) ?? [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      return respond(limit === undefined ? list : list.slice(0, limit));
    },
  };

  const risks: RiskRepository = {
    list: (projectId, { open } = {}) =>
      respond((store.risks.get(projectId) ?? []).filter((risk) => open === undefined || risk.open === open)),
    byMilestone: (projectId, milestoneId) =>
      respond((store.risks.get(projectId) ?? []).find((risk) => risk.open && risk.milestoneId === milestoneId) ?? null),
  };

  const workload: WorkloadRepository = {
    week: (projectId) => respond(canSeeTeamLoad(projectId) ? (store.workload.get(projectId) ?? []) : []),
  };

  function myAssignment(taskId: string, revision: number, expected: "pending" | "accepted" = "pending") {
    const task = store.findTask(taskId);
    if (!task) throw new RepositoryError("not-found", `No task ${taskId}`);
    if (task.revision !== revision)
      throw new RepositoryError("conflict", `Task ${taskId} changed (revision ${task.revision})`);
    const index = task.assignees.findIndex((assignee) => assignee.person.id === CURRENT_USER_ID);
    if (index < 0 || task.assignees[index]!.state !== expected) {
      throw new RepositoryError("forbidden", "No pending assignment for you");
    }
    return { task, index };
  }

  const assignments: AssignmentRepository = {
    listMine: (projectId) => {
      const workflow = store.workflow(projectId);
      const mine = (store.tasks.get(projectId) ?? []).filter((task) => !isTaskDone(task, workflow));
      const state = (task: ProjectTask) =>
        task.assignees.find((assignee) => assignee.person.id === CURRENT_USER_ID)?.state;
      return respond({
        pending: mine.filter((task) => state(task) === "pending"),
        open: mine.filter((task) => state(task) === "accepted"),
      });
    },
    async accept(taskId, revision) {
      const { task, index } = myAssignment(taskId, revision);
      task.assignees = task.assignees.map((assignee, at) =>
        at === index ? { ...assignee, state: "accepted" } : assignee,
      );
      task.revision += 1;
      task.updatedAt = now;
      onAssignmentsChanged(task.projectId, 0);
      onAcceptance?.(task, true);
      return respond(task);
    },
    async revertAccept(taskId, revision) {
      const { task, index } = myAssignment(taskId, revision, "accepted");
      task.assignees = task.assignees.map((assignee, at) =>
        at === index ? { ...assignee, state: "pending" } : assignee,
      );
      task.revision += 1;
      task.updatedAt = now;
      onAcceptance?.(task, false);
      return respond(task);
    },
    async remind(taskId) {
      const task = store.findTask(taskId);
      if (!task) throw new RepositoryError("not-found", `No task ${taskId}`);
      if (!task.assignees.some((assignee) => assignee.state === "pending")) {
        throw new RepositoryError("invalid", "Nobody is pending");
      }
      return respond(undefined);
    },
    async decline(taskId, { reason, note, revision }) {
      const { task, index } = myAssignment(taskId, revision);
      task.assignees = task.assignees.map((assignee, at) =>
        at === index ? { ...assignee, state: "declined", reason, ...(note ? { note } : {}) } : assignee,
      );
      task.revision += 1;
      task.updatedAt = now;
      onAssignmentsChanged(task.projectId, -1);
      return respond(task);
    },
  };

  return { milestones, workflows, activity, risks, workload, assignments };
}
