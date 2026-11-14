import { newIdempotencyKey, type ApiClient, type ResponseDataIn } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-teams";
import { addDaysToDay, dayOfInstant, instantToClockTime } from "@/lib/dates/clock-time";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import type {
  SprintItem,
  SprintReview,
  TeamCalendarOverlay,
  TeamEventDetail,
  TeamPerson,
  TeamPortfolioProject,
  TeamRsvp,
  TeamSprint,
  TeamSprintState,
  TeamTimeOffHistoryEntry,
  TeamTimeOffRequest,
} from "../team-domain";
import type { TeamEventInput, TeamEventRepository, TeamSprintRepository } from "../team-repositories";
import { RepositoryError } from "../repositories";
import { invalid, mapErrors, pageAll, revisionTag } from "./api-shared";
import { conflictAware } from "./api-project-shared";
import { createApiProjectDirectory } from "./api-project-directory-repository";
import { accessMe, roster, teamPerson, type TeamsClient } from "./api-team-repositories";
import { teamWork, toTeamTask } from "./api-team-work-repositories";
import { localInstant } from "./api-tasks-repository";

/**
 * Team calendar events + time off (TM-03), sprints (TM-05) and the project
 * portfolio (TM-06) over the Teams API. IMPLEMENTED ≠ LIVE VERIFIED.
 * `API_COVERAGE_MATRIX.md` → "Teams — Session 3".
 */

type Data<P extends keyof paths, M extends "get" | "post" | "patch" | "put" | "delete"> = ResponseDataIn<paths, P, M>;
type ApiCalendarItem = Data<"/api/v1/teams/{id}/calendar", "get">["items"][number];
type ApiMeeting = Data<"/api/v1/teams/{id}/meetings", "get">["items"][number];
type ApiInvite = Data<"/api/v1/teams/{id}/meetings/{meetingId}/invitations", "get">["items"][number];
type ApiTimeOff = Data<"/api/v1/teams/{id}/time-off", "get">["items"][number];
type ApiTimeOffStep = Data<"/api/v1/teams/{id}/time-off/{timeOffId}/history", "get">["items"][number];
type ApiPlan = Data<"/api/v1/teams/{id}/plans", "get">["items"][number];
type ApiMember = Awaited<ReturnType<typeof roster>>[number];

const PAGE = 100;
const TIME_OFF_STATE: Record<ApiTimeOff["state"], TeamTimeOffRequest["state"]> = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELED: "canceled",
};
const TIME_OFF_ACTION: Record<ApiTimeOffStep["action"], TeamTimeOffHistoryEntry["action"]> = {
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELED: "canceled",
};
const DAY_MS = 86_400_000;
const today = () => dayOfInstant(new Date().toISOString());
const unsupported = (reason: string) => new RepositoryError("unsupported", `Teams API: ${reason}`);

// ── TM-03 events + time off ─────────────────────────────────────────────

/** `update` / `rsvp` carry only the event id: the team and source are remembered from the last `range` / `create`. */
interface EventRef {
  teamId: string;
  eventId: string | null;
  meetingId: string | null;
  /** Event revision seen by the viewer (cancel refuses a newer version), or null. */
  revision: number | null;
}

const RSVP: Partial<Record<ApiInvite["state"], TeamRsvp | null>> = { PENDING: null, ACCEPTED: "going", DECLINED: "no" };
const URL_ONLY = /^https?:\/\/\S+$/;

/** All-day `endDate` is exclusive in the API (calendar expansion uses `endDate > from`). */
function scheduleOf(input: TeamEventInput) {
  const timezone = getPlannerTimeZone();
  if (!input.time)
    return { kind: "ALL_DAY" as const, timezone, startDate: input.day, endDate: addDaysToDay(input.day, 1) };
  if (!input.end) invalid("An event needs an end time");
  if (input.end! <= input.time) invalid("The end is before the start");
  return {
    kind: "TIMED" as const,
    timezone,
    localStart: `${input.day}T${input.time}`,
    localEnd: `${input.day}T${input.end}`,
  };
}

function timesOf(
  item: Pick<ApiCalendarItem, "schedule">,
): { day: string; time: string | null; end: string | null } | null {
  const schedule = item.schedule;
  if (schedule.kind === "ALL_DAY") return { day: schedule.startDate, time: null, end: null };
  if (!schedule.startAt) return null;
  return {
    day: dayOfInstant(schedule.startAt),
    time: instantToClockTime(schedule.startAt),
    end: schedule.endAt ? instantToClockTime(schedule.endAt) : null,
  };
}

export function createApiTeamEvents(api: TeamsClient): TeamEventRepository {
  const refs = new Map<string, EventRef>();
  /** Time-off request id → revision last read (If-Match for decide / cancel). */
  const timeOffRevisions = new Map<string, number>();
  const timeOffRevision = (requestId: string) => {
    const revision = timeOffRevisions.get(requestId);
    if (revision === undefined) throw new RepositoryError("not-found", "Request not loaded (open the list again)");
    return revision;
  };

  const meetingsOf = (teamId: string) =>
    pageAll<ApiMeeting>(
      async (after) =>
        (
          await api.request("get", "/api/v1/teams/{id}/meetings", {
            path: { id: teamId },
            query: { limit: PAGE, after },
          })
        ).data,
    );
  const invitesOf = (teamId: string, meetingId: string) =>
    pageAll<ApiInvite>(
      async (after) =>
        (
          await api.request("get", "/api/v1/teams/{id}/meetings/{meetingId}/invitations", {
            path: { id: teamId, meetingId },
            query: { limit: PAGE, after },
          })
        ).data,
    );

  interface Context {
    me: Awaited<ReturnType<typeof accessMe>>;
    members: ApiMember[];
    byAccess: (accessId: string) => TeamPerson;
    byActor: (actorId: string) => TeamPerson | null;
    canEdit: boolean;
  }
  async function context(teamId: string): Promise<Context> {
    const [me, members, team] = await Promise.all([
      accessMe(api, teamId),
      roster(api, teamId),
      api.request("get", "/api/v1/teams/{id}", { path: { id: teamId } }).then((response) => response.data),
    ]);
    const access = new Map(members.map((member) => [member.id, teamPerson(member)]));
    const actor = new Map(members.map((member) => [member.actorId, teamPerson(member)]));
    return {
      me,
      members,
      byAccess: (accessId) => access.get(accessId) ?? { id: accessId, name: "", initials: "" },
      byActor: (actorId) => actor.get(actorId) ?? null,
      // Meetings, agenda and invitations are `work.manage` writes on the server.
      canEdit: team.state === "ACTIVE" && me.capabilities.includes("work.manage"),
    };
  }

  function meetingDetail(
    teamId: string,
    ctx: Context,
    id: string,
    title: string,
    when: { day: string; time: string | null; end: string | null },
    meeting: ApiMeeting | null,
    invites: readonly ApiInvite[],
  ): TeamEventDetail {
    refs.set(id, {
      teamId,
      eventId: meeting?.event.id ?? id,
      meetingId: meeting?.id ?? null,
      revision: meeting?.event.revision ?? null,
    });
    const live = invites.filter((invite) => invite.state in RSVP);
    const mine = live.find((invite) => invite.member.accessId === ctx.me.accessId);
    const description = meeting?.event.description?.trim() ?? "";
    return {
      id,
      title,
      kind: "meeting",
      ...when,
      organiser: meeting ? ctx.byActor(meeting.createdByActorId) : null,
      invitees: live.map((invite) => ({
        person: ctx.byAccess(invite.member.accessId),
        rsvp: RSVP[invite.state] ?? null,
      })),
      // The API agenda is free text: one line per item, no owner or minutes.
      agenda: (meeting?.agenda ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => ({ id: `${id}:agenda:${index}`, title: line, owner: null, minutes: null })),
      url: URL_ONLY.test(description) ? description : null,
      myRsvp: mine ? (RSVP[mine.state] ?? null) : null,
      // An invitation is answered once (PENDING → ACCEPTED / DECLINED).
      // Cancel = DELETE of the meeting event (`work.manage`); recurring series are not offered.
      can: {
        edit: ctx.canEdit,
        rsvp: mine?.state === "PENDING",
        cancel: ctx.canEdit && meeting !== null && !meeting.event.seriesId,
      },
    };
  }

  function timeOffDays(ctx: Context, teamId: string, row: ApiTimeOff, from: string, to: string): TeamEventDetail[] {
    const person = ctx.byAccess(row.member.accessId);
    const days: TeamEventDetail[] = [];
    for (
      let day = row.startDate < from ? from : row.startDate;
      day <= row.endDate && day <= to;
      day = addDaysToDay(day, 1)
    ) {
      const id = `${row.id}@${day}`;
      refs.set(id, { teamId, eventId: null, meetingId: null, revision: null });
      days.push({
        id,
        title: person.name,
        kind: "time-off",
        day,
        time: null,
        end: null,
        personId: person.id,
        organiser: person,
        invitees: [],
        agenda: [],
        url: null,
        myRsvp: null,
        can: { edit: false, rsvp: false, cancel: false },
      });
    }
    return days;
  }

  function timeOffRequest(ctx: Context, row: ApiTimeOff): TeamTimeOffRequest {
    timeOffRevisions.set(row.id, row.revision);
    return {
      id: row.id,
      person: ctx.byAccess(row.member.accessId),
      mine: row.member.accessId === ctx.me.accessId,
      startDate: row.startDate,
      endDate: row.endDate,
      reason: row.reason,
      state: TIME_OFF_STATE[row.state],
      decisionNote: row.decisionNote,
      decidedAt: row.decidedAt,
      createdAt: row.createdAt,
      can: { decide: row.can.decide, cancel: row.can.cancel },
    };
  }

  async function range(teamId: string, from: string, to: string): Promise<TeamEventDetail[]> {
    const [ctx, items, meetings, timeOff] = await Promise.all([
      context(teamId),
      pageAll<ApiCalendarItem>(
        async (cursor) =>
          (
            await api.request("get", "/api/v1/teams/{id}/calendar", {
              path: { id: teamId },
              query: { from, to: addDaysToDay(to, 1), timezone: getPlannerTimeZone(), limit: PAGE, cursor },
            })
          ).data,
      ),
      meetingsOf(teamId),
      // Only approved absences are shown on the calendar (pending / rejected are not absences).
      pageAll<ApiTimeOff>(
        async (after) =>
          (
            await api.request("get", "/api/v1/teams/{id}/time-off", {
              path: { id: teamId },
              query: { limit: PAGE, after, state: "APPROVED" },
            })
          ).data,
      ),
    ]);
    const byEvent = new Map(meetings.map((meeting) => [meeting.event.id, meeting]));
    const events: TeamEventDetail[] = [];
    const invites = new Map<string, ApiInvite[]>();
    for (const item of items) {
      if (item.kind !== "EVENT" || item.status !== "ACTIVE") continue;
      const when = timesOf(item);
      if (!when) continue;
      const meeting = byEvent.get(item.resourceId) ?? null;
      if (meeting && !invites.has(meeting.id)) invites.set(meeting.id, await invitesOf(teamId, meeting.id));
      events.push(
        meetingDetail(teamId, ctx, item.identity, item.title, when, meeting, meeting ? invites.get(meeting.id)! : []),
      );
    }
    for (const row of timeOff)
      if (row.startDate <= to && row.endDate >= from) events.push(...timeOffDays(ctx, teamId, row, from, to));
    return events.sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? "").localeCompare(b.time ?? ""));
  }

  async function reread(teamId: string, meetingId: string, id: string): Promise<TeamEventDetail> {
    const [ctx, { data: meeting }, invites] = await Promise.all([
      context(teamId),
      api.request("get", "/api/v1/teams/{id}/meetings/{meetingId}", { path: { id: teamId, meetingId } }),
      invitesOf(teamId, meetingId),
    ]);
    const when = timesOf(meeting.event);
    if (!when) throw new RepositoryError("not-found", "Not found");
    return meetingDetail(teamId, ctx, id, meeting.event.title, when, meeting, invites);
  }

  function refOf(eventId: string): EventRef {
    const ref = refs.get(eventId);
    if (!ref) throw new RepositoryError("not-found", "Event not loaded (open the calendar again)");
    return ref;
  }

  return {
    range: (teamId, from, to) => mapErrors(() => range(teamId, from, to)),

    create: (teamId, input) =>
      mapErrors(async (): Promise<TeamEventDetail> => {
        const ctx = await context(teamId);
        if (input.kind === "time-off") {
          // Own time off is a request; it shows on the calendar once a manager approves it.
          const { data } = await api.request("post", "/api/v1/teams/{id}/time-off", {
            path: { id: teamId },
            header: { "Idempotency-Key": newIdempotencyKey() },
            body: {
              id: newIdempotencyKey(),
              startDate: input.day,
              endDate: input.day,
              minutesPerDay: null,
              reason: input.title.trim() || null,
            },
          });
          return timeOffDays(ctx, teamId, data, input.day, input.day)[0]!;
        }
        const title = input.title.trim();
        if (!title) invalid("A team event needs a title");
        const url = input.url?.trim() || null;
        const id = newIdempotencyKey();
        const { data: meeting } = await api.request("post", "/api/v1/teams/{id}/meetings", {
          path: { id: teamId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          // The external link is kept as the event description (the API has no URL field).
          body: { id, event: { title, description: url, schedule: scheduleOf(input) }, agenda: "" },
        });
        // Every other active member is invited; invitations live at most 7 days and end with the event.
        const schedule = meeting.event.schedule;
        const endsAt = Date.parse(
          schedule.kind === "TIMED" && schedule.endAt
            ? schedule.endAt
            : localInstant(addDaysToDay(input.day, 1), "00:00"),
        );
        const expiresAt = Math.min(endsAt, Date.now() + 7 * DAY_MS - 60_000);
        if (expiresAt > Date.now() + 60_000) {
          for (const member of ctx.members) {
            if (member.state !== "ACTIVE" || member.id === ctx.me.accessId) continue;
            await api.request("post", "/api/v1/teams/{id}/meetings/{meetingId}/invitations", {
              path: { id: teamId, meetingId: meeting.id },
              header: { "If-Match": revisionTag(meeting.revision), "Idempotency-Key": newIdempotencyKey() },
              body: {
                id: newIdempotencyKey(),
                member: { accessId: member.id, generation: member.generation },
                expiresAt: new Date(expiresAt).toISOString(),
              },
            });
          }
        }
        return reread(teamId, meeting.id, meeting.event.id);
      }),

    update: (eventId, input) =>
      mapErrors(async () => {
        const ref = refOf(eventId);
        if (!ref.eventId) throw unsupported("time off cannot be edited (cancel the request and ask again)");
        if (input.kind !== "meeting") throw unsupported("an event cannot become time off");
        const title = input.title.trim();
        if (!title) invalid("A team event needs a title");
        const { data: event } = await api.request("get", "/api/v1/teams/{id}/calendar/events/{eventId}", {
          path: { id: ref.teamId, eventId: ref.eventId },
        });
        await conflictAware(() =>
          api.request("patch", "/api/v1/teams/{id}/calendar/events/{eventId}", {
            path: { id: ref.teamId, eventId: ref.eventId! },
            header: { "If-Match": revisionTag(event.revision) },
            body: { title, description: input.url?.trim() || null, schedule: scheduleOf(input) },
          }),
        );
        if (ref.meetingId) return reread(ref.teamId, ref.meetingId, eventId);
        const ctx = await context(ref.teamId);
        const { data: updated } = await api.request("get", "/api/v1/teams/{id}/calendar/events/{eventId}", {
          path: { id: ref.teamId, eventId: ref.eventId },
        });
        const when = timesOf(updated);
        if (!when) throw new RepositoryError("not-found", "Not found");
        return {
          ...meetingDetail(ref.teamId, ctx, eventId, updated.title, when, null, []),
          url: URL_ONLY.test(updated.description ?? "") ? updated.description : null,
        };
      }),

    rsvp: (eventId, rsvp) =>
      mapErrors(async () => {
        const ref = refOf(eventId);
        if (!ref.meetingId) throw new RepositoryError("forbidden", "Not invited");
        if (rsvp === "maybe") throw unsupported("invitations are answered with accept or decline only");
        const me = await accessMe(api, ref.teamId);
        const mine = (await invitesOf(ref.teamId, ref.meetingId)).find(
          (invite) => invite.member.accessId === me.accessId,
        );
        if (!mine) throw new RepositoryError("forbidden", "Not invited");
        if (mine.state !== "PENDING") throw new RepositoryError("conflict", "Already answered");
        await conflictAware(() =>
          api.request("post", "/api/v1/teams/{id}/meetings/{meetingId}/invitations/{invitationId}/respond", {
            path: { id: ref.teamId, meetingId: ref.meetingId!, invitationId: mine.id },
            header: { "If-Match": revisionTag(mine.revision) },
            body: { decision: rsvp === "going" ? "ACCEPTED" : "DECLINED" },
          }),
        );
        return reread(ref.teamId, ref.meetingId, eventId);
      }),

    cancel: (eventId) =>
      mapErrors(async () => {
        const ref = refOf(eventId);
        if (!ref.eventId || !ref.meetingId) throw unsupported("only team meetings can be canceled here");
        const { data: event } = await api.request("get", "/api/v1/teams/{id}/calendar/events/{eventId}", {
          path: { id: ref.teamId, eventId: ref.eventId },
        });
        // Already canceled, or changed since the calendar was read: never cancel a version the viewer did not see.
        if (event.status !== "ACTIVE" || event.deletedAt) throw new RepositoryError("conflict", "Already canceled");
        if (ref.revision !== null && event.revision !== ref.revision)
          throw new RepositoryError("conflict", "Changed elsewhere");
        await conflictAware(() =>
          api.request("delete", "/api/v1/teams/{id}/calendar/events/{eventId}", {
            path: { id: ref.teamId, eventId: ref.eventId! },
            header: { "If-Match": revisionTag(event.revision) },
            body: {},
          }),
        );
        refs.delete(eventId);
      }),

    timeOff: (teamId) =>
      mapErrors(async () => {
        const [ctx, rows] = await Promise.all([
          context(teamId),
          pageAll<ApiTimeOff>(
            async (after) =>
              (
                await api.request("get", "/api/v1/teams/{id}/time-off", {
                  path: { id: teamId },
                  query: { limit: PAGE, after },
                })
              ).data,
          ),
        ]);
        return rows
          .map((row) => timeOffRequest(ctx, row))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }),

    decideTimeOff: (teamId, requestId, decision, note) =>
      mapErrors(async () => {
        const [ctx, { data }] = await Promise.all([
          context(teamId),
          conflictAware(() =>
            api.request("post", "/api/v1/teams/{id}/time-off/{timeOffId}/decision", {
              path: { id: teamId, timeOffId: requestId },
              header: { "If-Match": revisionTag(timeOffRevision(requestId)) },
              body: { decision: decision === "approve" ? "APPROVE" : "REJECT", note: note?.trim() || null },
            }),
          ),
        ]);
        return timeOffRequest(ctx, data);
      }),

    cancelTimeOff: (teamId, requestId) =>
      mapErrors(async () => {
        const [ctx, { data }] = await Promise.all([
          context(teamId),
          conflictAware(() =>
            api.request("post", "/api/v1/teams/{id}/time-off/{timeOffId}/cancel", {
              path: { id: teamId, timeOffId: requestId },
              header: { "If-Match": revisionTag(timeOffRevision(requestId)) },
              body: {},
            }),
          ),
        ]);
        return timeOffRequest(ctx, data);
      }),

    timeOffHistory: (teamId, requestId) =>
      mapErrors(async () => {
        const [ctx, rows] = await Promise.all([
          context(teamId),
          pageAll<ApiTimeOffStep>(
            async (after) =>
              (
                await api.request("get", "/api/v1/teams/{id}/time-off/{timeOffId}/history", {
                  path: { id: teamId, timeOffId: requestId },
                  query: { limit: PAGE, after },
                })
              ).data,
          ),
        ]);
        return rows
          .map((row) => ({
            id: row.id,
            action: TIME_OFF_ACTION[row.action],
            by: row.by ? ctx.byAccess(row.by.accessId) : null,
            at: row.createdAt,
          }))
          .sort((a, b) => a.at.localeCompare(b.at));
      }),
  };
}

/** TM-03 layer: due dates of the team's open tasks (project events need a project calendar read and are left out). */
export async function teamDueOverlays(
  api: TeamsClient,
  teamId: string,
  from: string,
  to: string,
): Promise<TeamCalendarOverlay[]> {
  const snap = await teamWork(api, teamId, { checklists: false });
  return snap.rows.flatMap((row): TeamCalendarOverlay[] => {
    if (!row.dueAt || row.boardState === "DONE") return [];
    const day = dayOfInstant(row.dueAt);
    if (day < from || day > to) return [];
    return [
      {
        id: `due:${row.task.id}`,
        kind: "task-due",
        day,
        title: row.task.title,
        taskId: row.task.id,
        blocked: row.boardState === "BLOCKED",
      },
    ];
  });
}

// ── TM-05 sprints ───────────────────────────────────────────────────────

/** Working days follow the Iran week (Sat–Wed), as in the approved sprint screen. */
const WORK_DAYS = new Set([6, 0, 1, 2, 3]);
const SPRINT_DAYS = 14; // SPEC TM-05: "2 weeks" when no earlier sprint sets the length.
const round2 = (value: number) => Math.round(value * 100) / 100;
const workDays = (start: string, end: string) => {
  const days: string[] = [];
  for (let day = start; day <= end; day = addDaysToDay(day, 1))
    if (WORK_DAYS.has(new Date(`${day}T12:00:00Z`).getUTCDay())) days.push(day);
  return days;
};
const spanOf = (plan: ApiPlan) =>
  Math.round((Date.parse(`${plan.endDate}T00:00:00Z`) - Date.parse(`${plan.startDate}T00:00:00Z`)) / DAY_MS) + 1;

export function createApiTeamSprints(api: TeamsClient): TeamSprintRepository {
  async function read(teamId: string) {
    const path = { id: teamId };
    const [settings, snap, points] = await Promise.all([
      api.request("get", "/api/v1/teams/{id}/settings", { path }).then((response) => response.data),
      teamWork(api, teamId, { checklists: false }),
      pageAll<Data<"/api/v1/teams/{id}/task-points", "get">["items"][number]>(
        async (after) =>
          (await api.request("get", "/api/v1/teams/{id}/task-points", { path, query: { limit: PAGE, after } })).data,
      ),
    ]);
    if (settings.planningMode !== "SPRINTS") throw unsupported("sprints are off for this team (Settings › Planning)");
    const unit = settings.estimateUnit === "POINTS" ? ("points" as const) : ("hours" as const);
    const pointsOf = new Map(points.map((entry) => [entry.taskId, entry.points]));
    const estimate = (taskId: string, minutes: number | null) =>
      unit === "points" ? (pointsOf.get(taskId) ?? 0) : round2((minutes ?? 0) / 60);
    const sprints = snap.plans
      .filter((plan) => plan.kind === "SPRINT")
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    return { unit, snap, sprints, estimate };
  }
  type Read = Awaited<ReturnType<typeof read>>;

  const summaryOf = async (teamId: string, planId: string) =>
    (await api.request("get", "/api/v1/teams/{id}/plans/{planId}/summary", { path: { id: teamId, planId } })).data;
  const pointsSummary = async (teamId: string, planId: string) =>
    (await api.request("get", "/api/v1/teams/{id}/plans/{planId}/points", { path: { id: teamId, planId } })).data;

  function itemsOf(teamId: string, r: Read, planId: string): SprintItem[] {
    return r.snap.rows
      .filter((row) => row.items.some((item) => item.planId === planId))
      .map((row) => {
        const task = toTeamTask(teamId, r.snap, row);
        const assignee =
          task.assignees.find((entry) => entry.state === "accepted") ??
          task.assignees.find((entry) => entry.state === "pending") ??
          null;
        return {
          taskId: row.task.id,
          title: row.task.title,
          source: { kind: "team" as const },
          status: task.status,
          estimate: r.estimate(row.task.id, row.estimatedMinutes),
          assignee: assignee?.person ?? null,
        };
      });
  }

  /** People capacity over the days in hours; null in points or beyond the API's 31-day window (never converted). */
  async function capacityOf(
    teamId: string,
    unit: "points" | "hours",
    start: string,
    end: string,
  ): Promise<number | null> {
    if (unit === "points" || spanOf({ startDate: start, endDate: end } as ApiPlan) > 31) return null;
    const { data } = await api.request("get", "/api/v1/teams/{id}/capacity/summary", {
      path: { id: teamId },
      query: { from: start, to: end, timezone: getPlannerTimeZone() },
    });
    return round2(data.members.reduce((sum, row) => sum + row.totals.netAvailableMinutes, 0) / 60);
  }

  const numberOf = (r: Read, plan: ApiPlan, served: number | null) => served ?? r.sprints.indexOf(plan) + 1;

  async function totals(teamId: string, unit: "points" | "hours", planId: string) {
    const summary = await summaryOf(teamId, planId);
    if (unit === "points") {
      const points = await pointsSummary(teamId, planId);
      return { summary, committed: points.plannedPoints, done: points.completedPoints };
    }
    return { summary, committed: round2(summary.plannedMinutes / 60), done: round2(summary.doneMinutes / 60) };
  }

  function nextDates(r: Read): { start: string; end: string } {
    const draft = r.sprints.find((plan) => plan.state === "DRAFT");
    if (draft) return { start: draft.startDate, end: draft.endDate };
    const last = r.sprints.filter((plan) => plan.state !== "DRAFT").at(-1);
    const after = last ? addDaysToDay(last.endDate, 1) : today();
    // A late start never back-dates the sprint.
    const start = after < today() ? today() : after;
    return { start, end: addDaysToDay(start, (last ? spanOf(last) : SPRINT_DAYS) - 1) };
  }

  async function current(teamId: string): Promise<TeamSprintState> {
    const r = await read(teamId);
    const active = r.sprints.find((plan) => plan.state === "ACTIVE") ?? null;
    const draft = r.sprints.find((plan) => plan.state === "DRAFT") ?? null;
    let sprint: TeamSprint | null = null;
    if (active) {
      const { summary, committed, done } = await totals(teamId, r.unit, active.id);
      const days = workDays(active.startDate, active.endDate);
      const now = today();
      const remaining = new Map(summary.days.map((entry) => [entry.date, entry.remainingMinutes]));
      // Daily remaining is served in minutes only: a points burndown is not drawn.
      const burndown: { day: string; remaining: number }[] = [];
      if (r.unit === "hours") {
        for (const day of days) {
          const minutes = remaining.get(day);
          if (day > now || minutes === null || minutes === undefined) break;
          burndown.push({ day, remaining: round2(minutes / 60) });
        }
      }
      sprint = {
        id: active.id,
        number: numberOf(r, active, summary.sprintNumber),
        goal: summary.goal ?? "",
        start: active.startDate,
        end: active.endDate,
        days,
        dayIndex: days.filter((day) => day <= now).length,
        committed,
        capacity: await capacityOf(teamId, r.unit, active.startDate, active.endDate),
        done,
        unit: r.unit,
        items: itemsOf(teamId, r, active.id),
        burndown,
      };
    }
    const dates = nextDates(r);
    const items = draft ? itemsOf(teamId, r, draft.id) : [];
    const served = draft ? (await summaryOf(teamId, draft.id)).sprintNumber : null;
    return {
      unit: r.unit,
      sprint,
      next: {
        number: draft ? numberOf(r, draft, served) : r.sprints.filter((plan) => plan.state !== "DRAFT").length + 1,
        ...dates,
        capacity: await capacityOf(teamId, r.unit, dates.start, dates.end),
        committed: round2(items.reduce((sum, item) => sum + item.estimate, 0)),
        items,
      },
    };
  }

  /** The queued (DRAFT) sprint, created with the next dates when there is none. */
  async function draftOf(teamId: string, r: Read): Promise<ApiPlan> {
    const draft = r.sprints.find((plan) => plan.state === "DRAFT");
    if (draft) return draft;
    const dates = nextDates(r);
    const { data } = await api.request("post", "/api/v1/teams/{id}/plans", {
      path: { id: teamId },
      header: { "Idempotency-Key": newIdempotencyKey() },
      body: {
        id: newIdempotencyKey(),
        kind: "SPRINT",
        title: `Sprint ${r.sprints.filter((plan) => plan.state !== "DRAFT").length + 1}`,
        startDate: dates.start,
        endDate: dates.end,
        timezone: getPlannerTimeZone(),
      },
    });
    return data;
  }

  const planById = async (teamId: string, planId: string) =>
    (await api.request("get", "/api/v1/teams/{id}/plans/{planId}", { path: { id: teamId, planId } })).data;

  async function reviewOf(teamId: string, r: Read, plan: ApiPlan): Promise<SprintReview> {
    const { summary, committed, done } = await totals(teamId, r.unit, plan.id);
    return {
      sprintId: plan.id,
      number: numberOf(r, plan, summary.sprintNumber),
      goal: summary.goal ?? "",
      start: plan.startDate,
      end: plan.endDate,
      committed,
      done,
      unit: r.unit,
      movedToNext: summary.carriedOut.toPlan,
      movedToBacklog: summary.carriedOut.toBacklog,
      completedAt: summary.closedAt ?? plan.endDate,
    };
  }

  return {
    current: (teamId) => mapErrors(() => current(teamId)),

    start: (teamId, input) =>
      mapErrors(async () => {
        const r = await read(teamId);
        if (r.sprints.some((plan) => plan.state === "ACTIVE"))
          throw new RepositoryError("conflict", "A sprint is active");
        const draft = await draftOf(teamId, r);
        const goal = input.goal.trim();
        const summary = await summaryOf(teamId, draft.id);
        await conflictAware(() =>
          api.request("put", "/api/v1/teams/{id}/plans/{planId}/planning", {
            path: { id: teamId, planId: draft.id },
            header: { "If-Match": revisionTag(summary.revision) },
            body: { goal: goal || null },
          }),
        );
        const fresh = await planById(teamId, draft.id);
        await conflictAware(() =>
          api.request("patch", "/api/v1/teams/{id}/plans/{planId}", {
            path: { id: teamId, planId: draft.id },
            header: { "If-Match": revisionTag(fresh.revision) },
            body: { state: "ACTIVE" },
          }),
        );
        return current(teamId);
      }),

    complete: (teamId, sprintId, moves) =>
      mapErrors(async () => {
        const r = await read(teamId);
        const plan = r.sprints.find((entry) => entry.id === sprintId && entry.state === "ACTIVE");
        if (!plan) throw new RepositoryError("conflict", "This sprint is not active");
        const summary = await summaryOf(teamId, sprintId);
        // Carry-over is refused on a closed plan: unfinished items move first, then the sprint closes.
        const toNext = summary.unfinished.some((item) => (moves[item.taskId] ?? "backlog") === "next")
          ? await draftOf(teamId, r)
          : null;
        for (const item of summary.unfinished) {
          const next = (moves[item.taskId] ?? "backlog") === "next";
          await conflictAware(() =>
            api.request("post", "/api/v1/teams/{id}/plans/{planId}/items/{itemId}/carry-over", {
              path: { id: teamId, planId: sprintId, itemId: item.itemId },
              header: { "If-Match": revisionTag(item.itemRevision) },
              body: {
                decision: next ? "NEXT" : "BACKLOG",
                targetPlanId: next ? toNext!.id : null,
                sourceRevision: item.sourceRevision,
              },
            }),
          );
        }
        const fresh = await planById(teamId, sprintId);
        await conflictAware(() =>
          api.request("patch", "/api/v1/teams/{id}/plans/{planId}", {
            path: { id: teamId, planId: sprintId },
            header: { "If-Match": revisionTag(fresh.revision) },
            body: { state: "CLOSED" },
          }),
        );
        return reviewOf(teamId, await read(teamId), { ...fresh, state: "CLOSED" });
      }),

    reviews: (teamId) =>
      mapErrors(async () => {
        const r = await read(teamId);
        const closed = r.sprints.filter((plan) => plan.state === "CLOSED").reverse();
        const reviews: SprintReview[] = [];
        for (const plan of closed) reviews.push(await reviewOf(teamId, r, plan));
        return reviews;
      }),
  };
}

// ── TM-06 portfolio ─────────────────────────────────────────────────────

const PORTFOLIO_ROLES = new Set<TeamPortfolioProject["role"]>([
  "owner",
  "admin",
  "manager",
  "member",
  "viewer",
  "guest",
]);

/**
 * Active team ↔ project links whose project the viewer can open (project
 * access gate; others are left out — never a hidden name or count). Project
 * figures come from the Projects integration (same values as the project
 * pages: health Unknown, progress, next milestone, dates, high risks); team
 * people = the team's common members from `project-summaries`. All links are
 * "linked": the API has no team-owned projects.
 */
export async function teamPortfolio(
  api: TeamsClient,
  client: ApiClient,
  teamId: string,
): Promise<TeamPortfolioProject[]> {
  const path = { id: teamId };
  const [links, summaries, members] = await Promise.all([
    pageAll<Data<"/api/v1/teams/{id}/projects", "get">["items"][number]>(
      async (after) =>
        (await api.request("get", "/api/v1/teams/{id}/projects", { path, query: { limit: PAGE, after } })).data,
    ),
    pageAll<Data<"/api/v1/teams/{id}/project-summaries", "get">["items"][number]>(
      async (after) =>
        (await api.request("get", "/api/v1/teams/{id}/project-summaries", { path, query: { limit: PAGE, after } }))
          .data,
    ),
    roster(api, teamId),
  ]);
  const people = new Map(members.map((member) => [member.id, teamPerson(member)]));
  const common = new Map(
    summaries.map((summary) => [
      summary.projectId,
      summary.commonMembers.flatMap((entry) => people.get(entry.member.accessId) ?? []),
    ]),
  );
  const projects = createApiProjectDirectory(client);
  const rows: TeamPortfolioProject[] = [];
  for (const entry of links) {
    if (!entry.link.active) continue;
    // Forbidden / not found already answer "not-available"; any other failure is an error, not an empty row.
    const answer = await projects.access(entry.link.projectId);
    if (answer.status !== "ok") continue;
    const project = answer.project;
    rows.push({
      id: project.id,
      name: project.name,
      percent: project.progress.percent,
      health: project.health,
      lifecycle: project.lifecycle,
      relation: "linked",
      initials: project.initials,
      tint: project.tint,
      role: PORTFOLIO_ROLES.has(project.role) ? project.role : "viewer",
      nextMilestone: project.nextMilestone?.due
        ? { title: project.nextMilestone.title, due: project.nextMilestone.due }
        : null,
      startDate: project.startDate,
      endDate: project.endDate,
      teamPeople: common.get(project.id) ?? [],
      openHighRisks: project.openHighRisks,
    });
  }
  return rows;
}
