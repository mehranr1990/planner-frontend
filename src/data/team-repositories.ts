import type {
  SetPresenceInput,
  TeamActivity,
  TeamCapacityEntry,
  TeamCheckinSummary,
  TeamCalendarOverlay,
  TeamEvent,
  TeamEventDetail,
  TeamEventKind,
  TeamMember,
  TeamRsvp,
  TeamProjectLink,
  TeamTask,
  TeamTaskComment,
  TeamTaskDetail,
  TeamTaskPriority,
  TeamTaskStatus,
  TeamThanks,
  TeamWeekPlan,
  TeamAccess,
  TeamDirectory,
  TeamInvitation,
  TeamPlanningMode,
  TeamPresence,
  TeamRole,
  TeamSummary,
} from "./team-domain";

import type { DeclineReason } from "./project-domain";

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
  /** Linked projects the viewer can open — never a hidden one or a hidden count. */
  projects(id: string): Promise<readonly TeamProjectLink[]>;
}

/** planRepo */
export interface TeamPlanRepository {
  /** The week plan summary (week = Saturday; defaults to the current week). */
  week(teamId: string, week?: string): Promise<TeamWeekPlan>;
}

/** capacityRepo — Viewers get "forbidden" (OPEN(DECISIONS): Viewer booking default off). */
export interface TeamCapacityRepository {
  week(teamId: string, week?: string, options?: TeamAccessOptions): Promise<readonly TeamCapacityEntry[]>;
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
}

/** activityRepo */
export interface TeamActivityRepository {
  list(teamId: string, limit?: number): Promise<readonly TeamActivity[]>;
}

/** checkinRepo (Overview tab: replies count only). */
export interface TeamCheckinRepository {
  summary(teamId: string): Promise<TeamCheckinSummary>;
}

/** recognitionRepo (Overview tab: team-visible thanks only). */
export interface TeamRecognitionRepository {
  recent(teamId: string, limit?: number): Promise<readonly TeamThanks[]>;
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
  teamTasks: TeamTaskRepository;
}
