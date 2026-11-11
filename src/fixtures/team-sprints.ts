/*
 * SAMPLE DATA for TM-05 Sprint & backlog (Mobile Squad has Sprints on; the
 * viewer leads it). Sprint 14 = 6–19 Oct 2026, day 6 of 10 on Tue 13 Oct.
 * Titles and goals are user content (not translated).
 */

import type { BacklogItem, SprintItem, SprintReview, TeamTaskStatus } from "@/data/team-domain";
import { teamPeople } from "./teams";

const { me, jonathan, kian, mina, katy } = teamPeople;

export interface SprintFixture {
  id: string;
  number: number;
  goal: string;
  start: string;
  end: string;
  capacity: number;
  items: readonly (SprintItem & { completedOn?: string })[];
}

const item = (
  taskId: string,
  title: string,
  status: TeamTaskStatus,
  estimate: number,
  assignee: SprintItem["assignee"],
  completedOn?: string,
): SprintItem & { completedOn?: string } => ({
  taskId,
  title,
  source: { kind: "team" },
  status,
  estimate,
  assignee,
  ...(completedOn ? { completedOn } : {}),
});

export const sprintFixtures: Readonly<Record<string, SprintFixture>> = {
  mobile: {
    id: "sprint-14",
    number: 14,
    goal: "Make the PWA feel native",
    start: "2026-10-06",
    end: "2026-10-19",
    capacity: 30,
    items: [
      item("s-bottom-nav", "Bottom nav polish", "done", 3, jonathan, "2026-10-11"),
      item("s-quick-add", "Quick add sheet", "done", 5, me, "2026-10-13"),
      item("s-agenda", "Calendar agenda view", "in-progress", 8, jonathan),
      item("s-settings", "Settings root list", "review", 3, mina),
      item("s-refresh", "Pull to refresh", "todo", 2, katy),
      item("s-rtl", "RTL QA pass", "blocked", 5, kian),
    ],
  },
};

export const backlogFixtures: Readonly<Record<string, readonly BacklogItem[]>> = {
  mobile: [
    { taskId: "b-offline", title: "Offline banner for PWA", source: { kind: "team" }, estimate: 3 },
    { taskId: "b-push", title: "Push permission prompt", source: { kind: "team" }, estimate: 5 },
    {
      taskId: "b-deeplinks",
      title: "Deep links to tasks",
      source: { kind: "project", projectId: "mobile-onboarding", projectName: "Mobile Onboarding" },
      estimate: 8,
    },
    { taskId: "b-haptics", title: "Haptics on complete", source: { kind: "team" }, estimate: 2 },
    { taskId: "b-widget", title: "Widget prototype", source: { kind: "team" }, estimate: 8 },
    // android-sdk: the viewer has no grant in this sample → never listed.
    {
      taskId: "b-sdk",
      title: "SDK crash reporter",
      source: { kind: "project", projectId: "android-sdk", projectName: "Android SDK" },
      estimate: 5,
    },
  ],
};

export const sprintReviewFixtures: Readonly<Record<string, readonly SprintReview[]>> = {
  mobile: [
    {
      sprintId: "sprint-13",
      number: 13,
      goal: "Offline-first groundwork",
      start: "2026-09-22",
      end: "2026-10-05",
      committed: 24,
      done: 21,
      unit: "points",
      movedToNext: 1,
      movedToBacklog: 1,
      completedAt: "2026-10-05T17:30:00+03:30",
    },
  ],
};
