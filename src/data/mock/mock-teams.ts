import {
  invitedTeamFixtures,
  presenceFixtures,
  recentTeamIds,
  removedTeamIds,
  teamFixtures,
  teamInvitationFixtures,
  type TeamFixture,
} from "@/fixtures/teams";
import { RepositoryError } from "../repositories";
import type {
  ClearAfter,
  TeamCapabilities,
  TeamInvitation,
  TeamLifecycle,
  TeamModule,
  TeamPresence,
  TeamRole,
  TeamSummary,
} from "../team-domain";
import type { TeamRepositories } from "../team-repositories";

/*
 * Mock Teams adapter (Phase 3 backend not built): teamRepo,
 * teamInvitationRepo, presenceRepo. Project counts only include projects the
 * viewer can open (`canOpenProject`, from the Projects mock): forbidden =
 * not found, no hidden counts. Status is manual and clears at its "until".
 */

const RANK: Record<TeamRole, number> = { viewer: 0, member: 1, lead: 2, admin: 3, owner: 4 };

const ALL_MODULES: readonly TeamModule[] = [
  "overview",
  "work",
  "calendar",
  "planning",
  "projects",
  "goals",
  "people",
  "analytics",
  "checkins",
  "recognition",
  "files",
  "settings",
];

/** Capabilities per role (SPEC permission tables). Archived teams are read-only. */
export function teamCapabilities(role: TeamRole, lifecycle: TeamLifecycle): TeamCapabilities {
  const rank = RANK[role];
  const editable = lifecycle === "active";
  const modules = Object.fromEntries(
    ALL_MODULES.map((module) => [module, module === "settings" ? rank >= RANK.lead : true]),
  ) as Record<TeamModule, boolean>;
  return {
    modules,
    setOwnStatus: editable && rank >= RANK.member,
    editWeekFocus: editable && rank >= RANK.lead,
    invite: editable && rank >= RANK.lead,
    inviteAdmin: editable && role === "owner",
    createTask: editable && rank >= RANK.member,
    editAnyTask: editable && rank >= RANK.lead,
    assignOthers: editable && rank >= RANK.lead,
    deleteTask: editable && rank >= RANK.lead,
    // OPEN(DECISIONS): whether Viewers may see this-week booking — design default off.
    seeBooking: rank >= RANK.member,
    archive: editable && rank >= RANK.admin,
    restore: lifecycle === "archived" && rank >= RANK.admin,
  };
}

export interface MockTeamsOptions {
  respond<T>(value: T): Promise<T>;
  /** Mock "today" ("YYYY-MM-DD") and now (instant). */
  today?: string;
  now?: string;
  /** Whether the viewer can open a project (Projects mock); team membership never grants it. */
  canOpenProject?: (projectId: string) => boolean;
}

export interface MockTeamsStore extends TeamRepositories {
  /** Mock-only: the live team fixtures (other team mocks read linked projects, lead, members). */
  findTeam(id: string): TeamFixture | undefined;
  /** Mock-only: the linked projects the viewer can open. */
  openableProjectIds(id: string): readonly string[];
}

/** The instant a status set now clears, in Iran time (+03:30); Iran weeks end on Friday. */
export function clearAt(clearAfter: ClearAfter, now: string, today: string): string | null {
  if (clearAfter === "never") return null;
  if (clearAfter === "hour") return new Date(Date.parse(now) + 60 * 60 * 1000).toISOString();
  if (clearAfter === "today") return `${today}T23:59:00+03:30`;
  const day = new Date(`${today}T00:00:00Z`);
  const toFriday = (5 - day.getUTCDay() + 7) % 7;
  day.setUTCDate(day.getUTCDate() + toFriday);
  return `${day.toISOString().slice(0, 10)}T23:59:00+03:30`;
}

export function createMockTeams({
  respond,
  today = "2026-10-13",
  now = "2026-10-13T14:35:00+03:30",
  canOpenProject = () => true,
}: MockTeamsOptions): MockTeamsStore {
  const teams: TeamFixture[] = structuredClone([...teamFixtures]);
  const invitations: TeamInvitation[] = structuredClone([...teamInvitationFixtures]);
  const recent: string[] = [...recentTeamIds];
  const presence = new Map<string, TeamPresence[]>(
    Object.entries(presenceFixtures).map(([teamId, seeds]) => [
      teamId,
      seeds.map((seed) => ({ allTeams: false, clearAfter: seed.until ? "today" : "never", ...seed })),
    ]),
  );

  const find = (id: string) => teams.find((team) => team.id === id);
  const openable = (team: TeamFixture) => team.linkedProjectIds.filter((projectId) => canOpenProject(projectId));
  const summary = (team: TeamFixture): TeamSummary => {
    const shown: Partial<TeamFixture> = structuredClone(team);
    delete shown.linkedProjectIds;
    delete shown.leadId;
    return { ...(shown as Omit<TeamFixture, "linkedProjectIds" | "leadId">), projectCount: openable(team).length };
  };
  const expired = (entry: TeamPresence) => entry.until !== null && Date.parse(entry.until) <= Date.parse(now);
  const visible = (entry: TeamPresence): TeamPresence =>
    expired(entry) ? { ...entry, status: null, note: "", until: null } : { ...entry };
  const memberOf = (teamId: string) => {
    const team = find(teamId);
    if (!team) throw new RepositoryError("not-found", `Team ${teamId} not found`);
    return team;
  };
  const myEntry = (teamId: string): TeamPresence => {
    const list = presence.get(teamId) ?? [];
    let entry = list.find((item) => item.personId === "me");
    if (!entry) {
      entry = { personId: "me", status: null, note: "", until: null, clearAfter: "never", allTeams: false, shareWorkingOn: false };
      list.push(entry);
      presence.set(teamId, list);
    }
    return entry;
  };
  const myTeams = () => teams.filter((team) => team.lifecycle === "active").map((team) => team.id);

  return {
    findTeam: find,
    openableProjectIds: (id) => {
      const team = find(id);
      return team ? openable(team) : [];
    },
    teams: {
      async listAccessible() {
        return respond({ teams: teams.map(summary), recentIds: [...recent] });
      },
      async access(id, options = {}) {
        if (removedTeamIds.includes(id)) return respond({ status: "removed" as const });
        const team = find(id);
        if (!team) {
          const invitation = invitations.find((item) => item.teamId === id);
          return respond(
            invitation ? { status: "invite-pending" as const, invitation: { ...invitation } } : { status: "not-available" as const },
          );
        }
        const role = options.previewRole ?? team.role;
        const lifecycle: TeamLifecycle = options.previewArchived ? "archived" : team.lifecycle;
        const shown = { ...summary(team), role, lifecycle, ...(options.previewArchived ? { lifecycleAt: now } : {}) };
        const at = recent.indexOf(id);
        if (at >= 0) recent.splice(at, 1);
        recent.unshift(id);
        return respond({ status: "ok" as const, team: shown, capabilities: teamCapabilities(role, lifecycle) });
      },
      async restore(id) {
        const team = memberOf(id);
        if (!teamCapabilities(team.role, team.lifecycle).restore) throw new RepositoryError("forbidden", "Owner/Admin only");
        team.lifecycle = "active";
        delete team.lifecycleAt;
        return respond(summary(team));
      },
    },
    teamInvitations: {
      async listMine() {
        return respond(invitations.map((invitation) => ({ ...invitation })));
      },
      async accept(id) {
        const index = invitations.findIndex((invitation) => invitation.id === id);
        if (index < 0) throw new RepositoryError("not-found", `Invitation ${id} not found`);
        const [invitation] = invitations.splice(index, 1);
        const joined = invitedTeamFixtures[invitation!.teamId];
        if (joined && !find(joined.id)) teams.push(structuredClone({ ...joined, role: invitation!.role }));
        return respond({ teamId: invitation!.teamId });
      },
      async decline(id) {
        const index = invitations.findIndex((invitation) => invitation.id === id);
        if (index >= 0) invitations.splice(index, 1);
        return respond(undefined);
      },
    },
    presence: {
      async list(teamId) {
        memberOf(teamId);
        return respond((presence.get(teamId) ?? []).map(visible));
      },
      async mine(teamId) {
        memberOf(teamId);
        return respond(visible(myEntry(teamId)));
      },
      async set(teamId, input) {
        const team = memberOf(teamId);
        if (!teamCapabilities(team.role, team.lifecycle).setOwnStatus) {
          throw new RepositoryError("forbidden", "Viewers cannot set a status");
        }
        const note = input.note.trim();
        if (note.length > 80) throw new RepositoryError("invalid", "Note too long");
        const until = clearAt(input.clearAfter, now, today);
        const targets = input.allTeams ? myTeams() : [teamId];
        for (const id of targets) {
          Object.assign(myEntry(id), { ...input, note, until });
        }
        return respond(visible(myEntry(teamId)));
      },
      async clear(teamId) {
        memberOf(teamId);
        const entry = myEntry(teamId);
        const targets = entry.allTeams ? myTeams() : [teamId];
        for (const id of targets) Object.assign(myEntry(id), { status: null, note: "", until: null });
        return respond(visible(entry));
      },
    },
  };
}
