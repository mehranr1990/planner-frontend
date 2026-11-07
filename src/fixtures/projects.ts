/*
 * SAMPLE DATA for Projects (Phase 2, Batch A boards PJ00/PJ01/SH01).
 * Mock "today" is Tue 13 Oct 2026 (21 Mehr 1405), like every other fixture.
 * Names, descriptions and notes are user content (not translated).
 * Replace with the real API when backend Phase 2 lands.
 */

import type { ProjectInvitation, ProjectPerson, ProjectSummary } from "@/data/project-domain";

const person = (id: string, name: string, initials: string): ProjectPerson => ({
  id,
  name,
  initials,
});

export const projectPeople = {
  me: person("me", "Mehran R.", "MR"),
  sara: person("sara", "Sara P.", "SP"),
  kamran: person("kamran", "Kamran I.", "KI"),
  jonathan: person("jonathan", "Jonathan K.", "JK"),
  kian: person("kian", "Kian F.", "KF"),
  maryam: person("maryam", "Maryam P.", "MP"),
  arash: person("arash", "Arash P.", "AP"),
  mina: person("mina", "Mina I.", "MI"),
  ali: person("ali", "Ali I.", "AI"),
  nima: person("nima", "Nima T.", "NT"),
  lena: person("lena", "Lena M.", "LM"),
} as const;

const { me, sara, kamran, jonathan, kian, maryam, arash, mina, ali, nima, lena } = projectPeople;

export type ProjectFixture = ProjectSummary;

export const projectFixtures: readonly ProjectFixture[] = [
  {
    id: "website-redesign",
    name: "Website Redesign",
    initials: "WR",
    tint: "blue",
    description: "New site + checkout for the spring launch.",
    role: "manager",
    health: "at-risk",
    lifecycle: "active",
    statusNote: {
      text: "Build is 4 days behind because payment API access is late.",
      author: sara,
      at: "2026-10-11T10:20:00+03:30",
    },
    progress: { done: 24, total: 41, percent: 58 },
    expectedPercent: 64,
    nextMilestone: { id: "beta", title: "Beta", due: "2026-11-11" },
    startDate: "2026-09-01",
    endDate: "2026-12-20",
    members: [kamran, jonathan, sara, kian, maryam, arash, me],
    memberCount: 7,
    forYou: 3,
    openHighRisks: 2,
    updatedAt: "2026-10-13T12:35:00+03:30",
  },
  {
    id: "planner-app",
    name: "Planner App",
    initials: "PA",
    tint: "indigo",
    description: "Personal planner, web and PWA.",
    role: "member",
    health: "on-track",
    lifecycle: "active",
    statusNote: { text: "Wave 2 scope frozen; QA starts next week.", author: mina, at: "2026-10-11T10:00:00+03:30" },
    progress: { done: 64, total: 90, percent: 71 },
    expectedPercent: 68,
    nextMilestone: { id: "wave-2", title: "Wave 2", due: "2026-10-22" },
    startDate: "2026-09-23",
    endDate: "2026-12-21",
    members: [mina, kian, lena, me],
    memberCount: 4,
    forYou: 2,
    openHighRisks: 0,
    updatedAt: "2026-10-12T10:00:00+03:30",
  },
  {
    id: "mobile-onboarding",
    name: "Mobile Onboarding",
    initials: "MO",
    tint: "amber",
    description: "First-run flow and activation emails.",
    role: "owner",
    health: "off-track",
    lifecycle: "active",
    statusNote: null,
    progress: { done: 5, total: 23, percent: 22 },
    expectedPercent: 45,
    nextMilestone: { id: "prototype", title: "Prototype", due: "2026-10-10" },
    startDate: "2026-10-07",
    endDate: "2026-11-06",
    members: [ali, nima],
    memberCount: 2,
    forYou: 1,
    openHighRisks: 1,
    updatedAt: "2026-10-10T11:00:00+03:30",
  },
  {
    id: "brand-refresh",
    name: "Brand Refresh",
    initials: "BR",
    tint: "purple",
    description: "Logo, type and colour update.",
    role: "owner",
    health: "on-track",
    lifecycle: "paused",
    statusNote: null,
    progress: { done: 8, total: 20, percent: 40 },
    expectedPercent: 50,
    nextMilestone: null,
    startDate: "2026-06-01",
    endDate: "2026-12-30",
    members: [sara],
    memberCount: 1,
    forYou: 0,
    openHighRisks: 0,
    updatedAt: "2026-09-29T11:00:00+03:30",
    lifecycleBy: me,
    lifecycleAt: "2026-09-29T11:00:00+03:30",
  },
  {
    id: "spring-campaign",
    name: "Spring Campaign",
    initials: "SC",
    tint: "blue",
    description: "Nowruz campaign landing pages and ads.",
    role: "owner",
    health: "on-track",
    lifecycle: "archived",
    statusNote: null,
    progress: { done: 26, total: 26, percent: 100 },
    expectedPercent: 100,
    nextMilestone: null,
    startDate: "2026-02-01",
    endDate: "2026-04-15",
    members: [sara, me],
    memberCount: 2,
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
    sentAt: "2026-10-11T09:00:00+03:30",
  },
];

/** What accepting "Data Migration" adds to the directory (mock only). */
export const invitedProjectFixtures: Readonly<Record<string, ProjectFixture>> = {
  "data-migration": {
    id: "data-migration",
    name: "Data Migration",
    initials: "DM",
    tint: "indigo",
    description: "Move customer records to the new CRM.",
    role: "member",
    health: "on-track",
    lifecycle: "active",
    statusNote: null,
    progress: { done: 3, total: 20, percent: 15 },
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
