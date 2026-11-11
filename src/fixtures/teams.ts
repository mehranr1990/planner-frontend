/*
 * SAMPLE DATA for Teams (Phase 3, Batch A boards TS01/TM00/TM01/TM90).
 * Mock "today" is Tue 13 Oct 2026 (21 Mehr 1405, week W42), like every other
 * fixture. Names, descriptions and notes are user content (not translated).
 * Replace with the real API when backend Phase 3 lands.
 */

import type { TeamInvitation, TeamPerson, TeamPresence, TeamSummary } from "@/data/team-domain";

const person = (id: string, name: string, initials: string): TeamPerson => ({ id, name, initials });

export const teamPeople = {
  me: person("me", "Mehran R.", "MR"),
  amelie: person("amelie", "Amélie L.", "AL"),
  harry: person("harry", "Harry B.", "HB"),
  jonathan: person("jonathan", "Jonathan K.", "JK"),
  katy: person("katy", "Katy F.", "KF"),
  nina: person("nina", "Nina T.", "NT"),
  sarah: person("sarah", "Sarah P.", "SP"),
  ava: person("ava", "Ava R.", "AR"),
  kian: person("kian", "Kian F.", "KF"),
  mina: person("mina", "Mina I.", "MI"),
  lena: person("lena", "Lena M.", "LM"),
  omid: person("omid", "Omid S.", "OS"),
} as const;

const { me, amelie, harry, jonathan, katy, nina, sarah, ava, kian, mina, lena, omid } = teamPeople;

/** Job titles shown next to names (user content, per team member). */
export const teamJobTitles: Readonly<Record<string, string>> = {
  me: "Product Owner",
  amelie: "UX Designer",
  harry: "Head of Design",
  jonathan: "Mobile Lead",
  katy: "Design Engineer",
  nina: "Illustrator",
  sarah: "Visual Designer",
  ava: "Researcher",
  kian: "iOS Engineer",
  mina: "Android Engineer",
  lena: "Growth Marketer",
  omid: "Data Analyst",
};

/** A team fixture plus the projects linked to it (some the viewer cannot open: never counted). */
export interface TeamFixture extends Omit<TeamSummary, "projectCount" | "restorable" | "lead"> {
  linkedProjectIds: readonly string[];
  /** The team lead shown in the header ("Lead · Harry B."). */
  leadId: string;
  /** TM-06: associated projects created under the team (Team-owned); the rest are Linked. */
  ownedProjectIds?: readonly string[];
}

export const teamFixtures: readonly TeamFixture[] = [
  {
    id: "design",
    name: "Design Team",
    initials: "DT",
    tint: "indigo",
    description: "Product design for planner and website.",
    role: "member",
    lifecycle: "active",
    planningMode: "weekly",
    members: [amelie, harry, jonathan, katy, me, nina, sarah, ava],
    memberCount: 8,
    leadId: "harry",
    openTasks: 12,
    forYou: 3,
    // partner-portal: linked, but the viewer has no grant → not listed, not counted.
    linkedProjectIds: ["website-redesign", "planner-app", "brand-refresh", "partner-portal"],
    ownedProjectIds: ["website-redesign"],
    checkinMissing: true,
    updatedAt: "2026-10-13T14:30:00+03:30",
  },
  {
    id: "mobile",
    name: "Mobile Squad",
    initials: "MO",
    tint: "blue",
    description: "iOS / Android app and PWA shell.",
    role: "lead",
    lifecycle: "active",
    planningMode: "sprints",
    members: [jonathan, kian, mina, me, katy],
    memberCount: 5,
    leadId: "me",
    openTasks: 9,
    forYou: 2,
    linkedProjectIds: ["mobile-onboarding", "android-sdk"],
    checkinMissing: false,
    updatedAt: "2026-10-13T13:35:00+03:30",
  },
  {
    id: "growth",
    name: "Growth",
    initials: "GR",
    tint: "amber",
    description: "Onboarding and lifecycle experiments.",
    role: "viewer",
    lifecycle: "active",
    planningMode: "weekly",
    members: [lena, omid, sarah, me, ava, harry],
    memberCount: 6,
    leadId: "lena",
    openTasks: 7,
    forYou: 0,
    // data-migration: the viewer is only invited → not counted until accepted.
    linkedProjectIds: ["spring-campaign", "website-redesign", "data-migration"],
    checkinMissing: false,
    updatedAt: "2026-10-12T16:10:00+03:30",
  },
  {
    id: "launch-crew",
    name: "Launch Crew",
    initials: "LC",
    tint: "purple",
    description: "Spring launch coordination.",
    role: "admin",
    lifecycle: "archived",
    lifecycleAt: "2026-09-25T10:00:00+03:30",
    planningMode: "weekly",
    members: [me, harry, lena],
    memberCount: 3,
    leadId: "harry",
    openTasks: 0,
    forYou: 0,
    linkedProjectIds: ["spring-campaign"],
    checkinMissing: false,
    updatedAt: "2026-09-25T10:00:00+03:30",
  },
];

export const recentTeamIds: readonly string[] = ["design", "mobile", "growth"];

/** Teams I was removed from / left: the next request answers "removed". */
export const removedTeamIds: readonly string[] = ["old-studio"];

export const teamInvitationFixtures: readonly TeamInvitation[] = [
  {
    id: "inv-research",
    teamId: "research",
    teamName: "Research Guild",
    initials: "RG",
    inviter: person("harry", "Harry B.", "HB"),
    role: "member",
    memberCount: 6,
    sentAt: "2026-10-12T09:00:00+03:30",
  },
];

/** The team behind an invitation, once accepted (joining gives no project access). */
export const invitedTeamFixtures: Readonly<Record<string, TeamFixture>> = {
  research: {
    id: "research",
    name: "Research Guild",
    initials: "RG",
    tint: "purple",
    description: "Shared research practice across product teams.",
    role: "member",
    lifecycle: "active",
    planningMode: "weekly",
    members: [harry, ava, amelie, nina, omid, lena],
    memberCount: 6,
    leadId: "harry",
    openTasks: 4,
    forYou: 0,
    linkedProjectIds: ["partner-portal"],
    checkinMissing: false,
    updatedAt: "2026-10-12T09:00:00+03:30",
  },
};

type PresenceSeed = Omit<TeamPresence, "allTeams" | "clearAfter" | "workingOn"> &
  Partial<Pick<TeamPresence, "allTeams" | "clearAfter">>;

/** Manual statuses per team (set by each person; never inferred). */
export const presenceFixtures: Readonly<Record<string, readonly PresenceSeed[]>> = {
  design: [
    { personId: "amelie", status: "available", note: "", until: null, shareWorkingOn: true },
    { personId: "harry", status: "busy", note: "Reviews until 4", until: "2026-10-13T16:00:00+03:30", shareWorkingOn: false },
    { personId: "jonathan", status: "available", note: "", until: null, shareWorkingOn: true },
    { personId: "katy", status: "busy", note: "", until: "2026-10-13T23:59:00+03:30", shareWorkingOn: true },
    { personId: "me", status: "available", note: "", until: null, shareWorkingOn: true, clearAfter: "never" },
    { personId: "nina", status: "off", note: "", until: "2026-10-13T23:59:00+03:30", shareWorkingOn: false },
    { personId: "sarah", status: "available", note: "", until: null, shareWorkingOn: true },
    // Expired at its "until": shows "No status" (nothing is inferred).
    { personId: "ava", status: "away", note: "Dentist", until: "2026-10-12T12:00:00+03:30", shareWorkingOn: false },
  ],
  mobile: [
    { personId: "jonathan", status: "available", note: "", until: null, shareWorkingOn: true },
    { personId: "kian", status: "busy", note: "Release build", until: null, shareWorkingOn: true },
    { personId: "mina", status: "available", note: "", until: null, shareWorkingOn: false },
    { personId: "me", status: "available", note: "", until: null, shareWorkingOn: true, clearAfter: "never" },
    { personId: "katy", status: "away", note: "", until: null, shareWorkingOn: false },
  ],
  growth: [
    { personId: "lena", status: "available", note: "", until: null, shareWorkingOn: true },
    { personId: "omid", status: "busy", note: "", until: null, shareWorkingOn: false },
    { personId: "sarah", status: "available", note: "", until: null, shareWorkingOn: true },
    { personId: "me", status: null, note: "", until: null, shareWorkingOn: false },
    { personId: "ava", status: "available", note: "", until: null, shareWorkingOn: false },
    { personId: "harry", status: "busy", note: "", until: null, shareWorkingOn: false },
  ],
};
