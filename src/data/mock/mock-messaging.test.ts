import { describe, expect, it } from "vitest";
import { SAMPLE_NOW } from "@/fixtures/personal/sample-day";
import { MessagingError } from "../messaging-repositories";
import { createMessagingServer, EDIT_WINDOW_MS } from "./mock-messaging";

/*
 * 13_MESSAGING_DELETE_POLICY_FINAL — the seven must-prove acceptance tests,
 * run against the mock server from several users' viewpoints, plus the
 * visibility rules search and receipts depend on.
 */

function setup() {
  let t = new Date(SAMPLE_NOW).getTime();
  const server = createMessagingServer({ now: () => t, simulate: false, uploadStepMs: 0 });
  return {
    server,
    me: server.as("me"),
    as: (id: string) => server.as(id),
    at: (offset: number) => (t = offset),
    advance: (by: number) => (t += by),
    now: () => t,
  };
}

const code = async (p: Promise<unknown>) => p.then(() => "ok", (e: unknown) => (e instanceof MessagingError ? e.code : String(e)));
const op = (() => {
  let n = 0;
  return () => `op-${++n}`;
})();

describe("delete/edit policy acceptance (P5)", () => {
  it("1 · DM: delete-for-everyone at 47h59m succeeds, at 48h+ε is refused (self-only remains), recipient converges", async () => {
    const env = setup();
    const sent = await env.me.messages.send("c-nazanin", { clientOpId: op(), body: "first" });
    const sent2 = await env.me.messages.send("c-nazanin", { clientOpId: op(), body: "second" });
    const created = new Date(sent.createdAt).getTime();
    env.at(created + EDIT_WINDOW_MS - 60_000);
    expect(await code(env.me.messages.deleteForEveryone(sent.id))).toBe("ok");
    const theirs = await env.as("nazanin").messages.page("c-nazanin");
    expect(theirs.items.find((m) => m.id === sent.id)).toMatchObject({ state: "deleted", body: "" });

    env.at(new Date(sent2.createdAt).getTime() + EDIT_WINDOW_MS + 1);
    const view = (await env.me.messages.page("c-nazanin")).items.find((m) => m.id === sent2.id)!;
    expect(view.can.deleteForEveryone).toEqual({ allowed: false, reason: "window" });
    expect(view.can.editHoursLeft).toBeNull();
    expect(await code(env.me.messages.deleteForEveryone(sent2.id))).toBe("window-expired");
    expect(await code(env.me.messages.edit(sent2.id, "late"))).toBe("window-expired");
    expect(await code(env.me.messages.deleteForMe(sent2.id))).toBe("ok");
    expect((await env.as("nazanin").messages.page("c-nazanin")).items.find((m) => m.id === sent2.id)).toMatchObject({ state: "visible", body: "second" });
  });

  it("1b · the window boundary is inclusive (now == createdAt + 48h)", async () => {
    const env = setup();
    const sent = await env.me.messages.send("c-sara", { clientOpId: op(), body: "edge" });
    env.at(new Date(sent.createdAt).getTime() + EDIT_WINDOW_MS);
    expect(await code(env.me.messages.edit(sent.id, "edge edited"))).toBe("ok");
    expect(await code(env.me.messages.deleteForEveryone(sent.id))).toBe("ok");
  });

  it("2 · private group: same window; a later joiner cannot reach older messages by guessing ids", async () => {
    const env = setup();
    // me joined Darband hikers after m-h0 (history from join).
    const page = await env.me.messages.page("c-hikers");
    expect(page.items.map((m) => m.id)).not.toContain("m-h0");
    expect(page.joinedLater).toBe(true);
    expect(await code(env.me.messages.thread("c-hikers", "m-h0"))).toBe("not-found");
    expect(await code(env.me.messages.react("m-h0", "👍"))).toBe("not-found");
    expect(await code(env.me.messages.deleteForMe("m-h0"))).toBe("not-found");
    expect(await code(env.me.messages.forwardTargets("m-h0"))).toBe("not-found");
    expect((await env.me.messages.search("planning", {})).length).toBe(0);
    expect((await env.as("nazanin").messages.search("planning", {})).length).toBe(1);

    const mine = await env.me.messages.send("c-hikers", { clientOpId: op(), body: "group msg" });
    env.advance(EDIT_WINDOW_MS - 1000);
    expect(await code(env.me.messages.deleteForEveryone(mine.id))).toBe("ok");
    const late = await env.me.messages.send("c-hikers", { clientOpId: op(), body: "group msg 2" });
    env.advance(EDIT_WINDOW_MS + 1);
    expect(await code(env.me.messages.deleteForEveryone(late.id))).toBe("window-expired");
  });

  it("3 · work channel: policy on permits, policy off denies, a policy change is enforced on the next command, after 48h always denied", async () => {
    const env = setup();
    // design-team (team policy: authors may delete for everyone).
    const a = await env.me.messages.send("c-design-team", { clientOpId: op(), body: "on" });
    expect(await code(env.me.messages.deleteForEveryone(a.id))).toBe("ok");
    // website-redesign (project policy off).
    const b = await env.me.messages.send("c-website", { clientOpId: op(), body: "off" });
    const view = (await env.me.messages.page("c-website")).items.find((m) => m.id === b.id)!;
    expect(view.can.deleteForEveryone).toEqual({ allowed: false, reason: "policy" });
    expect(await code(env.me.messages.deleteForEveryone(b.id))).toBe("policy");
    // Race: the UI saw "allowed", then an admin made the channel stricter.
    const c = await env.me.messages.send("c-design-team", { clientOpId: op(), body: "race" });
    expect((await env.me.messages.page("c-design-team")).items.find((m) => m.id === c.id)!.can.deleteForEveryone.allowed).toBe(true);
    await env.me.conversations.updatePolicy("c-design-team", { authorDeleteForEveryone: false });
    expect(await code(env.me.messages.deleteForEveryone(c.id))).toBe("policy");
    // A channel can't be looser than its workspace.
    expect(await code(env.me.conversations.updatePolicy("c-website", { authorDeleteForEveryone: true }))).toBe("policy");
    expect(await code(env.as("sara").conversations.updatePolicy("c-website", { authorDeleteForEveryone: true }))).toBe("forbidden");
    // After the window, even with policy on: denied.
    await env.me.conversations.updatePolicy("c-design-team", { authorDeleteForEveryone: true });
    env.advance(EDIT_WINDOW_MS + 60_000);
    expect(await code(env.me.messages.deleteForEveryone(c.id))).toBe("window-expired");
  });

  it("4 · non-authors can't edit or delete for everyone; a removed member can't delete, edit or read", async () => {
    const env = setup();
    const sara = env.as("sara");
    const msg = await sara.messages.send("c-design-team", { clientOpId: op(), body: "sara's" });
    const mine = (await env.me.messages.page("c-design-team")).items.find((m) => m.id === msg.id)!;
    expect(mine.can.editHoursLeft).toBeNull();
    expect(mine.can.deleteForEveryone).toEqual({ allowed: false, reason: "not-author" });
    expect(await code(env.me.messages.edit(msg.id, "hijack"))).toBe("forbidden");
    expect(await code(env.me.messages.deleteForEveryone(msg.id))).toBe("forbidden");

    await env.me.conversations.removePerson("c-design-team", "sara");
    expect(await code(sara.messages.deleteForEveryone(msg.id))).toBe("not-found");
    expect(await code(sara.messages.edit(msg.id, "x"))).toBe("not-found");
    expect(await code(sara.messages.page("c-design-team"))).toBe("removed");
    expect(await code(sara.messages.thread("c-design-team", msg.id))).toBe("removed");
    expect((await sara.conversations.list("all")).map((c) => c.id)).not.toContain("c-design-team");
    expect(await sara.conversations.get("c-design-team")).toEqual({ access: "removed" });
    expect((await sara.messages.search("sara's", {})).length).toBe(0);
  });

  it("5 · delete-for-me hides only for me, also in search, pagination and after reconnect", async () => {
    const env = setup();
    await env.me.messages.deleteForMe("m-n8");
    expect((await env.me.messages.page("c-nazanin")).items.map((m) => m.id)).not.toContain("m-n8");
    expect((await env.me.messages.search("light rain", {})).length).toBe(0);
    const reconnected = env.server.as("me");
    expect((await reconnected.messages.page("c-nazanin")).items.map((m) => m.id)).not.toContain("m-n8");
    expect((await reconnected.conversations.list("all")).find((c) => c.id === "c-nazanin")!.lastMessage!.preview).not.toContain("light rain");
    const theirs = await env.as("nazanin").messages.page("c-nazanin");
    expect(theirs.items.find((m) => m.id === "m-n8")).toMatchObject({ state: "visible", body: "Weather says light rain after 11" });
    expect((await env.as("nazanin").messages.search("light rain", {})).length).toBe(1);
  });

  it("6 · tombstones survive retries, idempotent sends, ordering and edit/delete races", async () => {
    const env = setup();
    const id = op();
    const first = await env.me.messages.send("c-nazanin", { clientOpId: id, body: "once" });
    const retry = await env.me.messages.send("c-nazanin", { clientOpId: id, body: "once" });
    expect(retry.id).toBe(first.id);
    expect((await env.me.messages.page("c-nazanin")).items.filter((m) => m.body === "once")).toHaveLength(1);

    await env.me.messages.deleteForEveryone(first.id);
    expect(await code(env.me.messages.deleteForEveryone(first.id))).toBe("ok");
    expect(await code(env.me.messages.edit(first.id, "resurrect"))).toBe("not-found");
    expect(await code(env.me.messages.forward(first.id, "c-sara", op()))).toBe("not-found");
    expect(await code(env.me.messages.react(first.id, "👍"))).toBe("forbidden");
    // Replaying the original send after deletion returns the tombstone, not the content.
    const replay = await env.me.messages.send("c-nazanin", { clientOpId: id, body: "once" });
    expect(replay).toMatchObject({ id: first.id, state: "deleted", body: "" });
    // Replies quoting a deleted message show the tombstone, search doesn't find it.
    const reply = await env.as("nazanin").messages.send("c-nazanin", { clientOpId: op(), body: "re", replyToId: "m-n7" });
    expect(reply.replyTo).toMatchObject({ deleted: true, excerpt: "" });
    expect((await env.as("nazanin").messages.search("once", {})).length).toBe(0);
    // Server order is strictly increasing per conversation.
    const items = (await env.me.messages.page("c-nazanin")).items;
    const times = items.map((m) => new Date(m.createdAt).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("7 · moderation is separately guarded, audited by role, not bound to 48h, and never in direct messages", async () => {
    const env = setup();
    const leila = env.as("leila");
    env.advance(10 * EDIT_WINDOW_MS);
    const target = (await leila.messages.page("c-website")).items.find((m) => m.id === "m-w2")!;
    expect(target.can.moderate).toBe(true);
    expect(await code(env.as("sara").messages.moderate("m-w2"))).toBe("forbidden");
    expect(await code(leila.messages.moderate("m-w2"))).toBe("ok");
    expect((await env.me.messages.page("c-website")).items.find((m) => m.id === "m-w2")).toMatchObject({ state: "removed", body: "" });
    expect(await code(env.me.messages.moderate("m-n8"))).toBe("forbidden");
    expect(await code(env.as("nazanin").messages.moderate("m-n6"))).toBe("forbidden");
  });
});

describe("visibility, receipts and privacy", () => {
  it("receipts are reciprocal in direct and never 'seen' in channels", async () => {
    const env = setup();
    const dm = (await env.me.messages.page("c-nazanin")).items.find((m) => m.id === "m-n6")!;
    expect(dm.receipt).toBe("seen");
    await env.me.settings.set({ receiptsDirect: false });
    expect((await env.me.messages.page("c-nazanin")).items.find((m) => m.id === "m-n6")!.receipt).toBe("delivered");
    const channel = (await env.me.messages.page("c-website")).items.find((m) => m.id === "m-w4")!;
    expect(channel.receipt).toBe("delivered");
  });

  it("presence is hidden both ways when I hide my last seen, and for blocked people", async () => {
    const env = setup();
    const detail = await env.me.conversations.get("c-nazanin");
    expect(detail.access === "member" && detail.other?.presence.kind).toBe("last-seen");
    await env.me.settings.set({ lastSeen: "nobody" });
    const after = await env.me.conversations.get("c-nazanin");
    expect(after.access === "member" && after.other?.presence.kind).toBe("hidden");
    const reza = await env.me.conversations.get("c-reza");
    expect(reza.access === "member" && reza.other?.presence.kind).toBe("hidden");
    expect(reza.access === "member" && reza.canPost).toBe(false);
    expect(await code(env.me.messages.send("c-reza", { clientOpId: op(), body: "hi" }))).toBe("blocked");
  });

  it("no one can read or search other people's direct messages, workspace admins included", async () => {
    const env = setup();
    const leila = env.as("leila");
    expect(await leila.conversations.get("c-nazanin")).toEqual({ access: "not-found" });
    expect(await code(leila.messages.page("c-nazanin"))).toBe("not-found");
    expect((await leila.messages.search("Darband", {})).length).toBe(0);
  });

  it("lookup never reveals accounts I may not message; mentions only resolve to members", async () => {
    const env = setup();
    expect((await env.me.conversations.lookup("reza")).people).toEqual([]);
    expect((await env.me.conversations.lookup("nobody-here@example.com")).people).toEqual([]);
    expect((await env.me.conversations.lookup("sara")).people.map((p) => p.id)).toEqual(["sara"]);
    const sent = await env.me.messages.send("c-family", { clientOpId: op(), body: "hi @[Kian F.](kian)" });
    expect(sent.body).toBe("hi @Kian F.");
  });

  it("voice over 2:00 or 10 MB is refused by the server", async () => {
    const env = setup();
    expect(await code(env.me.messages.upload({ name: "v.webm", bytes: 1000, mime: "audio/webm", kind: "voice", durationSec: 121 }))).toBe("too-long");
    expect(await code(env.me.messages.upload({ name: "v.webm", bytes: 10 * 1024 * 1024 + 1, mime: "audio/webm", kind: "voice", durationSec: 60 }))).toBe("too-large");
    expect(await code(env.me.messages.upload({ name: "v.webm", bytes: 10 * 1024 * 1024, mime: "audio/webm", kind: "voice", durationSec: 120 }))).toBe("ok");
  });

  it("forward only to conversations where I may post; non-shareable attachments stay put", async () => {
    const env = setup();
    const targets = await env.me.messages.forwardTargets("m-n1");
    expect(targets.find((t) => t.conversationId === "c-euroly-ann")!.canPost).toBe(false);
    expect(targets.find((t) => t.conversationId === "c-family")!.canPost).toBe(true);
    const restricted = await env.me.messages.forwardTargets("m-s2");
    expect(restricted.find((t) => t.conversationId === "c-family")!.canPost).toBe(false);
    await env.me.messages.forward("m-n1", "c-family", "fw-1");
    await env.me.messages.forward("m-n1", "c-family", "fw-1");
    expect((await env.me.messages.page("c-family")).items.filter((m) => m.forwarded)).toHaveLength(1);
  });

  it("task links render only for readers", async () => {
    const env = setup();
    const items = (await env.me.messages.page("c-website")).items;
    expect(items.find((m) => m.id === "m-w5")!.taskLink).toMatchObject({ readable: true, title: "Payment errors copy" });
    expect(items.find((m) => m.id === "m-w7")!.taskLink).toEqual({ readable: false });
  });
});

describe("meetings, minutes and announcements", () => {
  it("minutes: draft → in review → approved (all reviewers) → final; request changes returns to draft", async () => {
    const env = setup();
    const sara = env.as("sara");
    expect((await env.me.minutes.get("mt-retro"))!.can.review).toBe(true);
    await env.me.minutes.requestChanges("mt-retro", "Add the date");
    expect((await sara.minutes.get("mt-retro"))!).toMatchObject({ status: "draft", changesComment: "Add the date" });
    await sara.minutes.submit("mt-retro", ["me", "tara"]);
    await env.me.minutes.approve("mt-retro");
    expect((await sara.minutes.get("mt-retro"))!.status).toBe("in-review");
    await env.as("tara").minutes.approve("mt-retro");
    expect((await sara.minutes.get("mt-retro"))!.status).toBe("approved");
    expect(await code(sara.minutes.finalize("mt-retro"))).toBe("forbidden");
    await env.as("harry").minutes.finalize("mt-retro");
    expect((await env.me.minutes.get("mt-retro"))!.status).toBe("final");
  });

  it("make task links one task in the source workspace only, never copies", async () => {
    const env = setup();
    const task = { id: "t-1", href: "/projects/website-redesign/tasks/t-1", workspace: { kind: "project" as const, workspaceId: "website-redesign", name: "Website Redesign" } };
    expect(await code(env.me.minutes.linkTask("mt-kickoff", "ai1", { ...task, workspace: { kind: "team", workspaceId: "design", name: "Design Team" } }))).toBe("forbidden");
    await env.me.minutes.linkTask("mt-kickoff", "ai1", task);
    await env.me.minutes.linkTask("mt-kickoff", "ai1", { ...task, id: "t-2" });
    expect((await env.me.minutes.get("mt-kickoff"))!.actionItems[0]!.task!.id).toBe("t-1");
    expect(await code(env.as("kian").minutes.linkTask("mt-kickoff", "ai2", task))).toBe("forbidden");
  });

  it("non-invited people see Busy only when the source allows; personal meetings stay private", async () => {
    const env = setup();
    const from = "2026-10-13T00:00:00+03:30";
    const to = "2026-10-14T00:00:00+03:30";
    const tara = env.as("tara");
    const rows = await tara.meetings.forCalendar({ kind: "team", workspaceId: "design", name: "" }, from, to);
    expect(rows.find((r) => r.id === "mt-private-team")).toMatchObject({ busyOnly: true, title: "" });
    expect(await tara.meetings.get("mt-private-team")).toBeNull();
    expect(await env.as("kian").meetings.forCalendar({ kind: "company", workspaceId: "euroly", name: "" }, "2026-10-06T00:00:00+03:30", "2026-10-07T00:00:00+03:30")).toEqual([]);
    expect(await env.as("kian").meetings.get("mt-coffee")).toBeNull();
  });

  it("announcements: audience-only, acknowledgement counts for authors, one reminder per day", async () => {
    const env = setup();
    expect((await env.me.announcements.list("euroly")).map((a) => a.id)).not.toContain("an-hr-only");
    await env.me.announcements.ack("an-expense");
    const leila = env.as("leila");
    const row = (await leila.announcements.list("euroly")).find((a) => a.id === "an-expense")!;
    expect(row.ack).toMatchObject({ done: 3 });
    await leila.announcements.remind("an-expense");
    expect(await code(leila.announcements.remind("an-expense"))).toBe("forbidden");
    env.advance(24 * 3600_000);
    expect(await code(leila.announcements.remind("an-expense"))).toBe("ok");
    expect(await code(env.me.announcements.publish({ workspace: { kind: "company", workspaceId: "euroly", name: "" }, title: "x", body: "y", audience: { kind: "workspace", label: "", memberIds: [] }, pinDays: null, requireAck: false, scheduleAt: null, clientOpId: op() }))).toBe("forbidden");
  });
});
