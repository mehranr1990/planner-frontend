import { FIRST_HISTORY_WEEK, teamPlanHistory, type TeamPlanHistory } from "@/fixtures/team-analytics";
import { teamGoalPeriods } from "@/fixtures/team-goals";
import { RepositoryError } from "../repositories";
import type { TeamAnalyticsRange, TeamAnalyticsSummary, TeamAnalyticsWeek, TeamCapacityEntry, TeamRole } from "../team-domain";
import type { TeamReportRepository } from "../team-repositories";
import { checkinWeekOf } from "./mock-team-checkins";

/*
 * Mock teamReportRepo (TM-12). Team-level numbers only (no per-person
 * series). Past weeks come from the plan history fixture, the current week
 * live from the week plan. Plan completion = planned done / planned;
 * carried = moved to next week / planned; capacity booked = avg(booked ÷
 * capacity) over members with capacity. The done-task mix names only
 * projects the viewer can open; the rest is one "Other projects" number for
 * Lead/Admin (Owner/Admin/Lead), else left out entirely.
 */

const DAY = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface TeamAnalyticsInput {
  range: TeamAnalyticsRange;
  history: TeamPlanHistory;
  firstWeek: string;
  current: { week: string; weekNumber: number; planned: number; done: number };
  /** Saturday of the week holding the current quarter's first day. */
  quarterWeek: string;
  capacities: readonly TeamCapacityEntry[];
  projectName(projectId: string): string | undefined;
  seeOther: boolean;
  asOf: string;
}

export function computeTeamAnalytics(input: TeamAnalyticsInput): TeamAnalyticsSummary {
  const { history, current } = input;
  const past: (TeamAnalyticsWeek & { carried: number })[] = history.planned.map((planned, index) => ({
    week: isoDay(Date.parse(`${input.firstWeek}T00:00:00Z`) + index * 7 * DAY),
    weekNumber: current.weekNumber - (history.planned.length - index),
    planned,
    done: history.done[index] ?? 0,
    carried: history.carried[index] ?? 0,
    current: false,
  }));
  const all = [...past, { ...current, carried: 0, current: true }];
  const shown =
    input.range === "4w" ? all.slice(-4) : input.range === "12w" ? all.slice(-12) : all.filter((week) => week.week >= input.quarterWeek);
  const planned = shown.reduce((sum, week) => sum + week.planned, 0);
  const plannedDone = shown.reduce((sum, week) => sum + week.done, 0);
  const carried = shown.reduce((sum, week) => sum + week.carried, 0);
  const withCapacity = input.capacities.filter((entry) => entry.capacityHours > 0);
  const factor = shown.length / 12;
  const projects: { projectId: string; name: string; count: number }[] = [];
  let other = 0;
  let team = 0;
  for (const [source, count] of Object.entries(history.mix12w)) {
    const scaled = Math.round(count * factor);
    if (source === "team") {
      team = scaled;
      continue;
    }
    const name = input.projectName(source);
    if (name) projects.push({ projectId: source, name, count: scaled });
    else other += scaled;
  }
  return {
    range: input.range,
    weeks: shown.map((week) => ({
      week: week.week,
      weekNumber: week.weekNumber,
      planned: week.planned,
      done: week.done,
      current: week.current,
    })),
    planned,
    plannedDone,
    carried,
    cycleMedianDays: plannedDone > 0 ? history.cycleMedianDays : null,
    cycleSample: plannedDone,
    capacityBooked: withCapacity.length
      ? Math.round((withCapacity.reduce((sum, entry) => sum + entry.bookedHours / entry.capacityHours, 0) / withCapacity.length) * 100)
      : null,
    mix: { team, projects: projects.sort((a, b) => b.count - a.count), other: input.seeOther && other > 0 ? other : null },
    asOf: input.asOf,
  };
}

export interface MockTeamReportsOptions {
  respond<T>(value: T): Promise<T>;
  today: string;
  now: string;
  team(teamId: string): { role: TeamRole };
  currentPlan(teamId: string): { week: string; weekNumber: number; planned: number; done: number };
  capacities(teamId: string): readonly TeamCapacityEntry[];
  projectName(projectId: string): string | undefined;
}

export function createMockTeamReports(options: MockTeamReportsOptions): TeamReportRepository {
  const { respond, today, now } = options;
  const period = teamGoalPeriods.find((item) => item.start <= today && today <= item.end);
  return {
    async summary(teamId, range, preview = {}) {
      const { role } = options.team(teamId);
      const history = teamPlanHistory[teamId];
      if (!history) throw new RepositoryError("not-found", "No reports for this team");
      const viewer = preview.previewRole ?? role;
      return respond(
        computeTeamAnalytics({
          range,
          history,
          firstWeek: FIRST_HISTORY_WEEK,
          current: options.currentPlan(teamId),
          quarterWeek: checkinWeekOf(period?.start ?? today),
          capacities: options.capacities(teamId),
          projectName: options.projectName,
          seeOther: viewer === "owner" || viewer === "admin" || viewer === "lead",
          asOf: now,
        }),
      );
    },
  };
}
