/*
 * SAMPLE DATA for TM-07 Team goals (today Tue 13 Oct 2026 = 21 Mehr 1405).
 * Periods are Jalali quarters (Q4 1405 = 1 Mehr – 30 Azar here, as on the
 * board). Titles, tags and owners are user content. Auto key results add
 * the live count of linked team tasks (goal id) to the base below.
 */

import type { TeamGoalPeriod } from "@/data/team-domain";

export const teamGoalPeriods: readonly (TeamGoalPeriod & { start: string; end: string })[] = [
  { id: "q3-1405", quarter: 3, year: 1405, start: "2026-06-22", end: "2026-09-22" },
  { id: "q4-1405", quarter: 4, year: 1405, start: "2026-09-23", end: "2026-12-20" },
];

export const CURRENT_GOAL_PERIOD = "q4-1405";

export type TeamKrSeed =
  | { id: string; title: string; kind: "auto"; tag: string; done: number; total: number }
  | { id: string; title: string; kind: "task"; taskId: string }
  | {
      id: string;
      title: string;
      kind: "manual";
      current: number;
      target: number;
      ownerId: string | null;
      updatedById: string | null;
      updatedAt: string | null;
    };

export interface TeamGoalSeed {
  id: string;
  teamId: string;
  title: string;
  ownerId: string;
  periodId: string;
  dueDay: string;
  keyResults: readonly TeamKrSeed[];
  /** Linked tasks per project (shown only for projects the viewer can open). */
  projectLinks: Readonly<Record<string, number>>;
}

export const teamGoalFixtures: readonly TeamGoalSeed[] = [
  {
    id: "design-system-v2",
    teamId: "design",
    title: "Ship design system v2",
    ownerId: "harry",
    periodId: "q4-1405",
    dueDay: "2026-12-20",
    keyResults: [
      { id: "kr-components", title: "Components migrated", kind: "auto", tag: "DS v2", done: 33, total: 56 },
      { id: "kr-icons", title: "Icon set v2 shipped", kind: "task", taskId: "t-icons" },
      {
        id: "kr-docs",
        title: "Docs pages published",
        kind: "manual",
        current: 6,
        target: 15,
        ownerId: "sarah",
        updatedById: "sarah",
        updatedAt: "2026-10-11T12:00:00+03:30",
      },
    ],
    projectLinks: { "planner-app": 4, "partner-portal": 3 },
  },
  {
    id: "onboarding-dropoff",
    teamId: "design",
    title: "Halve onboarding drop-off",
    ownerId: "amelie",
    periodId: "q4-1405",
    dueDay: "2026-12-20",
    keyResults: [
      {
        id: "kr-variants",
        title: "Variants tested",
        kind: "manual",
        current: 1,
        target: 3,
        ownerId: "amelie",
        updatedById: "amelie",
        updatedAt: "2026-10-12T16:00:00+03:30",
      },
      { id: "kr-onboarding", title: "Onboarding fixes shipped", kind: "auto", tag: "onboarding", done: 1, total: 6 },
    ],
    projectLinks: { "website-redesign": 2 },
  },
  {
    id: "accessible-default",
    teamId: "design",
    title: "Accessible by default",
    ownerId: "sarah",
    periodId: "q4-1405",
    dueDay: "2026-12-20",
    keyResults: [
      {
        id: "kr-audited",
        title: "Screens audited",
        kind: "manual",
        current: 28,
        target: 40,
        ownerId: "me",
        updatedById: "me",
        updatedAt: "2026-10-09T10:00:00+03:30",
      },
      { id: "kr-a11y-auto", title: "Issues fixed", kind: "auto", tag: "a11y", done: 5, total: 7 },
      {
        id: "kr-contrast",
        title: "Contrast fixes",
        kind: "manual",
        current: 9,
        target: 12,
        ownerId: "sarah",
        updatedById: "sarah",
        updatedAt: "2026-10-10T09:00:00+03:30",
      },
      { id: "kr-a11y-task", title: "Accessibility pass done", kind: "task", taskId: "t-a11y" },
    ],
    projectLinks: {},
  },
  {
    id: "research-repo",
    teamId: "design",
    title: "Research repository live",
    ownerId: "ava",
    periodId: "q3-1405",
    dueDay: "2026-09-22",
    keyResults: [
      {
        id: "kr-studies",
        title: "Studies filed",
        kind: "manual",
        current: 12,
        target: 12,
        ownerId: "ava",
        updatedById: "ava",
        updatedAt: "2026-09-20T10:00:00+03:30",
      },
    ],
    projectLinks: {},
  },
  {
    id: "pwa-native",
    teamId: "mobile",
    title: "PWA feels native",
    ownerId: "me",
    periodId: "q4-1405",
    dueDay: "2026-12-20",
    keyResults: [
      {
        id: "kr-lighthouse",
        title: "Lighthouse PWA score",
        kind: "manual",
        current: 82,
        target: 100,
        ownerId: "me",
        updatedById: "me",
        updatedAt: "2026-10-12T11:00:00+03:30",
      },
    ],
    projectLinks: { "mobile-onboarding": 2 },
  },
];
