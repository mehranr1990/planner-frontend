import { sampleScheduleLinks } from "@/fixtures/project-work";
import type {
  AssigneeOverlap,
  ProjectPerson,
  ProjectTask,
  ScheduleChange,
  ScheduleGraph,
  ScheduleItem,
  ScheduleLink,
  ScheduleMode,
  ScheduleMove,
  SchedulePreview,
} from "../project-domain";
import type { ScheduleRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { isTaskDone, type ProjectWorkStore } from "./mock-project-work";

/*
 * Schedule for the mock adapter (PJ-08 reschedule now, PJ-05 Gantt later):
 * dated tasks and milestones with dependency links (FS/SS/FF/SF + lag), an
 * explicit preview (never a silent cascade) and one all-or-nothing apply with
 * expected revisions (stale → "conflict"; the cascade is Manager+). The
 * backend computes this when it exists; the mock computes it locally.
 */

const DAY = 86_400_000;
export const dayNumber = (day: string) =>
  Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / DAY;
export const fromDayNumber = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

/** Mock start of a dated task: its due minus a duration from the estimate (1 day per 2h on the project, min 1). */
export function defaultTaskStart(task: Pick<ProjectTask, "due" | "estimateHours">): string | null {
  if (!task.due) return null;
  const days = Math.max(1, Math.round((task.estimateHours ?? 2) / 2));
  return fromDayNumber(dayNumber(task.due) - days + 1);
}

interface Span {
  s: number;
  e: number;
}

/** The constrained field of the successor and the earliest day it allows. */
function required(link: ScheduleLink, pred: Span): { field: "s" | "e"; day: number } {
  switch (link.type) {
    case "SS":
      return { field: "s", day: pred.s + link.lagDays };
    case "FF":
      return { field: "e", day: pred.e + link.lagDays };
    case "SF":
      return { field: "e", day: pred.s + link.lagDays };
    default:
      return { field: "s", day: pred.e + link.lagDays };
  }
}

/**
 * What `change` does to the graph. Cascade: dependents move forward only by
 * what the predecessor pushes past their existing slack (never pulled
 * earlier). Only: nothing else moves; violated links come back as conflicts.
 */
export function computePreview(graph: ScheduleGraph, change: ScheduleChange, mode: ScheduleMode): SchedulePreview {
  const byId = new Map(graph.items.map((item) => [item.id, item]));
  const changed = byId.get(change.itemId);
  if (!changed) throw new RepositoryError("not-found", `No schedule item ${change.itemId}`);
  const original = new Map<string, Span>(
    graph.items.map((item) => [item.id, { s: dayNumber(item.start), e: dayNumber(item.end) }]),
  );
  const next = new Map(original);
  const isMilestone = changed.kind === "milestone";
  next.set(change.itemId, {
    s: dayNumber(isMilestone ? change.end : change.start),
    e: dayNumber(change.end),
  });

  if (mode === "cascade") {
    const queue = [change.itemId];
    while (queue.length) {
      const predId = queue.shift()!;
      for (const link of graph.links) {
        if (link.predecessorId !== predId || !next.has(link.successorId)) continue;
        const before = required(link, original.get(predId)!);
        const after = required(link, next.get(predId)!);
        const orig = original.get(link.successorId)!;
        const current = next.get(link.successorId)!;
        const slack = Math.max(0, orig[before.field] - before.day);
        const shift = after.day - before.day - slack - (current[before.field] - orig[before.field]);
        if (shift > 0) {
          next.set(link.successorId, { s: current.s + shift, e: current.e + shift });
          queue.push(link.successorId);
        }
      }
    }
  }

  // Links that end up violated although they held before.
  const conflicts = graph.links
    .filter((link) => next.has(link.predecessorId) && next.has(link.successorId))
    .filter((link) => {
      const before = required(link, original.get(link.predecessorId)!);
      const after = required(link, next.get(link.predecessorId)!);
      const heldBefore = original.get(link.successorId)![before.field] >= before.day;
      return heldBefore && next.get(link.successorId)![after.field] < after.day;
    })
    .map((link) => link.id);

  const toMove = (item: ScheduleItem): ScheduleMove => {
    const span = next.get(item.id)!;
    return {
      id: item.id,
      kind: item.kind,
      title: item.title,
      from: { start: item.start, end: item.end },
      to: { start: fromDayNumber(span.s), end: fromDayNumber(span.e) },
      revision: item.revision,
    };
  };
  const others = graph.items.filter((item) => {
    if (item.id === change.itemId) return false;
    const a = original.get(item.id)!;
    const b = next.get(item.id)!;
    return a.s !== b.s || a.e !== b.e;
  });
  return {
    change,
    mode,
    deltaDays: dayNumber(change.end) - dayNumber(changed.end),
    moves: [toMove(changed), ...others.map(toMove)],
    conflicts,
    hasDependents: graph.links.some((link) => link.predecessorId === change.itemId),
  };
}

/** Whether `from` (transitively) depends on `on` through the links. */
export function dependsOn(links: readonly ScheduleLink[], from: string, on: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === on) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const link of links) if (link.successorId === id) stack.push(link.predecessorId);
  }
  return false;
}

/**
 * Longest chain (by days, including lags) ending at the final milestone (the
 * latest one), or at the latest-ending item when there is no milestone.
 */
export function computeCriticalPath(graph: ScheduleGraph): string[] {
  const byId = new Map(graph.items.map((item) => [item.id, item]));
  const memo = new Map<string, { length: number; via: string | null }>();
  const duration = (item: ScheduleItem) => dayNumber(item.end) - dayNumber(item.start) + 1;
  const visit = (id: string, trail: Set<string>): number => {
    const known = memo.get(id);
    if (known) return known.length;
    const item = byId.get(id);
    if (!item || trail.has(id)) return 0;
    trail.add(id);
    let best = 0;
    let via: string | null = null;
    for (const link of graph.links) {
      if (link.successorId !== id || !byId.has(link.predecessorId)) continue;
      const length = visit(link.predecessorId, trail) + Math.max(0, link.lagDays);
      if (length > best) {
        best = length;
        via = link.predecessorId;
      }
    }
    trail.delete(id);
    const total = best + duration(item);
    memo.set(id, { length: total, via });
    return total;
  };
  const milestones = graph.items.filter((item) => item.kind === "milestone").sort((a, b) => a.end.localeCompare(b.end));
  const end =
    milestones.at(-1) ?? [...graph.items].sort((a, b) => a.end.localeCompare(b.end)).at(-1);
  if (!end) return [];
  visit(end.id, new Set());
  const path: string[] = [];
  for (let id: string | null = end.id; id; id = memo.get(id)?.via ?? null) path.unshift(id);
  return path;
}

export interface MockProjectScheduleOptions {
  store: ProjectWorkStore;
  respond<T>(value: T): Promise<T>;
  now: string;
  /** Manager+ (and not archived): edit milestones and apply a cascade. */
  canManageSchedule(projectId: string): boolean;
  /** Whether the current user may edit this task's dates. */
  canEditTask(task: ProjectTask): boolean;
}

export function createMockProjectSchedule({
  store,
  respond,
  now,
  canManageSchedule,
  canEditTask,
}: MockProjectScheduleOptions) {
  const starts = new Map<string, string>();
  /** Links per project, seeded on first use from `blockedBy` + the sample links, then edited in place. */
  const linkStore = new Map<string, ScheduleLink[]>();
  let linkCounter = 0;
  const linksOf = (projectId: string): ScheduleLink[] => {
    let list = linkStore.get(projectId);
    if (!list) {
      list = [
        ...(store.tasks.get(projectId) ?? []).flatMap((task) =>
          task.blockedBy.map((predecessorId) => ({
            id: `dep:${predecessorId}>${task.id}`,
            predecessorId,
            successorId: task.id,
            type: "FS" as const,
            lagDays: 0,
          })),
        ),
        ...sampleScheduleLinks.map((link) => ({ ...link })),
      ];
      linkStore.set(projectId, list);
    }
    return list;
  };
  const manageGuard = (projectId: string) => {
    if (!canManageSchedule(projectId)) throw new RepositoryError("forbidden", "Manager+ only");
  };
  const startOf = (task: ProjectTask) => starts.get(task.id) ?? defaultTaskStart(task);

  function graph(projectId: string): ScheduleGraph {
    const tasks = (store.tasks.get(projectId) ?? []).filter((task) => task.due !== null);
    const items: ScheduleItem[] = [
      ...tasks.map((task) => ({
        id: task.id,
        kind: "task" as const,
        title: task.title,
        start: startOf(task)!,
        end: task.due!,
        revision: task.revision,
      })),
      ...(store.milestones.get(projectId) ?? []).map((milestone) => ({
        id: milestone.id,
        kind: "milestone" as const,
        title: milestone.title,
        start: milestone.due,
        end: milestone.due,
        revision: milestone.revision ?? 1,
      })),
    ];
    const ids = new Set(items.map((item) => item.id));
    const links = linksOf(projectId)
      .filter((link) => ids.has(link.predecessorId) && ids.has(link.successorId))
      .map((link) => ({ ...link }));
    return { items, links };
  }

  const schedule: ScheduleRepository = {
    graph: (projectId) => respond(graph(projectId)),
    criticalPath: (projectId) => respond(computeCriticalPath(graph(projectId))),
    async addLink(projectId, input) {
      manageGuard(projectId);
      const { items, links } = graph(projectId);
      if (!items.some((item) => item.id === input.predecessorId) || !items.some((item) => item.id === input.successorId))
        throw new RepositoryError("not-found", "Unknown item");
      if (input.predecessorId === input.successorId || dependsOn(links, input.predecessorId, input.successorId))
        throw new RepositoryError("invalid", "cycle");
      if (links.some((link) => link.predecessorId === input.predecessorId && link.successorId === input.successorId))
        throw new RepositoryError("invalid", "duplicate");
      const link = { id: `link-${++linkCounter}`, ...input };
      linksOf(projectId).push(link);
      return respond(link);
    },
    async updateLink(projectId, linkId, { type, lagDays }) {
      manageGuard(projectId);
      const link = linksOf(projectId).find((item) => item.id === linkId);
      if (!link) throw new RepositoryError("not-found", `No link ${linkId}`);
      link.type = type;
      link.lagDays = lagDays;
      return respond({ ...link });
    },
    async removeLink(projectId, linkId) {
      manageGuard(projectId);
      const list = linksOf(projectId);
      const index = list.findIndex((item) => item.id === linkId);
      if (index < 0) throw new RepositoryError("not-found", `No link ${linkId}`);
      list.splice(index, 1);
      return respond(undefined);
    },
    overlaps: (projectId) => {
      const workflow = store.workflow(projectId);
      const open = (store.tasks.get(projectId) ?? []).filter((task) => task.due !== null && !isTaskDone(task, workflow));
      const byPerson = new Map<string, { person: ProjectPerson; tasks: ProjectTask[] }>();
      for (const task of open)
        for (const assignee of task.assignees) {
          if (assignee.state === "declined") continue;
          const entry = byPerson.get(assignee.person.id) ?? { person: assignee.person, tasks: [] };
          entry.tasks.push(task);
          byPerson.set(assignee.person.id, entry);
        }
      const result: AssigneeOverlap[] = [];
      for (const { person, tasks } of byPerson.values()) {
        const ids = new Set<string>();
        let pairs = 0;
        tasks.forEach((a, index) =>
          tasks.slice(index + 1).forEach((b) => {
            if (startOf(a)! <= b.due! && startOf(b)! <= a.due!) {
              pairs += 1;
              ids.add(a.id);
              ids.add(b.id);
            }
          }),
        );
        if (pairs > 0) result.push({ person, taskIds: [...ids], pairs });
      }
      return respond(result);
    },
    preview: async (projectId, change, mode) => respond(computePreview(graph(projectId), change, mode)),
    async apply(projectId, moves) {
      if (moves.length === 0) return respond(undefined);
      if (moves.length > 1 && !canManageSchedule(projectId)) {
        throw new RepositoryError("forbidden", "Applying a cascade is Manager+");
      }
      const milestones = store.milestones.get(projectId) ?? [];
      // Check every expected revision first: all or nothing.
      const targets = moves.map((move) => {
        if (move.kind === "milestone") {
          const milestone = milestones.find((item) => item.id === move.id);
          if (!milestone) throw new RepositoryError("not-found", `No milestone ${move.id}`);
          if (!canManageSchedule(projectId)) throw new RepositoryError("forbidden", "Manager+ only");
          if ((milestone.revision ?? 1) !== move.revision) throw new RepositoryError("conflict", `${move.id} changed`);
          return { move, milestone };
        }
        const task = store.findTask(move.id);
        if (!task || task.projectId !== projectId) throw new RepositoryError("not-found", `No task ${move.id}`);
        if (!canEditTask(task)) throw new RepositoryError("forbidden", "Not allowed for your role");
        if (task.revision !== move.revision) throw new RepositoryError("conflict", `${move.id} changed`);
        return { move, task };
      });
      for (const target of targets) {
        if ("milestone" in target && target.milestone) {
          target.milestone.due = target.move.to.end;
          target.milestone.revision = (target.milestone.revision ?? 1) + 1;
        } else if ("task" in target && target.task) {
          target.task.due = target.move.to.end;
          starts.set(target.task.id, target.move.to.start);
          target.task.revision += 1;
          target.task.updatedAt = now;
        }
      }
      return respond(undefined);
    },
  };
  return { schedule };
}
