import { describe, expect, it } from "vitest";
import { MessagingError } from "../messaging-repositories";
import { createApiMessaging } from "./api-messaging-repository";
import { err, fakeApi, json, type FakeCall } from "./test-support";

/*
 * Contract fakes (1,045-op contract) for the Messages & Meetings gap closure:
 * conversation invitation inbox, messaging notices + announcement reminders
 * (bell), private meeting file download, minutes withdraw. Not live evidence.
 */

const USER = { id: "u1", name: "Mehran Raeeszade" };
const M1 = "11111111-1111-4111-8111-111111111111";
const C1 = "33333333-3333-4333-8333-333333333333";
const NOW = Date.now();
const iso = (hoursFromNow: number) => new Date(NOW + hoursFromNow * 3_600_000).toISOString();
const page = (items: unknown[]) => json({ items, nextCursor: null, hasMore: false });
const code = (promise: Promise<unknown>) => promise.then(() => "ok", (error: unknown) => (error instanceof MessagingError ? `${error.code}:${error.message}` : String(error)));

const invitation = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  conversationId: C1,
  kind: "PRIVATE_GROUP",
  inviterActorId: "a2",
  inviterDisplayName: "Sara Karimi",
  state: "PENDING",
  revision: 3,
  expiresAt: iso(24),
  ...over,
});

describe("conversation invitation inbox", () => {
  it("lists only pending, unexpired invitations with the served fields (no invented title)", async () => {
    const api = fakeApi(() => page([invitation(), invitation({ id: "i2", expiresAt: iso(-1) }), invitation({ id: "i3", inviterDisplayName: null, kind: "DM" })]));
    const list = await createApiMessaging(api.client, USER).conversations.invitations();
    expect(list).toEqual([
      { id: "i1", revision: 3, conversationId: C1, kind: "group", inviterName: "Sara Karimi", expiresAt: expect.any(String) },
      { id: "i3", revision: 3, conversationId: C1, kind: "direct", inviterName: null, expiresAt: expect.any(String) },
    ]);
    expect(api.calls[0].path).toBe("/conversation-invitations");
    expect(api.writes()).toEqual([]);
  });

  it("accept / decline send If-Match = the invitation revision and resolve the conversation", async () => {
    const api = fakeApi((call) => (call.method === "POST" ? json(invitation({ state: call.path.endsWith("accept") ? "ACCEPTED" : "DECLINED", revision: 4 }), 201) : err(404)));
    const repo = createApiMessaging(api.client, USER);
    const [row] = [{ id: "i1", revision: 3, conversationId: C1, kind: "group" as const, inviterName: null, expiresAt: iso(1) }];
    expect(await repo.conversations.respondInvitation(row, true)).toBe(C1);
    await repo.conversations.respondInvitation(row, false);
    expect(api.calls.map((call) => [call.path, call.ifMatch])).toEqual([
      ["/conversation-invitations/i1/accept", '"3"'],
      ["/conversation-invitations/i1/decline", '"3"'],
    ]);
  });

  it("revoked / changed (409) and gone (404) are reported, never retried", async () => {
    const row = { id: "i1", revision: 3, conversationId: C1, kind: "group" as const, inviterName: null, expiresAt: iso(1) };
    const stale = fakeApi(() => err(409));
    expect(await code(createApiMessaging(stale.client, USER).conversations.respondInvitation(row, true))).toBe("invalid:Changed elsewhere");
    expect(stale.calls).toHaveLength(1);
    const gone = fakeApi(() => err(404));
    expect(await code(createApiMessaging(gone.client, USER).conversations.respondInvitation(row, false))).toMatch(/^not-found:/);
  });
});

describe("bell: messaging notices + announcement reminders", () => {
  const notice = (id: string, over: Record<string, unknown> = {}) => ({ id, conversationId: C1, kind: "MESSAGE", messageId: "m1", invitationId: null, read: false, revision: 2, createdAt: iso(-2), ...over });

  it("lists notices newest first; read sends If-Match once; an already-read notice sends nothing", async () => {
    const api = fakeApi((call) => (call.method === "POST" ? json(notice("n1", { read: true, revision: 3 }), 201) : page([notice("n1"), notice("n2", { kind: "INVITATION", messageId: null, invitationId: "i1", createdAt: iso(-1), read: true })])));
    const repo = createApiMessaging(api.client, USER);
    const list = await repo.conversations.notices();
    expect(list.map((item) => [item.id, item.kind, item.read])).toEqual([
      ["n2", "invitation", true],
      ["n1", "message", false],
    ]);
    await repo.conversations.readNotice(list[1]);
    await repo.conversations.readNotice(list[0]);
    expect(api.calls.filter((call) => call.method === "POST").map((call) => [call.path, call.ifMatch])).toEqual([["/messaging-notifications/n1/read", '"2"']]);
  });

  it("reminders: title + source only from authorised reads; a 403 announcement stays a generic row", async () => {
    const api = fakeApi((call: FakeCall, parts) => {
      if (call.method === "POST") return json({ id: "r1", announcementId: "an1", versionId: "v1", createdAt: iso(-3), readAt: iso(0) });
      if (parts[0] === "announcement-reminders")
        return json({
          items: [
            { id: "r1", announcementId: "an1", versionId: "v1", createdAt: iso(-3), readAt: null },
            { id: "r2", announcementId: "an2", versionId: "v2", createdAt: iso(-1), readAt: iso(0) },
          ],
        });
      if (parts[0] === "teams") return json({ id: "t1", title: "Design Team" });
      if (parts[1] === "an2") return err(403);
      if (parts.length === 2) return json({ id: "an1", kind: "TEAM", sourceId: "t1", revision: 1, createdAt: iso(-5) });
      return json({ id: "v1", announcementId: "an1", title: "Office move", text: "x", state: "PUBLISHED" });
    });
    const repo = createApiMessaging(api.client, USER);
    const reminders = await repo.announcements.reminders();
    expect(reminders).toEqual([
      { id: "r2", announcementId: "an2", at: expect.any(String), read: true, title: null, source: null },
      { id: "r1", announcementId: "an1", at: expect.any(String), read: false, title: "Office move", source: { kind: "team", workspaceId: "t1", name: "Design Team" } },
    ]);
    await repo.announcements.readReminder("r1");
    expect(api.writes()).toEqual(["POST /announcement-reminders/r1/read"]);
  });
});

/* Meetings: a TEAM meeting where I am the author of the minutes' latest version. */
const ME = { displayName: "Mehran", actorId: "a1", role: "PARTICIPANT", state: "ACTIVE", rsvp: "ACCEPTED", generation: 1, revision: 3, meetingId: M1, memberId: "mm1", capabilities: ["meeting.read", "minutes.draft"] };
const MEMBERS = [
  { displayName: "Sara Karimi", id: "mm2", actorId: "a2", role: "ORGANIZER", state: "ACTIVE", rsvp: "ACCEPTED", generation: 1, revision: 1 },
  { displayName: "Mehran", id: "mm1", actorId: "a1", role: "PARTICIPANT", state: "ACTIVE", rsvp: "ACCEPTED", generation: 1, revision: 3 },
];
const meeting = {
  id: M1,
  kind: "TEAM",
  sourceId: "t1",
  legacyTeamMeetingId: null,
  event: { id: "e1", title: "Weekly sync", description: null, schedule: { kind: "TIMED", timezone: "Asia/Tehran", localStart: "x", localEnd: "x", startAt: iso(-3), endAt: iso(-2) } },
  externalUrl: null,
  state: "ACTIVE",
  revision: 4,
  createdAt: iso(-48),
  role: "PARTICIPANT",
  currentFinalVersionId: null,
};
const version = (over: Record<string, unknown> = {}) => ({
  agenda: [],
  id: "v1",
  meetingId: M1,
  number: 2,
  parentId: null,
  authorMemberId: "mm1",
  reviewerMemberId: "mm2",
  minutes: "Summary",
  state: "IN_REVIEW",
  revision: 5,
  selfFinalized: false,
  createdAt: iso(-1),
  finalizedAt: null,
  decisions: [],
  actions: [],
  attachments: [],
  contributors: [],
  review: null,
  ...over,
});
const FILE = { id: "f1", filename: "brief.pdf", mimeType: "application/pdf", status: "READY", expectedSize: 10, actualSize: 9, sha256: "h", revision: 1, createdAt: iso(-1), uploadExpiresAt: iso(1), shared: false };

function meetingsApi(opts: { versions?: unknown[]; me?: Record<string, unknown>; file?: Record<string, unknown>; download?: number; withdraw?: number } = {}) {
  return fakeApi((call: FakeCall, parts) => {
    if (parts[0] === "teams") return json({ id: "t1", title: "Design Team" });
    const tail = parts.slice(2).join("/");
    if (call.method === "POST" && tail.endsWith("/withdraw")) return opts.withdraw ? err(opts.withdraw) : json(version({ state: "DRAFT", revision: 6 }), 201);
    if (parts.length === 1) return page([meeting]);
    if (tail === "") return json(meeting, 200, '"mt-4"');
    if (tail === "access/me") return json({ ...ME, ...opts.me });
    if (tail === "members") return page(MEMBERS);
    if (tail === "versions") return page(opts.versions ?? [version()]);
    if (tail === "attachments/f1") return json({ ...FILE, ...opts.file });
    if (tail === "attachments/f1/download") return opts.download ? err(opts.download) : new Response("%PDF-1", { status: 200, headers: { "Content-Type": "application/octet-stream" } });
    return err(404);
  });
}

describe("meeting file download (private, server-authorised)", () => {
  it("streams the READY file's bytes with its real name and type; no storage URL", async () => {
    const api = meetingsApi();
    const { blob, name } = await createApiMessaging(api.client, USER).meetings.download(M1, "f1");
    expect(name).toBe("brief.pdf");
    expect(blob.size).toBe(6);
    expect(api.calls.map((call) => call.path)).toEqual([`/meetings/${M1}/attachments/f1`, `/meetings/${M1}/attachments/f1/download`]);
    expect(api.writes()).toEqual([]);
  });

  it("a file that is not READY is not downloaded; forbidden / gone are reported", async () => {
    const pending = meetingsApi({ file: { status: "INITIATED" } });
    expect(await code(createApiMessaging(pending.client, USER).meetings.download(M1, "f1"))).toMatch(/^not-found:/);
    expect(pending.calls).toHaveLength(1);
    expect(await code(createApiMessaging(meetingsApi({ download: 403 }).client, USER).meetings.download(M1, "f1"))).toMatch(/^forbidden:/);
    expect(await code(createApiMessaging(meetingsApi({ download: 404 }).client, USER).meetings.download(M1, "f1"))).toMatch(/^not-found:/);
  });
});

describe("minutes withdraw", () => {
  it("offered to the author of an in-review version; POST withdraw with If-Match + Idempotency-Key", async () => {
    const api = meetingsApi();
    const repo = createApiMessaging(api.client, USER);
    expect((await repo.minutes.get(M1))!.can.withdraw).toBe(true);
    await repo.minutes.withdraw(M1);
    const call = api.calls.find((entry) => entry.method === "POST")!;
    expect(call).toMatchObject({ path: `/meetings/${M1}/versions/v1/withdraw`, ifMatch: '"5"' });
    expect(call.key).toBeTruthy();
  });

  it("approved: organiser may withdraw; a non-author participant may not", async () => {
    const approved = [version({ state: "APPROVED", authorMemberId: "mm2" })];
    expect((await createApiMessaging(meetingsApi({ versions: approved }).client, USER).minutes.get(M1))!.can.withdraw).toBe(false);
    expect((await createApiMessaging(meetingsApi({ versions: approved, me: { capabilities: ["meeting.read", "meeting.manage"] } }).client, USER).minutes.get(M1))!.can.withdraw).toBe(true);
  });

  it("a final or draft version is never reopened (no request); a 409 is shown, not retried", async () => {
    for (const state of ["FINAL", "DRAFT"]) {
      const api = meetingsApi({ versions: [version({ state })] });
      const repo = createApiMessaging(api.client, USER);
      expect((await repo.minutes.get(M1))!.can.withdraw).toBe(false);
      expect(await code(repo.minutes.withdraw(M1))).toBe("invalid:Changed elsewhere");
      expect(api.writes()).toEqual([]);
    }
    const stale = meetingsApi({ withdraw: 409 });
    expect(await code(createApiMessaging(stale.client, USER).minutes.withdraw(M1))).toBe("invalid:Changed elsewhere");
    expect(stale.writes()).toHaveLength(1);
  });
});
