import type {
  ProjectMember,
  ProjectTask,
  ProjectWorkflow,
  WorkloadCell,
  WorkloadGrid,
  WorkloadPeriod,
  WorkloadPeriodUnit,
} from "../project-domain";
import type { CalendarSystem } from "@/lib/dates/format";
import { dayToLocalDate, localDateToDay } from "@/lib/dates/clock-time";
import { addCalendarMonths, startOfCalendarMonth } from "@/lib/dates/month-grid";
import { isTaskDone } from "./mock-project-work";

/*
 * PJ-11 workload grid (D13), computed like the server would: estimates of
 * open project tasks spread evenly across start → due days (no start = the
 * due week), split between the task's assignees (pending assignments count
 * for the assignee, declined ones do not). Columns are Iran weeks (Sat–Fri),
 * like every other project count, or calendar months in the user's calendar
 * (Jalali months in Shamsi, Gregorian otherwise; owner decision). Each column
 * also counts the open assigned tasks active in it (Task count mode; tasks
 * without an estimate included, tasks without a due day have no place).
 * Only this project's tasks are read: nothing from Personal (time blocks,
 * Focus, other projects) is ever used.
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

const period = (start: number, end: number): WorkloadPeriod => ({
  start: fromDayNumber(start),
  end: fromDayNumber(end),
  weeks: (end - start + 1) / 7,
});

/** `count` Iran weeks from the week containing `from`. */
export function weekPeriods(from: string, count: number): WorkloadPeriod[] {
  const first = dayNumber(weekStartOf(from));
  return Array.from({ length: count }, (_, index) => period(first + index * 7, first + index * 7 + 6));
}

/** `count` whole calendar months from the month containing `from`; weeks = days / 7. */
export function monthPeriods(from: string, count: number, calendar: CalendarSystem): WorkloadPeriod[] {
  const first = startOfCalendarMonth(dayToLocalDate(from), calendar);
  return Array.from({ length: count }, (_, index) => {
    const start = dayNumber(localDateToDay(addCalendarMonths(first, index, calendar)));
    const next = dayNumber(localDateToDay(addCalendarMonths(first, index + 1, calendar)));
    return period(start, next - 1);
  });
}

export function workloadPeriods(
  from: string,
  unit: WorkloadPeriodUnit,
  count: number,
  calendar: CalendarSystem,
): WorkloadPeriod[] {
  return unit === "month" ? monthPeriods(from, count, calendar) : weekPeriods(from, count);
}

export interface WorkloadInput {
  periods: readonly WorkloadPeriod[];
  unit?: WorkloadPeriodUnit;
  tasks: readonly ProjectTask[];
  workflow: ProjectWorkflow;
  members: readonly ProjectMember[];
  startOf(task: ProjectTask): string | null;
}

interface Bucket {
  hours: number;
  /** taskId → hours share (null = no estimate). */
  tasks: Map<string, number | null>;
}

export function computeWorkloadGrid({ periods, unit = "week", tasks, workflow, members, startOf }: WorkloadInput): WorkloadGrid {
  const bounds = periods.map((entry) => [dayNumber(entry.start), dayNumber(entry.end)] as const);
  const indexOf = (n: number) => bounds.findIndex(([start, end]) => n >= start && n <= end);
  const open = tasks.filter((task) => !isTaskDone(task, workflow));
  const empty = (): Bucket[] => periods.map(() => ({ hours: 0, tasks: new Map() }));
  const perPerson = new Map<string, Bucket[]>();
  const unestimated = new Map<string, number>();
  const unassigned = periods.map(() => ({ estimated: new Set<string>(), all: new Set<string>(), hours: 0 }));

  for (const task of open) {
    const people = task.assignees.filter((assignee) => assignee.state !== "declined").map((assignee) => assignee.person.id);
    const estimate = task.estimateHours;
    if (estimate === null) for (const id of people) unestimated.set(id, (unestimated.get(id) ?? 0) + 1);
    if (!task.due) continue;
    const end = dayNumber(task.due);
    const startDay = startOf(task);
    const start = startDay ? Math.min(dayNumber(startDay), end) : dayNumber(weekStartOf(task.due));
    const perDay = estimate === null ? 0 : estimate / (end - start + 1);
    for (let n = start; n <= end; n += 1) {
      const index = indexOf(n);
      if (index < 0) continue;
      if (people.length === 0) {
        const cell = unassigned[index]!;
        cell.all.add(task.id);
        if (estimate !== null) {
          cell.estimated.add(task.id);
          cell.hours += perDay;
        }
        continue;
      }
      for (const id of people) {
        const cells = perPerson.get(id) ?? empty();
        perPerson.set(id, cells);
        const bucket = cells[index]!;
        if (estimate === null) {
          bucket.tasks.set(task.id, null);
          continue;
        }
        const share = perDay / people.length;
        bucket.hours += share;
        bucket.tasks.set(task.id, (bucket.tasks.get(task.id) ?? 0) + share);
      }
    }
  }

  const byId = new Map(tasks.map((task) => [task.id, task]));
  const round = (value: number) => Math.round(value);
  return {
    unit,
    weeks: periods.map((entry) => entry.start),
    periods,
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
            count: cell.tasks.size,
            tasks: [...cell.tasks.entries()]
              .map(([taskId, hours]) => ({
                taskId,
                title: byId.get(taskId)?.title ?? "",
                statusId: byId.get(taskId)?.statusId ?? "",
                hours: hours === null ? null : Math.max(1, round(hours)),
              }))
              .sort((a, b) => (b.hours ?? -1) - (a.hours ?? -1)),
          }),
        ),
      })),
    unassigned: unassigned.map((cell) => ({ tasks: cell.estimated.size, hours: round(cell.hours), count: cell.all.size })),
  };
}
