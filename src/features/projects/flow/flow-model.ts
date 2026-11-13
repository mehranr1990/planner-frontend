import type { CaseFlowLink, CaseFlowPerson, CaseFlowRow } from "@/components/context/case-flow";
import type { MilestoneRow, ProjectPerson, ProjectTask, ProjectWorkflow, WorkflowStatus } from "@/data/project-domain";

/*
 * PJ-06 Flow view model (D20, design/project-update/PEOPLE_FLOW.md §2): the
 * project's tasks of one filter as CaseFlow data. Pure; copy comes from the
 * caller.
 *
 * - Columns = published workflow statuses except Done (category) and Blocked;
 *   Blocked is a row state, its rows sit in the first active column.
 * - Rows = open tasks of the filter (optionally one person's).
 * - Links = task dependencies ("needs", same data as Gantt): upstream done =
 *   satisfied (solid), upstream open = waiting (dashed red). Only links whose
 *   upstream is on the board (a row or a Done tile) are drawn.
 * - Outcomes = Done tasks of the filter, most recent first and highlighted,
 *   then the milestone tile.
 * - People = project members, involved first; badge from their open tasks.
 */

export type FlowFilter = { kind: "all" } | { kind: "mine" } | { kind: "milestone"; id: string };

export function parseFlowFilter(value: string | null, milestones: readonly MilestoneRow[]): FlowFilter {
  if (value === "all") return { kind: "all" };
  if (value === "mine") return { kind: "mine" };
  if (value && milestones.some((row) => row.milestone.id === value)) return { kind: "milestone", id: value };
  // Default: the nearest at-risk milestone, else All.
  const risk = milestones
    .filter((row) => row.status === "risk")
    .sort((a, b) => a.milestone.due.localeCompare(b.milestone.due))[0];
  return risk ? { kind: "milestone", id: risk.milestone.id } : { kind: "all" };
}

export function flowFilterValue(filter: FlowFilter): string {
  return filter.kind === "milestone" ? filter.id : filter.kind;
}

export interface FlowRowFacts {
  task: ProjectTask;
  blocked: boolean;
  pending: boolean;
  unassigned: boolean;
  /** Titles of open upstream tasks (what it still needs). */
  waitingOn: readonly string[];
}

export interface ProjectFlowModel {
  columns: { status: WorkflowStatus; rows: (CaseFlowRow & { facts: FlowRowFacts })[] }[];
  links: CaseFlowLink[];
  people: CaseFlowPerson[];
  done: readonly ProjectTask[];
  milestone: MilestoneRow | null;
  /** Tasks in the filter and how many are done (footnote). */
  total: number;
  doneCount: number;
}

interface BuildInput {
  workflow: ProjectWorkflow;
  /** Every task the user can see (upstream titles, milestone / all filters). */
  all: readonly ProjectTask[];
  /** The server's "My tasks" view (open tasks assigned to the current user). */
  mine: readonly ProjectTask[];
  members: readonly ProjectPerson[];
  milestones: readonly MilestoneRow[];
  filter: FlowFilter;
  person: string | null;
  today: string;
  href: (task: ProjectTask) => string;
  maxOutcomes?: number;
}

const activeAssignees = (task: ProjectTask) => task.assignees.filter((assignee) => assignee.state !== "declined");

export function buildProjectFlow({
  workflow,
  all,
  mine,
  members,
  milestones,
  filter,
  person,
  today,
  href,
  maxOutcomes = 4,
}: BuildInput): ProjectFlowModel {
  const statusOf = new Map(workflow.statuses.map((status) => [status.id, status]));
  const category = (task: ProjectTask) => statusOf.get(task.statusId)?.category;
  const isDone = (task: ProjectTask) => category(task) === "done";
  const isBlocked = (task: ProjectTask) => category(task) === "blocked";
  const byId = new Map(all.map((task) => [task.id, task]));

  const inFilter =
    filter.kind === "mine"
      ? mine
      : filter.kind === "milestone"
        ? all.filter((task) => task.milestoneId === filter.id)
        : all;
  const relevant = inFilter.filter((task) => category(task) !== "canceled");
  const open = relevant.filter((task) => !isDone(task));
  const rowsOf = person
    ? open.filter((task) => activeAssignees(task).some((assignee) => assignee.person.id === person))
    : open;
  const done = relevant
    .filter((task) => isDone(task))
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  const stages = workflow.statuses.filter((status) => status.category !== "done" && status.category !== "blocked" && status.category !== "canceled");
  const firstActive = stages.find((status) => status.category === "active") ?? stages[0];

  const facts = (task: ProjectTask): FlowRowFacts => {
    const assignees = activeAssignees(task);
    return {
      task,
      blocked: isBlocked(task),
      pending: assignees.some((assignee) => assignee.state === "pending"),
      unassigned: assignees.length === 0,
      waitingOn: task.blockedBy
        .map((id) => byId.get(id))
        .filter((upstream): upstream is ProjectTask => upstream !== undefined && !isDone(upstream))
        .map((upstream) => upstream.title),
    };
  };

  const toRow = (task: ProjectTask): CaseFlowRow & { facts: FlowRowFacts } => {
    const lead = activeAssignees(task)[0]?.person;
    const cat = category(task);
    return {
      id: task.id,
      title: task.title,
      current: cat === "active" || cat === "review",
      state: isBlocked(task) ? "blocked" : cat === "active" || cat === "review" ? "active" : "none",
      lead: lead ? { kind: "person", name: lead.name, initials: lead.initials } : { kind: "unassigned" },
      href: href(task),
      facts: facts(task),
    };
  };

  const columns = stages.map((status) => ({
    status,
    rows: rowsOf
      .filter((task) => (isBlocked(task) ? status.id === firstActive?.id : task.statusId === status.id))
      .map(toRow),
  }));

  const outcomes = done.slice(0, Math.max(0, maxOutcomes - (filter.kind === "milestone" ? 1 : 0)));
  const onBoard = new Set([...rowsOf, ...outcomes].map((task) => task.id));
  const links: CaseFlowLink[] = rowsOf.flatMap((task) =>
    task.blockedBy
      .filter((id) => onBoard.has(id))
      .map((id) => ({ from: id, to: task.id, satisfied: isDone(byId.get(id)!) })),
  );

  const people: CaseFlowPerson[] = members
    .map((member) => {
      const theirs = relevant.filter((task) => activeAssignees(task).some((assignee) => assignee.person.id === member.id));
      const openSteps = theirs.filter((task) => !isDone(task));
      const alert = openSteps.some(
        (task) =>
          isBlocked(task) ||
          (task.due !== null && task.due < today) ||
          task.assignees.some((assignee) => assignee.person.id === member.id && assignee.state === "pending") ||
          facts(task).waitingOn.length > 0,
      );
      const badge: CaseFlowPerson["badge"] =
        theirs.length === 0
          ? { kind: "none" }
          : openSteps.length === 0
            ? { kind: "done" }
            : alert
              ? { kind: "alert", n: openSteps.length }
              : { kind: "count", n: openSteps.length };
      return { id: member.id, name: member.name, initials: member.initials, badge };
    })
    .sort((a, b) => Number(a.badge.kind === "none") - Number(b.badge.kind === "none"));

  return {
    columns,
    links,
    people,
    done: outcomes,
    milestone: filter.kind === "milestone" ? (milestones.find((row) => row.milestone.id === filter.id) ?? null) : null,
    total: relevant.length,
    doneCount: done.length,
  };
}
