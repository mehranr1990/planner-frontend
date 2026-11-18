import type { ResponseDataIn } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-social";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import type {
  ActivityDetail,
  ActivitySummary,
  ActivityTemplate,
  Attendee,
  CalendarProjection,
  ChecklistItem,
  FreeBusyCell,
  FreeBusyView,
  ItineraryDay,
  Poll,
  Rsvp,
  SocialPerson,
  WaitlistEntry,
} from "../social-domain";
import { SocialError, type ActivityAdminRepo, type ActivityChecklistRepo, type ActivityRepo, type FreeBusyRepo, type PollRepo } from "../social-repositories";
import { all, call, fail, pageQuery, refuse, retentionVersion, tag, uuid, wallClock, zonedInstant, type SocialCtx } from "./api-social-shared";

/*
 * Social Activities (P6-02 + gap closure, ADRs 0060–0062) over
 * `/api/v1/social-activities…`. Gregorian instants in transport, wall clock
 * in the activity's IANA zone for display. Files (ADR 0063) and weekly
 * recurrence are not in the contract and stay refused.
 */

type D<P extends keyof paths, M extends "get" | "post" | "put" | "patch" | "delete"> = ResponseDataIn<paths, P, M>;
type ApiActivity = D<"/api/v1/social-activities/{id}", "get">;
type ApiSummary = D<"/api/v1/social-activities", "get">["items"][number];
type ApiParticipant = D<"/api/v1/social-activities/{id}/participants", "get">["items"][number];
type ApiItem = D<"/api/v1/social-activities/{id}/items", "get">["items"][number];
type ApiPoll = D<"/api/v1/social-activities/{id}/polls", "get">["items"][number];

const TEMPLATE_FROM: Record<ApiSummary["template"], ActivityTemplate> = { GENERAL: "blank", TRAVEL: "trip", SPORT: "sport", FAMILY: "family", GATHERING: "gathering" };
const TEMPLATE_TO: Record<ActivityTemplate, ApiSummary["template"]> = { blank: "GENERAL", trip: "TRAVEL", sport: "SPORT", family: "FAMILY", gathering: "GATHERING" };
const RSVP_FROM: Record<string, Rsvp> = { PENDING: "pending", GOING: "going", MAYBE: "maybe", DECLINED: "declined" };
const FREE_BUSY_SLOTS: [string, number, number][] = [
  ["09–12", 9, 12],
  ["14–17", 14, 17],
  ["18–21", 18, 21],
];

export interface ActivityModules {
  activities: ActivityRepo;
  checklist: ActivityChecklistRepo;
  polls: PollRepo;
  freeBusy: FreeBusyRepo;
  activityAdmin: ActivityAdminRepo;
  /** Accessible activities the viewer participates in (ledger scope pickers). */
  participantsOf(activityId: string): Promise<ApiParticipant[]>;
  activityTitle(activityId: string): Promise<string>;
}

export function createActivityModules(ctx: SocialCtx, invitable: () => Promise<SocialPerson[]>): ActivityModules {
  const { api, people, revisions, intents } = ctx;
  const cache = new Map<string, ApiActivity>();
  const items = new Map<string, ApiItem[]>();
  const participants = new Map<string, ApiParticipant[]>();
  const pollActivity = new Map<string, string>();
  const polls = new Map<string, ApiPoll>();

  const remember = (a: ApiActivity) => {
    cache.set(a.id, a);
    revisions.set(`activity:${a.id}`, a.revision);
    return a;
  };
  const load = async (id: string) => remember((await call(() => api.request("get", "/api/v1/social-activities/{id}", { path: { id } }))).data);
  const current = async (id: string) => cache.get(id) ?? (await load(id));
  const ifMatch = async (id: string) => tag(revisions.get(`activity:${id}`) ?? (await load(id)).revision);

  const loadParticipants = async (id: string) => {
    const rows = await call(() => all((after) => api.request("get", "/api/v1/social-activities/{id}/participants", { path: { id }, query: pageQuery(after) }).then((r) => r.data)));
    for (const p of rows) people.learn(p.userId, p.displayName);
    participants.set(id, rows);
    return rows;
  };
  const participantOf = async (activityId: string, personId: string) => {
    const userId = people.apiId(personId);
    const rows = participants.get(activityId) ?? (await loadParticipants(activityId));
    const row = rows.find((p) => p.userId === userId) ?? (await loadParticipants(activityId)).find((p) => p.userId === userId);
    if (!row) throw new SocialError("not-found");
    return row;
  };
  const loadItems = async (id: string) => {
    const rows = await call(() => all((after) => api.request("get", "/api/v1/social-activities/{id}/items", { path: { id }, query: pageQuery(after) }).then((r) => r.data)));
    items.set(id, rows);
    return rows;
  };
  const itemOf = async (activityId: string, itemId: string) => {
    const row = (items.get(activityId) ?? (await loadItems(activityId))).find((i) => i.id === itemId) ?? (await loadItems(activityId)).find((i) => i.id === itemId);
    if (!row) throw new SocialError("not-found");
    return row;
  };
  const loadPolls = async (id: string) => {
    const rows = await call(() => all((after) => api.request("get", "/api/v1/social-activities/{id}/polls", { path: { id }, query: pageQuery(after) }).then((r) => r.data)));
    for (const p of rows) {
      pollActivity.set(p.id, id);
      polls.set(p.id, p);
    }
    return rows;
  };

  const ended = (a: ApiSummary) => Date.parse(a.endsAt) < Date.now();

  async function summary(a: ApiSummary): Promise<ActivitySummary> {
    const start = wallClock(a.startsAt, a.timezone);
    const end = wallClock(a.endsAt, a.timezone);
    const me = a.me;
    let myWaitlist: number | null = null;
    if (me && (me.seat === "WAITLISTED" || me.seat === "OFFERED")) {
      const queue = (await loadParticipants(a.id).catch(() => [] as ApiParticipant[])).filter((p) => p.seat === "WAITLISTED" || p.seat === "OFFERED").sort(byQueue);
      const at = queue.findIndex((p) => p.id === me.participantId);
      myWaitlist = at === -1 ? 1 : at + 1;
    }
    const organiser = me?.role === "ORGANIZER" ? people.person(people.myId) : { id: "", name: "", initials: "?" };
    return {
      id: a.id,
      title: a.title,
      template: TEMPLATE_FROM[a.template],
      group: a.groupId ? { id: a.groupId, name: await ctx.groupName(a.groupId) } : null,
      organiser,
      startDay: start.day,
      endDay: end.day,
      startTime: start.time,
      place: "",
      recurringWeekly: false,
      capacity: a.capacity,
      goingCount: a.seatsTaken,
      waitlistCount: a.waitlistCount,
      myRsvp: me && me.state !== "INVITED" ? (RSVP_FROM[me.rsvp] ?? "pending") : "pending",
      myWaitlist,
      status: a.state === "CANCELED" ? "cancelled" : "planned",
      currency: "irr",
      isGuest: me?.guest ?? false,
      organisedByMe: me?.role === "ORGANIZER",
      hasOpenPoll: false,
    };
  }

  async function detail(id: string): Promise<ActivityDetail> {
    const a = await load(id);
    const [rows, list, pollRows] = await Promise.all([loadParticipants(id).catch(() => [] as ApiParticipant[]), loadItems(id), loadPolls(id).catch(() => [] as ApiPoll[])]);
    const base = await summary(a);
    const byParticipant = new Map(rows.map((p) => [p.id, p]));
    const personOf = (participantId: string | null) => {
      const p = participantId ? byParticipant.get(participantId) : undefined;
      return p ? people.person(p.userId) : null;
    };
    const organisers = rows.filter((p) => p.role === "ORGANIZER" && p.state === "ACTIVE");
    const attendees: Attendee[] = rows
      .filter((p) => p.state === "ACTIVE" || p.state === "INVITED")
      .map((p) => ({ person: people.person(p.userId), rsvp: p.state === "INVITED" ? "pending" : (RSVP_FROM[p.rsvp] ?? "pending"), guest: p.guest, organiser: p.role === "ORGANIZER" }));
    const waitlist: WaitlistEntry[] = rows
      .filter((p) => p.seat === "WAITLISTED" || p.seat === "OFFERED")
      .sort(byQueue)
      .map((p) => ({ person: people.person(p.userId), offeredUntil: p.seat === "OFFERED" ? p.offerExpiresAt : null }));
    const days = new Map<string, ItineraryDay>();
    for (const item of list.filter((i) => i.kind !== "CHECKLIST").sort((x, y) => (x.startsAt ?? "").localeCompare(y.startsAt ?? "") || x.position - y.position)) {
      const day = item.localDate ?? (item.startsAt ? wallClock(item.startsAt, a.timezone).day : base.startDay);
      const entry = days.get(day) ?? { day, items: [] };
      entry.items.push({ id: item.id, time: item.startsAt ? wallClock(item.startsAt, a.timezone).time : null, title: item.title, place: item.location ?? "", note: item.notes ?? "" });
      days.set(day, entry);
    }
    const checklist: ChecklistItem[] = list
      .filter((i) => i.kind === "CHECKLIST")
      .sort((x, y) => x.position - y.position)
      .map((i) => ({ id: i.id, title: i.title, done: i.done, assignee: personOf(i.assigneeParticipantId), taskId: null }));
    const schedulePoll = pollRows.find((p) => p.kind === "SCHEDULE");
    const me = a.me;
    const planned = a.state === "PLANNED";
    const successor = a.successorParticipantId ? byParticipant.get(a.successorParticipantId) : undefined;
    return {
      ...base,
      organiser: organisers[0] ? people.person(organisers[0].userId) : base.organiser,
      place: a.location ?? "",
      hasOpenPoll: pollRows.some((p) => p.state === "OPEN"),
      description: a.description ?? "",
      itinerary: [...days.values()].sort((x, y) => x.day.localeCompare(y.day)),
      checklist,
      attendees,
      waitlist,
      files: [],
      cancelReason: null,
      cancelledBy: null,
      pollId: schedulePoll?.id ?? null,
      pollIds: [...(schedulePoll ? [schedulePoll] : []), ...pollRows.filter((p) => p !== schedulePoll)].map((p) => p.id),
      calendarBlock: false,
      capabilities: { edit: a.manage && planned, cancel: a.manage && planned, rsvp: planned && !!me && (me.state === "INVITED" || me.state === "ACTIVE"), uploadFiles: false },
      server: {
        state: a.state === "CANCELED" ? "cancelled" : a.state === "CLOSED" ? "closed" : a.state === "DELETED" ? "deleted" : "planned",
        timezone: a.timezone,
        manage: a.manage,
        myParticipantId: me?.participantId ?? null,
        myRole: me ? (me.role === "ORGANIZER" ? "organiser" : "participant") : null,
        reminderMinutes: me?.reminderMinutes ?? null,
        offerExpiresAt: me?.offerExpiresAt ?? null,
        orphaned: a.orphanedAt !== null,
        recoverUntil: a.recoverUntil,
        successor: successor ? people.person(successor.userId) : null,
        successorIsMe: !!me && a.successorParticipantId === me.participantId,
        conversation: { id: a.conversationId, managed: a.conversationManaged },
        description: a.description ?? "",
      },
    };
  }

  const rsvp = async (id: string, value: "GOING" | "MAYBE" | "DECLINED") => {
    const { data } = await intents.run(`rsvp:${id}:${value}`, (key) => call(() => api.request("post", "/api/v1/social-activities/{id}/rsvp", { path: { id }, header: { "Idempotency-Key": key }, body: { rsvp: value } })));
    remember(data);
    return data;
  };
  const lifecycleCall = async (id: string, run: (match: string, key: string) => Promise<{ data: ApiActivity }>, intent: string) => {
    const match = await ifMatch(id);
    const { data } = await intents.run(`${intent}:${id}`, (key) => call(() => run(match, key)));
    remember(data);
  };
  const createItem = async (activityId: string, body: { kind: "ITINERARY" | "AGENDA" | "CHECKLIST"; title: string; notes?: string | null; location?: string | null; startsAt?: string | null }) => {
    const id = uuid();
    await intents.run(`item:${id}`, (key) => call(() => api.request("post", "/api/v1/social-activities/{id}/items", { path: { id: activityId }, header: { "Idempotency-Key": key }, body: { id, ...body } })));
    items.delete(activityId);
  };
  const patchItem = async (activityId: string, itemId: string, body: { done?: boolean; assigneeParticipantId?: string | null }) => {
    const item = await itemOf(activityId, itemId);
    await intents.run(`item-patch:${itemId}:${JSON.stringify(body)}`, (key) =>
      call(() => api.request("patch", "/api/v1/social-activities/{id}/items/{itemId}", { path: { id: activityId, itemId }, header: { "If-Match": tag(item.revision), "Idempotency-Key": key }, body })),
    );
    items.delete(activityId);
  };

  const activities: ActivityRepo = {
    async mine(filter, groupId) {
      const rows = await call(() => all((after) => api.request("get", "/api/v1/social-activities", { query: { ...pageQuery(after), ...(groupId ? { groupId } : {}) } }).then((r) => r.data)));
      const picked = rows.filter((a) => {
        if (a.state === "DELETED") return false;
        if (filter === "past") return ended(a);
        if (ended(a)) return false;
        if (filter === "needs-answer") return a.state === "PLANNED" && (!a.me || a.me.state === "INVITED" || a.me.rsvp === "PENDING");
        if (filter === "organised") return a.me?.role === "ORGANIZER";
        return true;
      });
      const out = await Promise.all(picked.map(summary));
      return out.sort((x, y) => (filter === "past" ? y.startDay.localeCompare(x.startDay) : x.startDay.localeCompare(y.startDay)));
    },
    get: detail,
    async create(input) {
      if (input.recurringWeekly) fail("weekly recurrence is not in the Social Activities contract");
      const timeZone = getPlannerTimeZone();
      const startsAt = zonedInstant(input.startDay, input.startTime ?? "00:00", timeZone);
      const endsAt = zonedInstant(input.endDay, "23:59", timeZone);
      const id = uuid();
      const { data } = await intents.run(`activity:${input.clientOpId}`, (key) =>
        call(() =>
          api.request("post", "/api/v1/social-activities", {
            header: { "Idempotency-Key": key },
            body: { id, groupId: input.groupId, template: TEMPLATE_TO[input.template], title: input.title.trim(), location: input.place.trim() || null, timezone: timeZone, startsAt, endsAt, capacity: input.capacity },
          }),
        ),
      );
      remember(data as ApiActivity);
      for (const guest of input.guestIds) await activityAdmin.invite(data.id, guest);
      return data.id;
    },
    async rsvp(id, value) {
      const data = await rsvp(id, value === "going" ? "GOING" : value === "maybe" ? "MAYBE" : "DECLINED");
      return { waitlisted: data.me?.seat === "WAITLISTED" };
    },
    async joinWaitlist(id) {
      await rsvp(id, "GOING");
    },
    async leaveWaitlist(id) {
      await rsvp(id, "DECLINED");
    },
    async acceptOffer(id) {
      // Claiming an offered place is RSVP GOING before offerExpiresAt (12 h).
      await rsvp(id, "GOING");
    },
    async cancel(id) {
      // The contract carries no cancellation reason; the reason text is not sent.
      await lifecycleCall(id, (match, key) => api.request("post", "/api/v1/social-activities/{id}/lifecycle/{action}", { path: { id, action: "cancel" }, header: { "If-Match": match, "Idempotency-Key": key }, body: {} }), "cancel");
    },
    async addItineraryItem(activityId, day, item) {
      if (!item.time) throw new SocialError("invalid", "ITINERARY_TIME_REQUIRED", "ITINERARY_TIME_REQUIRED");
      const a = await current(activityId);
      await createItem(activityId, { kind: "ITINERARY", title: item.title.trim(), notes: item.note.trim() || null, location: item.place.trim() || null, startsAt: zonedInstant(day, item.time, a.timezone) });
    },
    setCalendarBlock: refuse("the Social calendar is an overlay only; no private time block exists in the contract"),
    async projections(from, to) {
      const { data } = await call(() => api.request("get", "/api/v1/social-activities/calendar", { query: { from: zonedInstant(from, "00:00", getPlannerTimeZone()), to: zonedInstant(to, "23:59", getPlannerTimeZone()) } }));
      return data.items
        .filter((i) => i.kind === "ACTIVITY")
        .map((i): CalendarProjection => {
          const start = wallClock(i.startsAt, i.timezone);
          return { activityId: i.activityId, title: i.title, source: "", startDay: start.day, endDay: wallClock(i.endsAt, i.timezone).day, startTime: start.time, rsvp: "going" };
        });
    },
  };

  const checklist: ActivityChecklistRepo = {
    async add(activityId, title) {
      await createItem(activityId, { kind: "CHECKLIST", title: title.trim() });
    },
    async toggle(activityId, itemId) {
      const item = await itemOf(activityId, itemId);
      await patchItem(activityId, itemId, { done: !item.done });
    },
    async claim(activityId, itemId) {
      const a = await current(activityId);
      if (!a.me) throw new SocialError("forbidden");
      await patchItem(activityId, itemId, { assigneeParticipantId: a.me.participantId });
    },
    linkTask: refuse("live checklist tasks are created by the server (makeTask), never linked from the client"),
    async makeTask(activityId, itemId) {
      const { data } = await intents.run(`task:${itemId}`, (key) => call(() => api.request("post", "/api/v1/social-activities/{id}/items/{itemId}/task", { path: { id: activityId, itemId }, header: { "Idempotency-Key": key }, body: {} })));
      return { taskId: data.taskId, created: data.created };
    },
  };

  function toPoll(p: ApiPoll, a: ApiActivity | undefined): Poll {
    const tz = a?.timezone ?? getPlannerTimeZone();
    const respondents = p.multiple ? Math.max(0, ...p.options.map((o) => o.votes)) : p.options.reduce((s, o) => s + o.votes, 0);
    return {
      id: p.id,
      activityId: p.activityId,
      kind: p.kind === "SCHEDULE" ? "date" : p.multiple ? "multiple" : "single",
      question: p.question,
      options: p.options.map((o) => ({
        id: o.id,
        label: o.label,
        ...(o.startsAt ? { day: wallClock(o.startsAt, tz).day, startTime: wallClock(o.startsAt, tz).time } : {}),
        ...(o.endsAt ? { endTime: wallClock(o.endsAt, tz).time } : {}),
        yes: o.votes,
        ifNeeded: 0,
        voters: [],
      })),
      myVotes: Object.fromEntries(p.myOptionIds.map((id) => [id, "yes" as const])),
      deadline: "",
      closed: p.state === "CLOSED",
      finalOptionId: p.chosenOptionId,
      anonymous: true,
      resultsVisible: true,
      respondents,
      invited: (participants.get(p.activityId) ?? []).filter((x) => x.state === "ACTIVE").length,
      canClose: !!a?.manage && p.state === "OPEN",
    };
  }
  const pollRow = async (pollId: string) => {
    const activityId = pollActivity.get(pollId);
    if (!activityId) throw new SocialError("not-found");
    return (await loadPolls(activityId)).find((p) => p.id === pollId) ?? fail("poll not found");
  };
  const closePoll = async (pollId: string, chosenOptionId: string | null) => {
    const p = await pollRow(pollId);
    await intents.run(`poll-close:${pollId}`, (key) =>
      call(() => api.request("post", "/api/v1/social-activities/{id}/polls/{pollId}/close", { path: { id: p.activityId, pollId }, header: { "If-Match": tag(p.revision), "Idempotency-Key": key }, body: { chosenOptionId } })),
    );
    cache.delete(p.activityId);
  };

  const pollRepo: PollRepo = {
    async get(pollId) {
      const p = await pollRow(pollId);
      const a = await current(p.activityId);
      if (!participants.has(p.activityId)) await loadParticipants(p.activityId).catch(() => null);
      return toPoll(p, a);
    },
    async vote(pollId, votes) {
      if (Object.values(votes).includes("if-needed")) fail("“if needed” votes are not in the contract (counts of chosen options only)");
      const p = await pollRow(pollId);
      const optionIds = Object.keys(votes);
      await intents.run(`vote:${pollId}:${optionIds.join(",")}`, (key) =>
        call(() => api.request("put", "/api/v1/social-activities/{id}/polls/{pollId}/vote", { path: { id: p.activityId, pollId }, header: { "Idempotency-Key": key }, body: { optionIds } })),
      );
    },
    close: (pollId) => closePoll(pollId, null),
    pickFinal: (pollId, optionId) => closePoll(pollId, optionId),
  };

  const freeBusy: FreeBusyRepo = {
    async range(activityId) {
      const a = await current(activityId);
      const [{ data }, rows] = await Promise.all([call(() => api.request("get", "/api/v1/social-activities/{id}/free-busy", { path: { id: activityId } })), loadParticipants(activityId).catch(() => [] as ApiParticipant[])]);
      const days: string[] = [];
      const first = wallClock(a.startsAt, a.timezone).day;
      const last = wallClock(a.endsAt, a.timezone).day;
      for (let d = first; d <= last && days.length < 14; d = nextDay(d)) days.push(d);
      const shared = new Map(data.items.map((row) => [row.participantId, row]));
      const cell = (intervals: { start: string; end: string }[], day: string, from: number, to: number): FreeBusyCell => {
        const s = Date.parse(zonedInstant(day, `${String(from).padStart(2, "0")}:00`, a.timezone));
        const e = Date.parse(zonedInstant(day, `${String(to).padStart(2, "0")}:00`, a.timezone));
        return intervals.some((i) => Date.parse(i.start) < e && Date.parse(i.end) > s) ? "busy" : "free";
      };
      const view: FreeBusyView = {
        slots: FREE_BUSY_SLOTS.map(([label]) => label),
        rows: rows
          .filter((p) => p.state === "ACTIVE")
          .map((p) => {
            const row = shared.get(p.id);
            return {
              person: people.person(p.userId),
              consent: row ? "shared" : "none",
              days: days.map((day) => ({ day, slots: FREE_BUSY_SLOTS.map(([, from, to]) => (row ? cell(row.intervals, day, from, to) : "not-shared")) })),
            };
          }),
        incomingRequest: null,
      };
      return view;
    },
    request: refuse("free/busy is shared by each person's own explicit consent; the contract has no request to share"),
    async share(activityId, on) {
      // PUT = explicit consent (busy-only intervals from the caller's own Calendar); DELETE revokes.
      await intents.run(`free-busy:${activityId}:${on}`, (key) =>
        call(async () => {
          const init = { path: { id: activityId }, header: { "Idempotency-Key": key }, body: {} };
          if (on) await api.request("put", "/api/v1/social-activities/{id}/free-busy", init);
          else await api.request("delete", "/api/v1/social-activities/{id}/free-busy", init);
        }),
      );
    },
  };

  const activityAdmin: ActivityAdminRepo = {
    async edit(id, patch) {
      const a = await current(id);
      const tz = a.timezone;
      const start = wallClock(a.startsAt, tz);
      const end = wallClock(a.endsAt, tz);
      const body: Record<string, unknown> = {};
      if (patch.title !== undefined) body.title = patch.title.trim();
      if (patch.place !== undefined) body.location = patch.place.trim() || null;
      if (patch.description !== undefined) body.description = patch.description.trim() || null;
      if (patch.capacity !== undefined) body.capacity = patch.capacity;
      if (patch.startDay !== undefined || patch.startTime !== undefined) body.startsAt = zonedInstant(patch.startDay ?? start.day, patch.startTime ?? start.time, tz);
      if (patch.endDay !== undefined) body.endsAt = zonedInstant(patch.endDay, end.time, tz);
      await lifecycleCall(id, (match, key) => api.request("patch", "/api/v1/social-activities/{id}", { path: { id }, header: { "If-Match": match, "Idempotency-Key": key }, body }), `edit:${JSON.stringify(body)}`);
    },
    close: (id) => lifecycleCall(id, (match, key) => api.request("post", "/api/v1/social-activities/{id}/lifecycle/{action}", { path: { id, action: "close" }, header: { "If-Match": match, "Idempotency-Key": key }, body: {} }), "close"),
    remove: (id) => lifecycleCall(id, (match, key) => api.request("delete", "/api/v1/social-activities/{id}", { path: { id }, header: { "If-Match": match, "Idempotency-Key": key }, body: {} }), "delete"),
    restore: (id) => lifecycleCall(id, (match, key) => api.request("post", "/api/v1/social-activities/{id}/restore", { path: { id }, header: { "If-Match": match, "Idempotency-Key": key }, body: {} }), "restore"),
    async join(id) {
      const { data } = await intents.run(`join:${id}`, (key) => call(() => api.request("post", "/api/v1/social-activities/{id}/join", { path: { id }, header: { "Idempotency-Key": key }, body: {} })));
      remember(data);
    },
    async leave(id) {
      const { data } = await intents.run(`leave:${id}`, (key) => call(() => api.request("post", "/api/v1/social-activities/{id}/leave", { path: { id }, header: { "Idempotency-Key": key }, body: {} })));
      remember(data);
    },
    async invite(id, personId) {
      const userId = people.apiId(personId);
      await intents.run(`invite:${id}:${userId}`, (key) => call(() => api.request("post", "/api/v1/social-activities/{id}/invitations", { path: { id }, header: { "Idempotency-Key": key }, body: { userId } })));
      participants.delete(id);
    },
    async removeParticipant(id, personId) {
      const p = await participantOf(id, personId);
      await intents.run(`remove:${p.id}`, (key) =>
        call(() => api.request("post", "/api/v1/social-activities/{id}/participants/{participantId}/remove", { path: { id, participantId: p.id }, header: { "If-Match": tag(p.revision), "Idempotency-Key": key }, body: {} })),
      );
      participants.delete(id);
    },
    async setOrganiser(id, personId, organiser) {
      const p = await participantOf(id, personId);
      const role = organiser ? "ORGANIZER" : "PARTICIPANT";
      await intents.run(`role:${p.id}:${role}`, (key) =>
        call(() => api.request("put", "/api/v1/social-activities/{id}/participants/{participantId}/role", { path: { id, participantId: p.id }, header: { "If-Match": tag(p.revision), "Idempotency-Key": key }, body: { role } })),
      );
      participants.delete(id);
    },
    async nominate(id, personId) {
      const p = await participantOf(id, personId);
      await lifecycleCall(id, (match, key) => api.request("post", "/api/v1/social-activities/{id}/succession", { path: { id }, header: { "If-Match": match, "Idempotency-Key": key }, body: { participantId: p.id } }), `nominate:${p.id}`);
    },
    respondSuccession: (id, action) =>
      lifecycleCall(id, (match, key) => api.request("post", "/api/v1/social-activities/{id}/succession/{action}", { path: { id, action }, header: { "If-Match": match, "Idempotency-Key": key }, body: {} }), `succession:${action}`),
    async setReminder(id, minutesBefore) {
      if (minutesBefore !== null && (!Number.isInteger(minutesBefore) || minutesBefore < 5 || minutesBefore > 10080)) throw new SocialError("invalid");
      await intents.run(`reminder:${id}:${minutesBefore}`, (key) => call(() => api.request("put", "/api/v1/social-activities/{id}/reminder", { path: { id }, header: { "Idempotency-Key": key }, body: { minutesBefore } })));
      cache.delete(id);
    },
    async deleteItem(activityId, itemId) {
      const item = await itemOf(activityId, itemId);
      await intents.run(`item-delete:${itemId}`, (key) =>
        call(() => api.request("delete", "/api/v1/social-activities/{id}/items/{itemId}", { path: { id: activityId, itemId }, header: { "If-Match": tag(item.revision), "Idempotency-Key": key }, body: {} })),
      );
      items.delete(activityId);
    },
    async createPoll(activityId, input) {
      const a = await current(activityId);
      const id = uuid();
      const options = input.options.map((o) => ({
        id: uuid(),
        label: o.label.trim(),
        ...(input.kind === "schedule" && o.day ? { startsAt: zonedInstant(o.day, o.startTime ?? "00:00", a.timezone), endsAt: zonedInstant(o.day, o.endTime ?? "23:59", a.timezone) } : {}),
      }));
      await intents.run(`poll:${id}`, (key) =>
        call(() =>
          api.request("post", "/api/v1/social-activities/{id}/polls", {
            path: { id: activityId },
            header: { "Idempotency-Key": key },
            body: { id, kind: input.kind === "schedule" ? "SCHEDULE" : "GENERAL", question: input.question.trim(), multiple: input.multiple, options },
          }),
        ),
      );
      pollActivity.set(id, activityId);
      return id;
    },
    async openConversation(id) {
      const retentionPolicyVersion = await retentionVersion(ctx.client, "CONVERSATION");
      const conversationId = uuid();
      await lifecycleCall(
        id,
        (match, key) => api.request("post", "/api/v1/social-activities/{id}/conversation/open", { path: { id }, header: { "If-Match": match, "Idempotency-Key": key }, body: { id: conversationId, retentionPolicyVersion } }),
        "conversation-open",
      );
    },
    async joinConversation(id) {
      const { data } = await intents.run(`conversation-join:${id}`, (key) => call(() => api.request("post", "/api/v1/social-activities/{id}/conversation/join", { path: { id }, header: { "Idempotency-Key": key }, body: {} })));
      return data.id;
    },
    async invitable(id) {
      const [rows, contacts] = await Promise.all([loadParticipants(id).catch(() => [] as ApiParticipant[]), invitable()]);
      const current = new Set(rows.filter((p) => p.state === "ACTIVE" || p.state === "INVITED").map((p) => p.userId));
      return contacts.filter((p) => !current.has(people.apiId(p.id)));
    },
  };

  return {
    activities,
    checklist,
    polls: pollRepo,
    freeBusy,
    activityAdmin,
    participantsOf: (id) => participants.get(id) ? Promise.resolve(participants.get(id)!) : loadParticipants(id),
    activityTitle: async (id) => (await current(id).catch(() => null))?.title ?? "",
  };
}

const byQueue = (x: { seat: string; waitlistedAt: string | null }, y: { seat: string; waitlistedAt: string | null }) =>
  (x.seat === "OFFERED" ? 0 : 1) - (y.seat === "OFFERED" ? 0 : 1) || (x.waitlistedAt ?? "").localeCompare(y.waitlistedAt ?? "");

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
