import { backlogFixtures, sprintFixtures, sprintReviewFixtures, type SprintFixture } from "@/fixtures/team-sprints";
import { RepositoryError } from "../repositories";
import type { BacklogItem, SprintItem, SprintReview, TeamSprint, TeamSprintState } from "../team-domain";
import type { TeamAccessOptions, TeamBacklogRepository, TeamSprintRepository } from "../team-repositories";

/*
 * Mock sprintRepo + backlogRepo (TM-05). Only teams with Settings ›
 * Planning › Sprints on answer; others get "unsupported". Burndown and
 * velocity are computed here from item completion days, team-level only
 * (never per person). Working days follow the Iran week (Sat–Wed).
 */

export interface MockTeamSprintsOptions {
  respond<T>(value: T): Promise<T>;
  today: string;
  now: string;
  /** The team's planning mode, role rights and whether a linked project is openable (team mock). */
  team(teamId: string, options?: TeamAccessOptions): { sprints: boolean; lead: boolean; member: boolean };
  canOpenProject(projectId: string): boolean;
}

const WORK_DAYS = new Set([6, 0, 1, 2, 3]);

const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Working days from start to end inclusive (Sat–Wed). */
export function sprintDays(start: string, end: string): string[] {
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    if (WORK_DAYS.has(new Date(`${day}T00:00:00Z`).getUTCDay())) days.push(day);
  }
  return days;
}

type StoredItem = SprintItem & { completedOn?: string };

const publicItem = ({ taskId, title, source, status, estimate, assignee }: StoredItem): SprintItem => ({
  taskId,
  title,
  source,
  status,
  estimate,
  assignee,
});

/** Remaining estimate after each elapsed working day: committed minus what was done by then. */
export function burndownOf(items: readonly StoredItem[], days: readonly string[], today: string) {
  const committed = items.reduce((sum, item) => sum + item.estimate, 0);
  return days
    .filter((day) => day <= today)
    .map((day) => ({
      day,
      remaining:
        committed -
        items
          .filter((item) => item.completedOn !== undefined && item.completedOn <= day)
          .reduce((sum, item) => sum + item.estimate, 0),
    }));
}

export function createMockTeamSprints({ respond, today, now, team, canOpenProject }: MockTeamSprintsOptions) {
  const sprints = new Map<string, (SprintFixture & { items: StoredItem[] }) | null>(
    Object.entries(structuredClone(sprintFixtures)).map(([id, sprint]) => [
      id,
      { ...sprint, items: [...sprint.items] },
    ]),
  );
  const backlog = new Map<string, BacklogItem[]>(
    Object.entries(structuredClone(backlogFixtures)).map(([id, list]) => [id, [...list]]),
  );
  const queued = new Map<string, StoredItem[]>();
  const reviews = new Map<string, SprintReview[]>(
    Object.entries(structuredClone(sprintReviewFixtures)).map(([id, list]) => [id, [...list]]),
  );
  let lastNumber = new Map<string, number>(Object.entries(sprintFixtures).map(([id, sprint]) => [id, sprint.number]));

  const check = (teamId: string, options?: TeamAccessOptions, lead = false) => {
    const answer = team(teamId, options);
    if (!answer.sprints) throw new RepositoryError("unsupported", "Sprints are off for this team");
    if (lead && !answer.lead) throw new RepositoryError("forbidden", "Lead+ only");
    return answer;
  };
  const visible = (source: SprintItem["source"]) => source.kind === "team" || canOpenProject(source.projectId);
  const view = (stored: SprintFixture & { items: StoredItem[] }): TeamSprint => {
    const days = sprintDays(stored.start, stored.end);
    const items = stored.items.filter((item) => visible(item.source));
    return {
      id: stored.id,
      number: stored.number,
      goal: stored.goal,
      start: stored.start,
      end: stored.end,
      days,
      dayIndex: days.filter((day) => day <= today).length,
      committed: items.reduce((sum, item) => sum + item.estimate, 0),
      capacity: stored.capacity,
      done: items.filter((item) => item.status === "done").reduce((sum, item) => sum + item.estimate, 0),
      unit: "points",
      items: items.map(publicItem),
      burndown: burndownOf(items, days, today),
    };
  };
  const state = (teamId: string): TeamSprintState => {
    const current = sprints.get(teamId) ?? null;
    const previousEnd = current?.end ?? reviews.get(teamId)?.[0]?.end ?? today;
    const start = addDays(previousEnd, 1);
    const items = (queued.get(teamId) ?? []).map(publicItem);
    return {
      unit: "points",
      sprint: current ? view(current) : null,
      next: {
        number: (lastNumber.get(teamId) ?? 0) + 1,
        start,
        end: addDays(start, 13),
        // People capacity × working days (mock: the current sprint's figure).
        capacity: current?.capacity ?? 30,
        committed: items.reduce((sum, item) => sum + item.estimate, 0),
        items,
      },
    };
  };

  const teamSprints: TeamSprintRepository = {
    async current(teamId, options) {
      check(teamId, options);
      return respond(structuredClone(state(teamId)));
    },
    async start(teamId, input) {
      check(teamId, undefined, true);
      if (sprints.get(teamId)) throw new RepositoryError("conflict", "A sprint is already active");
      const goal = input.goal.trim();
      if (!goal) throw new RepositoryError("invalid", "Goal required");
      const next = state(teamId).next;
      sprints.set(teamId, {
        id: `sprint-${next.number}`,
        number: next.number,
        goal,
        start: next.start,
        end: next.end,
        capacity: next.capacity,
        items: (queued.get(teamId) ?? []).map((item) => ({ ...item })),
      });
      lastNumber = new Map(lastNumber).set(teamId, next.number);
      queued.delete(teamId);
      return respond(structuredClone(state(teamId)));
    },
    async complete(teamId, sprintId, moves) {
      check(teamId, undefined, true);
      const current = sprints.get(teamId);
      if (!current || current.id !== sprintId) throw new RepositoryError("conflict", "Not the active sprint");
      const shown = view(current);
      const unfinished = current.items.filter((item) => item.status !== "done");
      const toNext = unfinished.filter((item) => (moves[item.taskId] ?? "next") === "next");
      const toBacklog = unfinished.filter((item) => moves[item.taskId] === "backlog");
      queued.set(teamId, [...(queued.get(teamId) ?? []), ...toNext.map((item) => ({ ...item }))]);
      backlog.set(teamId, [
        ...toBacklog.map(({ taskId, title, source, estimate }) => ({ taskId, title, source, estimate })),
        ...(backlog.get(teamId) ?? []),
      ]);
      const review: SprintReview = {
        sprintId: current.id,
        number: current.number,
        goal: current.goal,
        start: current.start,
        end: current.end,
        committed: shown.committed,
        done: shown.done,
        unit: "points",
        movedToNext: toNext.length,
        movedToBacklog: toBacklog.length,
        completedAt: now,
      };
      reviews.set(teamId, [review, ...(reviews.get(teamId) ?? [])]);
      sprints.set(teamId, null);
      return respond(structuredClone(review));
    },
    async reviews(teamId) {
      check(teamId);
      return respond(structuredClone(reviews.get(teamId) ?? []));
    },
  };

  const teamBacklog: TeamBacklogRepository = {
    async list(teamId) {
      check(teamId);
      return respond(structuredClone((backlog.get(teamId) ?? []).filter((item) => visible(item.source))));
    },
    async rank(teamId, taskIds) {
      check(teamId, undefined, true);
      const list = backlog.get(teamId) ?? [];
      const shown = list.filter((item) => visible(item.source));
      if (taskIds.length !== shown.length || shown.some((item) => !taskIds.includes(item.taskId))) {
        throw new RepositoryError("conflict", "The backlog changed");
      }
      // Items the viewer cannot see keep their place at the end.
      const hidden = list.filter((item) => !visible(item.source));
      backlog.set(teamId, [...taskIds.map((id) => shown.find((item) => item.taskId === id)!), ...hidden]);
      return respond(structuredClone(taskIds.map((id) => shown.find((item) => item.taskId === id)!)));
    },
  };

  return { teamSprints, teamBacklog };
}
