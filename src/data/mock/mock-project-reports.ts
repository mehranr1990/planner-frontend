import type { AnalyticsRange, AnalyticsSummary, ProjectRole, ProjectTask, ProjectWorkflow } from "../project-domain";
import { CURRENT_USER_ID, isTaskDone } from "./mock-project-work";

/*
 * PJ-12 reportRepo.summary for the mock adapter: every number is a count of
 * this project's tasks, computed like the server would (SPEC definitions).
 * Completion = done / all tasks. On-time = done on/before due / done with a
 * due. Cycle time = first In progress → Done (median days). Overdue = open
 * with due < today. Weeks start on the requested weekday (Saturday fa,
 * Monday en — DECISIONS proposed default, as SPEC states). Scope per week
 * counts tasks that exist (the sample has no creation history, so scope is
 * the current total). Members get only their own "done by assignee" row,
 * Viewers none. Never reads Personal data.
 */

const DAY = 86_400_000;
const dayNumber = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / DAY;
const fromDayNumber = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
/** Local (Tehran-offset) calendar day of an instant, as the server would in the user's timezone. */
const dayOf = (instant: string) => instant.slice(0, 10);

const RANK: Record<ProjectRole, number> = { owner: 5, admin: 4, manager: 3, member: 2, viewer: 1, guest: 0 };

export interface ReportInput {
  tasks: readonly ProjectTask[];
  workflow: ProjectWorkflow;
  role: ProjectRole;
  range: AnalyticsRange;
  weekStartsOn: number;
  projectStart: string;
  today: string;
  now: string;
}

export function weekStart(day: string, weekStartsOn: number): string {
  const n = dayNumber(day);
  const weekday = new Date(n * DAY).getUTCDay();
  return fromDayNumber(n - ((weekday - weekStartsOn + 7) % 7));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function computeAnalytics({
  tasks,
  workflow,
  role,
  range,
  weekStartsOn,
  projectStart,
  today,
  now,
}: ReportInput): AnalyticsSummary {
  const done = tasks.filter((task) => isTaskDone(task, workflow));
  const open = tasks.filter((task) => !isTaskDone(task, workflow));
  const withDue = done.filter((task) => task.due && task.completedAt);
  const onTime = withDue.filter((task) => dayOf(task.completedAt!) <= task.due!).length;
  const cycles = done
    .filter((task) => task.startedAt && task.completedAt)
    .map((task) => (Date.parse(task.completedAt!) - Date.parse(task.startedAt!)) / DAY);
  const cycle = median(cycles);
  const overdue = open.filter((task) => task.due && task.due < today);
  const blockedIds = new Set(workflow.statuses.filter((status) => status.category === "blocked").map((status) => status.id));

  const current = dayNumber(weekStart(today, weekStartsOn));
  const first = dayNumber(weekStart(projectStart, weekStartsOn));
  const count = range === "4w" ? 4 : range === "12w" ? 12 : Math.max(1, (current - first) / 7 + 1);
  const weeks = Array.from({ length: count }, (_, index) => fromDayNumber(current - (count - 1 - index) * 7));
  const weekIndexOf = (instant: string) => (dayNumber(weekStart(dayOf(instant), weekStartsOn)) - dayNumber(weeks[0]!)) / 7;
  const throughput = weeks.map(() => 0);
  let before = 0;
  for (const task of done) {
    if (!task.completedAt) continue;
    const index = weekIndexOf(task.completedAt);
    if (index < 0) before += 1;
    else if (index < weeks.length) throughput[index]! += 1;
  }
  let running = before;
  const doneCumulative = throughput.map((n) => (running += n));

  const byAssigneeMap = new Map<string, { person: ProjectTask["assignees"][number]["person"]; done: number }>();
  for (const task of done) {
    for (const assignee of task.assignees) {
      if (assignee.state === "declined") continue;
      const entry = byAssigneeMap.get(assignee.person.id) ?? { person: assignee.person, done: 0 };
      entry.done += 1;
      byAssigneeMap.set(assignee.person.id, entry);
    }
  }
  const byAssignee = [...byAssigneeMap.values()].sort((a, b) => b.done - a.done);

  return {
    asOf: now,
    kpis: {
      done: done.length,
      total: tasks.length,
      onTime,
      doneWithDue: withDue.length,
      cycleMedianDays: cycle === null ? null : Math.round(cycle * 10) / 10,
      cycleSample: cycles.length,
      overdue: overdue.length,
      overdueBlocked: overdue.filter((task) => blockedIds.has(task.statusId)).length,
    },
    weeks,
    scope: weeks.map(() => tasks.length),
    doneCumulative,
    throughput,
    byStatus: workflow.statuses.map((status) => ({
      statusId: status.id,
      count: tasks.filter((task) => task.statusId === status.id).length,
    })),
    byAssignee:
      RANK[role] >= RANK.manager
        ? byAssignee
        : RANK[role] === RANK.member
          ? byAssignee.filter((entry) => entry.person.id === CURRENT_USER_ID)
          : [],
    enoughData: throughput.some((n) => n > 0),
  };
}
