import {
  capacityFixtures,
  checkinSummaryFixtures,
  teamActivityFixtures,
  teamEventFixtures,
  teamTaskFixtures,
  thanksFixtures,
  weekPlanFixtures,
  workingOnFixtures,
} from "@/fixtures/team-work";
import {
  invitedTeamFixtures,
  teamJobTitles,
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
  TeamMember,
  TeamModule,
  TeamPresence,
  TeamProjectLink,
  TeamTask,
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
  /**
   * A linked project as the viewer may see it (Projects mock), or undefined
   * when the viewer cannot open it — team membership never grants access.
   */
  findProject?: (projectId: string) => TeamProjectLink | undefined;
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
  findProject = (id) => ({ id, name: id, percent: 0, health: "on-track", lifecycle: "active" }),
}: MockTeamsOptions): MockTeamsStore {
  const canOpenProject = (id: string) => findProject(id) !== undefined;
  const tasks: TeamTask[] = structuredClone([...teamTaskFixtures]);
  let taskCounter = 0;
  /** Per-viewer rights: project tasks are read-only on team surfaces; Members edit their own / assigned. */
  const withCan = (task: TeamTask, role: TeamRole, lifecycle: TeamLifecycle): TeamTask => {
    const caps = teamCapabilities(role, lifecycle);
    const mine = task.assignees.some((assignee) => assignee.person.id === "me" && assignee.state !== "declined");
    const edit = task.source.kind === "team" && (caps.editAnyTask || (caps.createTask && mine));
    return structuredClone({ ...task, can: { edit, status: edit } });
  };
  const teams: TeamFixture[] = structuredClone([...teamFixtures]);
  const invitations: TeamInvitation[] = structuredClone([...teamInvitationFixtures]);
  const recent: string[] = [...recentTeamIds];
  const presence = new Map<string, TeamPresence[]>(
    Object.entries(presenceFixtures).map(([teamId, seeds]) => [
      teamId,
      seeds.map((seed) => ({ allTeams: false, clearAfter: seed.until ? "today" : "never", workingOn: null, ...seed })),
    ]),
  );

  const find = (id: string) => teams.find((team) => team.id === id);
  const openable = (team: TeamFixture) => team.linkedProjectIds.filter((projectId) => canOpenProject(projectId));
  const summary = (team: TeamFixture): TeamSummary => {
    const shown: Partial<TeamFixture> = structuredClone(team);
    delete shown.linkedProjectIds;
    delete shown.leadId;
    return {
      ...(shown as Omit<TeamFixture, "linkedProjectIds" | "leadId">),
      projectCount: openable(team).length,
      lead: team.members.find((person) => person.id === team.leadId) ?? null,
      restorable: teamCapabilities(team.role, team.lifecycle).restore,
    };
  };
  const expired = (entry: TeamPresence) => entry.until !== null && Date.parse(entry.until) <= Date.parse(now);
  const visible = (entry: TeamPresence): TeamPresence => {
    // "Now working on" leaves the server only when the person shares it.
    const workingOn = entry.shareWorkingOn ? (workingOnFixtures[entry.personId] ?? null) : null;
    return expired(entry) ? { ...entry, status: null, note: "", until: null, workingOn } : { ...entry, workingOn };
  };
  const memberOf = (teamId: string) => {
    const team = find(teamId);
    if (!team) throw new RepositoryError("not-found", `Team ${teamId} not found`);
    return team;
  };
  const myEntry = (teamId: string): TeamPresence => {
    const list = presence.get(teamId) ?? [];
    let entry = list.find((item) => item.personId === "me");
    if (!entry) {
      entry = {
        personId: "me",
        status: null,
        note: "",
        until: null,
        clearAfter: "never",
        allTeams: false,
        shareWorkingOn: false,
        workingOn: null,
      };
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
      async members(id) {
        const team = memberOf(id);
        return respond(
          team.members.map((person): TeamMember => ({
            person,
            role: person.id === "me" ? team.role : person.id === team.leadId ? "lead" : "member",
            title: teamJobTitles[person.id] ?? "",
          })),
        );
      },
      async projects(id) {
        const team = memberOf(id);
        return respond(
          team.linkedProjectIds.map((projectId) => findProject(projectId)).filter((link) => link !== undefined),
        );
      },
    },
    teamPlans: {
      async week(teamId) {
        memberOf(teamId);
        const plan = weekPlanFixtures[teamId];
        if (!plan) throw new RepositoryError("not-found", "No plan");
        return respond(plan);
      },
    },
    teamCapacity: {
      async week(teamId, _week, options = {}) {
        const team = memberOf(teamId);
        const role = options.previewRole ?? team.role;
        // OPEN(DECISIONS): whether Viewers may see this-week booking — default off.
        if (!teamCapabilities(role, team.lifecycle).seeBooking) throw new RepositoryError("forbidden", "No booking rights");
        return respond(capacityFixtures[teamId] ?? []);
      },
    },
    teamCalendar: {
      async range(teamId, from, to) {
        memberOf(teamId);
        return respond((teamEventFixtures[teamId] ?? []).filter((event) => event.day >= from && event.day <= to));
      },
    },
    teamActivity: {
      async list(teamId, limit = 10) {
        memberOf(teamId);
        return respond((teamActivityFixtures[teamId] ?? []).slice(0, limit));
      },
    },
    teamCheckins: {
      async summary(teamId) {
        memberOf(teamId);
        const summary = checkinSummaryFixtures[teamId];
        if (!summary) throw new RepositoryError("not-found", "No check-in");
        return respond(summary);
      },
    },
    teamRecognition: {
      async recent(teamId, limit = 5) {
        memberOf(teamId);
        // Private thanks stay between writer and recipient: never on the team feed.
        return respond((thanksFixtures[teamId] ?? []).filter((thanks) => thanks.visibility === "team").slice(0, limit));
      },
    },
    teamTasks: {
      async list(teamId, query = {}, options = {}) {
        const team = memberOf(teamId);
        const includeProjects = query.includeProjects ?? true;
        const role = options.previewRole ?? team.role;
        const lifecycle: TeamLifecycle = options.previewArchived ? "archived" : team.lifecycle;
        return respond(
          tasks
            .filter(
              (task) =>
                task.teamId === teamId &&
                (task.source.kind === "team" || (includeProjects && canOpenProject(task.source.projectId))) &&
                (query.status === undefined || task.status === query.status),
            )
            .map((task) => withCan(task, role, lifecycle)),
        );
      },
      async projectRefs(teamId) {
        const team = memberOf(teamId);
        return respond(
          tasks
            .filter((task) => task.teamId === teamId && task.source.kind === "project" && canOpenProject(task.source.projectId))
            .map((task) => withCan(task, team.role, team.lifecycle)),
        );
      },
      async create(teamId, input) {
        const team = memberOf(teamId);
        const caps = teamCapabilities(team.role, team.lifecycle);
        if (!caps.createTask) throw new RepositoryError("forbidden", "Cannot create team tasks");
        const title = input.title.trim();
        if (!title) throw new RepositoryError("invalid", "Title required");
        const assignee = input.assigneeId ? team.members.find((person) => person.id === input.assigneeId) : undefined;
        if (assignee && assignee.id !== "me" && !caps.assignOthers) throw new RepositoryError("forbidden", "Cannot assign others");
        const me = team.members.find((person) => person.id === "me");
        taskCounter += 1;
        const task: TeamTask = {
          id: `t-new-${taskCounter}`,
          teamId,
          title,
          status: "todo",
          priority: input.priority ?? "medium",
          due: input.due ?? null,
          estimateHours: input.estimateHours ?? null,
          assignees: assignee
            ? [assignee.id === "me" ? { person: assignee, state: "accepted" } : { person: assignee, state: "pending", ...(me ? { by: me } : {}) }]
            : [],
          source: { kind: "team" },
          planWeek: input.planned === false ? null : (weekPlanFixtures[teamId]?.week ?? null),
          progress: 0,
          blockedBy: [],
          goal: null,
          revision: 1,
          updatedAt: now,
          can: { edit: false, status: false },
        };
        tasks.push(task);
        return respond(withCan(task, team.role, team.lifecycle));
      },
      async setStatus(taskId, status, revision) {
        const task = tasks.find((item) => item.id === taskId);
        if (!task) throw new RepositoryError("not-found", "Task not found");
        const team = memberOf(task.teamId);
        if (!withCan(task, team.role, team.lifecycle).can.status) throw new RepositoryError("forbidden", "Cannot move this task");
        if (task.revision !== revision) throw new RepositoryError("conflict", "Stale revision");
        task.status = status;
        task.revision += 1;
        task.updatedAt = now;
        if (status === "done") {
          task.completedAt = now;
          task.progress = 100;
        } else delete task.completedAt;
        return respond(withCan(task, team.role, team.lifecycle));
      },
      async remove(taskId) {
        const index = tasks.findIndex((item) => item.id === taskId);
        if (index < 0) throw new RepositoryError("not-found", "Task not found");
        const task = tasks[index]!;
        const team = memberOf(task.teamId);
        const caps = teamCapabilities(team.role, team.lifecycle);
        if (task.source.kind !== "team" || !caps.createTask) throw new RepositoryError("forbidden", "Cannot remove");
        tasks.splice(index, 1);
        return respond(undefined);
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

/** The repository surface of the team mock (mock-only helpers stay behind). */
export function teamRepositories(store: MockTeamsStore): TeamRepositories {
  return {
    teams: store.teams,
    teamInvitations: store.teamInvitations,
    presence: store.presence,
    teamPlans: store.teamPlans,
    teamCapacity: store.teamCapacity,
    teamCalendar: store.teamCalendar,
    teamActivity: store.teamActivity,
    teamCheckins: store.teamCheckins,
    teamRecognition: store.teamRecognition,
    teamTasks: store.teamTasks,
  };
}
