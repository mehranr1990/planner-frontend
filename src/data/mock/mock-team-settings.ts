import type { TeamFixture } from "@/fixtures/teams";
import { RepositoryError } from "../repositories";
import type { SprintItem, TeamCapabilities, TeamRole, TeamSettings, TeamTask, TeamTransfer } from "../team-domain";
import type { TeamSettingsRepository } from "../team-repositories";

/*
 * Mock team settings + lifecycle (TM-14). General / Access: Owner/Admin;
 * Planning: Lead+; archive: Owner/Admin; transfer / delete: Owner with
 * reauth (the mock rejects an empty password or "wrong"). Weekly → Sprints
 * turns this week's plan into the next sprint's draft; Sprints → Weekly
 * needs the active sprint completed first. Deleting a team never touches
 * projects. OPEN(DECISIONS): delete retention period — the backend
 * retention policy is pending; the mock deletes at once.
 */

const GENERAL_KEYS = ["name", "initials", "description", "tint"] as const;
const ACCESS_KEYS = ["defaultInviteRole", "membersMayInvite", "viewersSeeBooking"] as const;
const PLANNING_KEYS = ["weekStart", "estimateUnit", "checkinsOn", "statusOn"] as const;

export type StoredTeamSettings = Omit<TeamSettings, "name" | "initials" | "description" | "tint" | "planningMode">;

export const defaultTeamSettings = (): StoredTeamSettings => ({
  weekStart: null,
  estimateUnit: "hours",
  checkinsOn: true,
  statusOn: true,
  defaultInviteRole: "member",
  membersMayInvite: false,
  // OPEN(DECISIONS): whether Viewers may see this-week booking — design default off.
  viewersSeeBooking: false,
  revision: 1,
});

export interface MockTeamSettingsOptions {
  respond<T>(value: T): Promise<T>;
  now: string;
  memberOf(teamId: string): TeamFixture;
  roleOf(team: TeamFixture, personId: string): TeamRole;
  capabilities(team: TeamFixture): TeamCapabilities;
  /** Live per-team settings (the team mock reads the flags for capabilities). */
  settings(teamId: string): StoredTeamSettings;
  hasActiveSprint(teamId: string): boolean;
  draftFromPlan(teamId: string, items: readonly SprintItem[]): void;
  /** This week's planned tasks of the team (for the Sprint 1 draft). */
  plannedThisWeek(teamId: string): readonly TeamTask[];
  removeTeam(teamId: string): void;
}

export function createMockTeamSettings(options: MockTeamSettingsOptions): TeamSettingsRepository & {
  /** Mock-only: the successor accepts the handover. */
  acceptTransfer(teamId: string): void;
} {
  const { respond, now, memberOf, roleOf, capabilities, settings } = options;
  const transfers = new Map<string, TeamTransfer>();

  const view = (team: TeamFixture): TeamSettings => ({
    name: team.name,
    initials: team.initials,
    description: team.description,
    tint: team.tint,
    planningMode: team.planningMode,
    ...structuredClone(settings(team.id)),
  });
  const reauth = (password: string) => {
    if (!password || password === "wrong") throw new RepositoryError("invalid", "reauth");
  };
  const owner = (teamId: string) => {
    const team = memberOf(teamId);
    if (!capabilities(team).ownTeam) throw new RepositoryError("forbidden", "Owner only");
    return team;
  };
  const bump = (teamId: string) => {
    settings(teamId).revision += 1;
  };

  return {
    async get(teamId) {
      const team = memberOf(teamId);
      if (!capabilities(team).modules.settings) throw new RepositoryError("forbidden", "Lead+ only");
      return respond(view(team));
    },
    async update(teamId, patch, revision) {
      const team = memberOf(teamId);
      const caps = capabilities(team);
      const keys = Object.keys(patch) as (keyof typeof patch)[];
      const touches = (group: readonly string[]) => keys.some((key) => group.includes(key));
      if ((touches(GENERAL_KEYS) || touches(ACCESS_KEYS)) && !caps.editGeneral) throw new RepositoryError("forbidden", "Owner/Admin only");
      if (touches(PLANNING_KEYS) && !caps.editPlanning) throw new RepositoryError("forbidden", "Lead+ only");
      const stored = settings(teamId);
      if (stored.revision !== revision) throw new RepositoryError("conflict", "Stale revision");
      if (patch.name !== undefined && !patch.name.trim()) throw new RepositoryError("invalid", "Name required");
      if (patch.initials !== undefined && !/^\S{1,3}$/u.test(patch.initials.trim())) throw new RepositoryError("invalid", "Short name 1–3");
      for (const key of GENERAL_KEYS) {
        const value = patch[key];
        if (value !== undefined) Object.assign(team, { [key]: typeof value === "string" && key !== "tint" ? value.trim() : value });
      }
      for (const key of [...ACCESS_KEYS, ...PLANNING_KEYS]) {
        if (patch[key] !== undefined) Object.assign(stored, { [key]: patch[key] });
      }
      team.updatedAt = now;
      bump(teamId);
      return respond(view(team));
    },
    async setPlanningMode(teamId, mode) {
      const team = memberOf(teamId);
      if (!capabilities(team).editPlanning) throw new RepositoryError("forbidden", "Lead+ only");
      if (team.planningMode === mode) return respond(view(team));
      if (mode === "weekly" && options.hasActiveSprint(teamId)) throw new RepositoryError("conflict", "Complete the active sprint first");
      if (mode === "sprints") {
        options.draftFromPlan(
          teamId,
          options.plannedThisWeek(teamId).map((task) => ({
            taskId: task.id,
            title: task.title,
            source: task.source,
            status: task.status,
            estimate: task.estimateHours ?? 1,
            assignee: task.assignees[0]?.person ?? null,
          })),
        );
      }
      team.planningMode = mode;
      bump(teamId);
      return respond(view(team));
    },
    async archive(teamId) {
      const team = memberOf(teamId);
      if (!capabilities(team).archive) throw new RepositoryError("forbidden", "Owner/Admin only");
      team.lifecycle = "archived";
      team.lifecycleAt = now;
      return respond(undefined);
    },
    async transfer(teamId) {
      memberOf(teamId);
      return respond(structuredClone(transfers.get(teamId) ?? null));
    },
    async requestTransfer(teamId, personId) {
      const team = owner(teamId);
      const person = team.members.find((item) => item.id === personId);
      const role = person ? roleOf(team, person.id) : undefined;
      // OPEN(DECISIONS): exactly one Owner — the successor replaces me.
      if (!person || person.id === "me" || (role !== "admin" && role !== "lead")) throw new RepositoryError("invalid", "Admin or Lead only");
      const transfer: TeamTransfer = { successor: person, accepted: false, requestedAt: now };
      transfers.set(teamId, transfer);
      return respond(structuredClone(transfer));
    },
    async cancelTransfer(teamId) {
      owner(teamId);
      transfers.delete(teamId);
      return respond(undefined);
    },
    async confirmTransfer(teamId, password) {
      const team = owner(teamId);
      const transfer = transfers.get(teamId);
      if (!transfer?.accepted) throw new RepositoryError("conflict", "Waiting for the successor");
      reauth(password);
      team.memberRoles = { ...team.memberRoles, [transfer.successor.id]: "owner" };
      team.role = "admin";
      transfers.delete(teamId);
      return respond(undefined);
    },
    async remove(teamId, { name, password }) {
      const team = owner(teamId);
      if (name.trim() !== team.name) throw new RepositoryError("invalid", "name-mismatch");
      reauth(password);
      options.removeTeam(teamId);
      return respond(undefined);
    },
    acceptTransfer(teamId) {
      const transfer = transfers.get(teamId);
      if (transfer) transfer.accepted = true;
    },
  };
}
