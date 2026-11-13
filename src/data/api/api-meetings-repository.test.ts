import { describe, expect, it } from "vitest";
import type { NewMeetingInput } from "../messaging-domain";
import { MessagingError } from "../messaging-repositories";
import { createApiMessaging } from "./api-messaging-repository";
import { err, fakeApi, json, type FakeCall } from "./test-support";

/* Contract fakes for the meeting paths of the 864-op contract (X1-M resolved by GET /meetings/{id}/access/me). */

const USER = { id: "u1", name: "Mehran Raeeszade" };
const M1 = "11111111-1111-4111-8111-111111111111";
const M2 = "22222222-2222-4222-8222-222222222222";
const NOW = Date.now();
const iso = (hoursFromNow: number) => new Date(NOW + hoursFromNow * 3_600_000).toISOString();
const meeting = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  kind: "TEAM",
  sourceId: "t1",
  legacyTeamMeetingId: null,
  event: { id: `e-${id}`, title: "Weekly sync", description: "Plan", schedule: { kind: "TIMED", timezone: "Asia/Tehran", localStart: "x", localEnd: "x", startAt: iso(24), endAt: iso(25) } },
  externalUrl: "https://meet.example/abc",
  state: "ACTIVE",
  revision: 4,
  createdAt: iso(-48),
  role: "PARTICIPANT",
  currentFinalVersionId: null,
  ...over,
});
const ME = { displayName: "Mehran", actorId: "a1", role: "PARTICIPANT", state: "ACTIVE", rsvp: "TENTATIVE", generation: 1, revision: 3, meetingId: M1, memberId: "mm1", capabilities: ["meeting.read", "minutes.draft", "agenda.propose"] };
const MEMBERS = [
  { displayName: "Sara Karimi", id: "mm2", actorId: "a2", role: "ORGANIZER", state: "ACTIVE", rsvp: "ACCEPTED", generation: 1, revision: 1 },
  { displayName: "Mehran", id: "mm1", actorId: "a1", role: "PARTICIPANT", state: "ACTIVE", rsvp: "TENTATIVE", generation: 1, revision: 3 },
  { displayName: null, id: "mm3", actorId: "a3", role: "PARTICIPANT", state: "LEFT", rsvp: "DECLINED", generation: 1, revision: 2 },
];
const version = (over: Record<string, unknown> = {}) => ({
  agenda: [],
  id: "v1",
  meetingId: M1,
  number: 1,
  parentId: null,
  authorMemberId: "mm1",
  reviewerMemberId: null,
  minutes: "Summary",
  state: "DRAFT",
  revision: 5,
  selfFinalized: false,
  createdAt: iso(-1),
  finalizedAt: null,
  decisions: [{ id: "d1", text: "Ship it" }],
  actions: [{ id: "x1", title: "Write notes", description: null }],
  attachments: [],
  contributors: [],
  review: null,
  ...over,
});
const page = (items: unknown[]) => json({ items, nextCursor: null, hasMore: false });

function meetingsApi(opts: { versions?: unknown[]; me?: Record<string, unknown>; invitations?: unknown[] } = {}) {
  return fakeApi((call: FakeCall, parts) => {
    if (parts[0] === "teams") return json({ id: "t1", title: "Design Team" });
    if (parts[0] !== "meetings") return err(404);
    if (call.method !== "GET") return json(version({ id: "v2", revision: 6 }), parts.at(-1) === "reviewer" ? 200 : 201);
    if (parts.length === 1) return page([meeting(M1), meeting(M2, { kind: "PROJECT", sourceId: "p1" })]);
    if (parts[1] === "invitations") return page(opts.invitations ?? []);
    if (parts[1] === M2) return err(403);
    const tail = parts.slice(2).join("/");
    if (tail === "") return json(meeting(M1), 200, '"mt-4"');
    if (tail === "access/me") return json({ ...ME, ...opts.me });
    if (tail === "members") return page(MEMBERS);
    if (tail === "versions") return page(opts.versions ?? []);
    if (tail === "agenda")
      return page([
        { id: "g1", meetingId: M1, memberId: "mm2", text: "Roadmap", state: "ACCEPTED", revision: 1, createdAt: iso(-2) },
        { id: "g2", meetingId: M1, memberId: "mm1", text: "Idea", state: "PROPOSED", revision: 1, createdAt: iso(-2) },
      ]);
    if (tail === "attachments")
      return page([
        { id: "f1", filename: "brief.pdf", mimeType: "application/pdf", status: "READY", expectedSize: 10, actualSize: 9, sha256: "h", revision: 1, createdAt: iso(-1), uploadExpiresAt: iso(1), shared: true },
        { id: "f2", filename: "draft.pdf", mimeType: "application/pdf", status: "INITIATED", expectedSize: 10, actualSize: null, sha256: null, revision: 1, createdAt: iso(-1), uploadExpiresAt: iso(1), shared: false },
      ]);
    return err(404);
  });
}

const code = (promise: Promise<unknown>) => promise.then(() => "ok", (error: unknown) => (error instanceof MessagingError ? `${error.code}:${error.message}` : String(error)));

describe("live meetings (X1-M via access/me)", () => {
  it("lists only meetings the server admits me to, with my RSVP from access/me; no writes", async () => {
    const api = meetingsApi();
    const repo = createApiMessaging(api.client, USER);
    const list = await repo.meetings.list("upcoming");
    expect(list.map((entry) => entry.id)).toEqual([M1]);
    expect(list[0]).toMatchObject({ title: "Weekly sync", myRsvp: "maybe", inviteeCount: 2, minutesStatus: null, needsMyMinutes: false, location: null, link: "https://meet.example/abc" });
    expect(list[0].organizer).toMatchObject({ id: "a2", name: "Sara Karimi" });
    expect(list[0].source).toEqual({ kind: "team", workspaceId: "t1", name: "Design Team" });
    expect(await repo.meetings.list("past")).toEqual([]);
    expect(api.writes()).toEqual([]);
  });

  it("detail: my row is the session user, accepted agenda only, no invented notes / durations, ready files", async () => {
    const repo = createApiMessaging(meetingsApi().client, USER);
    const detail = (await repo.meetings.get(M1))!;
    expect(detail.invitees.map((person) => [person.id, person.rsvp, person.role])).toEqual([
      ["a2", "going", "organizer"],
      ["u1", "maybe", "attendee"],
    ]);
    expect(detail.agenda).toEqual([
      { id: "g1", title: "Roadmap", owner: expect.objectContaining({ id: "a2" }), minutes: null, done: null, proposed: false },
      { id: "g2", title: "Idea", owner: expect.objectContaining({ id: "u1" }), minutes: null, done: null, proposed: true },
    ]);
    expect(detail).toMatchObject({ notes: null, myRole: "attendee", canEdit: false, canEditAgenda: false, canProposeAgenda: true, canDecideAgenda: false, channelId: null, description: "Plan" });
    expect(detail.files).toEqual([{ id: "f1", name: "brief.pdf", bytes: 9, linked: false }]);
    expect(await repo.meetings.get(M2)).toBeNull();
  });

  it("RSVP answers my own invitation (If-Match revision); without one it is unavailable", async () => {
    const api = meetingsApi({ invitations: [{ id: "i1", meetingId: M1, title: "Weekly sync", schedule: {}, state: "TENTATIVE", revision: 2, expiresAt: iso(48) }] });
    await createApiMessaging(api.client, USER).meetings.rsvp(M1, "going");
    const respond = api.calls.find((call) => call.method === "POST")!;
    expect(respond).toMatchObject({ path: "/meetings/invitations/i1/respond", ifMatch: '"2"', body: { decision: "ACCEPTED" } });
    expect(respond.key).toBeTruthy();
    expect(await code(createApiMessaging(meetingsApi().client, USER).meetings.rsvp(M1, "going"))).toMatch(/^unavailable:/);
  });

  it("update: organiser PATCH with the meeting ETag; personal create / invitees stay refused (OD-1)", async () => {
    const api = meetingsApi();
    const repo = createApiMessaging(api.client, USER);
    await repo.meetings.update(M1, { title: "Renamed", link: null });
    expect(api.calls.find((call) => call.method === "PATCH")).toMatchObject({ path: `/meetings/${M1}`, ifMatch: '"mt-4"', body: { event: { title: "Renamed" }, externalUrl: null } });
    const personal = { kind: "personal", workspaceId: null, name: "" } as const;
    expect(await code(repo.meetings.create({ title: "x", source: personal, start: iso(1), end: iso(2), inviteeIds: [], link: null, clientOpId: "op" }))).toMatch(/OD-1/);
    expect(await code(repo.meetings.invitable(personal))).toMatch(/OD-1/);
  });
});

/* M-X5 (`meeting.create` on root access/me) and M-X4 (source-roster actor ids) of the 864-op contract. */
function workApi(opts: { createStatus?: number } = {}) {
  return fakeApi((call: FakeCall, parts) => {
    const tail = parts.join("/");
    if (call.method === "POST" && tail === "meetings") return opts.createStatus ? err(opts.createStatus) : json({ id: call.body.id }, 201);
    if (tail === "projects") return page([{ id: "p1", scopeId: "ps1", title: "Website" }]);
    if (tail === "teams") return page([{ id: "t1", scopeId: "ts1", title: "Design Team" }, { id: "t2", scopeId: "ts2", title: "Ops" }]);
    if (tail === "companies") return page([{ id: "c1", scopeId: "cs1", title: "Euroly" }]);
    if (tail === "projects/p1/access/me") return err(404);
    if (tail === "teams/t1/access/me") return json({ actorId: "ta1", role: "MEMBER", capabilities: ["meeting.create"] });
    if (tail === "teams/t2/access/me") return json({ actorId: "tb1", role: "OWNER", capabilities: ["team.read"] });
    if (tail === "companies/c1/contexts/cs1/access/me") return json({ actorId: "ca1", role: "OWNER", capabilities: ["meeting.create"] });
    if (tail === "teams/t1/memberships")
      return page([
        { id: "tm1", actorId: "ta1", displayName: "Mehran", state: "ACTIVE" },
        { id: "tm2", actorId: "ta2", displayName: "Sara Karimi", state: "ACTIVE" },
        { id: "tm3", actorId: "ta3", displayName: "Old member", state: "REVOKED" },
      ]);
    return err(404);
  });
}

describe("live meeting creation (M-X4 / M-X5)", () => {
  it("sources = only workspaces whose access/me reports meeting.create (not roles); unreadable ones are left out", async () => {
    const api = workApi();
    expect(await createApiMessaging(api.client, USER).meetings.sources()).toEqual([
      { kind: "team", workspaceId: "t1", name: "Design Team" },
      { kind: "company", workspaceId: "c1", name: "Euroly" },
    ]);
    expect(api.writes()).toEqual([]);
  });

  it("invitable = active source-roster actors except me (actor ids, never account ids)", async () => {
    const people = await createApiMessaging(workApi().client, USER).meetings.invitable({ kind: "team", workspaceId: "t1", name: "Design Team" });
    expect(people).toEqual([{ id: "ta2", name: "Sara Karimi", initials: "SK" }]);
  });

  it("create posts a work meeting with participantActorIds (Idempotency-Key = clientOpId, same id on retry); denials map", async () => {
    const api = workApi();
    const repo = createApiMessaging(api.client, USER);
    const input: NewMeetingInput = { title: " Kickoff ", source: { kind: "team", workspaceId: "t1", name: "Design Team" }, start: iso(24), end: iso(25), inviteeIds: ["ta2"], link: null, clientOpId: "op-1" };
    const id = await repo.meetings.create(input);
    expect(await repo.meetings.create(input)).toBe(id);
    const posts = api.calls.filter((call) => call.method === "POST");
    expect(posts[0]).toMatchObject({ path: "/meetings", key: "op-1", body: { id, kind: "TEAM", sourceId: "t1", event: { title: "Kickoff", schedule: { kind: "TIMED" } }, externalUrl: null, participantActorIds: ["ta2"] } });
    expect(posts[0].body).not.toHaveProperty("participants");
    expect(posts[1].body.id).toBe(id);
    expect(await code(createApiMessaging(workApi({ createStatus: 403 }).client, USER).meetings.create(input))).toMatch(/^forbidden/);
  });

  it("OD-16: proposals are posted as text; the organiser decides with the entry revision", async () => {
    const api = meetingsApi();
    const repo = createApiMessaging(api.client, USER);
    await repo.meetings.proposeAgenda(M1, " Budget ");
    await repo.meetings.decideAgenda(M1, "g2", false);
    const [post, patch] = api.calls.filter((call) => call.method !== "GET");
    expect(post).toMatchObject({ method: "POST", path: `/meetings/${M1}/agenda`, body: { text: "Budget" } });
    expect(post.key).toBeTruthy();
    expect(patch).toMatchObject({ method: "PATCH", path: `/meetings/${M1}/agenda/g2`, ifMatch: '"1"', body: { state: "REJECTED" } });
  });

  it("OD-15: pending, unexpired invitations become reduced rows (title + time, no source)", async () => {
    const schedule = { kind: "TIMED", timezone: "Asia/Tehran", localStart: "x", localEnd: "x", startAt: iso(48), endAt: iso(49) };
    const api = meetingsApi({
      invitations: [
        { id: "i1", meetingId: M2, title: "Planning", schedule, state: "PENDING", revision: 1, expiresAt: iso(24) },
        { id: "i2", meetingId: "m3", title: "Old", schedule, state: "PENDING", revision: 1, expiresAt: iso(-1) },
        { id: "i3", meetingId: M1, title: "Weekly sync", schedule, state: "ACCEPTED", revision: 2, expiresAt: iso(24) },
      ],
    });
    expect(await createApiMessaging(api.client, USER).meetings.invitations()).toEqual([{ meetingId: M2, title: "Planning", start: iso(48), end: iso(49) }]);
    expect(api.writes()).toEqual([]);
  });

  it("attach uploads the bytes (create with sha256 → complete); unsupported types are refused before any write", async () => {
    const api = fakeApi((call, parts) => {
      if (call.method === "POST" && parts.at(-1) === "attachments") return json({ ...call.body, status: "INITIATED", actualSize: null, revision: 1, createdAt: iso(0), uploadExpiresAt: iso(1), shared: false }, 201);
      if (call.method === "POST" && parts.at(-1) === "complete") return json({ id: parts[3], filename: "a.pdf", mimeType: "application/pdf", status: "READY", expectedSize: 3, actualSize: 3, sha256: "h", revision: 2, createdAt: iso(0), uploadExpiresAt: iso(1), shared: false }, 201);
      return err(404);
    });
    const repo = createApiMessaging(api.client, USER);
    await repo.meetings.attach(M1, { name: "a.pdf", bytes: 3, linked: false, blob: new Blob(["PDF"], { type: "application/pdf" }) });
    expect(api.writes().map((write) => write.replace(/attachments\/[^/]+/, "attachments/:id"))).toEqual([`POST /meetings/${M1}/attachments`, `POST /meetings/${M1}/attachments/:id/complete`]);
    expect(api.calls[0].body).toMatchObject({ filename: "a.pdf", mimeType: "application/pdf", expectedSize: 3, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(await code(repo.meetings.attach(M1, { name: "a.zip", bytes: 3, linked: false, blob: new Blob(["Z"], { type: "application/zip" }) }))).toMatch(/^invalid:/);
    expect(api.writes()).toHaveLength(2);
  });
});

describe("live minutes (immutable versions, one reviewer)", () => {
  it("maps the latest version and my rights; decision authors are not invented", async () => {
    const repo = createApiMessaging(meetingsApi({ versions: [version()] }).client, USER);
    const minutes = (await repo.minutes.get(M1))!;
    expect(minutes).toMatchObject({ status: "draft", version: 1, summary: "Summary", personal: false, reviews: [], changesComment: null });
    expect(minutes.decisions).toEqual([{ id: "d1", text: "Ship it", proposedBy: null }]);
    expect(minutes.can).toEqual({ write: true, submit: true, review: false, finalize: false, makeTask: false });
    expect(minutes.versions[0]).toMatchObject({ version: 1, status: "draft", by: { id: "u1" } });
  });

  it("save creates a child version with fresh row ids; assignees are refused before any write", async () => {
    const api = meetingsApi({ versions: [version()] });
    const repo = createApiMessaging(api.client, USER);
    await repo.minutes.save(M1, { summary: "New summary" });
    const post = api.calls.find((call) => call.method === "POST")!;
    expect(post.path).toBe(`/meetings/${M1}/versions`);
    expect(post.body).toMatchObject({ parentId: "v1", minutes: "New summary", decisions: [{ text: "Ship it" }], actions: [{ title: "Write notes" }] });
    expect((post.body.decisions as { id: string }[])[0].id).not.toBe("d1");
    const before = api.writes().length;
    expect(await code(repo.minutes.save(M1, { actionItems: [{ id: "x1", text: "Write notes", assignee: { id: "a2", name: "Sara", initials: "S" }, due: null, task: null }] }))).toMatch(/^unavailable:/);
    expect(api.writes().length).toBe(before);
  });

  it("submit names exactly one reviewer (member id), then submits with the new revision", async () => {
    const api = meetingsApi({ versions: [version()] });
    const repo = createApiMessaging(api.client, USER);
    expect(await code(repo.minutes.submit(M1, ["a2", "a3"]))).toBe("invalid:one-reviewer");
    await repo.minutes.submit(M1, ["a2"]);
    expect(api.writes()).toEqual([`PATCH /meetings/${M1}/versions/v1/reviewer`, `POST /meetings/${M1}/versions/v2/submit`]);
    expect(api.calls.filter((call) => call.method !== "GET").map((call) => call.ifMatch)).toEqual(['"5"', '"6"']);
    expect(api.calls.find((call) => call.method === "PATCH")!.body).toEqual({ memberId: "mm2" });
  });

  it("review: only the named reviewer; approval needs a reason; REJECT returns to draft with the comment", async () => {
    const inReview = version({ state: "IN_REVIEW", reviewerMemberId: "mm1", authorMemberId: "mm2" });
    const api = meetingsApi({ versions: [inReview] });
    const repo = createApiMessaging(api.client, USER);
    expect((await repo.minutes.get(M1))!.can.review).toBe(true);
    expect(await code(repo.minutes.approve(M1))).toBe("invalid:reason-required");
    await repo.minutes.approve(M1, "Looks right");
    expect(api.calls.find((call) => call.method === "POST")).toMatchObject({ path: `/meetings/${M1}/versions/v1/review`, ifMatch: '"5"', body: { decision: "APPROVE", reason: "Looks right" } });

    const rejected = createApiMessaging(meetingsApi({ versions: [{ ...inReview, state: "REJECTED", review: { id: "r1", decision: "REJECT", reason: "Add the date" } }] }).client, USER);
    expect(await rejected.minutes.get(M1)).toMatchObject({ status: "draft", changesComment: "Add the date", reviews: [{ state: "changes", comment: "Add the date" }] });
  });
});
