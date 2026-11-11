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
}

export interface SetPresenceInput {
  status: PresenceStatus;
  note: string;
  clearAfter: ClearAfter;
  allTeams: boolean;
  shareWorkingOn: boolean;
}
