import { newIdempotencyKey, typedAs, type ApiClient, type ApiClientFor, type ResponseDataIn } from "@/api/client";
import { ApiHttpError } from "@/api/errors";
import type { paths } from "@/api/generated/openapi-p6-teams";
import { addDaysToDay, dayOfInstant, instantToClockTime } from "@/lib/dates/clock-time";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import type { TeamAccess, TeamCapabilities, TeamDirectory, TeamEvent, TeamMemberRow, TeamModule, TeamPerson, TeamRole, TeamSummary } from "../team-domain";
import type { TeamCalendarRepository, TeamMemberRepository, TeamRepositories, TeamRepository, TeamSettingsRepository, ProjectAssociationRepository } from "../team-repositories";
import { RepositoryError } from "../repositories";
import { invalid, mapErrors, pageAll, retryOnConflict, revisionTag } from "./api-shared";
import { conflictAware, initialsOf, liveOnlyIn } from "./api-project-shared";

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
 *   (weekly), `forYou` 0 (no team-scoped assignment read), `checkinMissing`
 *   false (no check-ins), `recentIds` [].
 * Everything else is refused with its reason; `API_COVERAGE_MATRIX.md` → "Teams".
 */

type TeamsClient = ApiClientFor<paths>;
type Data<P extends keyof paths, M extends "get" | "post" | "patch" | "put" | "delete"> = ResponseDataIn<paths, P, M>;
type ApiTeam = Data<"/api/v1/teams/{id}", "get">;
type ApiMe = Data<"/api/v1/teams/{id}/access/me", "get">;
type ApiMembership = Data<"/api/v1/teams/{id}/memberships", "get">["items"][number];
type ApiTask = Data<"/api/v1/teams/{id}/tasks", "get">["items"][number];

const PAGE = 100;
const PROOF = "accepting or declining needs the one-time invitation proof, whose delivery is an open owner decision (OD-4)";
const NO_TASK_MODEL = "team tasks carry no assignees, plan week, checklist or dependencies, and only OPEN / IN_PROGRESS / DONE / CANCELED statuses";
const NO_PLANNING = "the API has no planning mode, week focus, publish or carry-over model";

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
const roleOf = (role: ApiMe["role"] | ApiMembership["role"]): TeamRole => (role ? ROLE[role] : "viewer");

export const teamPerson = (member: ApiMembership): TeamPerson => {
  const name = member.displayName ?? "";
  return { id: member.id, name, initials: initialsOf(name) };
};

const LIVE_MODULES: readonly TeamModule[] = ["overview", "calendar", "people"];

/** Backend capability hints ∧ what live mode can do. */
export function teamCapabilitiesOf(me: ApiMe, team: ApiTeam): TeamCapabilities {
  const has = (capability: string) => me.capabilities.includes(capability);
  const owner = me.role === "OWNER";
  const settings = has("custody.archive") || owner;
  const modules = Object.fromEntries(
    (["overview", "work", "calendar", "planning", "projects", "goals", "people", "analytics", "checkins", "recognition", "files", "settings"] as const).map((module) => [
      module,
      module === "settings" ? settings : LIVE_MODULES.includes(module),
    ]),
  ) as Record<TeamModule, boolean>;
  return {
    modules,
    setOwnStatus: false,
    editWeekFocus: false,
    // Sending an invitation returns a proof whose delivery is undecided (OD-4).
    invite: false,
    inviteAdmin: false,
    createTask: false,
    editAnyTask: false,
    assignOthers: false,
    deleteTask: false,
    seeBooking: false,
    archive: team.state === "ACTIVE" && has("custody.archive"),
    restore: team.state === "ARCHIVED" && has("custody.archive"),
    linkProjects: false,
    createProject: false,
    uploadFile: false,
    manageFiles: false,
    exportAnalytics: false,
    editGeneral: false,
    editPlanning: false,
    ownTeam: owner,
  };
}

const roster = (api: TeamsClient, teamId: string): Promise<ApiMembership[]> =>
  pageAll<ApiMembership>(async (after) => (await api.request("get", "/api/v1/teams/{id}/memberships", { path: { id: teamId }, query: { limit: PAGE, after } })).data);

const accessMe = async (api: TeamsClient, teamId: string): Promise<ApiMe> =>
  (await api.request("get", "/api/v1/teams/{id}/access/me", { path: { id: teamId } })).data;

const isHidden = (error: unknown) =>
  (error instanceof ApiHttpError && (error.status === 403 || error.status === 404)) ||
  (error instanceof RepositoryError && (error.code === "forbidden" || error.code === "not-found"));

const LIFECYCLE: Partial<Record<ApiTeam["state"], TeamSummary["lifecycle"]>> = { ACTIVE: "active", ARCHIVED: "archived" };

async function summaryOf(api: TeamsClient, team: ApiTeam): Promise<{ summary: TeamSummary; me: ApiMe } | null> {
  const lifecycle = LIFECYCLE[team.state];
  if (!lifecycle) return null;
  const [me, members, tasks, links] = await Promise.all([
    accessMe(api, team.id),
    roster(api, team.id),
    pageAll<ApiTask>(async (after) => (await api.request("get", "/api/v1/teams/{id}/tasks", { path: { id: team.id }, query: { limit: PAGE, after } })).data),
    pageAll<Data<"/api/v1/teams/{id}/projects", "get">["items"][number]>(
      async (after) => (await api.request("get", "/api/v1/teams/{id}/projects", { path: { id: team.id }, query: { limit: PAGE, after } })).data,
    ),
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
    forYou: 0,
    projectCount: links.filter((entry) => entry.link.active).length,
    restorable: lifecycle === "archived" && me.capabilities.includes("custody.archive"),
    checkinMissing: false,
    updatedAt: team.updatedAt,
  };
  return { summary, me };
}

function createApiTeamDirectory(api: TeamsClient): TeamRepository {
  const access = (id: string) =>
    mapErrors(async (): Promise<TeamAccess> => {
      try {
        const { data: team } = await api.request("get", "/api/v1/teams/{id}", { path: { id } });
        const entry = await summaryOf(api, team);
        if (!entry) return { status: "not-available" };
        return { status: "ok", team: entry.summary, capabilities: teamCapabilitiesOf(entry.me, team) };
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
      mapErrors(async () =>
        (await roster(api, id)).filter((member) => member.state === "ACTIVE").map((member) => ({ person: teamPerson(member), role: roleOf(member.role), title: "" })),
      ),

    create: () => Promise.reject(new RepositoryError("unsupported", "Teams API: creating a team needs the operator-supplied retentionPolicyVersion (OD-1)")),
    projects: () =>
      Promise.reject(new RepositoryError("unsupported", "Teams API: team project links carry no progress, health, dates, milestone or risk figures for the portfolio rows")),
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

  return liveOnly<TeamMemberRepository>(`${NO_PLANNING}; moving a member between teams and the removal preview's task counts are not in the API`, {
    list: (teamId) =>
      mapErrors(async () => {
        const [me, members] = await Promise.all([accessMe(api, teamId), roster(api, teamId)]);
        const has = (capability: string) => me.capabilities.includes(capability);
        return members
          .filter((member) => member.state === "ACTIVE")
          .map((member): TeamMemberRow => {
            const self = member.id === me.accessId;
            const manageable = member.role !== "OWNER" && !self && (has("membership.admin") || (has("membership.manager") && member.role !== "ADMIN"));
            return {
              person: teamPerson(member),
              role: roleOf(member.role),
              title: "",
              can: { changeRole: manageable, editCapacity: false, move: false, remove: manageable, leave: false },
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

    // The pending rows carry no recipient email or send time, which the Invitations tab shows.
    invitations: () => Promise.reject(new RepositoryError("unsupported", "Teams API: pending invitation rows carry no recipient email or send time")),
    resendInvite: () => Promise.reject(new RepositoryError("unsupported", `Teams API: resending needs a new proof; ${PROOF}`)),

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

function createApiTeamCalendar(api: TeamsClient): TeamCalendarRepository {
  return liveOnly<TeamCalendarRepository>("team task due dates and project layers have no team-scoped read", {
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
  return liveOnly<TeamSettingsRepository>(
    `${NO_PLANNING}; no check-in or recognition settings; the successor completes a handover with their own password (no owner confirmation step)`,
    {
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

function createApiProjectAssociations(api: TeamsClient): ProjectAssociationRepository {
  return liveOnly<ProjectAssociationRepository>("links are direct (PUT), there is no request / approval flow", {
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
  });
}

export function createApiTeamRepositories(client: ApiClient): TeamRepositories {
  const api: TeamsClient = typedAs<paths>(client);
  return {
    teams: createApiTeamDirectory(api),
    teamInvitations: liveOnly(`invitee rows carry only a label and expiry; ${PROOF}; sending returns a proof the inviter would have to deliver`),
    presence: liveOnly("no presence / manual status"),
    teamPlans: liveOnly(`${NO_PLANNING}`),
    teamCapacity: liveOnly("capacity is explicit per-day minutes (unknown = null), not weekly hours on chosen weekdays"),
    teamCalendar: createApiTeamCalendar(api),
    teamEvents: liveOnly("team meetings carry no per-person RSVP or timed agenda for this screen; meetings are served by Messages & Meetings"),
    teamActivity: liveOnly("no team activity feed"),
    teamCheckins: liveOnly("no check-ins"),
    teamRecognition: liveOnly("recognition is a confidentiality-reviewed case / disclosure flow, not a public thanks feed"),
    teamFeedback: liveOnly("private feedback is a case / disclosure flow with review and consent, not the screen's inbox"),
    teamFiles: liveOnly("no team file library"),
    teamReports: liveOnly("the dashboard has window counts only (no weekly series)"),
    teamSettings: createApiTeamSettings(api),
    teamTasks: liveOnly(`${NO_TASK_MODEL}`),
    teamSprints: liveOnly("plans of kind SPRINT have no move-to-next / backlog review model"),
    projectAssociations: createApiProjectAssociations(api),
    teamGoals: liveOnly("goals have manual progress, not the screen's periods and key-result values"),
    teamMembers: createApiTeamMembers(api),
    teamBacklog: liveOnly("no ranked team backlog"),
  };
}
