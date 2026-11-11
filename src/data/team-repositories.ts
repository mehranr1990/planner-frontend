import type {
  SetPresenceInput,
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
}
