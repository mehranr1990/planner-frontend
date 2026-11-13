import { newIdempotencyKey, type ApiClientFor, type ResponseDataIn } from "@/api/client";
import { ApiHttpError } from "@/api/errors";
import type { paths } from "@/api/generated/openapi-p6-messaging";
import { addDaysToDay, dayOfInstant, instantAt, instantAtTime, instantToClockTime } from "@/lib/dates/clock-time";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import type { ActionItem, Invitee, MeetingDetail, MeetingSummary, MeetingTab, Minutes, MinutesStatus, MsgPerson, MsgSource, Rsvp } from "../messaging-domain";
import { MessagingError, type MeetingRepository, type MinutesRepository } from "../messaging-repositories";
import { revisionTag } from "./api-shared";
import { initialsOf } from "./api-project-shared";

/*
 * Meetings + minutes (MT-01…MT-03) in live mode, over the meeting paths of
 * `openapi-p6-messaging.d.ts`. X1-M is resolved by `GET /meetings/{id}/access/me`
 * (own memberId, actorId, role, RSVP, state, capabilities); the server's
 * admission rules stay authoritative: a meeting whose access/me answers 403/404
 * is not shown (pending invitations carry no source, so they are not listed).
 * - People: other members = their meeting actor id; my own row = the seam's `me`.
 * - RSVP: answered on my own invitation (`/meetings/invitations` → respond);
 *   the organiser who created the meeting has none.
 * - Minutes: immutable versions. A save is a new version (parent = latest)
 *   with fresh decision / action ids (they are global keys); one reviewer.
 * - Not served, so never shown as facts: location, minute-taker role, agenda
 *   durations / done state, meeting notes, decision authors, action assignee /
 *   due, source channel.
 * `API_COVERAGE_MATRIX.md` → "Messages & Meetings".
 */

type MeetClient = ApiClientFor<paths>;
type Data<P extends keyof paths, M extends "get" | "post" | "patch"> = ResponseDataIn<paths, P, M>;
type ApiMeeting = Data<"/api/v1/meetings/{id}", "get">;
type ApiMeetingMe = Data<"/api/v1/meetings/{id}/access/me", "get">;
type ApiMeetingMember = Data<"/api/v1/meetings/{id}/members", "get">["items"][number];
type ApiVersion = Data<"/api/v1/meetings/{id}/versions/{versionId}", "get">;
type ApiInvitation = Data<"/api/v1/meetings/invitations", "get">["items"][number];
type ApiAgendaEntry = Data<"/api/v1/meetings/{id}/agenda", "get">["items"][number];
type ApiMeetingFile = Data<"/api/v1/meetings/{id}/attachments", "get">["items"][number];
type ApiTaskLink = Data<"/api/v1/meetings/{id}/actions/{actionId}/tasks", "get">["items"][number];
type Page<T> = { items: T[]; nextCursor?: string | null; hasMore?: boolean };
type WorkKind = "PROJECT" | "TEAM" | "COMPANY";

export interface ApiMeetingsDeps {
  me: MsgPerson;
  mapped: <T>(call: () => Promise<T>) => Promise<T>;
  allPages: <T>(fetchPage: (cursor: string | undefined) => Promise<Page<T>>) => Promise<T[]>;
  /** The workspace title of a work source (blank when unreadable). */
  workspaceName: (kind: WorkKind, id: string) => Promise<string>;
  /** The caller's Projects / Teams / Companies (M-X5 hints, M-X4 rosters). */
  work: WorkSources;
}

/** A work source the caller can read, with its root `access/me` capabilities. */
export interface WorkSource {
  kind: WorkKind;
  id: string;
  title: string;
  capabilities: readonly string[];
}
/** A source-roster row: its space-local actor id is what `participantActorIds` takes. */
export interface WorkMember {
  actorId: string;
  displayName?: string | null;
  state: string;
}
export interface WorkSources {
  /** Every Project / Team / Company the server admits me to (403 / 404 → left out). */
  list(): Promise<WorkSource[]>;
  /** My actor id and the members of a source's root roster. */
  roster(kind: WorkKind, id: string): Promise<{ me: string; members: WorkMember[] }>;
}

const PAGE = 100;
const RSVP: Record<ApiMeetingMe["rsvp"], Rsvp> = { ACCEPTED: "going", TENTATIVE: "maybe", DECLINED: "not-going" };
const DECISION = { going: "ACCEPTED", maybe: "TENTATIVE", "not-going": "DECLINED" } as const;
// REJECTED returns the minutes to Draft with the reviewer's reason (`changesComment`).
const STATUS: Record<ApiVersion["state"], MinutesStatus> = { DRAFT: "draft", IN_REVIEW: "in-review", APPROVED: "approved", REJECTED: "draft", FINAL: "final" };
const SOURCE_KIND = { PROJECT: "project", TEAM: "team", COMPANY: "company" } as const;
const WORK_KIND = { project: "PROJECT", team: "TEAM", company: "COMPANY" } as const;
/** Capability hint (M-X5) on a source's root access/me; the server re-checks on create. */
const CAN_CREATE = "meeting.create";
const ANSWERABLE: ReadonlySet<ApiInvitation["state"]> = new Set(["PENDING", "ACCEPTED", "TENTATIVE", "DECLINED"]);
const NOBODY: MsgPerson = { id: "", name: "", initials: "" };

const unavailable = (reason: string) => () => Promise.reject(new MessagingError("unavailable", `Meetings API: ${reason}`));
const newId = () => crypto.randomUUID();
/** Accepted meeting upload types (contract enum). */
const UPLOAD_TYPES = ["text/plain", "application/pdf", "image/png", "image/jpeg"] as const;
const sha256 = async (blob: Blob) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))].map((byte) => byte.toString(16).padStart(2, "0")).join("");

/** Start / end instants of a meeting; null when its local times cannot be placed (another zone, unresolved). */
function timesOf(schedule: ApiMeeting["event"]["schedule"]): { start: string; end: string } | null {
  if ("localStart" in schedule) {
    if (schedule.startAt && schedule.endAt) return { start: schedule.startAt, end: schedule.endAt };
    if (schedule.timezone !== getPlannerTimeZone()) return null;
    const [startDay, startTime] = schedule.localStart.split("T");
    const [endDay, endTime] = schedule.localEnd.split("T");
    return { start: instantAtTime(startDay, startTime), end: instantAtTime(endDay, endTime) };
  }
  // All-day (assumption: endDate inclusive) in the planner zone only.
  if (schedule.timezone !== getPlannerTimeZone()) return null;
  return { start: instantAt(schedule.startDate, 0), end: instantAt(addDaysToDay(schedule.endDate, 1), 0) };
}

const timed = (start: string, end: string) => ({
  kind: "TIMED" as const,
  timezone: getPlannerTimeZone(),
  localStart: `${dayOfInstant(start)}T${instantToClockTime(start)}`,
  localEnd: `${dayOfInstant(end)}T${instantToClockTime(end)}`,
});

const newest = (versions: readonly ApiVersion[]): ApiVersion | undefined => versions.reduce<ApiVersion | undefined>((latest, version) => (!latest || version.number > latest.number ? version : latest), undefined);

export function createApiMeetings(api: MeetClient, { me: ME, mapped, allPages, workspaceName, work }: ApiMeetingsDeps): { meetings: MeetingRepository; minutes: MinutesRepository } {
  const list = <T>(read: (cursor: string | undefined) => Promise<{ data: Page<T> }>) => allPages<T>(async (cursor) => (await read(cursor)).data);
  const meetingRows = () => list((cursor) => api.request("get", "/api/v1/meetings", { query: { cursor, limit: PAGE } }));
  const roster = (id: string) => list<ApiMeetingMember>((cursor) => api.request("get", "/api/v1/meetings/{id}/members", { path: { id }, query: { cursor, limit: PAGE } }));
  const versionsOf = (id: string) => list<ApiVersion>((cursor) => api.request("get", "/api/v1/meetings/{id}/versions", { path: { id }, query: { cursor, limit: PAGE } }));
  const readMeeting = async (id: string) => {
    const { data, etag } = await api.request("get", "/api/v1/meetings/{id}", { path: { id } });
    return { meeting: data, tag: etag ?? revisionTag(data.revision) };
  };
  /** My admission (X1-M); null when the server does not admit me (403 / 404). */
  const admitted = async (id: string): Promise<ApiMeetingMe | null> => {
    try {
      return (await api.request("get", "/api/v1/meetings/{id}/access/me", { path: { id } })).data;
    } catch (error) {
      if (error instanceof ApiHttpError && (error.status === 403 || error.status === 404)) return null;
      throw error;
    }
  };
  /** A list the caller may not be allowed to read (draft bodies, private uploads) reads as empty. */
  const orEmpty = <T>(read: Promise<T[]>): Promise<T[]> => read.catch((error: unknown) => (error instanceof ApiHttpError && error.status === 403 ? [] : Promise.reject(error)));

  const sourceOf = async (meeting: Pick<ApiMeeting, "kind" | "sourceId">): Promise<MsgSource> =>
    meeting.kind === "INDEPENDENT" || !meeting.sourceId
      ? { kind: "personal", workspaceId: null, name: "" }
      : { kind: SOURCE_KIND[meeting.kind], workspaceId: meeting.sourceId, name: await workspaceName(meeting.kind, meeting.sourceId) };
  /** clientOpId → meeting id, so a retried create sends the same body. */
  const created = new Map<string, string>();
  const workKindOf = (source: MsgSource): WorkKind => {
    if (source.kind === "personal" || !source.workspaceId) throw new MessagingError("unavailable", "Meetings API: personal meetings need a retentionPolicyVersion (OD-1)");
    return WORK_KIND[source.kind];
  };
  const sameSource = (meeting: Pick<ApiMeeting, "kind" | "sourceId">, source: MsgSource) =>
    meeting.kind === "INDEPENDENT" ? source.kind === "personal" : SOURCE_KIND[meeting.kind] === source.kind && meeting.sourceId === source.workspaceId;

  const personOf = (member: ApiMeetingMember | undefined, me: ApiMeetingMe): MsgPerson => {
    if (!member) return NOBODY;
    if (member.actorId === me.actorId) return ME;
    const name = member.displayName ?? "";
    return { id: member.actorId, name, initials: initialsOf(name), ...(member.state === "ACTIVE" || member.displayName ? {} : { deleted: true }) };
  };

  interface Context {
    meeting: ApiMeeting;
    tag: string;
    me: ApiMeetingMe;
    members: ApiMeetingMember[];
    versions: ApiVersion[];
  }
  /** Everything one admitted meeting needs; null when I am not admitted. */
  const contextOf = async (id: string): Promise<Context | null> => {
    const me = await admitted(id);
    if (!me) return null;
    const [{ meeting, tag }, members, versions] = await Promise.all([readMeeting(id), roster(id), orEmpty(versionsOf(id))]);
    return { meeting, tag, me, members, versions };
  };

  const summaryOf = async ({ meeting, me, members, versions }: Context): Promise<MeetingSummary | null> => {
    const times = timesOf(meeting.event.schedule);
    if (!times) return null;
    const latest = newest(versions);
    const active = members.filter((member) => member.state === "ACTIVE");
    const final = meeting.currentFinalVersionId !== null || latest?.state === "FINAL";
    return {
      id: meeting.id,
      title: meeting.event.title,
      source: await sourceOf(meeting),
      start: times.start,
      end: times.end,
      link: meeting.externalUrl,
      location: null,
      myRsvp: RSVP[me.rsvp],
      organizer: personOf(
        active.find((member) => member.role === "ORGANIZER"),
        me,
      ),
      inviteeCount: active.length,
      minutesStatus: latest ? STATUS[latest.state] : null,
      // No minute-taker role in the API: minutes I may draft for an ended meeting that has no final version.
      needsMyMinutes: me.capabilities.includes("minutes.draft") && !final && Date.parse(times.end) <= Date.now(),
    };
  };

  /** Admitted, active meetings (cancelled ones are not modelled by the screens). */
  const summaries = async (keep: (row: ApiMeeting) => boolean = () => true) => {
    const rows = (await meetingRows()).filter((row) => row.state === "ACTIVE" && keep(row));
    const built = await Promise.all(
      rows.map(async (row) => {
        const context = await contextOf(row.id);
        return context ? summaryOf(context) : null;
      }),
    );
    return built.filter((summary): summary is MeetingSummary => summary !== null);
  };

  const meetings: MeetingRepository = {
    list: (tab: MeetingTab) =>
      mapped(async () => {
        const now = Date.now();
        const all = await summaries();
        if (tab === "needs-minutes") return all.filter((meeting) => meeting.needsMyMinutes).sort((a, b) => b.start.localeCompare(a.start));
        if (tab === "past") return all.filter((meeting) => Date.parse(meeting.end) <= now).sort((a, b) => b.start.localeCompare(a.start));
        return all.filter((meeting) => Date.parse(meeting.end) > now).sort((a, b) => a.start.localeCompare(b.start));
      }),

    forCalendar: (source, from, to) =>
      mapped(async () =>
        (await summaries((row) => sameSource(row, source)))
          .filter((meeting) => meeting.start < to && meeting.end > from)
          // Only admitted meetings are listed: never busy-only.
          .map((meeting) => ({ ...meeting, busyOnly: false })),
      ),

    get: (id) =>
      mapped(async () => {
        const context = await contextOf(id);
        if (!context) return null;
        const summary = await summaryOf(context);
        if (!summary) return null;
        const { meeting, me, members } = context;
        const [agenda, files] = await Promise.all([
          orEmpty(list<ApiAgendaEntry>((cursor) => api.request("get", "/api/v1/meetings/{id}/agenda", { path: { id }, query: { cursor, limit: PAGE } }))),
          orEmpty(list<ApiMeetingFile>((cursor) => api.request("get", "/api/v1/meetings/{id}/attachments", { path: { id }, query: { cursor, limit: PAGE } }))),
        ]);
        const invitees = members
          .filter((member) => member.state === "ACTIVE")
          .map((member): Invitee => ({ ...personOf(member, me), rsvp: RSVP[member.rsvp], role: member.role === "ORGANIZER" ? "organizer" : "attendee" }));
        const detail: MeetingDetail = {
          ...summary,
          invitees,
          // OD-16: accepted entries + proposals the server shows me (no duration / done state in the API); rejected ones are dropped.
          agenda: agenda
            .filter((entry) => entry.state !== "REJECTED")
            .map((entry) => ({
              id: entry.id,
              title: entry.text,
              owner: personOf(members.find((member) => member.id === entry.memberId), me),
              minutes: null,
              done: null,
              proposed: entry.state === "PROPOSED",
            })),
          notes: null,
          files: files.filter((file) => file.status === "READY").map((file) => ({ id: file.id, name: file.filename, bytes: file.actualSize ?? file.expectedSize, linked: false })),
          channelId: null,
          myRole: me.role === "ORGANIZER" ? "organizer" : "attendee",
          canEdit: me.capabilities.includes("meeting.manage"),
          canEditAgenda: false,
          canProposeAgenda: me.capabilities.includes("agenda.propose"),
          canDecideAgenda: me.capabilities.includes("meeting.manage"),
          description: meeting.event.description ?? "",
        };
        return detail;
      }),

    update: (id, patch) =>
      mapped(async () => {
        const { meeting, tag } = await readMeeting(id);
        const event: { title?: string; description?: string | null; schedule?: ReturnType<typeof timed> } = {};
        if (patch.title !== undefined) event.title = patch.title;
        if (patch.description !== undefined) event.description = patch.description || null;
        if (patch.start !== undefined || patch.end !== undefined) {
          const times = timesOf(meeting.event.schedule);
          const start = patch.start ?? times?.start;
          const end = patch.end ?? times?.end;
          if (!start || !end) throw new MessagingError("invalid", "Meeting time cannot be placed");
          event.schedule = timed(start, end);
        }
        await api.request("patch", "/api/v1/meetings/{id}", {
          path: { id },
          header: { "If-Match": tag, "Idempotency-Key": newIdempotencyKey() },
          body: { ...(Object.keys(event).length ? { event } : {}), ...(patch.link !== undefined ? { externalUrl: patch.link } : {}) },
        });
      }),

    rsvp: (id, value) =>
      mapped(async () => {
        const invitations = await list<ApiInvitation>((cursor) => api.request("get", "/api/v1/meetings/invitations", { query: { cursor, limit: PAGE } }));
        const invitation = invitations.find((candidate) => candidate.meetingId === id && ANSWERABLE.has(candidate.state));
        if (!invitation) throw new MessagingError("unavailable", "Meetings API: no invitation of mine to answer for this meeting (its creator has none)");
        await api.request("post", "/api/v1/meetings/invitations/{invitationId}/respond", {
          path: { invitationId: invitation.id },
          header: { "If-Match": revisionTag(invitation.revision), "Idempotency-Key": newIdempotencyKey() },
          body: { decision: DECISION[value] },
        });
      }),

    // OD-15: pending invitations carry only title / schedule / state by policy → reduced rows (no source).
    invitations: () =>
      mapped(async () => {
        const invitations = await list<ApiInvitation>((cursor) => api.request("get", "/api/v1/meetings/invitations", { query: { cursor, limit: PAGE } }));
        return invitations
          .filter((invitation) => invitation.state === "PENDING" && Date.parse(invitation.expiresAt) > Date.now())
          .map((invitation) => {
            const times = timesOf(invitation.schedule);
            return { meetingId: invitation.meetingId, title: invitation.title, start: times?.start ?? null, end: times?.end ?? null };
          })
          .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
      }),
    addAgenda: unavailable("agenda entries are text proposals the organiser accepts or rejects (OD-16: use proposeAgenda); no duration or owner choice"),
    toggleAgenda: unavailable("no done state on agenda entries"),
    proposeAgenda: (id, text) =>
      mapped(async () => {
        await api.request("post", "/api/v1/meetings/{id}/agenda", { path: { id }, header: { "Idempotency-Key": newIdempotencyKey() }, body: { id: newId(), text: text.trim() } });
      }),
    decideAgenda: (id, entryId, accept) =>
      mapped(async () => {
        const entries = await list<ApiAgendaEntry>((cursor) => api.request("get", "/api/v1/meetings/{id}/agenda", { path: { id }, query: { cursor, limit: PAGE } }));
        const entry = entries.find((candidate) => candidate.id === entryId);
        if (!entry) throw new MessagingError("not-found");
        await api.request("patch", "/api/v1/meetings/{id}/agenda/{entryId}", {
          path: { id, entryId },
          header: { "If-Match": revisionTag(entry.revision), "Idempotency-Key": newIdempotencyKey() },
          body: { state: accept ? "ACCEPTED" : "REJECTED" },
        });
      }),
    saveNotes: unavailable("meetings have no shared notes"),
    // Uploads stay private to the uploader; sharing as agenda material is the organiser's explicit `/share` (not offered here).
    attach: (id, file) =>
      mapped(async () => {
        const mimeType = UPLOAD_TYPES.find((type) => type === file.blob?.type);
        if (!file.blob || !mimeType || file.linked) throw new MessagingError("invalid", "Meetings API: uploads take txt, pdf, png or jpeg bytes (no linked files)");
        const { data: created } = await api.request("post", "/api/v1/meetings/{id}/attachments", {
          path: { id },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { id: newId(), filename: file.name, mimeType, expectedSize: file.blob.size, sha256: await sha256(file.blob) },
        });
        const { data: done } = await api.request("post", "/api/v1/meetings/{id}/attachments/{attachmentId}/complete", { path: { id, attachmentId: created.id }, body: file.blob });
        if (done.status !== "READY") throw new MessagingError("invalid", "Meetings API: the attachment was rejected");
      }),
    // Work meetings only (M-X4): invitees are source-roster actor ids, resolved by the server inside the meeting's space.
    create: (input) =>
      mapped(async () => {
        const kind = workKindOf(input.source);
        const id = created.get(input.clientOpId) ?? newId();
        created.set(input.clientOpId, id);
        const { data } = await api.request("post", "/api/v1/meetings", {
          header: { "Idempotency-Key": input.clientOpId },
          body: {
            id,
            kind,
            sourceId: input.source.workspaceId!,
            event: { title: input.title.trim(), schedule: timed(input.start, input.end) },
            externalUrl: input.link,
            participantActorIds: input.inviteeIds,
          },
        });
        return data.id;
      }),
    invitable: (source) =>
      mapped(async () => {
        const { me, members } = await work.roster(workKindOf(source), source.workspaceId!);
        return members
          .filter((member) => member.state === "ACTIVE" && member.actorId !== me)
          .map((member) => ({ id: member.actorId, name: member.displayName ?? "", initials: initialsOf(member.displayName ?? "") }));
      }),
    // Only sources whose root access/me reports `meeting.create` (M-X5); never inferred from roles.
    sources: () =>
      mapped(async () =>
        (await work.list()).filter((source) => source.capabilities.includes(CAN_CREATE)).map((source) => ({ kind: SOURCE_KIND[source.kind], workspaceId: source.id, name: source.title })),
      ),
  };

  /** The latest version, my admission and the people of a meeting's minutes. */
  const minutesContext = async (meetingId: string) => {
    const context = await contextOf(meetingId);
    if (!context) throw new MessagingError("not-found");
    return { ...context, latest: newest(context.versions) };
  };
  const memberIdOf = (members: readonly ApiMeetingMember[], me: ApiMeetingMe, personId: string) =>
    personId === ME.id ? me.memberId : members.find((member) => member.actorId === personId && member.state === "ACTIVE")?.id;
  const versionCall = (meetingId: string, version: ApiVersion) => ({
    path: { id: meetingId, versionId: version.id },
    header: { "If-Match": revisionTag(version.revision), "Idempotency-Key": newIdempotencyKey() },
  });
  const reviewable = async (meetingId: string) => {
    const { latest, me } = await minutesContext(meetingId);
    if (!latest || latest.state !== "IN_REVIEW" || latest.reviewerMemberId !== me.memberId) throw new MessagingError("forbidden");
    return latest;
  };

  /** Task links of the actions of a final version (explicit "Make task" results). */
  const taskLinks = async (meeting: ApiMeeting, version: ApiVersion): Promise<Map<string, ActionItem["task"]>> => {
    const links = new Map<string, ActionItem["task"]>();
    if (version.state !== "FINAL") return links;
    await Promise.all(
      version.actions.map(async (action) => {
        const rows = await orEmpty(list<ApiTaskLink>((cursor) => api.request("get", "/api/v1/meetings/{id}/actions/{actionId}/tasks", { path: { id: meeting.id, actionId: action.id }, query: { cursor, limit: PAGE } })));
        // Personal links only (the one live "Make task" path); work-source tasks open from their workspace.
        const task = rows.find((row) => row.task && (row.personal || !meeting.sourceId))?.task;
        if (task) links.set(action.id, { id: task.id, href: `/personal/tasks/${encodeURIComponent(task.id)}`, workspace: { kind: "personal", workspaceId: null, name: "" } });
      }),
    );
    return links;
  };

  const minutes: MinutesRepository = {
    get: (meetingId) =>
      mapped(async () => {
        const context = await contextOf(meetingId);
        if (!context) return null;
        const { meeting, me, members, versions } = context;
        const latest = newest(versions);
        const person = (memberId: string) =>
          personOf(
            members.find((member) => member.id === memberId),
            me,
          );
        const can = me.capabilities;
        const state = latest?.state;
        const personal = meeting.kind === "INDEPENDENT";
        const tasks = latest ? await taskLinks(meeting, latest) :new Map<string, ActionItem["task"]>();
        const result: Minutes = {
          meetingId,
          status: latest ? STATUS[latest.state] : "draft",
          version: latest?.number ?? 0,
          summary: latest?.minutes ?? "",
          // Decision authors are not served.
          decisions: (latest?.decisions ?? []).map((decision) => ({ id: decision.id, text: decision.text, proposedBy: null })),
          actionItems: (latest?.actions ?? []).map((action) => ({ id: action.id, text: action.title, assignee: null, due: null, task: tasks.get(action.id) ?? null })),
          reviews:
            latest?.reviewerMemberId && latest.state !== "DRAFT"
              ? [{ reviewer: person(latest.reviewerMemberId), state: latest.review ? (latest.review.decision === "APPROVE" ? "approved" : "changes") : "pending", comment: latest.review?.reason ?? null }]
              : [],
          versions: [...versions]
            .sort((a, b) => a.number - b.number)
            .map((version) => ({ version: version.number, status: STATUS[version.state], at: version.finalizedAt ?? version.createdAt, by: person(version.authorMemberId), note: version.review?.reason ?? null })),
          personal,
          can: {
            write: can.includes("minutes.draft") && (!latest || state === "DRAFT" || state === "REJECTED"),
            submit: state === "DRAFT" && latest?.authorMemberId === me.memberId,
            review: state === "IN_REVIEW" && latest?.reviewerMemberId === me.memberId,
            // The organiser finalizes an approval; a sole independent owner may self-finalize (the server re-checks).
            finalize: can.includes("meeting.manage") && (state === "APPROVED" || (state === "DRAFT" && personal && members.length === 1)),
            // Live: only independent meetings (Personal tasks) link after the final version; work sources need a release and their task engine.
            makeTask: personal && state === "FINAL",
          },
          changesComment: state === "REJECTED" ? (latest?.review?.reason ?? null) : null,
        };
        return result;
      }),

    save: (meetingId, patch) =>
      mapped(async () => {
        if (patch.actionItems?.some((item) => item.assignee || item.due)) throw new MessagingError("unavailable", "Meetings API: action items carry no assignee or due date");
        const { latest } = await minutesContext(meetingId);
        // Every version owns its rows: carried-over decisions and actions get fresh ids (global keys).
        const decisions = (patch.decisions ?? latest?.decisions ?? []).map((decision) => ({ id: newId(), text: decision.text }));
        const actions = patch.actionItems ? patch.actionItems.map((item) => ({ id: newId(), title: item.text })) : (latest?.actions ?? []).map((action) => ({ id: newId(), title: action.title, description: action.description ?? null }));
        await api.request("post", "/api/v1/meetings/{id}/versions", {
          path: { id: meetingId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: {
            id: newId(),
            ...(latest ? { parentId: latest.id } : {}),
            minutes: patch.summary ?? latest?.minutes ?? "",
            decisions,
            actions,
            ...(latest ? { attachments: latest.attachments, contributors: latest.contributors } : {}),
            ...(latest?.reviewerMemberId ? { reviewerMemberId: latest.reviewerMemberId } : {}),
          },
        });
      }),

    submit: (meetingId, reviewerIds) =>
      mapped(async () => {
        if (reviewerIds.length !== 1) throw new MessagingError("invalid", "one-reviewer");
        const { latest, me, members } = await minutesContext(meetingId);
        if (!latest || latest.state !== "DRAFT") throw new MessagingError("forbidden");
        const memberId = memberIdOf(members, me, reviewerIds[0]);
        if (!memberId) throw new MessagingError("not-found");
        let version = latest;
        if (version.reviewerMemberId !== memberId) {
          version = (await api.request("patch", "/api/v1/meetings/{id}/versions/{versionId}/reviewer", { ...versionCall(meetingId, version), body: { memberId } })).data;
        }
        await api.request("post", "/api/v1/meetings/{id}/versions/{versionId}/submit", { ...versionCall(meetingId, version), body: {} });
      }),

    approve: (meetingId, comment) =>
      mapped(async () => {
        // The API stores a reason with every review decision.
        if (!comment?.trim()) throw new MessagingError("invalid", "reason-required");
        const version = await reviewable(meetingId);
        await api.request("post", "/api/v1/meetings/{id}/versions/{versionId}/review", { ...versionCall(meetingId, version), body: { decision: "APPROVE", reason: comment.trim() } });
      }),

    requestChanges: (meetingId, comment) =>
      mapped(async () => {
        const version = await reviewable(meetingId);
        await api.request("post", "/api/v1/meetings/{id}/versions/{versionId}/review", { ...versionCall(meetingId, version), body: { decision: "REJECT", reason: comment.trim() } });
      }),

    finalize: (meetingId) =>
      mapped(async () => {
        const { latest } = await minutesContext(meetingId);
        if (!latest || (latest.state !== "APPROVED" && latest.state !== "DRAFT")) throw new MessagingError("forbidden");
        await api.request("post", "/api/v1/meetings/{id}/versions/{versionId}/finalize", { ...versionCall(meetingId, latest), body: {} });
      }),

    linkTask: (meetingId, itemId, task) =>
      mapped(async () => {
        await api.request("post", "/api/v1/meetings/{id}/actions/{actionId}/tasks", {
          path: { id: meetingId, actionId: itemId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { taskId: task.id },
        });
      }),
  };

  return { meetings, minutes };
}
