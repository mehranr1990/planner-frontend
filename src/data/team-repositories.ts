import type {
  SetPresenceInput,
  TeamActivity,
  TeamCapacity,
  TeamCapacityEntry,
  TeamMemberRemovalPreview,
  TeamMemberRow,
  TeamPendingInvite,
  TeamCheckinSummary,
  CheckinAnswers,
  CheckinComment,
  CheckinSchedule,
  CheckinWeek,
  TeamSettings,
  TeamTransfer,
  TeamAnalyticsRange,
  TeamAnalyticsSummary,
  FeedbackInbox,
  FeedbackNote,
  FeedbackRequest,
  ThanksLink,
  TeamCalendarOverlay,
  TeamEvent,
  TeamEventDetail,
  TeamEventKind,
  TeamTimeOffHistoryEntry,
  TeamTimeOffRequest,
  TeamMember,
  TeamRsvp,
  TeamLinkRequest,
  TeamPortfolioProject,
  TeamGoal,
  TeamGoalPeriod,
  TeamTask,
  TeamTaskComment,
  TeamTaskDetail,
  TeamTaskPriority,
  TeamTaskStatus,
  TeamThanks,
  TeamWeekPlan,
  TeamWeekReview,
  CarryOverDecision,
  BacklogItem,
  SprintReview,
  TeamSprintState,
  TeamAccess,
  TeamDirectory,
  TeamInvitation,
  TeamPlanningMode,
  TeamPresence,
  TeamRole,
  TeamSummary,
} from "./team-domain";

import type { Weekday } from "@/lib/dates/week";
import type { DeclineReason, FileLibrary } from "./project-domain";
import type { FileRepository } from "./project-repositories";

/*
 * Teams (Phase 3) repository interfaces. Backend Phase 3 is not built: only
 * mock adapters implement these (src/data/mock/mock-teams.ts); names follow
 * each SPEC "Data & backend" tab (teamRepo, teamInvitationRepo, presenceRepo…).
 * Never add an API adapter with guessed endpoints. Errors use RepositoryError.
 */

export interface TeamAccessOptions {
  /** Demo harness only (?state=…): answer as if the viewer held this role. */
  previewRole?: TeamRole;
  /** Demo harness only: answer as if the team were archived. */
  previewArchived?: boolean;
}

/** teamRepo */
export interface TeamRepository {
  /** Teams I belong to (active + archived), with role and counts. */
  listAccessible(): Promise<TeamDirectory>;
  /** One team with my capabilities, or an access answer (not available / invite / removed). */
  access(id: string, options?: TeamAccessOptions): Promise<TeamAccess>;
  /** Owner/Admin: archived → active. */
  restore(id: string): Promise<TeamSummary>;
  /** TM-90 New team: the creator becomes Owner. No company association in Phase 3. */
  create(input: NewTeamInput): Promise<TeamSummary>;
  /** Members with team role and job title (A–Z is the UI's job). */
  members(id: string): Promise<readonly TeamMember[]>;
  /** Team-owned + linked projects the viewer can open — never a hidden one or a hidden count. */
  projects(id: string): Promise<readonly TeamPortfolioProject[]>;
}

/** planRepo */
export interface TeamPlanRepository {
  /** The week plan summary (week = Saturday; defaults to the current week). */
  week(teamId: string, week?: string): Promise<TeamWeekPlan>;
  /**
   * TM-04 plan + assign: put a task in a week (null = back to To plan) for a
   * person (null = unassigned). Assigning someone else leaves a Pending
   * assignment until they accept. Lead+ plan any task; Members only their
   * own ("forbidden" otherwise); project tasks keep their project assignee.
   * Rejects "conflict" on a stale revision.
   */
  plan(teamId: string, taskId: string, input: PlanTaskInput): Promise<TeamTask>;
  /** Lead+: draft → published (notifies the team). The plan can still change afterwards. */
  publish(teamId: string, week: string): Promise<TeamWeekPlan>;
  /** Lead+: the week focus lines. */
  setFocus(teamId: string, week: string, focus: readonly string[]): Promise<TeamWeekPlan>;
  /** Review of a past week (task counts only, never per-person scores). */
  review(teamId: string, week: string): Promise<TeamWeekReview>;
  /** Lead+: move an unfinished task to this week (carry-over), back to To plan, or close it. */
  decide(teamId: string, week: string, taskId: string, decision: CarryOverDecision): Promise<TeamWeekReview>;
}

export interface PlanTaskInput {
  week: string | null;
  assigneeId: string | null;
  revision: number;
}

/** capacityRepo — Viewers get "forbidden" (OPEN(DECISIONS): Viewer booking default off). */
export interface TeamCapacityRepository {
  week(teamId: string, week?: string, options?: TeamAccessOptions): Promise<readonly TeamCapacityEntry[]>;
  /** TM-08 capacity editor: weekly hours + working days per member. */
  get(teamId: string, personId: string): Promise<TeamCapacity>;
  /** Lead+ ("Edit capacity"); used by Planning, Workload and Sprints. */
  set(teamId: string, personId: string, input: { hours: number; days: readonly Weekday[] }): Promise<TeamCapacity>;
}

/** teamMemberRepo (TM-08). Rights are per row (`can`), never derived from the role label in the UI. */
export interface TeamMemberRepository {
  list(teamId: string, options?: TeamAccessOptions): Promise<readonly TeamMemberRow[]>;
  /** Owner/Admin. Owner only changes by transfer; Admin is set only by an Owner. */
  setRole(teamId: string, personId: string, role: Exclude<TeamRole, "owner">): Promise<TeamMemberRow>;
  removalPreview(teamId: string, personId: string): Promise<TeamMemberRemovalPreview>;
  /** Owner/Admin: open team tasks become Unassigned; project roles never change. */
  remove(teamId: string, personId: string): Promise<void>;
  /** Owner/Admin: to another of my teams; this team's open tasks become Unassigned. */
  move(teamId: string, personId: string, toTeamId: string): Promise<void>;
  /** Invitations tab (Lead+ with invite rights). */
  invitations(teamId: string): Promise<readonly TeamPendingInvite[]>;
  resendInvite(teamId: string, inviteId: string): Promise<TeamPendingInvite>;
  cancelInvite(teamId: string, inviteId: string): Promise<void>;
}

/** teamCalendarRepo */
export interface TeamCalendarRepository {
  /** Team events between two days (inclusive). */
  range(teamId: string, from: string, to: string): Promise<readonly TeamEvent[]>;
  /** TM-03 layers: team task due dates + events of projects the viewer can open (forbidden = not found). */
  overlays(teamId: string, from: string, to: string): Promise<readonly TeamCalendarOverlay[]>;
}

export interface TeamEventInput {
  title: string;
  /** "meeting" = team event; "time-off" = my own time off (T7). */
  kind: Extract<TeamEventKind, "meeting" | "time-off">;
  day: string;
  time: string | null;
  end: string | null;
  url?: string | null;
}

/** teamEventRepo (TM-03 light meetings). */
export interface TeamEventRepository {
  /** Team events with invitees, agenda and RSVP between two days (inclusive). */
  range(teamId: string, from: string, to: string, options?: TeamAccessOptions): Promise<readonly TeamEventDetail[]>;
  /** Members+: a team event (every member invited) or own time off. Viewers: "forbidden". */
  create(teamId: string, input: TeamEventInput): Promise<TeamEventDetail>;
  /** Organiser or Lead+ ("Edit any event"); others: "forbidden". */
  update(eventId: string, input: TeamEventInput): Promise<TeamEventDetail>;
  /** Every member, Viewers included. */
  rsvp(eventId: string, rsvp: TeamRsvp): Promise<TeamEventDetail>;
  /** Cancels a team event for everyone (`can.cancel`); changed elsewhere → "conflict". */
  cancel(eventId: string): Promise<void>;
  /** Time-off requests the viewer may see (managers: everyone's; others: their own), newest first. */
  timeOff(teamId: string): Promise<readonly TeamTimeOffRequest[]>;
  /** Manager decision on someone else's pending request (`can.decide`); the note is optional. */
  decideTimeOff(
    teamId: string,
    requestId: string,
    decision: "approve" | "reject",
    note: string | null,
  ): Promise<TeamTimeOffRequest>;
  /** The requester cancels their own pending / not-yet-ended approved request (`can.cancel`). */
  cancelTimeOff(teamId: string, requestId: string): Promise<TeamTimeOffRequest>;
  /** Submitted / approved / rejected / canceled steps, oldest first. */
  timeOffHistory(teamId: string, requestId: string): Promise<readonly TeamTimeOffHistoryEntry[]>;
}

/** activityRepo */
export interface TeamActivityRepository {
  list(teamId: string, limit?: number): Promise<readonly TeamActivity[]>;
}

/** checkinRepo (TM-09; the Overview tab reads the summary: replies count only). */
export interface TeamCheckinRepository {
  summary(teamId: string): Promise<TeamCheckinSummary>;
  /** One week (Saturday; default = this week) with replies, comments and who replied. */
  week(teamId: string, week?: string, options?: TeamAccessOptions): Promise<CheckinWeek>;
  /**
   * Send / edit my reply (or skip the week). Editable until closing; a
   * missing reply may still be sent for 24h after (marked late, author only).
   * Rejects "forbidden" for Viewers, "conflict" when the week is closed,
   * "invalid" when Did and Next are both empty.
   */
  reply(teamId: string, week: string, input: CheckinAnswers | { skip: true }): Promise<CheckinWeek>;
  /** Members+ while the week is not closed. */
  comment(teamId: string, replyId: string, body: string): Promise<CheckinComment>;
  /** Lead+: once per week to non-responders; "conflict" when already sent. */
  remind(teamId: string, week: string): Promise<{ reminded: number }>;
  schedule(teamId: string): Promise<CheckinSchedule>;
  /** Lead+ (Settings › Planning). */
  setSchedule(teamId: string, schedule: CheckinSchedule): Promise<CheckinSchedule>;
}

/** recognitionRepo (TM-10; Overview tab: team-visible thanks only). No counts per person, ever. */
export interface TeamRecognitionRepository {
  recent(teamId: string, limit?: number): Promise<readonly TeamThanks[]>;
  /** The feed for me: team thanks (not hidden) + private thanks I wrote or received, newest first. */
  list(teamId: string, options?: TeamAccessOptions): Promise<readonly TeamThanks[]>;
  /** Members+. Rejects "invalid" (no recipient / empty text / myself), "forbidden" for Viewers. */
  give(teamId: string, input: GiveThanksInput): Promise<TeamThanks>;
  /** Recipient: hide from the team feed (or show again). */
  hide(teamId: string, thanksId: string, hidden: boolean): Promise<TeamThanks>;
  /** Author deletes own; Owner/Admin remove any (audited). */
  remove(teamId: string, thanksId: string): Promise<void>;
}

export interface GiveThanksInput {
  toIds: readonly string[];
  text: string;
  visibility: "team" | "private";
  link?: ThanksLink | null;
}

/** fileRepo with scope team (TM-11): the same file service as PJ-10, team folders; no guests, no quota. */
export type TeamFileRepository = Omit<FileRepository, "list"> & {
  list(teamId: string, options?: TeamAccessOptions): Promise<FileLibrary>;
};

/** feedbackRepo (TM-10): private 1:1, only writer and recipient (Leads don't see it, T9). */
export interface TeamFeedbackRepository {
  inbox(teamId: string): Promise<FeedbackInbox>;
  /** Members+; never to myself. */
  request(teamId: string, input: { toId: string; about: string; question: string }): Promise<FeedbackRequest>;
  /** Members+; answering a request asked of me closes it. */
  write(teamId: string, input: { toId: string; about: string; body: string; requestId?: string }): Promise<FeedbackNote>;
}

export interface TeamTaskQuery {
  /** T5: project tasks of members in projects the viewer can open (default on). */
  includeProjects?: boolean;
  status?: TeamTaskStatus;
}

export interface NewTeamTaskInput {
  title: string;
  /** Assigning someone else needs "assign others"; they get a pending assignment. */
  assigneeId?: string;
  priority?: TeamTaskPriority;
  due?: string;
  estimateHours?: number;
  /** Put it in this week's plan (default) or leave it not planned. */
  planned?: boolean;
}

/** teamTaskRepo */
export interface TeamTaskRepository {
  /** Team tasks plus (by default) project refs the viewer can open, each with `can` for the viewer. */
  list(teamId: string, query?: TeamTaskQuery, options?: TeamAccessOptions): Promise<readonly TeamTask[]>;
  /** Project tasks of team members in projects the viewer can open (read-through, never others). */
  projectRefs(teamId: string): Promise<readonly TeamTask[]>;
  /** TM-09 suggestions: tasks I completed in that week (team + projects I can open; nothing from Personal). */
  doneByMe(teamId: string, week: string): Promise<readonly TeamTask[]>;
  /** TM-04 To plan: open team tasks not in a week plan + member project tasks the viewer can open. */
  unplanned(teamId: string, options?: TeamAccessOptions): Promise<readonly TeamTask[]>;
  create(teamId: string, input: NewTeamTaskInput): Promise<TeamTask>;
  /** Fixed team statuses (T4). Rejects "conflict" on a stale revision, "forbidden" without rights / for project tasks. */
  setStatus(taskId: string, status: TeamTaskStatus, revision: number): Promise<TeamTask>;
  /** Undo of create (Viewer/others: "forbidden"). */
  remove(taskId: string): Promise<void>;
  /** TM-15 detail; project tasks are "not-found" here (they open PJ-15 in their project). */
  get(taskId: string, options?: TeamAccessOptions): Promise<TeamTaskDetail>;
  addComment(taskId: string, body: string): Promise<TeamTaskComment>;
  /** Assignment machinery (same as Projects): accepting projects the task into Personal. */
  accept(taskId: string, revision: number): Promise<TeamTask>;
  decline(taskId: string, input: { reason: DeclineReason; note?: string; revision: number }): Promise<TeamTask>;
  /** Undo of Accept (back to pending; the Personal projection leaves). */
  revertAccept(taskId: string, revision: number): Promise<TeamTask>;
  remind(taskId: string): Promise<void>;
}

export interface NewTeamInput {
  name: string;
  description?: string;
  planningMode: TeamPlanningMode;
}

export interface TeamInviteInput {
  emails: readonly string[];
  /** Owner only by transfer; Admin only from an Owner. */
  role: Exclude<TeamRole, "owner">;
}

/** teamInvitationRepo */
export interface TeamInvitationRepository {
  /**
   * TM-90 Invite: the same answer for every address (never reveals whether an
   * account exists); verified accounts get an invitation. Joining never
   * grants project access. Rejects "invalid" for a malformed email,
   * "forbidden" without invite rights (Admin role: Owner only).
   */
  send(teamId: string, input: TeamInviteInput): Promise<{ sent: number }>;
  /** Pending invitations for me (public-safe preview). */
  listMine(): Promise<readonly TeamInvitation[]>;
  /** Accepts and returns the team id to open. Joining never grants project access. */
  accept(id: string): Promise<{ teamId: string }>;
  decline(id: string): Promise<void>;
}

/** presenceRepo — manual status only. */
export interface PresenceRepository {
  /** Every member's current status in a team (expired statuses come back as "No status"). */
  list(teamId: string): Promise<readonly TeamPresence[]>;
  /** My status in a team. */
  mine(teamId: string): Promise<TeamPresence>;
  /** Sets my status (this team, or all my teams when `allTeams`). Viewers: "forbidden". */
  set(teamId: string, input: SetPresenceInput): Promise<TeamPresence>;
  /** Clears my status (back to "No status"). */
  clear(teamId: string): Promise<TeamPresence>;
}

/** teamGoalRepo (TM-07). Auto KR values are computed by the mock from linked team tasks. */
export interface TeamGoalRepository {
  list(teamId: string, options?: TeamAccessOptions): Promise<{ goals: readonly TeamGoal[]; periods: readonly TeamGoalPeriod[]; current: string }>;
  get(goalId: string, options?: TeamAccessOptions): Promise<TeamGoal>;
  /** Lead+: a new goal in a period (key results are added in the goal). */
  create(teamId: string, input: { title: string; periodId: string; dueDay: string }): Promise<TeamGoal>;
  /** Manual KR numbers ("Update progress"): Lead+ any, Members their own; others "forbidden". */
  update(goalId: string, values: Readonly<Record<string, number>>): Promise<TeamGoal>;
}

/** projectAssociationRepo (TM-06; P2-03 association interface → P3). */
export interface ProjectAssociationRepository {
  /** Pending link requests of this team (waiting for each project's owner). */
  requests(teamId: string): Promise<readonly TeamLinkRequest[]>;
  /**
   * Team Owner/Admin asks to link a project where they are project Owner or
   * Admin. Linking never grants project access. Rejects "forbidden" without
   * rights on either side, "conflict" when already linked or requested.
   */
  request(teamId: string, projectId: string): Promise<TeamLinkRequest>;
  /** Project owner side (approval lives in the project; mock only here). */
  approve(requestId: string): Promise<void>;
  /** Team or project Owner/Admin; never deletes the project or changes its members. */
  unlink(teamId: string, projectId: string): Promise<void>;
}

/** sprintRepo (TM-05; only for teams with Settings › Planning › Sprints on, else "unsupported"). */
export interface TeamSprintRepository {
  current(teamId: string, options?: TeamAccessOptions): Promise<TeamSprintState>;
  /** Lead+: starts the next sprint with its queued items. Rejects "conflict" while one is active. */
  start(teamId: string, input: { goal: string }): Promise<TeamSprintState>;
  /** Lead+: each unfinished item goes to the next sprint or back to the backlog; returns the review. */
  complete(teamId: string, sprintId: string, moves: Readonly<Record<string, "next" | "backlog">>): Promise<SprintReview>;
  /** Completed sprints, newest first (read-only summaries). */
  reviews(teamId: string): Promise<readonly SprintReview[]>;
}

/** backlogRepo (TM-05). */
export interface TeamBacklogRepository {
  /** Ranked team tasks + project tasks the viewer can open (read-through). */
  list(teamId: string): Promise<readonly BacklogItem[]>;
  /** Lead+: the full new order of task ids. */
  rank(teamId: string, taskIds: readonly string[]): Promise<readonly BacklogItem[]>;
}

export interface TeamRepositories {
  teams: TeamRepository;
  teamInvitations: TeamInvitationRepository;
  presence: PresenceRepository;
  teamPlans: TeamPlanRepository;
  teamCapacity: TeamCapacityRepository;
  teamCalendar: TeamCalendarRepository;
  teamEvents: TeamEventRepository;
  teamActivity: TeamActivityRepository;
  teamCheckins: TeamCheckinRepository;
  teamRecognition: TeamRecognitionRepository;
  teamFeedback: TeamFeedbackRepository;
  teamFiles: TeamFileRepository;
  teamReports: TeamReportRepository;
  teamSettings: TeamSettingsRepository;
  teamTasks: TeamTaskRepository;
  teamSprints: TeamSprintRepository;
  projectAssociations: ProjectAssociationRepository;
  teamGoals: TeamGoalRepository;
  teamMembers: TeamMemberRepository;
  teamBacklog: TeamBacklogRepository;
}

/** teamReportRepo (TM-12). Team-level numbers only; never per person. */
export interface TeamReportRepository {
  summary(teamId: string, range: TeamAnalyticsRange, options?: TeamAccessOptions): Promise<TeamAnalyticsSummary>;
}

export type TeamSettingsPatch = Partial<Omit<TeamSettings, "revision" | "planningMode">>;

/** teamRepo.update / settings + lifecycle (TM-14; P3-01 / P3-02 / P3-05). */
export interface TeamSettingsRepository {
  get(teamId: string): Promise<TeamSettings>;
  /**
   * General / Access fields: Owner/Admin; Planning fields: Lead+ ("forbidden"
   * otherwise). Rejects "conflict" on a stale revision, "invalid" for an
   * empty name or short name.
   */
  update(teamId: string, patch: TeamSettingsPatch, revision: number): Promise<TeamSettings>;
  /**
   * Lead+. Weekly → Sprints: this week's plan becomes the Sprint 1 draft.
   * Sprints → Weekly: rejects "conflict" while a sprint is active (complete it first).
   */
  setPlanningMode(teamId: string, mode: TeamPlanningMode): Promise<TeamSettings>;
  /** Owner/Admin: read-only for everyone; linked projects are not archived. */
  archive(teamId: string): Promise<void>;
  transfer(teamId: string): Promise<TeamTransfer | null>;
  /** Owner: an Admin or Lead becomes the successor (they accept first). */
  requestTransfer(teamId: string, personId: string): Promise<TeamTransfer>;
  cancelTransfer(teamId: string): Promise<void>;
  /** Owner, after the successor accepted; rejects "invalid" ("reauth") on a wrong password. */
  confirmTransfer(teamId: string, password: string): Promise<void>;
  /**
   * Owner: type the team name + password. Team tasks, goals, check-ins and
   * files are deleted; projects stay with their owners. Rejects "invalid"
   * ("name-mismatch" / "reauth").
   */
  remove(teamId: string, input: { name: string; password: string }): Promise<void>;
}
