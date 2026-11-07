/*
 * SAMPLE DATA for Projects (Phase 2, Batch A boards PJ00/PJ01/SH01).
 * Mock "today" is Tue 13 Oct 2026 (21 Mehr 1405), like every other fixture.
 * Names, descriptions and notes are user content (not translated).
 * Replace with the real API when backend Phase 2 lands.
 */

import type { ProjectInvitation, ProjectPerson, ProjectRole, ProjectSummary } from "@/data/project-domain";

const person = (id: string, name: string, initials: string): ProjectPerson => ({
  id,
  name,
  initials,
});

export const projectPeople = {
  me: person("me", "Mehran", "M"),
  sara: person("sara", "Sara P.", "SP"),
  ali: person("ali", "Ali R.", "AR"),
  neda: person("neda", "Neda K.", "NK"),
  omid: person("omid", "Omid T.", "OT"),
  lena: person("lena", "Lena M.", "LM"),
} as const;

const { me, sara, ali, neda, omid, lena } = projectPeople;

export interface ProjectFixture extends ProjectSummary {
  /** Mock-only: the role the current user holds (capabilities are derived by the mock). */
  role: ProjectRole;
}

export const projectFixtures: readonly ProjectFixture[] = [
  {
    id: "website-redesign",
    name: "Website Redesign",
    initials: "WR",
    description: "New marketing site, checkout and design system rollout.",
    role: "manager",
    health: "at-risk",
    lifecycle: "active",
    statusNote: {
      text: "Checkout API access is late; beta may slip a week unless the vendor replies by Thursday.",
      author: sara,
      at: "2026-10-12T16:20:00+03:30",
    },
    progress: { done: 49, total: 84 },
    expectedPercent: 64,
    nextMilestone: { id: "beta", title: "Beta", due: "2026-11-11" },
    startDate: "2026-08-23",
    endDate: "2026-12-21",
    members: [sara, ali, neda, omid, me],
    memberCount: 8,
    forYou: 3,
    openHighRisks: 2,
    updatedAt: "2026-10-13T12:05:00+03:30",
  },
  {
    id: "planner-app",
    name: "Planner App",
    initials: "PA",
    description: "Wave 2 of the planner: shared projects and offline capture.",
    role: "member",
    health: "on-track",
    lifecycle: "active",
    statusNote: {
      text: "Wave 2 scope frozen; QA starts next week.",
      author: ali,
      at: "2026-10-11T10:00:00+03:30",
    },
    progress: { done: 71, total: 100 },
    expectedPercent: 68,
    nextMilestone: { id: "wave-2", title: "Wave 2", due: "2026-10-22" },
    startDate: "2026-07-01",
    endDate: "2026-11-30",
    members: [ali, lena, me],
    memberCount: 5,
    forYou: 2,
    openHighRisks: 0,
    updatedAt: "2026-10-13T09:40:00+03:30",
  },
  {
    id: "mobile-onboarding",
    name: "Mobile Onboarding",
    initials: "MO",
    description: "First-run flow and sign-up for the mobile apps.",
    role: "owner",
    health: "off-track",
    lifecycle: "active",
    statusNote: null,
    progress: { done: 9, total: 41 },
    expectedPercent: 45,
    nextMilestone: { id: "prototype", title: "Prototype", due: "2026-10-10" },
    startDate: "2026-09-01",
    endDate: "2026-12-01",
    members: [me, neda],
    memberCount: 2,
    forYou: 1,
    openHighRisks: 1,
    updatedAt: "2026-10-12T18:10:00+03:30",
  },
  {
    id: "brand-refresh",
    name: "Brand Refresh",
    initials: "BR",
    description: "Logo, colour and type refresh across every channel.",
    role: "owner",
    health: "on-track",
    lifecycle: "paused",
    statusNote: null,
    progress: { done: 12, total: 30 },
    expectedPercent: 50,
    nextMilestone: null,
    startDate: "2026-06-01",
    endDate: "2026-12-30",
    members: [me, omid],
    memberCount: 2,
    forYou: 0,
    openHighRisks: 0,
    updatedAt: "2026-09-28T11:00:00+03:30",
    lifecycleBy: me,
    lifecycleAt: "2026-09-28T11:00:00+03:30",
  },
  {
    id: "spring-campaign",
    name: "Spring Campaign",
    initials: "SC",
    description: "Nowruz campaign landing pages and ads.",
    role: "manager",
    health: "on-track",
    lifecycle: "archived",
    statusNote: null,
    progress: { done: 26, total: 26 },
    expectedPercent: 100,
    nextMilestone: null,
    startDate: "2026-02-01",
    endDate: "2026-04-15",
    members: [sara, me],
    memberCount: 4,
    forYou: 0,
    openHighRisks: 0,
    updatedAt: "2026-09-03T10:00:00+03:30",
    lifecycleBy: sara,
    lifecycleAt: "2026-09-03T10:00:00+03:30",
  },
];

/** Projects the user once had and lost (revoked state). */
export const revokedProjectIds: readonly string[] = ["old-agency"];

export const invitationFixtures: readonly ProjectInvitation[] = [
  {
    id: "inv-data-migration",
    projectId: "data-migration",
    projectName: "Data Migration",
    inviter: sara,
    role: "member",
    sentAt: "2026-10-12T09:00:00+03:30",
  },
];

/** What accepting "Data Migration" adds to the directory (mock only). */
export const invitedProjectFixtures: Readonly<Record<string, ProjectFixture>> = {
  "data-migration": {
    id: "data-migration",
    name: "Data Migration",
    initials: "DM",
    description: "Move customer records to the new CRM.",
    role: "member",
    health: "on-track",
    lifecycle: "active",
    statusNote: null,
    progress: { done: 3, total: 20 },
    expectedPercent: 10,
    nextMilestone: { id: "dry-run", title: "Dry run", due: "2026-11-02" },
    startDate: "2026-10-05",
    endDate: "2027-01-20",
    members: [sara, lena],
    memberCount: 3,
    forYou: 0,
    openHighRisks: 0,
    updatedAt: "2026-10-12T09:00:00+03:30",
  },
};

/** Most recently opened first. */
export const recentProjectIds: readonly string[] = [
  "website-redesign",
  "planner-app",
  "mobile-onboarding",
  "brand-refresh",
];
