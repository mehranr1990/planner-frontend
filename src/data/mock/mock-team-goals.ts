import { CURRENT_GOAL_PERIOD, teamGoalFixtures, teamGoalPeriods, type TeamGoalSeed } from "@/fixtures/team-goals";
import { RepositoryError } from "../repositories";
import type {
  TeamCapabilities,
  TeamGoal,
  TeamGoalPace,
  TeamKeyResult,
  TeamPerson,
  TeamTask,
  TeamTaskStatus,
} from "../team-domain";
import type { TeamAccessOptions, TeamGoalRepository } from "../team-repositories";

/*
 * Mock teamGoalRepo (TM-07). Auto key results = base + live count of the
 * team's tasks linked to the goal; linked-task KRs follow the task status;
 * manual KRs carry who/when. Progress = mean of KR ratios; pace compares it
 * with the share of the period elapsed. Linked work counts only what the
 * viewer can see (project counts only for projects they can open). Personal
 * goals never appear here.
 */

export interface MockTeamGoalsOptions {
  respond<T>(value: T): Promise<T>;
  today: string;
  now: string;
  tasks: () => readonly TeamTask[];
  members(teamId: string): readonly TeamPerson[];
  capabilities(teamId: string, options?: TeamAccessOptions): TeamCapabilities;
  canOpenProject(projectId: string): boolean;
  projectName(projectId: string): string;
}

const STATUS_RATIO: Record<TeamTaskStatus, number> = {
  todo: 0,
  blocked: 0.25,
  "in-progress": 0.5,
  review: 0.9,
  done: 1,
};

const day = (value: string) => Date.parse(`${value}T00:00:00Z`);

export function paceOf(progress: number, expected: number): TeamGoalPace {
  if (progress >= expected - 0.05) return "on-pace";
  if (progress >= expected - 0.15) return "slightly-behind";
  return "behind";
}

export function createMockTeamGoals(options: MockTeamGoalsOptions): TeamGoalRepository {
  const { respond, today, now, tasks, members, capabilities, canOpenProject, projectName } = options;
  const goals: TeamGoalSeed[] = structuredClone([...teamGoalFixtures]);
  let counter = 0;

  const view = (seed: TeamGoalSeed, preview?: TeamAccessOptions): TeamGoal => {
    const people = members(seed.teamId);
    const person = (id: string | null) => (id ? (people.find((item) => item.id === id) ?? null) : null);
    const caps = capabilities(seed.teamId, preview);
    const linkedTasks = tasks().filter((task) => task.teamId === seed.teamId && task.goal?.id === seed.id);
    const keyResults = seed.keyResults.map((kr): TeamKeyResult => {
      if (kr.kind === "auto") {
        const own = linkedTasks.filter((task) => task.source.kind === "team");
        return {
          id: kr.id,
          title: kr.title,
          current: kr.done + own.filter((task) => task.status === "done").length,
          target: kr.total + own.length,
          source: { kind: "auto", tag: kr.tag },
          canUpdate: false,
        };
      }
      if (kr.kind === "task") {
        const task = tasks().find((item) => item.id === kr.taskId);
        const status = task?.status ?? "todo";
        return {
          id: kr.id,
          title: kr.title,
          current: STATUS_RATIO[status],
          target: 1,
          source: { kind: "task", taskId: kr.taskId, taskTitle: task?.title ?? kr.title, status },
          canUpdate: false,
        };
      }
      return {
        id: kr.id,
        title: kr.title,
        current: kr.current,
        target: kr.target,
        source: {
          kind: "manual",
          owner: person(kr.ownerId),
          updatedBy: person(kr.updatedById),
          updatedAt: kr.updatedAt,
        },
        canUpdate: caps.editAnyTask || (caps.createTask && kr.ownerId === "me"),
      };
    });
    const ratios = keyResults.map((kr) => (kr.target > 0 ? Math.min(1, kr.current / kr.target) : 0));
    const progress = ratios.length ? ratios.reduce((sum, value) => sum + value, 0) / ratios.length : 0;
    const period = teamGoalPeriods.find((item) => item.id === seed.periodId)!;
    const expected = Math.min(
      1,
      Math.max(0, (day(today) - day(period.start)) / Math.max(1, day(seed.dueDay) - day(period.start))),
    );
    return {
      id: seed.id,
      title: seed.title,
      owner: person(seed.ownerId) ?? { id: seed.ownerId, name: seed.ownerId, initials: "?" },
      period: { id: period.id, quarter: period.quarter, year: period.year },
      dueDay: seed.dueDay,
      progress,
      expected,
      pace: progress >= 1 ? "on-pace" : paceOf(progress, expected),
      keyResults,
      linked: {
        team: linkedTasks.filter((task) => task.source.kind === "team").length,
        projects: Object.entries(seed.projectLinks)
          .filter(([projectId]) => canOpenProject(projectId))
          .map(([projectId, count]) => ({ projectId, projectName: projectName(projectId), count })),
      },
      lifecycle: "active",
    };
  };
  const find = (goalId: string) => {
    const seed = goals.find((item) => item.id === goalId);
    if (!seed) throw new RepositoryError("not-found", "Goal not found");
    return seed;
  };

  return {
    async list(teamId, preview) {
      capabilities(teamId, preview);
      return respond({
        goals: goals.filter((seed) => seed.teamId === teamId).map((seed) => view(seed, preview)),
        periods: teamGoalPeriods.map(({ id, quarter, year }) => ({ id, quarter, year })),
        current: CURRENT_GOAL_PERIOD,
      });
    },
    async get(goalId, preview) {
      return respond(view(find(goalId), preview));
    },
    async create(teamId, input) {
      if (!capabilities(teamId).editAnyTask) throw new RepositoryError("forbidden", "Lead+ only");
      const title = input.title.trim();
      if (!title) throw new RepositoryError("invalid", "Title required");
      if (!teamGoalPeriods.some((period) => period.id === input.periodId))
        throw new RepositoryError("invalid", "Unknown period");
      counter += 1;
      const seed: TeamGoalSeed = {
        id: `goal-new-${counter}`,
        teamId,
        title,
        ownerId: "me",
        periodId: input.periodId,
        dueDay: input.dueDay,
        keyResults: [],
        projectLinks: {},
      };
      goals.push(seed);
      return respond(view(seed));
    },
    async update(goalId, values) {
      const seed = find(goalId);
      const shown = view(seed);
      for (const [krId, value] of Object.entries(values)) {
        const kr = seed.keyResults.find((item) => item.id === krId);
        if (!kr || kr.kind !== "manual") throw new RepositoryError("invalid", "Only manual key results take numbers");
        if (!shown.keyResults.find((item) => item.id === krId)?.canUpdate)
          throw new RepositoryError("forbidden", "Not your key result");
        if (!Number.isFinite(value) || value < 0) throw new RepositoryError("invalid", "Bad number");
        Object.assign(kr, { current: value, updatedById: "me", updatedAt: now });
      }
      return respond(view(seed));
    },
  };
}
