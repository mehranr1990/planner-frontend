import { teamEventExtras, teamProjectEventFixtures } from "@/fixtures/team-calendar";
import { planningTaskFixtures, weekReviewFixtures } from "@/fixtures/team-planning";
import {
  capacityFixtures,
  checkinSummaryFixtures,
  teamActivityFixtures,
  teamEventFixtures,
  teamTaskDetailFixtures,
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
  TeamCalendarOverlay,
  TeamEventDetail,
  TeamInvitation,
  TeamPerson,
  TeamRsvp,
  TeamLifecycle,
  TeamMember,
  TeamModule,
  TeamPresence,
  TeamProjectLink,
  TeamTask,
  TeamTaskActivity,
  TeamTaskComment,
  TeamWeekPlan,
  TeamWeekReview,
  TeamRole,
  TeamSummary,
} from "../team-domain";
import type { TeamEventInput, TeamRepositories } from "../team-repositories";

/** Stored team event: the detail minus the per-viewer fields. */
interface StoredTeamEvent extends Omit<TeamEventDetail, "myRsvp" | "can" | "organiser" | "invitees"> {
  teamId: string;
  organiserId: string | null;
  inviteeIds: readonly string[];
  rsvps: Record<string, TeamRsvp>;
}

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
  /**
   * The accepted-assignment bridge into Personal (same as Projects): called
   * with the projection when one of my team tasks is accepted and with null
   * when it leaves (Undo of Accept).
   */
  onProjection?: (taskId: string, projection: TeamPersonalProjection | null) => void;
}

/** What Personal shows for an accepted team task: a projection with the team as its source. */
export interface TeamPersonalProjection {
  title: string;
  teamName: string;
  due: string | null;
  priority: TeamTask["priority"];
  estimateHours: number | null;
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
  onProjection,
}: MockTeamsOptions): MockTeamsStore {
  const comments = new Map<string, TeamTaskComment[]>(
    Object.entries(teamTaskDetailFixtures).map(([id, extra]) => [id, structuredClone([...(extra.comments ?? [])])]),
  );
  let commentCounter = 0;
  const canOpenProject = (id: string) => findProject(id) !== undefined;
  const tasks: TeamTask[] = structuredClone([...teamTaskFixtures, ...planningTaskFixtures]);
  // TM-04: plan state per team and week (draft/published, focus) and last week's reviews.
  const planStates = new Map<string, Pick<TeamWeekPlan, "status" | "publishedAt" | "publishedBy" | "focus" | "focusBy" | "focusAt">>();
  const reviews = new Map<string, TeamWeekReview>(Object.entries(structuredClone(weekReviewFixtures)));
  const weekPlan = (teamId: string, week?: string): TeamWeekPlan => {
    const base = weekPlanFixtures[teamId];
    if (!base) throw new RepositoryError("not-found", "No plan");
    const target = week ?? base.week;
    const key = teamId + ":" + target;
    if (target === base.week) return structuredClone({ ...base, ...planStates.get(key) });
    const offset = Math.round((Date.parse(target) - Date.parse(base.week)) / (7 * 86_400_000));
    const planned = tasks.filter((task) => task.teamId === teamId && task.planWeek === target);
    return structuredClone({
      week: target,
      weekNumber: base.weekNumber + offset,
      planned: planned.length,
      done: planned.filter((task) => task.status === "done").length,
      days: [],
      blocked: planned.filter((task) => task.status === "blocked").length,
      carriedOver: 0,
      unplanned: 0,
      focus: [],
      focusBy: null,
      focusAt: null,
      status: "draft" as const,
      publishedAt: null,
      publishedBy: null,
      ...planStates.get(key),
    });
  };
  const leadOf = (teamId: string) => {
    const team = memberOf(teamId);
    if (!teamCapabilities(team.role, team.lifecycle).editWeekFocus) throw new RepositoryError("forbidden", "Lead+ only");
    return team;
  };
  const meIn = (teamId: string): TeamPerson => memberOf(teamId).members.find((person) => person.id === "me")!;
  let taskCounter = 0;
  const bump = (task: TeamTask) => {
    task.revision += 1;
    task.updatedAt = now;
  };
  const project = (task: TeamTask, teamName: string, present: boolean) =>
    onProjection?.(
      task.id,
      present
        ? { title: task.title, teamName, due: task.due, priority: task.priority, estimateHours: task.estimateHours }
        : null,
    );
  const myAssignment = (taskId: string, revision: number, state: "pending" | "accepted") => {
    const task = tasks.find((item) => item.id === taskId && item.source.kind === "team");
    if (!task) throw new RepositoryError("not-found", "Task not found");
    const team = memberOf(task.teamId);
    const mine = task.assignees.find((assignee) => assignee.person.id === "me" && assignee.state === state);
    if (!mine || !teamCapabilities(team.role, team.lifecycle).createTask) throw new RepositoryError("forbidden", "Not your assignment");
    if (task.revision !== revision) throw new RepositoryError("conflict", "Stale revision");
    return { task, team, mine };
  };
  /** Per-viewer rights: project tasks are read-only on team surfaces; Members edit their own / assigned. */
  const withCan = (task: TeamTask, role: TeamRole, lifecycle: TeamLifecycle): TeamTask => {
    const caps = teamCapabilities(role, lifecycle);
    const mine = task.assignees.some((assignee) => assignee.person.id === "me" && assignee.state !== "declined");
    const edit = task.source.kind === "team" && (caps.editAnyTask || (caps.createTask && mine));
    return structuredClone({ ...task, can: { edit, status: edit } });
  };
  const teams: TeamFixture[] = structuredClone([...teamFixtures]);
  // TM-03: team events with the light-meeting basics (shared with the Overview card).
  const events: StoredTeamEvent[] = Object.entries(teamEventFixtures).flatMap(([teamId, list]) =>
    list.map((event): StoredTeamEvent => {
      const extra = teamEventExtras[event.id] ?? {};
      const team = teams.find((item) => item.id === teamId);
      return {
        ...structuredClone(event),
        teamId,
        end: extra.end ?? null,
        organiserId: extra.organiserId ?? event.personId ?? null,
        inviteeIds:
          event.kind === "meeting" ? (extra.invitees ?? team?.members.map((person) => person.id) ?? []) : [],
        rsvps: { ...extra.rsvps },
        agenda: structuredClone([...(extra.agenda ?? [])]),
        url: extra.url ?? null,
      };
    }),
  );
  let eventCounter = 0;
  const eventDetail = (event: StoredTeamEvent, role: TeamRole, lifecycle: TeamLifecycle): TeamEventDetail => {
    const team = memberOf(event.teamId);
    const person = (id: string): TeamPerson | undefined => team.members.find((item) => item.id === id);
    const caps = teamCapabilities(role, lifecycle);
    const { organiserId, inviteeIds, rsvps, ...stored } = structuredClone(event);
    const rest: Partial<typeof stored> = stored;
    delete rest.teamId;
    return {
      ...(rest as Omit<typeof stored, "teamId">),
      organiser: organiserId ? (person(organiserId) ?? null) : null,
      invitees: inviteeIds.flatMap((id) => {
        const found = person(id);
        return found ? [{ person: found, rsvp: rsvps[id] ?? null }] : [];
      }),
      myRsvp: rsvps.me ?? null,
      can: {
        // "Edit any event": Lead+; Members edit what they organised.
        edit: caps.editAnyTask || (caps.createTask && organiserId === "me"),
        rsvp: lifecycle === "active" && inviteeIds.includes("me"),
      },
    };
  };
  const checkEventInput = (input: TeamEventInput) => {
    const title = input.title.trim();
    if (!title && input.kind === "meeting") throw new RepositoryError("invalid", "Title required");
    if (input.time && input.end && input.end <= input.time) throw new RepositoryError("invalid", "End before start");
    if (input.url && !/^https?:\/\/\S+$/.test(input.url)) throw new RepositoryError("invalid", "Bad URL");
    return title;
  };
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
      async create(input) {
        const name = input.name.trim();
        if (!name) throw new RepositoryError("invalid", "Name required");
        const base = name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "team";
        let id = base;
        for (let n = 2; find(id); n += 1) id = base + "-" + n;
        const me = { id: "me", name: "Mehran R.", initials: "MR" };
        const initials =
          name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((word) => Array.from(word)[0] ?? "")
            .join("")
            .toLocaleUpperCase() || "T";
        const team: TeamFixture = {
          id,
          name,
          initials,
          tint: "indigo",
          description: input.description?.trim() ?? "",
          role: "owner",
          lifecycle: "active",
          planningMode: input.planningMode,
          members: [me],
          memberCount: 1,
          leadId: "me",
          openTasks: 0,
          forYou: 0,
          linkedProjectIds: [],
          checkinMissing: false,
          updatedAt: now,
        };
        teams.push(team);
        recent.unshift(id);
        return respond(summary(team));
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
      async week(teamId, week) {
        memberOf(teamId);
        return respond(weekPlan(teamId, week));
      },
      async plan(teamId, taskId, input) {
        const team = memberOf(teamId);
        const caps = teamCapabilities(team.role, team.lifecycle);
        const task = tasks.find((item) => item.id === taskId && item.teamId === teamId);
        if (!task) throw new RepositoryError("not-found", "Task not found");
        if (task.revision !== input.revision) throw new RepositoryError("conflict", "Stale revision");
        const holder = task.assignees.find((assignee) => assignee.state !== "declined");
        const planAny = caps.editWeekFocus;
        const own = !holder || holder.person.id === "me";
        // Members plan only their own tasks, and only for themselves.
        if (!caps.createTask || (!planAny && (!own || (input.assigneeId !== null && input.assigneeId !== "me")))) {
          throw new RepositoryError("forbidden", "Cannot plan this task");
        }
        if (task.source.kind === "project") {
          // Project tasks keep their project assignment (changed in the project only).
          if (input.assigneeId !== null && input.assigneeId !== (holder?.person.id ?? null)) {
            throw new RepositoryError("forbidden", "Project tasks are assigned in their project");
          }
        } else if (input.assigneeId === null) {
          if (input.week !== null) task.assignees = [];
        } else if (input.assigneeId !== holder?.person.id) {
          const person = team.members.find((item) => item.id === input.assigneeId);
          if (!person) throw new RepositoryError("invalid", "Not a member");
          task.assignees =
            person.id === "me" ? [{ person, state: "accepted" }] : [{ person, state: "pending", by: meIn(teamId) }];
        }
        task.planWeek = input.week;
        if (input.week !== null) task.carriedFrom = null;
        bump(task);
        return respond(withCan(task, team.role, team.lifecycle));
      },
      async publish(teamId, week) {
        leadOf(teamId);
        const key = teamId + ":" + week;
        planStates.set(key, { ...weekPlan(teamId, week), status: "published", publishedAt: now, publishedBy: meIn(teamId) });
        return respond(weekPlan(teamId, week));
      },
      async setFocus(teamId, week, focus) {
        leadOf(teamId);
        const lines = focus.map((line) => line.trim()).filter(Boolean);
        if (lines.some((line) => line.length > 80) || lines.length > 3) throw new RepositoryError("invalid", "Focus too long");
        const key = teamId + ":" + week;
        planStates.set(key, { ...weekPlan(teamId, week), focus: lines, focusBy: meIn(teamId), focusAt: now });
        return respond(weekPlan(teamId, week));
      },
      async review(teamId, week) {
        memberOf(teamId);
        const review = reviews.get(teamId);
        if (!review || review.week !== week) throw new RepositoryError("not-found", "No review for this week");
        return respond(structuredClone(review));
      },
      async decide(teamId, week, taskId, decision) {
        leadOf(teamId);
        const review = reviews.get(teamId);
        const row = review?.week === week ? review.unfinished.find((item) => item.taskId === taskId) : undefined;
        const task = tasks.find((item) => item.id === taskId);
        if (!review || !row || !task) throw new RepositoryError("not-found", "Not an unfinished task of that week");
        (row as { decision: typeof decision }).decision = decision;
        task.planWeek = null;
        task.carriedFrom = decision === "this-week" ? week : null;
        if (decision === "close") {
          task.status = "done";
          task.completedAt = now;
        } else if (task.status === "done") {
          task.status = "todo";
          delete task.completedAt;
        }
        bump(task);
        return respond(structuredClone(review));
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
        return respond(
          events
            .filter((event) => event.teamId === teamId && event.day >= from && event.day <= to)
            .map(({ id, title, kind, day, time, personId }) => ({ id, title, kind, day, time, ...(personId ? { personId } : {}) })),
        );
      },
      async overlays(teamId, from, to) {
        const team = memberOf(teamId);
        const within = (day: string) => day >= from && day <= to;
        const dues: TeamCalendarOverlay[] = tasks
          .filter((task) => task.teamId === teamId && task.source.kind === "team" && task.due && within(task.due) && task.status !== "done")
          .map((task) => ({
            id: `due:${task.id}`,
            kind: "task-due",
            day: task.due!,
            title: task.title,
            taskId: task.id,
            blocked: task.status === "blocked",
          }));
        // Team membership never grants project access: only projects the viewer can open.
        const projectEvents: TeamCalendarOverlay[] = (teamProjectEventFixtures[teamId] ?? []).flatMap((event) => {
          const link = team.linkedProjectIds.includes(event.projectId) ? findProject(event.projectId) : undefined;
          return link && within(event.day)
            ? [{ ...event, id: `project:${event.id}`, kind: "project-event" as const, projectName: link.name }]
            : [];
        });
        return respond([...dues, ...projectEvents]);
      },
    },
    teamEvents: {
      async range(teamId, from, to, options = {}) {
        const team = memberOf(teamId);
        const role = options.previewRole ?? team.role;
        const lifecycle: TeamLifecycle = options.previewArchived ? "archived" : team.lifecycle;
        return respond(
          events
            .filter((event) => event.teamId === teamId && event.day >= from && event.day <= to)
            .map((event) => eventDetail(event, role, lifecycle)),
        );
      },
      async create(teamId, input) {
        const team = memberOf(teamId);
        if (!teamCapabilities(team.role, team.lifecycle).createTask) throw new RepositoryError("forbidden", "Viewers cannot add events");
        const title = checkEventInput(input);
        eventCounter += 1;
        const timeOff = input.kind === "time-off";
        const event: StoredTeamEvent = {
          id: `ev-new-${eventCounter}`,
          teamId,
          title: timeOff ? title || "Time off" : title,
          kind: input.kind,
          day: input.day,
          time: timeOff ? null : input.time,
          end: timeOff ? null : input.end,
          // Time off is always the creator's own (T7).
          ...(timeOff ? { personId: "me" } : {}),
          organiserId: "me",
          inviteeIds: timeOff ? [] : team.members.map((person) => person.id),
          rsvps: timeOff ? {} : { me: "going" },
          agenda: [],
          url: timeOff ? null : (input.url ?? null),
        };
        events.push(event);
        return respond(eventDetail(event, team.role, team.lifecycle));
      },
      async update(eventId, input) {
        const event = events.find((item) => item.id === eventId);
        if (!event) throw new RepositoryError("not-found", "Event not found");
        const team = memberOf(event.teamId);
        if (!eventDetail(event, team.role, team.lifecycle).can.edit) throw new RepositoryError("forbidden", "Cannot edit this event");
        const title = checkEventInput(input);
        Object.assign(event, { title: title || event.title, day: input.day, time: input.time, end: input.end, url: input.url ?? null });
        return respond(eventDetail(event, team.role, team.lifecycle));
      },
      async rsvp(eventId, answer) {
        const event = events.find((item) => item.id === eventId);
        if (!event) throw new RepositoryError("not-found", "Event not found");
        const team = memberOf(event.teamId);
        if (!eventDetail(event, team.role, team.lifecycle).can.rsvp) throw new RepositoryError("forbidden", "Not invited");
        event.rsvps.me = answer;
        return respond(eventDetail(event, team.role, team.lifecycle));
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
      async unplanned(teamId, options = {}) {
        const team = memberOf(teamId);
        const role = options.previewRole ?? team.role;
        const lifecycle: TeamLifecycle = options.previewArchived ? "archived" : team.lifecycle;
        return respond(
          tasks
            .filter(
              (task) =>
                task.teamId === teamId &&
                task.planWeek === null &&
                task.status !== "done" &&
                (task.source.kind === "team" || canOpenProject(task.source.projectId)),
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
      async get(taskId, options = {}) {
        const task = tasks.find((item) => item.id === taskId && item.source.kind === "team");
        if (!task) throw new RepositoryError("not-found", "Task not found");
        const team = memberOf(task.teamId);
        const role = options.previewRole ?? team.role;
        const lifecycle: TeamLifecycle = options.previewArchived ? "archived" : team.lifecycle;
        const extra = teamTaskDetailFixtures[taskId] ?? {};
        const related = extra.related && canOpenProject(extra.related.projectId) ? extra.related : null;
        const creator = team.members.find((person) => person.id === team.leadId) ?? team.members[0]!;
        const by = task.assignees.find((assignee) => assignee.by)?.by ?? creator;
        const activity: TeamTaskActivity[] = [
          { id: taskId + "-created", kind: "created", actor: creator, at: task.updatedAt },
          ...(extra.assignedAt ? [{ id: taskId + "-assigned", kind: "assigned" as const, actor: by, at: extra.assignedAt }] : []),
        ];
        return respond({
          task: withCan(task, role, lifecycle),
          teamName: team.name,
          assignedAt: extra.assignedAt ?? null,
          related,
          comments: comments.get(taskId) ?? [],
          activity,
          canManageAssignments: teamCapabilities(role, lifecycle).assignOthers,
        });
      },
      async addComment(taskId, body) {
        const task = tasks.find((item) => item.id === taskId);
        if (!task) throw new RepositoryError("not-found", "Task not found");
        const team = memberOf(task.teamId);
        if (!teamCapabilities(team.role, team.lifecycle).createTask) throw new RepositoryError("forbidden", "Cannot comment");
        const text = body.trim();
        if (!text) throw new RepositoryError("invalid", "Empty comment");
        commentCounter += 1;
        const comment: TeamTaskComment = {
          id: "c-new-" + commentCounter,
          author: team.members.find((person) => person.id === "me")!,
          at: now,
          body: text,
        };
        comments.set(taskId, [...(comments.get(taskId) ?? []), comment]);
        return respond(comment);
      },
      async accept(taskId, revision) {
        const { task, team, mine } = myAssignment(taskId, revision, "pending");
        mine.state = "accepted";
        bump(task);
        project(task, team.name, true);
        return respond(withCan(task, team.role, team.lifecycle));
      },
      async decline(taskId, input) {
        const { task, team, mine } = myAssignment(taskId, input.revision, "pending");
        mine.state = "declined";
        bump(task);
        return respond(withCan(task, team.role, team.lifecycle));
      },
      async revertAccept(taskId, revision) {
        const { task, team, mine } = myAssignment(taskId, revision, "accepted");
        mine.state = "pending";
        bump(task);
        project(task, team.name, false);
        return respond(withCan(task, team.role, team.lifecycle));
      },
      async remind(taskId) {
        const task = tasks.find((item) => item.id === taskId);
        if (!task) throw new RepositoryError("not-found", "Task not found");
        const team = memberOf(task.teamId);
        if (!teamCapabilities(team.role, team.lifecycle).assignOthers) throw new RepositoryError("forbidden", "Lead+ only");
        return respond(undefined);
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
      async send(teamId, input) {
        const team = memberOf(teamId);
        const caps = teamCapabilities(team.role, team.lifecycle);
        if (!caps.invite || (input.role === "admin" && !caps.inviteAdmin)) throw new RepositoryError("forbidden", "No invite rights");
        const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (input.emails.length === 0 || input.emails.some((email) => !valid.test(email))) {
          throw new RepositoryError("invalid", "Bad email");
        }
        // Same answer for every address: never reveals whether an account exists.
        return respond({ sent: input.emails.length });
      },
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
    teamEvents: store.teamEvents,
    teamActivity: store.teamActivity,
    teamCheckins: store.teamCheckins,
    teamRecognition: store.teamRecognition,
    teamTasks: store.teamTasks,
  };
}
