import { newIdempotencyKey, typedAs, type ApiClient, type ApiClientFor, type ResponseDataIn } from "@/api/client";
import { ApiHttpError } from "@/api/errors";
import type { paths } from "@/api/generated/openapi-p6-teams";
import { addDaysToDay, dayOfInstant, instantToClockTime } from "@/lib/dates/clock-time";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import type { Weekday } from "@/lib/dates/week";
import type { TeamAccess, TeamCapabilities, TeamDirectory, TeamEvent, TeamLinkRequest, TeamMemberRow, TeamModule, TeamPendingInvite, TeamPerson, TeamRole, TeamSettings, TeamSummary } from "../team-domain";
import type { TeamCalendarRepository, TeamMemberRepository, TeamRepositories, TeamRepository, TeamSettingsRepository, ProjectAssociationRepository } from "../team-repositories";
import { RepositoryError } from "../repositories";
import { invalid, mapErrors, pageAll, retryOnConflict, revisionTag } from "./api-shared";
import { conflictAware, initialsOf, liveOnlyIn } from "./api-project-shared";
import { createApiProjectDirectory } from "./api-project-directory-repository";
import { catalogVersion } from "./api-retention";
import { createApiTeamEvents, createApiTeamSprints, teamDueOverlays, teamPortfolio, teamProjectEventOverlays } from "./api-team-schedule-repositories";
import {
  createApiPresence,
  createApiTeamBacklog,
  createApiTeamActivity,
  createApiTeamCheckins,
  createApiTeamFeedback,
  createApiTeamCapacity,
  createApiTeamFiles,
  createApiTeamGoals,
  createApiTeamInvitations,
  createApiTeamPlans,
  createApiTeamRecognition,
  createApiTeamReports,
  createApiTeamTasks,
} from "./api-team-work-repositories";

const liveOnly = <T extends object>(requirement: string, supported: Partial<T> = {}): T => liveOnlyIn("Teams", requirement, supported);

/*
 * Teams (Phase 3) in live mode, over the 860-op subset in
 * `src/api/generated/openapi-p6-teams.d.ts`. Live mode never serves the mock
 * Teams adapters.
 * - The caller's role / capabilities come from `GET /teams/{id}/access/me`
 *   (hints only: every command is still checked by the server). A capability
 *   is true only when the backend grants it AND live mode supports the action.
 * - People: a person's id is the membership (access) id; the name is the
 *   membership `displayName` (null → blank, never invented). No job title,
 *   email or avatar is served.
 * - Lifecycle: ACTIVE → active, ARCHIVED → archived; OWNER_EXIT_FROZEN,
 *   CLOSING_GRACE and CLOSED are "not available".
 * - Not served by the API, so fixed in live mode: tint (indigo), planning mode
 *   (weekly), `checkinMissing`
 *   false (no check-ins), `recentIds` [].
 * Everything else is refused with its reason; `API_COVERAGE_MATRIX.md` → "Teams".
 */

export type TeamsClient = ApiClientFor<paths>;
type Data<P extends keyof paths, M extends "get" | "post" | "patch" | "put" | "delete"> = ResponseDataIn<paths, P, M>;
type ApiTeam = Data<"/api/v1/teams/{id}", "get">;
type ApiMe = Data<"/api/v1/teams/{id}/access/me", "get">;
type ApiMembership = Data<"/api/v1/teams/{id}/memberships", "get">["items"][number];
type ApiTask = Data<"/api/v1/teams/{id}/tasks", "get">["items"][number];
type ApiSentInvite = Data<"/api/v1/teams/{id}/sent-invitations", "get">["items"][number];

const pendingInvite = (row: Pick<ApiSentInvite, "id" | "memberRole" | "expiresAt">, email: string, sentAt: string): TeamPendingInvite => ({
  id: row.id,
  email,
  role: roleOf(row.memberRole) as Exclude<TeamRole, "owner">,
  sentAt,
  expiresAt: row.expiresAt,
});

const PAGE = 100;

const ROLE_TO_API: Record<Exclude<TeamRole, "owner">, "ADMIN" | "LEAD" | "MEMBER" | "VIEWER"> = { admin: "ADMIN", lead: "LEAD", member: "MEMBER", viewer: "VIEWER" };
const TINTS = ["blue", "indigo", "amber", "purple"] as const;

const ROLE: Record<NonNullable<ApiMe["role"]>, TeamRole> = {
  OWNER: "owner",
  ADMIN: "admin",
  ORG_ADMIN: "admin",
  MANAGER: "lead",
  LEAD: "lead",
  TEAM_LEAD: "lead",
  DEPT_MANAGER: "lead",
  MEMBER: "member",
  VIEWER: "viewer",
};

/** A null role is a grant from an enclosing scope without a team role: shown as Viewer. */
export const roleOf = (role: ApiMe["role"] | ApiMembership["role"]): TeamRole => (role ? ROLE[role] : "viewer");

export const teamPerson = (member: ApiMembership): TeamPerson => {
  const name = member.displayName ?? "";
  return { id: member.id, name, initials: initialsOf(name) };
};

const LIVE_MODULES: readonly TeamModule[] = ["overview", "work", "calendar", "planning", "projects", "goals", "people", "analytics", "files", "recognition"];

/** Backend capability hints ∧ what live mode can do. */
/** The team settings switches that gate modules (null row = never configured: both off on the server). */
export interface TeamFlagsRow {
  checkinsEnabled: boolean | null;
  statusEnabled: boolean | null;
}

export function teamCapabilitiesOf(me: ApiMe, team: ApiTeam, flags: TeamFlagsRow | null = null): TeamCapabilities {
  const has = (capability: string) => me.capabilities.includes(capability);
  const owner = me.role === "OWNER";
  const settings = has("custody.archive") || owner;
  const active = team.state === "ACTIVE";
  const modules = Object.fromEntries(
    (["overview", "work", "calendar", "planning", "projects", "goals", "people", "analytics", "checkins", "recognition", "files", "settings"] as const).map((module) => [
      module,
      module === "settings" ? settings : module === "checkins" ? flags?.checkinsEnabled === true : LIVE_MODULES.includes(module),
    ]),
  ) as Record<TeamModule, boolean>;
  return {
    modules,
    setOwnStatus: active && flags?.statusEnabled === true && me.role !== "VIEWER" && me.role !== null,
    editWeekFocus: active && has("work.manage"),
    // OD-4: recipients fetch their own proof in the app, so sending is enough.
    invite: active && (has("membership.admin") || has("membership.manager")),
    inviteAdmin: active && owner,
    createTask: team.state === "ACTIVE" && has("task.create"),
    editAnyTask: team.state === "ACTIVE" && has("work.manage"),
    assignOthers: team.state === "ACTIVE" && has("work.manage"),
    deleteTask: team.state === "ACTIVE" && has("work.manage"),
    seeBooking: me.role !== "VIEWER" && me.role !== null,
    archive: team.state === "ACTIVE" && has("custody.archive"),
    restore: team.state === "ARCHIVED" && has("custody.archive"),
    // TB-6: link requests and team-owned create both require the team's settings.manage.
    linkProjects: active && has("settings.manage"),
    createProject: active && has("settings.manage"),
    uploadFile: team.state === "ACTIVE" && has("task.create"),
    manageFiles: team.state === "ACTIVE" && has("work.manage"),
    exportAnalytics: active && has("work.manage"),
    editGeneral: active && (owner || me.role === "ADMIN"),
    editPlanning: active && has("work.manage"),
    ownTeam: owner,
  };
}

export const roster = (api: TeamsClient, teamId: string): Promise<ApiMembership[]> =>
  pageAll<ApiMembership>(async (after) => (await api.request("get", "/api/v1/teams/{id}/memberships", { path: { id: teamId }, query: { limit: PAGE, after } })).data);

export const accessMe = async (api: TeamsClient, teamId: string): Promise<ApiMe> =>
  (await api.request("get", "/api/v1/teams/{id}/access/me", { path: { id: teamId } })).data;

const isHidden = (error: unknown) =>
  (error instanceof ApiHttpError && (error.status === 403 || error.status === 404)) ||
  (error instanceof RepositoryError && (error.code === "forbidden" || error.code === "not-found"));

const LIFECYCLE: Partial<Record<ApiTeam["state"], TeamSummary["lifecycle"]>> = { ACTIVE: "active", ARCHIVED: "archived" };

async function summaryOf(api: TeamsClient, team: ApiTeam): Promise<{ summary: TeamSummary; me: ApiMe } | null> {
  const lifecycle = LIFECYCLE[team.state];
  if (!lifecycle) return null;
  const [me, members, tasks, links, work] = await Promise.all([
    accessMe(api, team.id),
    roster(api, team.id),
    pageAll<ApiTask>(async (after) => (await api.request("get", "/api/v1/teams/{id}/tasks", { path: { id: team.id }, query: { limit: PAGE, after } })).data),
    pageAll<Data<"/api/v1/teams/{id}/projects", "get">["items"][number]>(
      async (after) => (await api.request("get", "/api/v1/teams/{id}/projects", { path: { id: team.id }, query: { limit: PAGE, after } })).data,
    ),
    // "Assigned to you": my pending team assignments (not served for an archived team → 0).
    api.request("get", "/api/v1/teams/{id}/my-work", { path: { id: team.id } }).then((response) => response.data, () => null),
  ]);
  const active = members.filter((member) => member.state === "ACTIVE");
  const lead = active.find((member) => member.role === "LEAD");
  const summary: TeamSummary = {
    id: team.id,
    name: team.title,
    initials: initialsOf(team.title),
    tint: "indigo",
    description: team.description ?? "",
    role: roleOf(me.role),
    lifecycle,
    planningMode: "weekly",
    members: active.map(teamPerson),
    memberCount: active.length,
    lead: lead ? teamPerson(lead) : null,
    openTasks: tasks.filter((task) => task.deletedAt === null && (task.status === "OPEN" || task.status === "IN_PROGRESS")).length,
    forYou: work?.pending.length ?? 0,
    projectCount: links.filter((entry) => entry.link.active).length,
    restorable: lifecycle === "archived" && me.capabilities.includes("custody.archive"),
    checkinMissing: false,
    updatedAt: team.updatedAt,
  };
  return { summary, me };
}

function createApiTeamDirectory(api: TeamsClient, client: ApiClient): TeamRepository {
  const access = (id: string) =>
    mapErrors(async (): Promise<TeamAccess> => {
      try {
        const { data: team } = await api.request("get", "/api/v1/teams/{id}", { path: { id } });
        const entry = await summaryOf(api, team);
        if (!entry) return { status: "not-available" };
        const flags = await api.request("get", "/api/v1/teams/{id}/settings", { path: { id } }).then((response) => response.data, () => null);
        return { status: "ok", team: entry.summary, capabilities: teamCapabilitiesOf(entry.me, team, flags) };
      } catch (error) {
        // Forbidden and not found are the same answer (no discovery).
        if (isHidden(error)) return { status: "not-available" };
        throw error;
      }
    });

  return liveOnly<TeamRepository>("—", {
    listAccessible: () =>
      mapErrors(async (): Promise<TeamDirectory> => {
        const teams = await pageAll<ApiTeam>(async (after) => (await api.request("get", "/api/v1/teams", { query: { limit: PAGE, after } })).data);
        const summaries: TeamSummary[] = [];
        for (const team of teams) {
          // Access can end between the list and the reads: such a team is simply not shown.
          const entry = await summaryOf(api, team).catch((error: unknown) => {
            if (isHidden(error)) return null;
            throw error;
          });
          if (entry) summaries.push(entry.summary);
        }
        // The API keeps no "recently opened" list.
        return { teams: summaries, recentIds: [] };
      }),

    access,

    restore: (id) =>
      mapErrors(async () => {
        let { data: team, etag } = await api.request("get", "/api/v1/teams/{id}", { path: { id } });
        const send = () => api.request("post", "/api/v1/teams/{id}/restore", { path: { id }, header: { "If-Match": etag ?? revisionTag(team.revision) }, body: {} });
        await conflictAware(() =>
          retryOnConflict(send, async () => {
            ({ data: team, etag } = await api.request("get", "/api/v1/teams/{id}", { path: { id } }));
          }),
        );
        const answer = await access(id);
        if (answer.status !== "ok") throw new RepositoryError("not-found", "Not found");
        return answer.team;
      }),

    members: (id) =>
      mapErrors(async () => {
        const [members, profiles] = await Promise.all([
          roster(api, id),
          pageAll<Data<"/api/v1/teams/{id}/member-profiles", "get">["items"][number]>(async (after) => (await api.request("get", "/api/v1/teams/{id}/member-profiles", { path: { id }, query: { limit: PAGE, after } })).data),
        ]);
        const title = new Map(profiles.map((profile) => [profile.member.accessId, profile.jobTitle ?? ""]));
        return members.filter((member) => member.state === "ACTIVE").map((member) => ({ person: teamPerson(member), role: roleOf(member.role), title: title.get(member.id) ?? "" }));
      }),

    // OD-1: the single approved TEAM policy of the operator catalog (refused when there is none or several).
    create: (input) =>
      mapErrors(async () => {
        const title = input.name.trim();
        if (!title) invalid("A team needs a name");
        const retentionPolicyVersion = await catalogVersion(api as unknown as ApiClient, "TEAM");
        const { data: team } = await api.request("post", "/api/v1/teams", {
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { id: newIdempotencyKey(), title, description: input.description?.trim() || null, retentionPolicyVersion },
        });
        if (input.planningMode === "sprints") {
          const { data: row } = await api.request("get", "/api/v1/teams/{id}/settings", { path: { id: team.id } });
          await api.request("patch", "/api/v1/teams/{id}/settings", { path: { id: team.id }, header: { "If-Match": revisionTag(row.revision) }, body: { planningMode: "SPRINTS" } });
        }
        const answer = await access(team.id);
        if (answer.status !== "ok") throw new RepositoryError("not-found", "Not found");
        return answer.team;
      }),
    projects: (id) => mapErrors(() => teamPortfolio(api, client, id)),
  });
}

function createApiTeamMembers(api: TeamsClient): TeamMemberRepository {
  const current = async (teamId: string, personId: string): Promise<ApiMembership> => {
    const member = (await roster(api, teamId)).find((candidate) => candidate.id === personId);
    if (!member) throw new RepositoryError("not-found", "Not found");
    return member;
  };
  /** PATCH needs the state and the role together; If-Match is the quoted membership revision. */
  const change = (teamId: string, personId: string, next: (member: ApiMembership) => { state: "ACTIVE" | "REVOKED"; memberRole: "ADMIN" | "LEAD" | "MEMBER" | "VIEWER" }) =>
    mapErrors(async () => {
      let member = await current(teamId, personId);
      const send = () =>
        api.request("patch", "/api/v1/teams/{id}/memberships/{accessId}", {
          path: { id: teamId, accessId: personId },
          header: { "If-Match": revisionTag(member.revision) },
          body: next(member),
        });
      return (await conflictAware(() => retryOnConflict(send, async () => (member = await current(teamId, personId))))).data;
    });

  const sentInvites = (teamId: string) =>
    pageAll<ApiSentInvite>(
      async (after) =>
        (await api.request("get", "/api/v1/teams/{id}/sent-invitations", { path: { id: teamId }, query: { state: "PENDING", limit: PAGE, after } })).data,
    );

  const titles = async (teamId: string) =>
    new Map(
      (
        await pageAll<Data<"/api/v1/teams/{id}/member-profiles", "get">["items"][number]>(
          async (after) => (await api.request("get", "/api/v1/teams/{id}/member-profiles", { path: { id: teamId }, query: { limit: PAGE, after } })).data,
        )
      ).map((profile) => [profile.member.accessId, profile.jobTitle ?? ""]),
    );

  return liveOnly<TeamMemberRepository>("moving a member between teams is deferred (TB-3): invite them to the other team, then remove them here", {
    removalPreview: (teamId, personId) =>
      mapErrors(async () => {
        const [{ data }, member] = await Promise.all([
          api.request("get", "/api/v1/teams/{id}/memberships/{accessId}/removal-preview", { path: { id: teamId, accessId: personId } }),
          current(teamId, personId),
        ]);
        return { openTeamTasks: data.openAssignments, acceptedTeamTasks: Math.max(0, data.openAssignments - data.pendingAssignments), lastOwner: member.role === "OWNER" };
      }),

    list: (teamId) =>
      mapErrors(async () => {
        const [me, members, title] = await Promise.all([accessMe(api, teamId), roster(api, teamId), titles(teamId)]);
        const has = (capability: string) => me.capabilities.includes(capability);
        return members
          .filter((member) => member.state === "ACTIVE")
          .map((member): TeamMemberRow => {
            const self = member.id === me.accessId;
            const manageable = member.role !== "OWNER" && !self && (has("membership.admin") || (has("membership.manager") && member.role !== "ADMIN"));
            return {
              person: teamPerson(member),
              role: roleOf(member.role),
              title: title.get(member.id) ?? "",
              // Weekly capacity PUT needs work.manage. Move stays off (TB-3 deferred: invite to the other team, then remove here).
              can: { changeRole: manageable, editCapacity: has("work.manage"), move: false, remove: manageable, leave: false },
            };
          });
      }),

    setRole: (teamId, personId, role) =>
      mapErrors(async () => {
        const updated = await change(teamId, personId, () => ({ state: "ACTIVE", memberRole: role.toUpperCase() as "ADMIN" | "LEAD" | "MEMBER" | "VIEWER" }));
        return { person: teamPerson(updated), role: roleOf(updated.role), title: "", can: { changeRole: true, editCapacity: false, move: false, remove: true, leave: false } };
      }),

    remove: (teamId, personId) =>
      mapErrors(async () => {
        await change(teamId, personId, (member) => {
          if (!member.memberRole) invalid("no-team-role");
          return { state: "REVOKED", memberRole: member.memberRole };
        });
      }),

    // P3 gap closure: sent offers with the authorized recipient email (withheld → ""); sentAt = in-app offer time.
    invitations: (teamId) =>
      mapErrors(async () => (await sentInvites(teamId)).map((row) => pendingInvite(row, row.recipientEmail ?? "", row.sentAt))),

    // Resend keeps the offer identity and invalidates older proofs; If-Match = the revision just read.
    resendInvite: (teamId, inviteId) =>
      mapErrors(async () => {
        const row = (await sentInvites(teamId)).find((candidate) => candidate.id === inviteId);
        if (!row) throw new RepositoryError("not-found", "Not found");
        await conflictAware(() =>
          api.request("post", "/api/v1/teams/{id}/invitations/{offerId}/resend", {
            path: { id: teamId, offerId: inviteId },
            header: { "If-Match": revisionTag(row.revision), "Idempotency-Key": newIdempotencyKey() },
            body: {},
          }),
        );
        // The resend response has no sentAt: read the row again for the new offer time.
        const sent = (await sentInvites(teamId)).find((candidate) => candidate.id === inviteId) ?? row;
        return pendingInvite(sent, sent.recipientEmail ?? "", sent.sentAt);
      }),

    cancelInvite: (teamId, inviteId) =>
      mapErrors(async () => {
        const read = async () => (await api.request("get", "/api/v1/teams/{id}/invitations/{offerId}", { path: { id: teamId, offerId: inviteId } })).data;
        let invitation = await read();
        const send = () =>
          api.request("post", "/api/v1/teams/{id}/invitations/{offerId}/revoke", {
            path: { id: teamId, offerId: inviteId },
            header: { "If-Match": revisionTag(invitation.revision) },
            body: {},
          });
        await conflictAware(() => retryOnConflict(send, async () => (invitation = await read())));
      }),
  });
}

const eventOf = (item: Data<"/api/v1/teams/{id}/calendar", "get">["items"][number]): TeamEvent | null => {
  if (item.kind !== "EVENT" || item.status !== "ACTIVE") return null;
  if (item.schedule.kind === "ALL_DAY") return { id: item.identity, title: item.title, kind: "meeting", day: item.schedule.startDate, time: null };
  if (!item.schedule.startAt) return null;
  return { id: item.identity, title: item.title, kind: "meeting", day: dayOfInstant(item.schedule.startAt), time: instantToClockTime(item.schedule.startAt) };
};

function createApiTeamCalendar(api: TeamsClient, client: ApiClient): TeamCalendarRepository {
  return liveOnly<TeamCalendarRepository>("—", {
    overlays: (teamId, from, to) =>
      mapErrors(async () => {
        const [due, events] = await Promise.all([teamDueOverlays(api, teamId, from, to), teamProjectEventOverlays(api, client, teamId, from, to)]);
        return [...due, ...events];
      }),
    range: (teamId, from, to) =>
      mapErrors(async () => {
        const items = await pageAll<Data<"/api/v1/teams/{id}/calendar", "get">["items"][number]>(
          async (cursor) =>
            (
              await api.request("get", "/api/v1/teams/{id}/calendar", {
                path: { id: teamId },
                // `to` is exclusive in the API, inclusive in the seam.
                query: { from, to: addDaysToDay(to, 1), timezone: getPlannerTimeZone(), limit: PAGE, cursor },
              })
            ).data,
        );
        return items.map(eventOf).filter((event): event is TeamEvent => event !== null);
      }),
  });
}

function createApiTeamSettings(api: TeamsClient): TeamSettingsRepository {
  const read = async (teamId: string) => {
    const { data, etag } = await api.request("get", "/api/v1/teams/{id}", { path: { id: teamId } });
    return { title: data.title, tag: etag ?? revisionTag(data.revision) };
  };
  /** The current offer (T-M2: Owner-only list): PENDING and not yet expired. Accept is terminal, so there is no owner confirmation step. */
  const pending = async (teamId: string) =>
    (
      await pageAll<Data<"/api/v1/teams/{id}/ownership-handovers", "get">["items"][number]>(
        async (after) => (await api.request("get", "/api/v1/teams/{id}/ownership-handovers", { path: { id: teamId }, query: { limit: PAGE, after } })).data,
      )
    ).find((handover) => handover.state === "PENDING" && Date.parse(handover.expiresAt) > Date.now()) ?? null;
  const successorOf = async (teamId: string, accessId: string): Promise<TeamPerson> => {
    const successor = (await roster(api, teamId)).find((member) => member.id === accessId);
    return successor ? teamPerson(successor) : { id: accessId, name: "", initials: "" };
  };
  type ApiSettings = Data<"/api/v1/teams/{id}/settings", "get">;
  const settingsOf = async (teamId: string): Promise<TeamSettings> => {
    const [{ data: team }, { data: row }] = await Promise.all([
      api.request("get", "/api/v1/teams/{id}", { path: { id: teamId } }),
      api.request("get", "/api/v1/teams/{id}/settings", { path: { id: teamId } }),
    ]);
    return {
      name: team.title,
      initials: row.shortName ?? initialsOf(team.title),
      description: team.description ?? "",
      tint: (TINTS as readonly string[]).includes(row.color ?? "") ? (row.color as TeamSettings["tint"]) : "indigo",
      planningMode: row.planningMode === "SPRINTS" ? "sprints" : "weekly",
      weekStart: row.weekStart === null ? null : (row.weekStart as Weekday),
      estimateUnit: row.estimateUnit === "POINTS" ? "points" : "hours",
      // The server enables check-ins and status only when explicitly true.
      checkinsOn: row.checkinsEnabled === true,
      statusOn: row.statusEnabled === true,
      defaultInviteRole: row.defaultInviteRole ? ROLE[row.defaultInviteRole] as Exclude<TeamRole, "owner"> : "member",
      membersMayInvite: null,
      viewersSeeBooking: null,
      revision: row.revision,
    };
  };
  const patchSettings = async (teamId: string, body: Partial<Omit<ApiSettings, "teamId" | "revision" | "updatedAt">>, revision: number) =>
    conflictAware(() => api.request("patch", "/api/v1/teams/{id}/settings", { path: { id: teamId }, header: { "If-Match": revisionTag(revision) }, body }));
  return liveOnly<TeamSettingsRepository>(
    "the successor completes a handover with their own password (no owner confirmation step)",
    {
      get: (teamId) => mapErrors(() => settingsOf(teamId)),

      // General fields live on the team (its own revision, read fresh); the rest on the settings row (the screen's revision).
      update: (teamId, patch, revision) =>
        mapErrors(async () => {
          if (patch.membersMayInvite != null || patch.viewersSeeBooking != null) invalid("These access switches are not served by the API");
          if (patch.name !== undefined && !patch.name.trim()) invalid("A team needs a name");
          if (patch.name !== undefined || patch.description !== undefined) {
            const current = await read(teamId);
            await conflictAware(() =>
              api.request("patch", "/api/v1/teams/{id}", {
                path: { id: teamId },
                header: { "If-Match": current.tag },
                body: { ...(patch.name !== undefined ? { title: patch.name.trim() } : {}), ...(patch.description !== undefined ? { description: patch.description || null } : {}) },
              }),
            );
          }
          const body: Partial<Omit<ApiSettings, "teamId" | "revision" | "updatedAt">> = {};
          if (patch.initials !== undefined) body.shortName = patch.initials.trim() || null;
          if (patch.tint !== undefined) body.color = patch.tint;
          if (patch.weekStart !== undefined) body.weekStart = patch.weekStart;
          if (patch.estimateUnit !== undefined) body.estimateUnit = patch.estimateUnit === "points" ? "POINTS" : "HOURS";
          if (patch.checkinsOn !== undefined) body.checkinsEnabled = patch.checkinsOn;
          if (patch.statusOn !== undefined) body.statusEnabled = patch.statusOn;
          if (patch.defaultInviteRole !== undefined) body.defaultInviteRole = ROLE_TO_API[patch.defaultInviteRole];
          if (Object.keys(body).length > 0) await patchSettings(teamId, body, revision);
          return settingsOf(teamId);
        }),

      setPlanningMode: (teamId, mode) =>
        mapErrors(async () => {
          const current = await settingsOf(teamId);
          await patchSettings(teamId, { planningMode: mode === "sprints" ? "SPRINTS" : "WEEKLY" }, current.revision);
          return settingsOf(teamId);
        }),

      transfer: (teamId) =>
        mapErrors(async () => {
          const handover = await pending(teamId);
          return handover ? { successor: await successorOf(teamId, handover.toAccessId), accepted: false } : null;
        }),

      cancelTransfer: (teamId) =>
        mapErrors(async () => {
          let current = await pending(teamId);
          if (!current) return;
          const send = () =>
            api.request("post", "/api/v1/teams/{id}/ownership-handovers/{handoverId}/revoke", {
              path: { id: teamId, handoverId: current!.id },
              header: { "If-Match": revisionTag(current!.revision) },
              body: {},
            });
          await conflictAware(() =>
            retryOnConflict(send, async () => {
              current = await pending(teamId);
              if (!current) throw new RepositoryError("conflict", "Changed elsewhere");
            }),
          );
        }),

      archive: (teamId) =>
        mapErrors(async () => {
          let current = await read(teamId);
          const send = () => api.request("post", "/api/v1/teams/{id}/archive", { path: { id: teamId }, header: { "If-Match": current.tag }, body: {} });
          await conflictAware(() => retryOnConflict(send, async () => (current = await read(teamId))));
        }),

      // The team starts its deletion grace period; the typed name is checked against the live title first.
      remove: (teamId, confirm) =>
        mapErrors(async () => {
          let current = await read(teamId);
          if (confirm.name.trim() !== current.title.trim()) invalid("name-mismatch");
          const send = () =>
            api.request("post", "/api/v1/teams/{id}/delete", { path: { id: teamId }, header: { "If-Match": current.tag }, body: { password: confirm.password } });
          await conflictAware(() => retryOnConflict(send, async () => (current = await read(teamId))));
        }),

      // The successor (a membership id) accepts first; the API serves no request time.
      requestTransfer: (teamId, personId) =>
        mapErrors(async () => {
          const [{ data: handover }, members] = await Promise.all([
            api.request("post", "/api/v1/teams/{id}/ownership-handovers", {
              path: { id: teamId },
              header: { "Idempotency-Key": newIdempotencyKey() },
              body: { successorAccessId: personId },
            }),
            roster(api, teamId),
          ]);
          const successor = members.find((member) => member.id === handover.toAccessId);
          return {
            successor: successor ? teamPerson(successor) : { id: handover.toAccessId, name: "", initials: "" },
            accepted: handover.state === "ACCEPTED",
          };
        }),
    },
  );
}

type ApiAssociation = Data<"/api/v1/teams/{id}/projects/{projectId}/association-request", "get">;

/**
 * Link requests (P3 gap closure): pending LINK requests of this team, request =
 * POST association-requests {LINK} with the current association revision,
 * approve = decision APPROVE (both settings authorities, checked by the server).
 * Requests never grant project membership. Project names come from the
 * caller's own Projects directory; a project they cannot open stays unnamed.
 */
function createApiProjectAssociations(api: TeamsClient, client: ApiClient): ProjectAssociationRepository {
  const known = new Map<string, { teamId: string; projectId: string }>();
  const read = async (teamId: string, projectId: string): Promise<ApiAssociation> =>
    (await api.request("get", "/api/v1/teams/{id}/projects/{projectId}/association-request", { path: { id: teamId, projectId } })).data;
  const names = async () => {
    const directory = await createApiProjectDirectory(client).listAccessible().catch(() => null);
    return new Map((directory?.projects ?? []).map((project) => [project.id, project.name]));
  };
  const toRequest = (row: ApiAssociation, name: Map<string, string>): TeamLinkRequest | null => {
    if (!row.request || row.request.state !== "PENDING" || row.request.action !== "LINK") return null;
    known.set(row.request.id, { teamId: row.teamId, projectId: row.projectId });
    return { id: row.request.id, projectId: row.projectId, projectName: name.get(row.projectId) ?? "", requestedAt: row.request.requestedAt, requestedBy: null };
  };
  return {
    requests: (teamId) =>
      mapErrors(async () => {
        const [rows, name] = await Promise.all([
          pageAll<ApiAssociation>(
            async (after) => (await api.request("get", "/api/v1/teams/{id}/project-association-requests", { path: { id: teamId }, query: { limit: PAGE, after } })).data,
          ),
          names(),
        ]);
        return rows.flatMap((row) => toRequest(row, name) ?? []);
      }),

    request: (teamId, projectId) =>
      mapErrors(async () => {
        const current = await read(teamId, projectId);
        if (current.active || current.request?.state === "PENDING") throw new RepositoryError("conflict", "Already linked or requested");
        const { data } = await conflictAware(() =>
          api.request("post", "/api/v1/teams/{id}/projects/{projectId}/association-requests", {
            path: { id: teamId, projectId },
            header: { "If-Match": revisionTag(current.revision), "Idempotency-Key": newIdempotencyKey() },
            body: { id: newIdempotencyKey(), action: "LINK" },
          }),
        );
        const request = toRequest(data, await names());
        if (!request) throw new RepositoryError("conflict", "The request was not recorded");
        return request;
      }),

    approve: (requestId) =>
      mapErrors(async () => {
        const where = known.get(requestId);
        if (!where) throw new RepositoryError("not-found", "Request not loaded (open the list again)");
        const current = await read(where.teamId, where.projectId);
        if (current.request?.id !== requestId || current.request.state !== "PENDING") throw new RepositoryError("conflict", "The request changed");
        await conflictAware(() =>
          api.request("post", "/api/v1/teams/{id}/projects/{projectId}/association-request/decision", {
            path: { id: where.teamId, projectId: where.projectId },
            header: { "If-Match": revisionTag(current.revision) },
            body: { decision: "APPROVE" },
          }),
        );
      }),

    unlink: (teamId, projectId) =>
      mapErrors(async () => {
        const read = async () => {
          const links = await pageAll<Data<"/api/v1/teams/{id}/projects", "get">["items"][number]>(
            async (after) => (await api.request("get", "/api/v1/teams/{id}/projects", { path: { id: teamId }, query: { limit: PAGE, after } })).data,
          );
          const entry = links.find((candidate) => candidate.link.projectId === projectId && candidate.link.active);
          if (!entry) throw new RepositoryError("not-found", "Not found");
          return entry.link;
        };
        let link = await read();
        const send = () =>
          api.request("delete", "/api/v1/teams/{id}/projects/{projectId}", { path: { id: teamId, projectId }, header: { "If-Match": revisionTag(link.revision) } });
        await conflictAware(() => retryOnConflict(send, async () => (link = await read())));
      }),
  };
}

export function createApiTeamRepositories(client: ApiClient): TeamRepositories {
  const api: TeamsClient = typedAs<paths>(client);
  return {
    teams: createApiTeamDirectory(api, client),
    teamInvitations: createApiTeamInvitations(api),
    presence: createApiPresence(api),
    teamPlans: createApiTeamPlans(api),
    teamCapacity: createApiTeamCapacity(api),
    teamCalendar: createApiTeamCalendar(api, client),
    teamEvents: createApiTeamEvents(api),
    teamActivity: createApiTeamActivity(api),
    teamCheckins: createApiTeamCheckins(api),
    teamRecognition: createApiTeamRecognition(api),
    teamFeedback: createApiTeamFeedback(api),
    teamFiles: createApiTeamFiles(api),
    teamReports: createApiTeamReports(api),
    teamSettings: createApiTeamSettings(api),
    teamTasks: createApiTeamTasks(api),
    teamSprints: createApiTeamSprints(api),
    projectAssociations: createApiProjectAssociations(api, client),
    teamGoals: createApiTeamGoals(api),
    teamMembers: createApiTeamMembers(api),
    teamBacklog: createApiTeamBacklog(api),
  };
}
