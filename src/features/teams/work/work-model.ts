import type { CaseFlowColumn, CaseFlowLink, CaseFlowOutcome, CaseFlowPerson } from "@/components/context/case-flow";
import type { TeamMember, TeamTask, TeamTaskStatus } from "@/data/team-domain";

/*
 * TM-02 pure model: quick filters, grouping and the Flow (CaseFlow) mapping.
 * No React, no copy: callers translate labels.
 */

export const teamWorkFilters = ["all", "mine", "week", "unassigned", "blocked", "done"] as const;
export type TeamWorkFilter = (typeof teamWorkFilters)[number];

export const teamWorkGroupings = ["plan", "status", "person", "source"] as const;
export type TeamWorkGrouping = (typeof teamWorkGroupings)[number];

const isMine = (task: TeamTask) => task.assignees.some((assignee) => assignee.person.id === "me" && assignee.state !== "declined");
const isUnassigned = (task: TeamTask) =>
  task.assignees.length === 0 || task.assignees.every((assignee) => assignee.state === "declined");

export function matchesWorkFilter(task: TeamTask, filter: TeamWorkFilter, week: string | null): boolean {
  switch (filter) {
    case "mine":
      return isMine(task) && task.status !== "done";
    case "week":
      return week !== null && task.planWeek === week;
    case "unassigned":
      return isUnassigned(task) && task.status !== "done";
    case "blocked":
      return task.status === "blocked";
    case "done":
      return task.status === "done";
    default:
      return task.status !== "done";
  }
}

export function workFilterCounts(tasks: readonly TeamTask[], week: string | null): Record<TeamWorkFilter, number> {
  return Object.fromEntries(
    teamWorkFilters.map((filter) => [filter, tasks.filter((task) => matchesWorkFilter(task, filter, week)).length]),
  ) as Record<TeamWorkFilter, number>;
}

export interface WorkGroup {
  /** "plan" | "unplanned" | a status | a person id | "team" | a project id | "nobody". */
  key: string;
  kind: "plan" | "unplanned" | "status" | "person" | "nobody" | "team" | "project";
  /** Person or project name (data), when the group is one. */
  name?: string;
  status?: TeamTaskStatus;
  tasks: TeamTask[];
}

const STATUS_ORDER: readonly TeamTaskStatus[] = ["in-progress", "review", "blocked", "todo", "done"];

export function groupTeamTasks(tasks: readonly TeamTask[], grouping: TeamWorkGrouping, week: string | null): WorkGroup[] {
  const sorted = [...tasks].sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      (a.due ?? "9999").localeCompare(b.due ?? "9999") ||
      a.title.localeCompare(b.title),
  );
  const groups = new Map<string, WorkGroup>();
  const add = (group: Omit<WorkGroup, "tasks">, task: TeamTask) => {
    const existing = groups.get(group.key);
    if (existing) existing.tasks.push(task);
    else groups.set(group.key, { ...group, tasks: [task] });
  };
  for (const task of sorted) {
    if (grouping === "plan") {
      if (week !== null && task.planWeek === week) add({ key: "plan", kind: "plan" }, task);
      else add({ key: "unplanned", kind: "unplanned" }, task);
    } else if (grouping === "status") {
      add({ key: task.status, kind: "status", status: task.status }, task);
    } else if (grouping === "person") {
      const people = task.assignees.filter((assignee) => assignee.state !== "declined");
      if (people.length === 0) add({ key: "nobody", kind: "nobody" }, task);
      for (const assignee of people) add({ key: assignee.person.id, kind: "person", name: assignee.person.name }, task);
    } else if (task.source.kind === "team") {
      add({ key: "team", kind: "team" }, task);
    } else {
      add({ key: task.source.projectId, kind: "project", name: task.source.projectName }, task);
    }
  }
  const list = [...groups.values()];
  if (grouping === "plan") return list.sort((a) => (a.kind === "plan" ? -1 : 1));
  if (grouping === "status") return list.sort((a, b) => STATUS_ORDER.indexOf(a.status!) - STATUS_ORDER.indexOf(b.status!));
  if (grouping === "person") return list.sort((a, b) => (a.kind === "nobody" ? 1 : b.kind === "nobody" ? -1 : a.name!.localeCompare(b.name!)));
  return list.sort((a) => (a.kind === "team" ? -1 : 1));
}

/** Board columns = the team's fixed status set (T4). */
export const boardColumns: readonly TeamTaskStatus[] = ["todo", "in-progress", "review", "blocked", "done"];

export interface FlowModel {
  people: CaseFlowPerson[];
  columns: (Omit<CaseFlowColumn, "label"> & { status: "todo" | "in-progress" | "review" })[];
  links: CaseFlowLink[];
  outcomes: (CaseFlowOutcome & { completedAt: string; who: string })[];
}

/**
 * TM-02 Flow: this week's plan tasks. Columns To do · In progress · Review
 * (Blocked is a row state in its stage: In progress); Done this week = outcome
 * tiles (latest highlighted). Lines = "needs" links between visible tasks.
 * People badges: open steps, red when one is blocked or waiting for
 * acceptance, check when all done, + when none.
 */
export function buildFlowModel(
  tasks: readonly TeamTask[],
  members: readonly TeamMember[],
  week: string | null,
  rowSub: (task: TeamTask) => string | undefined,
  href: (task: TeamTask) => string,
): FlowModel {
  const planned = tasks.filter((task) => week !== null && task.planWeek === week);
  const open = planned.filter((task) => task.status !== "done");
  const done = planned
    .filter((task) => task.status === "done" && task.completedAt)
    .sort((a, b) => Date.parse(b.completedAt!) - Date.parse(a.completedAt!));
  const stage = (task: TeamTask): "todo" | "in-progress" | "review" =>
    task.status === "review" ? "review" : task.status === "todo" ? "todo" : "in-progress";

  const columns = (["todo", "in-progress", "review"] as const).map((status) => ({
    id: status,
    status,
    rows: open
      .filter((task) => stage(task) === status)
      .map((task) => {
        const person = task.assignees.find((assignee) => assignee.state !== "declined")?.person;
        return {
          id: task.id,
          title: task.title,
          sub: rowSub(task),
          current: task.status === "in-progress" || task.status === "review",
          state: task.status === "blocked" ? ("blocked" as const) : ("active" as const),
          lead: person
            ? { kind: "person" as const, name: person.name, initials: person.initials }
            : { kind: "unassigned" as const },
          href: href(task),
        };
      }),
  }));

  // Upstream rows on the board are still open, so every drawn link is still waiting (dashed red).
  const visible = new Set(open.map((task) => task.id));
  const links: CaseFlowLink[] = open.flatMap((task) =>
    task.blockedBy.filter((id) => visible.has(id)).map((id) => ({ from: id, to: task.id, satisfied: false })),
  );

  const people: CaseFlowPerson[] = [...members]
    .sort((a, b) => a.person.name.localeCompare(b.person.name))
    .map((member) => {
      const theirs = planned.filter((task) =>
        task.assignees.some((assignee) => assignee.person.id === member.person.id && assignee.state !== "declined"),
      );
      const openSteps = theirs.filter((task) => task.status !== "done");
      const alert = openSteps.some(
        (task) =>
          task.status === "blocked" ||
          task.assignees.some((assignee) => assignee.person.id === member.person.id && assignee.state === "pending"),
      );
      const badge: CaseFlowPerson["badge"] =
        theirs.length === 0
          ? { kind: "none" }
          : openSteps.length === 0
            ? { kind: "done" }
            : alert
              ? { kind: "alert", n: openSteps.length }
              : { kind: "count", n: openSteps.length };
      return { id: member.person.id, name: member.person.name, initials: member.person.initials, badge };
    });

  const outcomes = done.slice(0, 4).map((task, index) => ({
    id: task.id,
    title: task.title,
    highlighted: index === 0,
    href: href(task),
    completedAt: task.completedAt!,
    who: task.assignees[0]?.person.name ?? "",
  }));

  return { people, columns, links, outcomes };
}
