/*
 * SAMPLE DATA for TM-09 Check-ins (W42 = Sat 10 Oct 2026, closes Wed 14 Oct
 * 18:00; W41 = Sat 3 Oct, closed). Three work questions only: no mood, no
 * scores. Answers and comments are user content (not translated).
 */

import type { CheckinAnswers, CheckinComment, CheckinSchedule, TeamTask } from "@/data/team-domain";
import { CURRENT_WEEK } from "./team-work";
import { teamPeople } from "./teams";

const { me, harry } = teamPeople;

export const LAST_CHECKIN_WEEK = "2026-10-03";

/** OPEN(DECISIONS): check-in default schedule — design default Sat 09:00 → Wed 18:00. */
export const defaultCheckinSchedule: CheckinSchedule = { opensDay: 6, opensTime: "09:00", closesDay: 3, closesTime: "18:00" };

export interface CheckinReplySeed {
  id: string;
  personId: string;
  answers: CheckinAnswers;
  sentAt: string;
  comments?: readonly CheckinComment[];
}

const answers = (did: string, next: string, blocked = ""): CheckinAnswers => ({ did, next, blocked });

/** Replies per team and week (Saturday). */
export const checkinReplyFixtures: Readonly<Record<string, Readonly<Record<string, readonly CheckinReplySeed[]>>>> = {
  design: {
    [CURRENT_WEEK]: [
      {
        id: "ci-katy-42",
        personId: "katy",
        answers: answers(
          "Design tokens audit 60%",
          "Component QA",
          "Payment API access for checkout hand-off (Website Redesign)",
        ),
        sentAt: "2026-10-13T10:20:00+03:30",
      },
      {
        id: "ci-amelie-42",
        personId: "amelie",
        answers: answers("Onboarding variants shared", "Variant tests with Ava", "Waiting for legal on copy"),
        sentAt: "2026-10-12T17:40:00+03:30",
      },
      {
        id: "ci-sarah-42",
        personId: "sarah",
        answers: answers("Icon set v2 ready for review\nAccessibility checklist draft", "Docs pages for icons"),
        sentAt: "2026-10-12T09:15:00+03:30",
        comments: [{ id: "cc-1", author: harry, body: "Great — I’ll review the icons Wednesday.", at: "2026-10-12T11:00:00+03:30" }],
      },
      {
        id: "ci-harry-42",
        personId: "harry",
        answers: answers("Critique session W41", "Review icon set v2"),
        sentAt: "2026-10-11T16:05:00+03:30",
      },
      {
        id: "ci-jonathan-42",
        personId: "jonathan",
        answers: answers("Mobile nav spec", "Hand-off to Mobile Squad"),
        sentAt: "2026-10-11T12:30:00+03:30",
      },
    ],
    [LAST_CHECKIN_WEEK]: [
      {
        id: "ci-sarah-41",
        personId: "sarah",
        answers: answers("Icon grid", "Icon set v2"),
        sentAt: "2026-10-07T15:00:00+03:30",
      },
      {
        id: "ci-me-41",
        personId: "me",
        answers: answers("Critique notes W41", "Onboarding copy review"),
        sentAt: "2026-10-06T18:10:00+03:30",
      },
    ],
  },
  mobile: {
    [CURRENT_WEEK]: [
      {
        id: "ci-jonathan-m42",
        personId: "jonathan",
        answers: answers("Release checklist", "Store screenshots"),
        sentAt: "2026-10-12T10:00:00+03:30",
      },
      {
        id: "ci-me-m42",
        personId: "me",
        answers: answers("Sprint 14 planning", "Release build 2.4 review"),
        sentAt: "2026-10-11T09:30:00+03:30",
      },
    ],
  },
  growth: {
    [CURRENT_WEEK]: [
      {
        id: "ci-lena-42",
        personId: "lena",
        answers: answers("Lifecycle email test live", "Read first results"),
        sentAt: "2026-10-12T14:00:00+03:30",
      },
      {
        id: "ci-omid-42",
        personId: "omid",
        answers: answers("Funnel queries", "Funnel dashboard", "Event names differ between apps"),
        sentAt: "2026-10-12T15:30:00+03:30",
      },
    ],
  },
};


const done = (id: string, title: string, completedAt: string): TeamTask => ({
  id,
  teamId: "design",
  title,
  status: "done",
  priority: "medium",
  due: null,
  estimateHours: 2,
  assignees: [{ person: me, state: "accepted" }],
  source: { kind: "team" },
  planWeek: null,
  progress: 100,
  blockedBy: [],
  goal: null,
  revision: 1,
  updatedAt: completedAt,
  completedAt,
  can: { edit: false, status: false },
});

/** My done team tasks this week (the check-in suggestions); merged into the team task store. */
export const checkinTaskFixtures: readonly TeamTask[] = [
  done("t-critique-notes", "Critique notes W41", "2026-10-11T15:30:00+03:30"),
  done("t-quick-add-sheet", "Quick add sheet", "2026-10-12T13:00:00+03:30"),
];
