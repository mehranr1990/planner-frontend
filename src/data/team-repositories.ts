import type {
  SetPresenceInput,
  TeamActivity,
  TeamCapacityEntry,
  TeamCheckinSummary,
  TeamEvent,
  TeamMember,
  TeamProjectLink,
  TeamTask,
  TeamTaskStatus,
  TeamThanks,
  TeamWeekPlan,
  TeamAccess,
  TeamDirectory,
  TeamInvitation,
  TeamPresence,
  TeamRole,
  TeamSummary,
} from "./team-domain";

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

/** teamTaskRepo */
export interface TeamTaskRepository {
  list(teamId: string, query?: TeamTaskQuery): Promise<readonly TeamTask[]>;
}

/** teamInvitationRepo */
export interface TeamInvitationRepository {
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
  teamActivity: TeamActivityRepository;
  teamCheckins: TeamCheckinRepository;
  teamRecognition: TeamRecognitionRepository;
  teamTasks: TeamTaskRepository;
}
