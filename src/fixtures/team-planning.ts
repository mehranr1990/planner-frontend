/*
 * SAMPLE DATA for TM-04 Weekly planning (week W42 = Sat 10 Oct 2026; W41 =
 * Sat 3 Oct). To plan items (carry-overs, unplanned team tasks, a member's
 * project task in a project the viewer can open) and last week's review.
 * Titles are user content (not translated).
 */

import type { TeamTask, TeamWeekReview } from "@/data/team-domain";
import { projectPeople } from "./projects";
import { teamPeople } from "./teams";

export const LAST_WEEK = "2026-10-03";

const { me } = teamPeople;

const { sara } = projectPeople;

const unplanned = (id: string, title: string, estimateHours: number, extra: Partial<TeamTask> = {}): TeamTask => ({
  id,
  teamId: "design",
  title,
  status: "todo",
  priority: "medium",
  due: null,
  estimateHours,
  assignees: [],
  source: { kind: "team" },
  planWeek: null,
  progress: 0,
  blockedBy: [],
  goal: null,
  revision: 1,
  updatedAt: "2026-10-09T17:00:00+03:30",
  can: { edit: false, status: false },
  ...extra,
});

/** Merged into the team task store (they are ordinary team tasks waiting in To plan). */
export const planningTaskFixtures: readonly TeamTask[] = [
  unplanned("t-style-guide", "Illustration style guide", 6, { carriedFrom: LAST_WEEK }),
  unplanned("t-empty-polish", "Empty states polish", 4),
  unplanned("payment-errors-copy", "Payment errors copy", 3, {
    due: "2026-10-24",
    assignees: [{ person: me, state: "pending", by: sara }],
    source: { kind: "project", projectId: "website-redesign", projectName: "Website Redesign" },
  }),
  unplanned("t-proto-tests", "Prototype tests", 3, { carriedFrom: LAST_WEEK }),
];

export const weekReviewFixtures: Readonly<Record<string, TeamWeekReview>> = {
  design: {
    week: LAST_WEEK,
    weekNumber: 41,
    planned: 17,
    plannedDone: 14,
    carriedOver: 3,
    unplannedAdded: 5,
    estimateAccuracy: 82,
    unfinished: [
      { taskId: "t-style-guide", title: "Illustration style guide", decision: "this-week" },
      { taskId: "t-empty-polish", title: "Empty states polish", decision: "to-plan" },
      { taskId: "t-proto-tests", title: "Prototype tests", decision: "this-week" },
    ],
  },
  mobile: {
    week: LAST_WEEK,
    weekNumber: 41,
    planned: 8,
    plannedDone: 8,
    carriedOver: 0,
    unplannedAdded: 1,
    estimateAccuracy: 90,
    unfinished: [],
  },
  growth: {
    week: LAST_WEEK,
    weekNumber: 41,
    planned: 5,
    plannedDone: 4,
    carriedOver: 1,
    unplannedAdded: 0,
    estimateAccuracy: 76,
    unfinished: [],
  },
};
