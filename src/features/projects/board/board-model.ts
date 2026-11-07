import type {
  ProjectPerson,
  ProjectPhase,
  ProjectTask,
  ProjectWorkflow,
  WorkflowStatus,
} from "@/data/project-domain";

/*
 * PJ-03 board model, pure and testable: columns = the published workflow
 * statuses (done last), optional swimlanes (None · Phase · Assignee), Done
 * collapsing cards completed more than 7 days ago, WIP counts per status
 * (across lanes), and the drop check (workflow transition, role, WIP limit,
 * lane change) the screen asks before requesting a transition.
 */

export type Swimlane = "none" | "phase" | "assignee";
export const SWIMLANES: readonly Swimlane[] = ["none", "phase", "assignee"];

/** Done cards completed longer ago than this collapse under "+ n more". */
export const DONE_COLLAPSE_DAYS = 7;

export interface BoardColumnModel {
  status: WorkflowStatus;
  /** Cards shown, in manual order. */
  tasks: ProjectTask[];
  /** Done only: cards older than 7 days (hidden until expanded). */
  collapsed: ProjectTask[];
}

export type LaneHead =
  | { kind: "all" }
  | { kind: "phase"; phase: ProjectPhase }
  | { kind: "person"; person: ProjectPerson }
  | { kind: "nobody" }
  | { kind: "no-phase" };

export interface BoardLane {
  id: string;
  head: LaneHead;
  columns: BoardColumnModel[];
}

export interface BoardModel {
  statuses: WorkflowStatus[];
  lanes: BoardLane[];
  /** Tasks per status across lanes (what WIP limits count). */
  counts: Record<string, number>;
}

/** Board column order: the workflow order with done statuses last. */
export function boardStatuses(workflow: ProjectWorkflow): WorkflowStatus[] {
  return [
    ...workflow.statuses.filter((status) => status.category !== "done"),
    ...workflow.statuses.filter((status) => status.category === "done"),
  ];
}

/** The lane a task sits in for a swimlane mode. */
export function laneOf(task: ProjectTask, swimlane: Swimlane): string {
  if (swimlane === "phase") return task.phaseId ? `phase:${task.phaseId}` : "no-phase";
  if (swimlane === "assignee") {
    const holder = task.assignees.find((assignee) => assignee.state !== "declined");
    return holder ? `person:${holder.person.id}` : "nobody";
  }
  return "all";
}

const DAY = 86_400_000;

function isOld(task: ProjectTask, now: string): boolean {
  if (!task.completedAt) return false;
  return Date.parse(now) - Date.parse(task.completedAt) > DONE_COLLAPSE_DAYS * DAY;
}

export interface BuildBoardOptions {
  swimlane: Swimlane;
  phases: readonly ProjectPhase[];
  members: readonly ProjectPerson[];
  /** Planner "now" (instant) for the Done collapse. */
  now: string;
}

export function buildBoard(
  tasks: readonly ProjectTask[],
  workflow: ProjectWorkflow,
  { swimlane, phases, members, now }: BuildBoardOptions,
): BoardModel {
  const statuses = boardStatuses(workflow);
  const counts: Record<string, number> = Object.fromEntries(statuses.map((status) => [status.id, 0]));
  for (const task of tasks) counts[task.statusId] = (counts[task.statusId] ?? 0) + 1;

  let heads: { id: string; head: LaneHead }[];
  if (swimlane === "phase") {
    heads = phases.map((phase) => ({ id: `phase:${phase.id}`, head: { kind: "phase", phase } }));
    if (tasks.some((task) => !task.phaseId)) heads.push({ id: "no-phase", head: { kind: "no-phase" } });
  } else if (swimlane === "assignee") {
    const ids = new Set(tasks.map((task) => laneOf(task, "assignee")));
    heads = members
      .filter((person) => ids.has(`person:${person.id}`))
      .map((person) => ({ id: `person:${person.id}`, head: { kind: "person", person } }));
    // People who hold tasks but are not in the member list (e.g. removed) still get a lane.
    for (const task of tasks) {
      const id = laneOf(task, "assignee");
      const holder = task.assignees.find((assignee) => assignee.state !== "declined");
      if (holder && !heads.some((lane) => lane.id === id)) heads.push({ id, head: { kind: "person", person: holder.person } });
    }
    if (ids.has("nobody")) heads.push({ id: "nobody", head: { kind: "nobody" } });
  } else {
    heads = [{ id: "all", head: { kind: "all" } }];
  }

  const lanes = heads.map(({ id, head }) => {
    const inLane = tasks.filter((task) => laneOf(task, swimlane) === id);
    return {
      id,
      head,
      columns: statuses.map((status) => {
        const cards = inLane.filter((task) => task.statusId === status.id);
        if (status.category !== "done") return { status, tasks: cards, collapsed: [] };
        return {
          status,
          tasks: cards.filter((task) => !isOld(task, now)),
          collapsed: cards.filter((task) => isOld(task, now)),
        };
      }),
    };
  });
  return { statuses, lanes, counts };
}

export type DropDecision =
  /** Same column and lane: manual reorder (Manager+). */
  | { kind: "reorder" }
  | { kind: "move"; statusChange: boolean; laneChange: boolean; confirmWip: boolean }
  | { kind: "not-allowed"; reason: "transition" | "role" | "wip" | "lane" };

export interface DropInput {
  task: ProjectTask;
  toStatusId: string;
  fromLane: string;
  toLane: string;
  swimlane: Swimlane;
  workflow: ProjectWorkflow;
  counts: Readonly<Record<string, number>>;
  capabilities: { exceedWip: boolean; reorderTasks: boolean };
}

/** What dropping `task` on (toStatus, toLane) means for this user (SPEC PJ-03 Rules + Permissions). */
export function decideDrop({
  task,
  toStatusId,
  fromLane,
  toLane,
  swimlane,
  workflow,
  counts,
  capabilities,
}: DropInput): DropDecision {
  const statusChange = toStatusId !== task.statusId;
  const laneChange = fromLane !== toLane;
  if (!statusChange && !laneChange) {
    return capabilities.reorderTasks ? { kind: "reorder" } : { kind: "not-allowed", reason: "role" };
  }
  if (statusChange) {
    if (task.can?.status === false) return { kind: "not-allowed", reason: "role" };
    if (!(workflow.transitions[task.statusId] ?? []).includes(toStatusId))
      return { kind: "not-allowed", reason: "transition" };
  }
  if (laneChange) {
    const can = swimlane === "assignee" ? task.can?.assign : task.can?.edit;
    if (can === false || toLane === "no-phase") return { kind: "not-allowed", reason: "lane" };
  }
  let confirmWip = false;
  const limit = workflow.wipLimits?.[toStatusId];
  if (statusChange && limit !== undefined && (counts[toStatusId] ?? 0) + 1 > limit) {
    if (!capabilities.exceedWip) return { kind: "not-allowed", reason: "wip" };
    confirmWip = true;
  }
  return { kind: "move", statusChange, laneChange, confirmWip };
}

/** The patch a lane change asks for (phase or assignee); null for no lane change. */
export function lanePatch(toLane: string): { phaseId: string } | { assigneeIds: string[] } | null {
  if (toLane.startsWith("phase:")) return { phaseId: toLane.slice(6) };
  if (toLane.startsWith("person:")) return { assigneeIds: [toLane.slice(7)] };
  if (toLane === "nobody") return { assigneeIds: [] };
  return null;
}

/** Ids of a column after moving `taskId` to `index` (manual order). */
export function reorderIds(ids: readonly string[], taskId: string, index: number): string[] {
  const rest = ids.filter((id) => id !== taskId);
  const at = Math.max(0, Math.min(rest.length, index));
  return [...rest.slice(0, at), taskId, ...rest.slice(at)];
}
