import { describe, expect, it } from "vitest";
import { createApiMessaging } from "./api-messaging-repository";
import { err, fakeApi, json, type FakeCall } from "./test-support";

/* Contract fakes for the Messaging subset of the 860-op contract: no mock data, no simulated events. */

const CV = "c1";
const USER = { id: "u1", name: "Mehran Raeeszade" };
const NOW = Date.now();
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();
const row = (over: Record<string, unknown> = {}) => ({
  id: CV,
  kind: "TEAM",
  sourceId: "t1",
  title: "general",
  revision: 3,
  writable: true,
  createdAt: iso(100),
  lastMessage: { id: "x2", memberId: "mb2", kind: "TEXT", text: "Hi", createdAt: iso(1) },
  unreadCount: 2,
  muted: false,
  lastActivityAt: iso(1),
  updatedAt: iso(1),
  ...over,
});
const MEMBERS = [
  { displayName: "Mehran", id: "mb1", conversationId: CV, actorId: "a1", role: "ADMIN", state: "ACTIVE", generation: 1, revision: 4, historyAfter: null, joinedAt: iso(100) },
  { displayName: "Sara Karimi", id: "mb2", conversationId: CV, actorId: "a2", role: "MEMBER", state: "ACTIVE", generation: 1, revision: 2, historyAfter: null, joinedAt: iso(90) },
];
const ME = { accessId: "mb1", actorId: "a1", role: "ADMIN", generation: 1, capabilities: ["message.read", "message.send", "membership.manage", "conversation.rename"] };
const item = (id: string, sequence: string, memberId: string, hoursAgo: number, over: Record<string, unknown> = {}) => ({
  id,
  conversationId: CV,
  sequence,
  kind: "TEXT",
  state: "VISIBLE",
  revision: 1,
  memberId,
  createdAt: iso(hoursAgo),
  replyToId: null,
  threadId: null,
  content: { text: `text ${id}`, sourceId: null, sourceConversationId: null, sourceMemberId: null },
  reactions: [],
  mentions: [],
  pinned: false,
  ...over,
});
const TIMELINE = [item("x1", "1", "mb1", 50), item("x3", "3", "mb1", 2), item("x2", "2", "mb2", 1, { mentions: ["mb1"] }), item("x4", "4", "mb2", 1, { state: "HIDDEN" })];

const ATTACHMENT = { id: "f1", conversationId: CV, messageId: "x5", kind: "IMAGE", filename: "plan.png", mimeType: "image/png", status: "READY", expectedSize: 3, actualSize: 3, sha256: "h", durationMs: null, revision: 1, createdAt: iso(1), uploadExpiresAt: iso(0) };
const MEDIA_TIMELINE = [
  ...TIMELINE.map(({ content, ...rest }) => ({ ...rest, text: content.text, attachments: [], sourceId: null, sourceConversationId: null })),
  { ...item("x5", "5", "mb2", 1), kind: "MEDIA", text: null, attachments: [ATTACHMENT], sourceId: null, sourceConversationId: null },
];

function messagingApi(extra: (call: FakeCall, parts: string[]) => Response | null = () => null) {
  return fakeApi((call, parts) => {
    const answer = extra(call, parts);
    if (answer) return answer;
    if (call.method !== "GET") return json({ resourceId: "x9", revision: 1 }, 201);
    if (parts[0] === "teams") return json({ id: "t1", title: "Design Team" });
    if (parts[0] === "messaging") return json({ items: [], nextCursor: null, hasMore: false });
    if (parts[0] !== "conversations") return err(404);
    if (parts.length === 1) return json({ items: [row(), row({ id: "c2", kind: "DM", sourceId: null, title: null, lastMessage: null, unreadCount: 1, lastActivityAt: iso(5) })], nextCursor: null });
    if (parts[1] === "zz") return err(404);
    const tail = parts.slice(2).join("/");
    if (tail === "") return json(row(), 200, '"cv-3"');
    if (tail === "access/me") return json(parts[1] === "c2" ? { ...ME, accessId: "dm1" } : ME);
    if (tail === "members") return json({ items: parts[1] === "c2" ? [{ ...MEMBERS[0], id: "dm1" }, { ...MEMBERS[1], id: "dm2", displayName: "Ali" }] : MEMBERS, nextCursor: null });
    if (tail === "message-policy") return json({ revision: 1, authorDelete: false });
    if (tail === "media-timeline") return json({ items: MEDIA_TIMELINE, nextCursor: null, hasMore: false, changeCursor: "c" });
    if (tail.startsWith("media-messages/") && tail.endsWith("/download")) return new Response(new Blob(["PNG"], { type: "image/png" }), { status: 200, headers: { "Content-Type": "application/octet-stream" } });
    if (tail.startsWith("media-messages/")) return json(MEDIA_TIMELINE.find((entry) => entry.id === parts[3]));
    if (tail === "contact-block") return json({ id: parts[1] === "c2" ? "b1" : null, conversationId: parts[1], active: parts[1] === "c2", revision: 3 }, 200, '"blk-3"');
    if (tail === "timeline" || tail === "pins") return json({ items: tail === "pins" ? [] : TIMELINE, nextCursor: null, hasMore: false, changeCursor: "c" });
    if (tail === "progress") return json({ deliveredThrough: "2", readThrough: "1", shareReceipts: false, revision: 1 });
    if (tail === "mentions") return json({ items: parts[1] === CV ? TIMELINE.filter((entry) => (entry.mentions as string[]).includes("mb1")) : [], nextCursor: null, hasMore: false, changeCursor: "c" });
    if (tail === "messages/x1/receipts") return json({ messageId: "x1", sharing: false, deliveredCount: null, readCount: null });
    if (tail === "messages/x3/receipts") return json({ messageId: "x3", sharing: true, deliveredCount: 1, readCount: 1 });
    if (tail.startsWith("message-details/")) return json(TIMELINE.find((entry) => entry.id === parts[3]) ?? item("x9", "9", "mb1", 0));
    if (tail === "notification-settings") return json({ mode: "ALL", quietStart: null, quietEnd: null, mentionQuiet: false, revision: 7 });
    return err(404);
  });
}

describe("live Messaging repository", () => {
  it("lists conversations from the summary API: names, workspace, unread, unread mentions after my read-through, newest first", async () => {
    const api = messagingApi();
    const repo = createApiMessaging(api.client, USER);
    const list = await repo.conversations.list("all");
    expect(list.map((entry) => [entry.id, entry.kind, entry.title, entry.unread, entry.mentions])).toEqual([
      [CV, "channel", "general", 2, 1],
      ["c2", "direct", "Ali", 1, 0],
    ]);
    expect(list[0].source).toEqual({ kind: "team", workspaceId: "t1", name: "Design Team" });
    expect(list[0].lastMessage).toMatchObject({ author: "Sara Karimi", mine: false, preview: "Hi", kind: "text" });
    expect(await repo.conversations.unreadCount()).toBe(3);
    expect((await repo.channels.list("t1")).map((entry) => entry.id)).toEqual([CV]);
    expect(await repo.conversations.workspaceMentions("t1")).toBe(1);
    expect(await repo.conversations.workspaceMentions("t9")).toBe(0);
    expect(api.writes()).toEqual([]);
  });

  it("detail: rights from access/me, presence hidden, no receipts; not-found for hidden conversations", async () => {
    const repo = createApiMessaging(messagingApi().client, USER);
    const detail = await repo.conversations.get(CV);
    expect(detail).toMatchObject({ access: "member", myRole: "admin", canPost: true, canManage: true, memberCount: 2, threadUnread: 0, policy: null });
    await expect(repo.conversations.get("zz")).resolves.toEqual({ access: "not-found" });
    const people = await repo.conversations.participants(CV);
    expect(people.map((person) => [person.id, person.you])).toEqual([
      ["u1", true],
      ["a2", false],
    ]);
  });

  it("page: sequence order, hidden items left out, unread from readThrough, 48 h window, author-delete policy, server receipts on my messages", async () => {
    const repo = createApiMessaging(messagingApi().client, USER);
    const page = await repo.messages.page(CV);
    expect(page.items.map((message) => message.id)).toEqual(["x1", "x2", "x3", "x5"]);
    expect(page.firstUnreadId).toBe("x2");
    expect(page.unreadCount).toBe(2);
    const [old, theirs, recent] = page.items;
    expect(old.can.editHoursLeft).toBeNull();
    expect(old.can.deleteForEveryone).toEqual({ allowed: false, reason: "window" });
    expect(recent.can.editHoursLeft).toBe(46);
    expect(recent.can.deleteForEveryone).toEqual({ allowed: false, reason: "policy" });
    expect(theirs).toMatchObject({ mine: false, mentionsMe: true, author: { id: "a2", name: "Sara Karimi" }, receipt: null });
    expect(recent.author).toEqual({ id: "u1", name: "Mehran Raeeszade", initials: "MR" });
    // x1: receipts not shared → none; x3 in a channel: delivered (no "seen" outside direct conversations).
    expect([old.receipt, recent.receipt]).toEqual([null, "delivered"]);
  });

  it("commands: compose with mentions as member ids, edit / react / pin by remembered conversation, mute, rename, leave", async () => {
    const api = messagingApi();
    const repo = createApiMessaging(api.client, USER);
    await repo.messages.page(CV);
    const sent = await repo.messages.send(CV, { clientOpId: "op-1", body: "Hi @[Sara](a2)", replyToId: "x2" });
    expect(sent.id).toBe("x9");
    await repo.messages.edit("x3", "fixed");
    await repo.messages.react("x2", "👍");
    await repo.messages.pin("x2", true);
    await repo.conversations.mute(CV, true);
    await repo.conversations.rename(CV, " Renamed ");
    await repo.conversations.leave(CV);
    const writes = api.calls.filter((call) => call.method !== "GET");
    expect(writes.map((call) => [call.method, call.path, call.ifMatch])).toEqual([
      ["POST", `/conversations/${CV}/advanced-actions`, null],
      ["POST", `/conversations/${CV}/advanced-actions`, null],
      ["POST", `/conversations/${CV}/advanced-actions`, null],
      ["POST", `/conversations/${CV}/advanced-actions`, null],
      ["PATCH", `/conversations/${CV}/notification-settings`, '"7"'],
      ["PATCH", `/conversations/${CV}`, '"cv-3"'],
      ["POST", `/conversations/${CV}/leave`, '"4"'],
    ]);
    expect(writes[0].key).toBe("op-1");
    expect(writes[0].body).toMatchObject({ action: "compose", text: "Hi @[Sara](a2)", replyToId: "x2", mentions: ["mb2"] });
    expect(writes.slice(1, 4).map((call) => call.body)).toEqual([
      { action: "edit", messageId: "x3", text: "fixed" },
      { action: "reaction", messageId: "x2", emoji: "👍", active: true },
      { action: "pin", messageId: "x2", active: true },
    ]);
    expect(writes[4].body).toEqual({ mode: "MUTED", quietStart: null, quietEnd: null, mentionQuiet: false });
    expect(writes[5].body).toEqual({ title: "Renamed" });
    await expect(repo.messages.edit("unknown", "x")).rejects.toMatchObject({ code: "not-found" });
  });

  it("media: READY attachments downloaded once; upload stages bytes and send posts create → complete → media message; forward and block", async () => {
    const api = messagingApi((call, parts) => {
      if (call.method === "POST" && parts[2] === "attachments" && parts.length === 3) return json({ ...ATTACHMENT, id: "f9", status: "INITIATED", messageId: null }, 201);
      if (call.method === "POST" && parts[4] === "complete") return json({ ...ATTACHMENT, id: "f9", messageId: null }, 201);
      if (call.method === "POST" && parts[2] === "media-messages") return json({ ...MEDIA_TIMELINE[4], id: "x5" }, 201);
      return null;
    });
    const repo = createApiMessaging(api.client, USER);
    const page = await repo.messages.page(CV);
    const media = page.items.find((message) => message.id === "x5")!;
    expect(media.attachments).toMatchObject([{ id: "f1", kind: "image", name: "plan.png", bytes: 3, mime: "image/png" }]);
    expect(media.attachments[0].url).toMatch(/^blob:/);
    expect((await repo.messages.media(CV)).map((entry) => entry.attachment.id)).toEqual(["f1"]);
    await expect(repo.messages.upload({ name: "a.webm", bytes: 3, mime: "audio/webm", kind: "voice", url: "blob:x" })).rejects.toMatchObject({ code: "invalid" });
    const source = URL.createObjectURL(new Blob(["PNG"], { type: "image/png" }));
    const staged = await repo.messages.upload({ name: "plan.png", bytes: 3, mime: "image/png", kind: "image", url: source });
    await repo.messages.send(CV, { clientOpId: "op-2", body: "look", attachments: [staged] });
    await repo.messages.forward("x5", "c2", "op-3");
    await repo.messages.forward("x2", "c2", "op-4");
    await repo.settings.block("a2").catch((error: unknown) => error);
    await repo.settings.unblock("a2");
    const writes = api.calls.filter((call) => call.method !== "GET");
    expect(writes.map((call) => [call.path, call.key])).toEqual([
      ["/conversations/c1/attachments", expect.any(String)],
      ["/conversations/c1/attachments/f9/complete", null],
      ["/conversations/c1/media-messages", "op-2"],
      ["/conversations/c2/media-forwards", "op-3"],
      ["/conversations/c2/advanced-actions", "op-4"],
      ["/messaging/blocks", expect.any(String)],
    ]);
    expect(writes[0].body).toMatchObject({ filename: "plan.png", expectedSize: 3, kind: "IMAGE", mimeType: "image/png", sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(writes[2].body).toMatchObject({ caption: "look", attachments: ["f9"] });
    expect(writes[3].body).toMatchObject({ sourceConversationId: CV, sourceId: "x5" });
    expect(writes[4].body).toMatchObject({ action: "forward", sourceConversationId: CV, sourceId: "x2" });
    expect([writes[5].body, writes[5].ifMatch]).toEqual([{ blockId: "b1", active: false }, '"blk-3"']);
  });

  it("refuses what the API or owner policy does not support, without a request; never emits events", async () => {
    const api = fakeApi(() => err(500));
    const repo = createApiMessaging(api.client, USER);
    // No media search (OD-11 is text + links only); the author-delete policy is read-only.
    await expect(repo.messages.search("hi", { has: "image" })).rejects.toMatchObject({ code: "unavailable" });
    await expect(repo.conversations.updatePolicy("c1", { authorDeleteForEveryone: false })).rejects.toMatchObject({ code: "unavailable" });
    await expect(repo.meetings.create({ title: "x", source: { kind: "personal", workspaceId: null, name: "" }, start: "2026-01-01T00:00:00Z", end: "2026-01-01T01:00:00Z", inviteeIds: ["u2"], link: null, clientOpId: "op" })).rejects.toMatchObject({ code: "unavailable" });
    await expect(repo.announcements.list("t1")).rejects.toMatchObject({ code: "unavailable" });
    await expect(repo.settings.get()).rejects.toMatchObject({ code: "unavailable" });
    let events = 0;
    repo.subscribe(() => events++)();
    expect(events).toBe(0);
    expect(api.calls).toEqual([]);
  });

  it("creates a direct conversation with the catalog's CONVERSATION policy; an empty catalog is refused truthfully", async () => {
    const policy = { version: "mp-rpc-v1.0-conversation", applicableContexts: ["CONVERSATION"], marketScope: "IR", classRules: {}, createdAt: "x" };
    const api = fakeApi((call) => (call.path === "/retention-policies" ? json({ items: [policy] }) : json({ id: "c9", kind: "DM", sourceId: null, title: null, revision: 1, writable: true, createdAt: "x" }, 201)));
    expect(await createApiMessaging(api.client, USER).conversations.create({ personIds: ["u2"], clientOpId: "op" })).toBe("c9");
    expect(api.calls.at(-1)!.body).toMatchObject({ kind: "DM", participants: ["u2"], retentionPolicyVersion: "mp-rpc-v1.0-conversation" });
    const empty = fakeApi(() => json({ items: [] }));
    await expect(createApiMessaging(empty.client, USER).conversations.create({ personIds: ["u2"], clientOpId: "op" })).rejects.toMatchObject({ code: "unavailable" });
    expect(empty.calls.map((call) => call.path)).toEqual(["/retention-policies"]);
  });
});
