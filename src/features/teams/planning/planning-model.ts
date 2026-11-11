import type { TeamCapabilities, TeamMember, TeamTask } from "@/data/team-domain";

/*
 * TM-04 pure planning model: people columns with booked / capacity (T6:
 * estimates of team + project tasks planned this week ÷ weekly capacity),
 * the plan summary, and who may move which task where. No React, no copy.
 */

export const holderOf = (task: TeamTask) => task.assignees.find((assignee) => assignee.state !== "declined") ?? null;

export const addWeeks = (week: string, weeks: number): string => {
  const date = new Date(`${week}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
};

export interface PlanColumn {
  member: TeamMember;
  tasks: TeamTask[];
  bookedHours: number;
  /** Weekly capacity from People (null = not visible to the viewer). */
  capacityHours: number | null;
  over: boolean;
}

export function planColumns(
  members: readonly TeamMember[],
  planned: readonly TeamTask[],
  capacity: ReadonlyMap<string, number> | null,
): PlanColumn[] {
  return [...members]
    .sort((a, b) => a.person.name.localeCompare(b.person.name))
    .map((member) => {
      const tasks = planned.filter((task) => holderOf(task)?.person.id === member.person.id);
      const bookedHours = tasks.reduce((sum, task) => sum + (task.estimateHours ?? 0), 0);
      const capacityHours = capacity ? (capacity.get(member.person.id) ?? null) : null;
      return { member, tasks, bookedHours, capacityHours, over: capacityHours !== null && bookedHours > capacityHours };
    });
}

export function planSummary(columns: readonly PlanColumn[], planned: readonly TeamTask[]) {
  return {
    tasks: planned.length,
    hours: planned.reduce((sum, task) => sum + (task.estimateHours ?? 0), 0),
    capacity: columns.reduce((sum, column) => sum + (column.capacityHours ?? 0), 0),
    over: columns.filter((column) => column.over),
    unassigned: planned.filter((task) => holderOf(task) === null).length,
  };
}

/** Lead+ plan any task; Members only their own (or unassigned ones, for themselves). */
export function canPlanTask(task: TeamTask, capabilities: TeamCapabilities): boolean {
  if (capabilities.editWeekFocus) return true;
  if (!capabilities.createTask) return false;
  const holder = holderOf(task);
  return holder === null || holder.person.id === "me";
}

/** Where a task may go: "toplan" or a person id. Project tasks keep their project assignee. */
export function planTargets(task: TeamTask, capabilities: TeamCapabilities, memberIds: readonly string[]): string[] {
  if (!canPlanTask(task, capabilities)) return [];
  const holder = holderOf(task)?.person.id ?? null;
  const people =
    task.source.kind === "project"
      ? holder
        ? [holder]
        : []
      : capabilities.editWeekFocus
        ? [...memberIds]
        : memberIds.filter((id) => id === "me");
  const here = task.planWeek === null ? "toplan" : holder;
  return ["toplan", ...people].filter((target) => target !== here);
}
