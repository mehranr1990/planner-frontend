import type { ProjectMember, ProjectTask, ProjectWorkflow, WorkloadCell, WorkloadGrid } from "../project-domain";
import { isTaskDone } from "./mock-project-work";

/*
 * PJ-11 workload grid (D13), computed like the server would: estimates of
 * open project tasks spread evenly across start → due days (no start = the
 * due week), split between the task's assignees (pending assignments count
 * for the assignee, declined ones do not). Weeks are Iran weeks (Sat–Fri),
 * like every other project count. Only this project's tasks are read:
 * nothing from Personal (time blocks, Focus, other projects) is ever used.
 */

const DAY = 86_400_000;
const dayNumber = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / DAY;
const fromDayNumber = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

/** Saturday on or before `day`. */
export function weekStartOf(day: string): string {
  const n = dayNumber(day);
  const weekday = new Date(n * DAY).getUTCDay(); // 0 Sun … 6 Sat
  return fromDayNumber(n - ((weekday + 1) % 7));
}

export interface WorkloadInput {
  from: string;
  weeks: number;
  tasks: readonly ProjectTask[];
  workflow: ProjectWorkflow;
  members: readonly ProjectMember[];
  startOf(task: ProjectTask): string | null;
}

export function computeWorkloadGrid({ from, weeks, tasks, workflow, members, startOf }: WorkloadInput): WorkloadGrid {
  const first = dayNumber(weekStartOf(from));
  const starts = Array.from({ length: weeks }, (_, index) => first + index * 7);
  const weekIndex = (n: number) => Math.floor((n - first) / 7);
  const open = tasks.filter((task) => !isTaskDone(task, workflow));
  const empty = (): { hours: number; tasks: Map<string, number> }[] =>
    starts.map(() => ({ hours: 0, tasks: new Map<string, number>() }));
  const perPerson = new Map<string, ReturnType<typeof empty>>();
  const unestimated = new Map<string, number>();
  const unassigned = starts.map(() => ({ tasks: new Set<string>(), hours: 0 }));

  for (const task of open) {
    const people = task.assignees.filter((assignee) => assignee.state !== "declined").map((assignee) => assignee.person.id);
    if (task.estimateHours === null) {
      for (const id of people) unestimated.set(id, (unestimated.get(id) ?? 0) + 1);
      continue;
    }
    if (!task.due) continue;
    const end = dayNumber(task.due);
    const startDay = startOf(task);
    const start = startDay ? Math.min(dayNumber(startDay), end) : dayNumber(weekStartOf(task.due));
    const days = end - start + 1;
    const perDay = task.estimateHours / days;
    for (let n = start; n <= end; n += 1) {
      const index = weekIndex(n);
      if (index < 0 || index >= weeks) continue;
      if (people.length === 0) {
        unassigned[index]!.tasks.add(task.id);
        unassigned[index]!.hours += perDay;
        continue;
      }
      for (const id of people) {
        const cells = perPerson.get(id) ?? empty();
        perPerson.set(id, cells);
        const share = perDay / people.length;
        cells[index]!.hours += share;
        cells[index]!.tasks.set(task.id, (cells[index]!.tasks.get(task.id) ?? 0) + share);
      }
    }
  }

  const byId = new Map(tasks.map((task) => [task.id, task]));
  const round = (value: number) => Math.round(value);
  return {
    weeks: starts.map(fromDayNumber),
    rows: members
      .filter((member) => member.role !== "viewer")
      .map((member) => ({
        person: member.person,
        role: member.role,
        capacity: member.capacityHours,
        unestimated: unestimated.get(member.person.id) ?? 0,
        cells: (perPerson.get(member.person.id) ?? empty()).map(
          (cell): WorkloadCell => ({
            hours: round(cell.hours),
            tasks: [...cell.tasks.entries()]
              .map(([taskId, hours]) => ({
                taskId,
                title: byId.get(taskId)?.title ?? "",
                statusId: byId.get(taskId)?.statusId ?? "",
                hours: Math.max(1, round(hours)),
              }))
              .sort((a, b) => b.hours - a.hours),
          }),
        ),
      })),
    unassigned: unassigned.map((cell) => ({ tasks: cell.tasks.size, hours: round(cell.hours) })),
  };
}
