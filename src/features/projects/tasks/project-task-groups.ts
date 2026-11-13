import type {
  ProjectMilestone,
  ProjectPhase,
  ProjectTask,
  ProjectWorkflow,
  WorkflowStatus,
} from "@/data/project-domain";

/*
 * PJ-02 grouping: Phase (default) · Status · Assignee · Milestone · None.
 * Groups keep the project's own order (phases by plan, statuses by workflow,
 * milestones by due date); empty groups are dropped. Pure.
 */

export type ProjectTaskGroupBy = "phase" | "status" | "assignee" | "milestone" | "none";

export const GROUP_OPTIONS: readonly ProjectTaskGroupBy[] = ["phase", "status", "assignee", "milestone", "none"];

export interface ProjectTaskGroup {
  id: string;
  /** Data label (phase / status / person / milestone name) or null for the "no …" bucket. */
  label: string | null;
  status?: WorkflowStatus;
  phase?: ProjectPhase;
  tasks: ProjectTask[];
  open: number;
  done: number;
}

export interface GroupContext {
  workflow: ProjectWorkflow;
  phases: readonly ProjectPhase[];
  milestones: readonly ProjectMilestone[];
}

export function isDoneStatus(workflow: ProjectWorkflow, statusId: string): boolean {
  return workflow.statuses.find((status) => status.id === statusId)?.category === "done";
}

export function groupProjectTasks(
  tasks: readonly ProjectTask[],
  by: ProjectTaskGroupBy,
  { workflow, phases, milestones }: GroupContext,
): ProjectTaskGroup[] {
  const make = (id: string, label: string | null, extra: Partial<ProjectTaskGroup> = {}): ProjectTaskGroup => ({
    id,
    label,
    tasks: [],
    open: 0,
    done: 0,
    ...extra,
  });
  const groups = new Map<string, ProjectTaskGroup>();
  const order: string[] = [];
  const ensure = (group: ProjectTaskGroup) => {
    if (!groups.has(group.id)) {
      groups.set(group.id, group);
      order.push(group.id);
    }
    return groups.get(group.id)!;
  };

  // Pre-seed the project's order so groups appear in plan order.
  if (by === "phase") for (const phase of phases) ensure(make(phase.id, phase.name, { phase }));
  if (by === "status") for (const status of workflow.statuses) ensure(make(status.id, status.name, { status }));
  if (by === "milestone") {
    for (const milestone of [...milestones].sort((a, b) => a.due.localeCompare(b.due)))
      ensure(make(milestone.id, milestone.title));
  }

  for (const task of tasks) {
    const keys: { id: string; label: string | null }[] = [];
    if (by === "phase")
      keys.push({ id: task.phaseId ?? "none", label: phases.find((phase) => phase.id === task.phaseId)?.name ?? null });
    else if (by === "status") keys.push({ id: task.statusId, label: task.statusId });
    else if (by === "milestone")
      keys.push({
        id: task.milestoneId ?? "none",
        label: milestones.find((m) => m.id === task.milestoneId)?.title ?? null,
      });
    else if (by === "assignee") {
      const people = task.assignees.filter((assignee) => assignee.state !== "declined");
      if (people.length === 0) keys.push({ id: "none", label: null });
      // A task with two assignees shows under each person.
      for (const assignee of people) keys.push({ id: assignee.person.id, label: assignee.person.name });
    } else keys.push({ id: "all", label: null });

    for (const key of keys) {
      const group = ensure(make(key.id, key.label));
      group.tasks.push(task);
      if (isDoneStatus(workflow, task.statusId)) group.done += 1;
      else group.open += 1;
    }
  }

  const result = order.map((id) => groups.get(id)!).filter((group) => group.tasks.length > 0);
  // "No milestone" / "Unassigned" buckets go last.
  return [...result.filter((group) => group.id !== "none"), ...result.filter((group) => group.id === "none")];
}
