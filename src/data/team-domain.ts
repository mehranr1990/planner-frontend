import type { Weekday } from "@/lib/dates/week";
import type { ProjectTint } from "./project-domain";

/*
 * Teams (Phase 3) domain types. Backend Phase 3 is not built: mock adapters
 * only (src/data/mock/mock-teams.ts). Names, descriptions and notes are user
 * content. Team membership never grants project access (README #3): every
 * project reference here is one the viewer can open.
 */

export type TeamRole = "owner" | "admin" | "lead" | "member" | "viewer";

export type TeamLifecycle = "active" | "archived";

/** Settings › Planning: weekly plan (default) or sprints + backlog (owner answer). */
export type TeamPlanningMode = "weekly" | "sprints";

/** Initials-tile colour (the same tiles as Projects). */
export type TeamTint = ProjectTint;

export interface TeamPerson {
  id: string;
  name: string;
  initials: string;
}

export interface TeamSummary {
  id: string;
  name: string;
  initials: string;
  tint: TeamTint;
  description: string;
  /** The viewer's role in this team (the same person may differ per team). */
  role: TeamRole;
  lifecycle: TeamLifecycle;
  /** When it was archived (ISO), for "Archived 3 Mehr". */
  lifecycleAt?: string;
  planningMode: TeamPlanningMode;
  /** Member avatars for previews (server order). */
  members: readonly TeamPerson[];
  memberCount: number;
  /** The team lead shown in the header ("Lead · Harry B."). */
  lead: TeamPerson | null;
  /** Open team tasks. */
  openTasks: number;
  /** "n for you": my open + pending assignments in this team. */
  forYou: number;
  /** Linked projects the viewer can open (forbidden = not found, no hidden count). */
  projectCount: number;
  /** Archived and the viewer may restore it (Owner/Admin, server flag). */
  restorable: boolean;
  /** The viewer's check-in reply for this week is missing (rail badge). */
  checkinMissing: boolean;
  updatedAt: string;
}

export interface TeamDirectory {
  teams: readonly TeamSummary[];
  /** Most recently opened first. */
  recentIds: readonly string[];
}

/** Public-safe preview of an invitation: team name, inviter, role, size. */
export interface TeamInvitation {
  id: string;
  teamId: string;
  teamName: string;
  initials: string;
  inviter: TeamPerson;
  role: Exclude<TeamRole, "owner">;
  memberCount: number;
  sentAt: string;
}

/** Team screens; hidden (not disabled) in the rail when false (TS-01). */
export type TeamModule =
  | "overview"
  | "work"
  | "calendar"
  | "planning"
  | "projects"
  | "goals"
  | "people"
  | "analytics"
  | "checkins"
  | "recognition"
  | "files"
  | "settings";

/** What the viewer may do in one team; from the repository, never derived from the role label in UI. */
export interface TeamCapabilities {
  modules: Readonly<Record<TeamModule, boolean>>;
  setOwnStatus: boolean;
  editWeekFocus: boolean;
  invite: boolean;
  /** Admin is offered in Invite only to Owners. */
  inviteAdmin: boolean;
  createTask: boolean;
  editAnyTask: boolean;
  assignOthers: boolean;
  deleteTask: boolean;
  /** See others' this-week booking. OPEN(DECISIONS): Viewers default off. */
  seeBooking: boolean;
  archive: boolean;
  restore: boolean;
  /** TM-06: link / unlink projects (team Owner/Admin). */
  linkProjects: boolean;
  /** TM-06: New team project (Lead+). */
  createProject: boolean;
  /** TM-11: upload team files (Member+). */
  uploadFile: boolean;
  /** TM-11: versions of anyone’s files / restore (Lead+). */
  manageFiles: boolean;
  /** TM-12: export snapshot (Owner/Admin/Lead). */
  exportAnalytics: boolean;
  /** TM-14: General + Access tabs (Owner/Admin). */
  editGeneral: boolean;
  /** TM-14: Planning tab (Lead+). */
  editPlanning: boolean;
  /** TM-14: transfer ownership / delete (Owner). */
  ownTeam: boolean;
}

export type TeamAccess =
  | { status: "ok"; team: TeamSummary; capabilities: TeamCapabilities }
  | { status: "not-available" }
  | { status: "invite-pending"; invitation: TeamInvitation }
  /** Removed / left: accepted team tasks leave Personal projections. */
  | { status: "removed" };

/** Manual status only (owner answer): nothing is inferred from calendars or activity. */
export type PresenceStatus = "available" | "busy" | "away" | "off";

export const presenceStatuses: readonly PresenceStatus[] = ["available", "busy", "away", "off"];

export type ClearAfter = "hour" | "today" | "week" | "never";

export const clearAfterOptions: readonly ClearAfter[] = ["hour", "today", "week", "never"];

export interface TeamPresence {
  personId: string;
  /** null = "No status" (never set, cleared, or expired at `until`). */
  status: PresenceStatus | null;
  note: string;
  /** When it clears (ISO), or null for "never". */
  until: string | null;
  clearAfter: ClearAfter;
  /** OPEN(DECISIONS): status storage scope — per team, with "same in all my teams". */
  allTeams: boolean;
  /** "Share what I'm working on" (owner update 10 Nov): off = "Not shared". */
  shareWorkingOn: boolean;
  /** What the person works on; null unless they share it. */
  workingOn: string | null;
}

export interface SetPresenceInput {
  status: PresenceStatus;
  note: string;
  clearAfter: ClearAfter;
  allTeams: boolean;
  shareWorkingOn: boolean;
}

// ── Inside a team: people, week plan, capacity, calendar, activity (TM-01) ──

export interface TeamMember {
  person: TeamPerson;
  role: TeamRole;
  /** Job title (user content). */
  title: string;
}

/** Linked project the viewer can open (never a hidden one). */
export interface TeamProjectLink {
  id: string;
  name: string;
  percent: number;
  health: "on-track" | "at-risk" | "off-track";
  lifecycle: "active" | "paused" | "archived";
}

/**
 * TM-06 portfolio row: a project the viewer can open that is Team-owned
 * (created under the team) or Linked (approved by the project owner).
 */
export interface TeamPortfolioProject extends TeamProjectLink {
  relation: "owned" | "linked";
  initials: string;
  tint: TeamTint;
  /** The viewer's own project role (display only). */
  role: "owner" | "admin" | "manager" | "member" | "viewer" | "guest";
  nextMilestone: { title: string; due: string } | null;
  startDate: string;
  endDate: string;
  /** Team members who are also project members (never others). */
  teamPeople: readonly TeamPerson[];
  openHighRisks: number;
}

/** projectAssociationRepo: a link request waiting for the project owner. */
export interface TeamLinkRequest {
  id: string;
  projectId: string;
  projectName: string;
  requestedAt: string;
  requestedBy: TeamPerson;
}

/** planRepo.week: the published weekly plan's summary (week = its Saturday). */
export interface TeamWeekPlan {
  week: string;
  weekNumber: number;
  planned: number;
  done: number;
  /** Sat … Thu (Iran work week + Thursday half day). */
  days: readonly { day: string; planned: number; done: number }[];
  blocked: number;
  carriedOver: number;
  unplanned: number;
  /** Focus set by a Lead: task titles (user content). */
  focus: readonly string[];
  focusBy: TeamPerson | null;
  focusAt: string | null;
  /** TM-04: a Lead publishes the draft; after publishing the plan can still change (shown in Activity). */
  status: "draft" | "published";
  publishedAt: string | null;
  publishedBy: TeamPerson | null;
}

/** TM-04 Review last week: what happens to an unfinished task. */
export type CarryOverDecision = "this-week" | "to-plan" | "close";

export const carryOverDecisions: readonly CarryOverDecision[] = ["this-week", "to-plan", "close"];

/** planRepo.review: last week's read-only summary — task counts, never per-person scores. */
export interface TeamWeekReview {
  week: string;
  weekNumber: number;
  planned: number;
  plannedDone: number;
  carriedOver: number;
  unplannedAdded: number;
  /** Estimated ÷ actual hours of done tasks, 0–100. */
  estimateAccuracy: number;
  unfinished: readonly { taskId: string; title: string; decision: CarryOverDecision | null }[];
}

/** capacityRepo.week: booked = estimates of team + project work this week; never Personal data. */
export interface TeamCapacityEntry {
  personId: string;
  bookedHours: number;
  capacityHours: number;
  /** TM-08: booked tasks of projects the viewer cannot open (hours only, never titles). */
  otherProjectTasks?: number;
}

/** capacityRepo.get/set (TM-08): weekly hours for this team and the working days (not linked to Personal settings). */
export interface TeamCapacity {
  personId: string;
  hours: number;
  /** JS weekdays (0 = Sunday … 6 = Saturday). */
  days: readonly Weekday[];
}

/** teamMemberRepo.list row: role, title, and what the viewer may do with this member (server-computed). */
export interface TeamMemberRow extends TeamMember {
  can: { changeRole: boolean; editCapacity: boolean; move: boolean; remove: boolean; leave: boolean };
}

/** What moving / removing a member does (preview before confirming). */
export interface TeamMemberRemovalPreview {
  /** Open team tasks that become Unassigned. */
  openTeamTasks: number;
  /** Accepted team tasks that leave the person's Personal projections. */
  acceptedTeamTasks: number;
  /** OPEN(DECISIONS): exactly one Owner — the last Owner cannot be removed or moved. */
  lastOwner: boolean;
}

/** A pending invitation the team sent (Invitations tab). */
export interface TeamPendingInvite {
  id: string;
  email: string;
  role: Exclude<TeamRole, "owner">;
  sentAt: string;
  expiresAt: string;
}

export type TeamEventKind = "meeting" | "time-off" | "deadline" | "checkin";

export interface TeamEvent {
  id: string;
  title: string;
  kind: TeamEventKind;
  day: string;
  /** "HH:mm", or null for all-day. */
  time: string | null;
  personId?: string;
}

// ── Team calendar (TM-03) ──────────────────────────────────────────────

export type TeamRsvp = "going" | "maybe" | "no";

export const teamRsvps: readonly TeamRsvp[] = ["going", "maybe", "no"];

export interface TeamAgendaItem {
  id: string;
  /** User content. */
  title: string;
  owner: TeamPerson | null;
  minutes: number;
}

/**
 * teamEventRepo: a team event with the light-meeting basics (title, time,
 * invitees, agenda with owner and minutes, external URL, RSVP). Minutes,
 * decisions and action items arrive in Phase 5.
 */
export interface TeamEventDetail extends TeamEvent {
  /** "HH:mm" end, or null (all-day / point in time). */
  end: string | null;
  organiser: TeamPerson | null;
  invitees: readonly { person: TeamPerson; rsvp: TeamRsvp | null }[];
  agenda: readonly TeamAgendaItem[];
  /** External meeting URL (user content), or null. */
  url: string | null;
  /** My answer, or null (no reply / not invited). */
  myRsvp: TeamRsvp | null;
  /** Server-computed for the viewer. */
  can: { edit: boolean; rsvp: boolean };
}

/** teamCalendarRepo.overlays: team task due dates and events of projects the viewer can open (never others). */
export type TeamCalendarOverlay =
  | { id: string; kind: "task-due"; day: string; title: string; taskId: string; blocked: boolean }
  | {
      id: string;
      kind: "project-event";
      day: string;
      time: string;
      end: string | null;
      title: string;
      projectId: string;
      projectName: string;
    };

export type TeamActivityKind = "moved" | "flagged" | "shared" | "created" | "completed";

export interface TeamActivity {
  id: string;
  actor: TeamPerson;
  kind: TeamActivityKind;
  /** The object (task title, file…; user content). */
  subject: string;
  /** For "moved": the new status. */
  status?: TeamTaskStatus;
  at: string;
}

/** The weekly check-in for the Overview tab: replies count only (no mood, no scores). */
export interface TeamCheckinSummary {
  week: string;
  replied: number;
  total: number;
  closesAt: string;
  mine: "missing" | "sent";
}

/** Something the thanks points at (only things the writer can see). */
export type ThanksLink =
  | { kind: "task"; id: string; title: string }
  | { kind: "goal"; id: string; title: string }
  | { kind: "project"; id: string; title: string };

export interface TeamThanks {
  id: string;
  from: TeamPerson;
  /** One or more teammates. */
  to: readonly TeamPerson[];
  text: string;
  /** "team" = the team feed (default); "private" = writer and recipients only. */
  visibility: "team" | "private";
  link?: ThanksLink | null;
  /** A recipient hid it from the team feed (writer and recipients still see it). */
  hidden?: boolean;
  at: string;
  /** Server-computed: delete own · hide (recipient) · remove (Owner/Admin, audited). */
  can?: { delete: boolean; hide: boolean; remove: boolean };
}

// ── Team work (TM-02 / TM-15) ─────────────────────────────────────────────

/** Fixed team statuses (T4): no team workflow editor. */
export type TeamTaskStatus = "todo" | "in-progress" | "review" | "blocked" | "done";

export const teamTaskStatuses: readonly TeamTaskStatus[] = ["todo", "in-progress", "review", "blocked", "done"];

export type TeamTaskPriority = "urgent" | "high" | "medium" | "low";

export type TeamAssignmentState = "pending" | "accepted" | "declined";

export interface TeamTaskAssignee {
  person: TeamPerson;
  state: TeamAssignmentState;
  by?: TeamPerson;
}

/** Where the task lives: the team, or a project the viewer can open (never a hidden one). */
export type TeamTaskSource = { kind: "team" } | { kind: "project"; projectId: string; projectName: string };

export interface TeamTask {
  id: string;
  teamId: string;
  title: string;
  status: TeamTaskStatus;
  priority: TeamTaskPriority;
  due: string | null;
  estimateHours: number | null;
  assignees: readonly TeamTaskAssignee[];
  source: TeamTaskSource;
  /** The week plan it belongs to (Saturday), or null = not planned. */
  planWeek: string | null;
  /** Checklist progress 0–100. */
  progress: number;
  /** Tasks this one waits for (same team; finish-to-start). */
  blockedBy: readonly string[];
  goal: { id: string; title: string } | null;
  /** Revision for If-Match style writes. */
  revision: number;
  updatedAt: string;
  completedAt?: string;
  /** TM-04: the week (Saturday) it was carried over from, when it waits in To plan as a carry-over. */
  carriedFrom?: string | null;
  /** What the viewer may do (server-computed; project tasks are read-only on team surfaces). */
  can: { edit: boolean; status: boolean };
}

export interface TeamTaskComment {
  id: string;
  author: TeamPerson;
  at: string;
  body: string;
}

export interface TeamTaskActivity {
  id: string;
  kind: "created" | "assigned" | "status" | "accepted" | "declined";
  actor: TeamPerson;
  at: string;
  status?: TeamTaskStatus;
}

/** TM-15: the task plus what the drawer shows (never the assignee's personal notes, focus or time blocks). */
export interface TeamTaskDetail {
  task: TeamTask;
  teamName: string;
  assignedAt: string | null;
  /** Related project task (link only; opens in its project) — only when the viewer can open it. */
  related: { projectId: string; projectName: string; taskId: string; title: string } | null;
  comments: readonly TeamTaskComment[];
  activity: readonly TeamTaskActivity[];
  /** Lead+: Remind / Reassign on someone else's pending assignment. */
  canManageAssignments: boolean;
}

// ── Sprint & backlog (TM-05, optional per team) ─────────────────────────

/** Team setting: estimates in points or hours. */
export type SprintEstimateUnit = "points" | "hours";

export interface SprintItem {
  taskId: string;
  title: string;
  source: TeamTaskSource;
  status: TeamTaskStatus;
  estimate: number;
  assignee: TeamPerson | null;
}

/** sprintRepo.current: the active sprint; velocity and burndown are team-level only (no per-person scoring). */
export interface TeamSprint {
  id: string;
  number: number;
  goal: string;
  start: string;
  end: string;
  /** Working days of the sprint (Sat–Wed in Iran) and today's position in them (1-based; 0 = not started). */
  days: readonly string[];
  dayIndex: number;
  committed: number;
  capacity: number;
  done: number;
  unit: SprintEstimateUnit;
  items: readonly SprintItem[];
  /** Remaining estimate after each elapsed working day (computed by the mock). */
  burndown: readonly { day: string; remaining: number }[];
}

export interface TeamSprintState {
  unit: SprintEstimateUnit;
  sprint: TeamSprint | null;
  /** The next sprint as Start would create it (dates, capacity from People × days, items queued for it). */
  next: { number: number; start: string; end: string; capacity: number; committed: number; items: readonly SprintItem[] };
}

export interface BacklogItem {
  taskId: string;
  title: string;
  source: TeamTaskSource;
  estimate: number;
}

/** Read-only sprint review (team totals only). */
export interface SprintReview {
  sprintId: string;
  number: number;
  goal: string;
  start: string;
  end: string;
  committed: number;
  done: number;
  unit: SprintEstimateUnit;
  /** Items moved on at completion. */
  movedToNext: number;
  movedToBacklog: number;
  completedAt: string;
}

// ── Team goals (TM-07) ───────────────────────────────────────────────────

/** Where a key result's number comes from (each KR shows its source line). */
export type TeamKrSource =
  | { kind: "auto"; tag: string }
  | { kind: "task"; taskId: string; taskTitle: string; status: TeamTaskStatus }
  | { kind: "manual"; owner: TeamPerson | null; updatedBy: TeamPerson | null; updatedAt: string | null };

export interface TeamKeyResult {
  id: string;
  title: string;
  current: number;
  target: number;
  source: TeamKrSource;
  /** Manual KRs: Lead+ any, Members their own (server-computed). */
  canUpdate: boolean;
}

export type TeamGoalPace = "on-pace" | "slightly-behind" | "behind";

export interface TeamGoalPeriod {
  id: string;
  quarter: number;
  /** Jalali year. */
  year: number;
}

export interface TeamGoal {
  id: string;
  title: string;
  owner: TeamPerson;
  period: TeamGoalPeriod;
  dueDay: string;
  /** 0–1, the mean of the key results. */
  progress: number;
  /** 0–1, expected by today from the period dates (pace marker). */
  expected: number;
  pace: TeamGoalPace;
  keyResults: readonly TeamKeyResult[];
  /** Linked work the viewer can see: team tasks + tasks of projects they can open (counts only of what they see). */
  linked: { team: number; projects: readonly { projectId: string; projectName: string; count: number }[] };
  lifecycle: "active" | "archived";
}

// ── Check-ins (TM-09) ─────────────────────────────────────────────────────

/** Three work questions (owner answer): no mood, no energy, no scores. */
export interface CheckinAnswers {
  did: string;
  next: string;
  blocked: string;
}

/** OPEN(DECISIONS): default schedule Sat 09:00 → Wed 18:00 (Iran time). Lead+ change it. */
export interface CheckinSchedule {
  opensDay: Weekday;
  opensTime: string;
  closesDay: Weekday;
  closesTime: string;
}

export interface CheckinComment {
  id: string;
  author: TeamPerson;
  body: string;
  at: string;
}

export interface CheckinReply {
  id: string;
  person: TeamPerson;
  answers: CheckinAnswers;
  sentAt: string;
  /** Sent in the 24h after closing (T12); only ever set on the author's own reply. */
  late?: boolean;
  comments: readonly CheckinComment[];
}

/** open → editable · late → 24h after closing, missing replies only (T12) · closed → read-only. */
export type CheckinWeekStatus = "open" | "late" | "closed";

export interface CheckinWeek {
  /** Saturday (YYYY-MM-DD). */
  week: string;
  weekNumber: number;
  status: CheckinWeekStatus;
  closesAt: string;
  schedule: CheckinSchedule;
  /** This week (the switcher always offers it). */
  current: { week: string; weekNumber: number };
  /** Previous (closed) weeks the viewer can open, newest first. */
  previous: readonly { week: string; weekNumber: number }[];
  /** Others' replies, newest first (mine is in `mine`). */
  replies: readonly CheckinReply[];
  mine: { state: "missing" | "sent" | "skipped"; reply: CheckinReply | null };
  /** Who may reply (Viewers never); counts only, no streaks. */
  replied: readonly TeamPerson[];
  notYet: readonly { person: TeamPerson; off: boolean }[];
  /** Non-responders a reminder would reach (not me, not off today). */
  remindable: number;
  remindedAt: string | null;
  can: { reply: boolean; comment: boolean; remind: boolean; makeTask: boolean };
}

// ── Feedback (TM-10; private 1:1: writer and recipient only, T9) ──────────

export interface FeedbackRequest {
  id: string;
  /** Who asks for feedback. */
  from: TeamPerson;
  /** Who is asked. */
  to: TeamPerson;
  about: string;
  question: string;
  due: string | null;
  at: string;
  status: "open" | "answered";
}

export interface FeedbackNote {
  id: string;
  author: TeamPerson;
  recipient: TeamPerson;
  about: string;
  body: string;
  at: string;
  requestId: string | null;
}

/** Only what involves me: never anyone else’s 1:1 (Leads included). */
export interface FeedbackInbox {
  /** Open requests others sent me. */
  asked: readonly FeedbackRequest[];
  /** My requests (open or answered). */
  requested: readonly FeedbackRequest[];
  received: readonly FeedbackNote[];
  sent: readonly FeedbackNote[];
}

// ── Team analytics (TM-12; team-level only, no per-person charts) ─────────

export type TeamAnalyticsRange = "4w" | "12w" | "quarter";

export interface TeamAnalyticsWeek {
  /** Saturday. */
  week: string;
  weekNumber: number;
  planned: number;
  /** Planned tasks done. */
  done: number;
  /** This week so far (lighter bar). */
  current: boolean;
}

export interface TeamAnalyticsSummary {
  range: TeamAnalyticsRange;
  weeks: readonly TeamAnalyticsWeek[];
  /** Plan completion = plannedDone / planned. */
  planned: number;
  plannedDone: number;
  /** Carried over = planned moved to next week / planned. */
  carried: number;
  /** First In progress → Done (median days) over `cycleSample` done tasks. */
  cycleMedianDays: number | null;
  cycleSample: number;
  /** avg(booked ÷ capacity) over members with capacity, 0–100; null when nobody has capacity. */
  capacityBooked: number | null;
  /** Done tasks by where they came from; `other` = projects the viewer cannot open (Lead/Admin only, else null). */
  mix: { team: number; projects: readonly { projectId: string; name: string; count: number }[]; other: number | null };
  asOf: string;
}

// ── Team settings (TM-14) ─────────────────────────────────────────────────

export type TeamEstimateUnit = "hours" | "points";

export interface TeamSettings {
  name: string;
  initials: string;
  description: string;
  tint: TeamTint;
  planningMode: TeamPlanningMode;
  /** null = each user's own week start; else fixed for the team. */
  weekStart: Weekday | null;
  estimateUnit: TeamEstimateUnit;
  checkinsOn: boolean;
  /** Manual status on/off for this team (nothing is ever inferred). */
  statusOn: boolean;
  defaultInviteRole: Exclude<TeamRole, "owner">;
  /** On: Members may invite Viewers. */
  membersMayInvite: boolean;
  /** OPEN(DECISIONS): Viewers see this-week booking — default off. */
  viewersSeeBooking: boolean;
  revision: number;
}

/** P3-05 handover: the successor accepts, then the Owner confirms with the password. */
export interface TeamTransfer {
  successor: TeamPerson;
  accepted: boolean;
  /** Not served by the API (live mode leaves it out). */
  requestedAt?: string;
}
