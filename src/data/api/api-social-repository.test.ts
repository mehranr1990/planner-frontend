import { describe, expect, it } from "vitest";
import { SocialError } from "../social-repositories";
import { createApiSocial } from "./api-social-repository";
import { err, fakeApi, json } from "./test-support";

/*
 * Contract fake for the Social (P6-01) live adapter: exact paths, If-Match
 * revisions and Idempotency-Keys, privacy-preserving discovery, conservative
 * group rights, and explicit refusals for everything P6-01 does not serve.
 */

const ME = "11111111-1111-4111-8111-111111111111";
const ANA = "22222222-2222-4222-8222-222222222222";
const BEN = "33333333-3333-4333-8333-333333333333";
const user = { id: ME, name: "Mehran R." };
const at = "2026-11-10T10:00:00.000Z";

const conn = (id: string, requester: string, recipient: string, state: string, revision = 1) => ({ id, requesterUserId: requester, recipientUserId: recipient, state, revision, createdAt: at, updatedAt: at });
const group = { id: "g1", name: "Hikers", description: null, publicSummary: "Weekend hikes", discoverable: true, spaceId: "s1", scopeId: "sc1", revision: 4, state: "ACTIVE", createdAt: at, updatedAt: at };
const membership = (id: string, actorId: string, role: string, revision = 2) => ({ id, spaceId: "s1", scopeId: "sc1", actorId, memberRole: role === "OWNER" ? null : role, role, state: "ACTIVE", generation: 1, revision });

function setup({ admin = true }: { admin?: boolean } = {}) {
  const fake = fakeApi((call, parts) => {
    const path = parts.join("/");
    if (path === "social/discovery") return json({ items: call.body.email === "ana@example.test" ? [{ id: ANA, name: "Ana" }] : [] }, 201);
    if (path === "social/connections" && call.method === "GET") return json({ items: [conn("c1", ANA, ME, "PENDING", 3), conn("c2", ME, BEN, "ACCEPTED", 5)], nextCursor: null });
    if (path === "social/connections" && call.method === "POST") return json(conn("c9", ME, ANA, "PENDING"), 201);
    if (parts[0] === "social" && parts[1] === "connections" && parts.length === 4) return json(conn(parts[2]!, ANA, ME, "ACCEPTED", 4), 201);
    if (path === "social/circles" && call.method === "GET") return json({ items: [{ id: "k1", name: "Close", revision: 7 }], nextCursor: null });
    if (path === "social/circles/k1/members" && call.method === "GET") return json({ items: [{ circleId: "k1", connectionId: "c2" }], nextCursor: null });
    if (path === "social/circles/k1/members/c2") return json({ circleId: "k1", connectionId: "c2" });
    if (path === "social/privacy" && call.method === "GET") return json({ discoverable: false, allowFriendRequests: true, revision: 6 });
    if (path === "social/privacy") return json({ discoverable: false, allowFriendRequests: false, revision: 7 });
    if (path === "social-groups" && call.method === "GET") return json({ items: [group], nextCursor: null });
    if (path === "social-groups/discover") return json({ items: [{ id: "g2", name: "Runners", publicSummary: "Sunday 10K" }], nextCursor: null });
    if (path === "social-groups/g1") return call.method === "GET" ? json(group) : json({ ...group, name: String(call.body.name ?? group.name), revision: 5 });
    if (path === "social-groups/g2") return err(403);
    if (path === "social-groups/g1/memberships" && call.method === "GET") return json({ items: [membership("m1", "a-owner", "OWNER"), membership("m2", "a-ben", "MEMBER", 3)], nextCursor: null });
    if (path === "social-groups/g1/memberships/m2") return json({ ...membership("m2", "a-ben", "ADMIN", 4) });
    if (path === "social-groups/g1/join-requests" && call.method === "GET") return admin ? json({ items: [{ id: "r1", groupId: "g1", requesterUserId: ANA, state: "PENDING", revision: 2 }], nextCursor: null }) : err(403);
    if (path === "social-groups/g1/join-requests/r1/approve") return json({ id: "r1", groupId: "g1", requesterUserId: ANA, state: "APPROVED", revision: 3 }, 201);
    if (path === "social-groups/g2/join-requests") return json({ id: "r9", groupId: "g2", requesterUserId: ME, state: "PENDING", revision: 1 }, 201);
    if (path === "social-groups/g1/invitations") return json({ invitation: { id: "o1", spaceId: "s1", scopeId: "sc1", kind: "MEMBERSHIP", memberRole: "MEMBER", state: "PENDING", revision: 1, expiresAt: at, acceptedAccessId: null }, proof: null }, 201);
    return err(404);
  });
  return { ...fake, repo: createApiSocial(fake.client, user) };
}

describe("api-social-repository (P6-01)", () => {
  it("lookup: discovery then a request; unknown emails get the same answer and no request", async () => {
    const { repo, writes, calls } = setup();
    expect(await repo.connections.request("ana@example.test", "hi")).toEqual({ sent: true });
    expect(await repo.connections.request("nobody@example.test", "")).toEqual({ sent: true });
    expect(writes()).toEqual(["POST /social/discovery", "POST /social/connections", "POST /social/discovery"]);
    expect(calls.find((c) => c.path === "/social/connections" && c.method === "POST")).toMatchObject({ body: { recipientUserId: ANA }, key: expect.any(String) });
    await expect(repo.connections.request("+98 912 000", "")).rejects.toMatchObject({ code: "invalid" });
  });

  it("connections: direction from the session user, no invented names, circle labels by connection id", async () => {
    const { repo } = setup();
    const requests = await repo.connections.requests();
    expect(requests).toEqual([expect.objectContaining({ id: "c1", direction: "incoming", person: { id: ANA, name: "", initials: "?" }, mutualGroups: null })]);
    const list = await repo.connections.list();
    expect(list).toEqual([expect.objectContaining({ person: expect.objectContaining({ id: BEN, name: "" }), circleIds: ["k1"], sharedGroups: null })]);
  });

  it("accept / circle label send the current revision as If-Match with an Idempotency-Key", async () => {
    const { repo, calls } = setup();
    await repo.connections.accept("c1");
    expect(calls.at(-1)).toMatchObject({ method: "POST", path: "/social/connections/c1/accept", ifMatch: '"3"', key: expect.any(String) });
    await repo.circles.list();
    await repo.circles.setMembership("k1", BEN, true);
    expect(calls.at(-1)).toMatchObject({ method: "PUT", path: "/social/circles/k1/members/c2", ifMatch: '"7"' });
  });

  it("privacy maps allowFriendRequests and refuses the unserved “my groups” option", async () => {
    const { repo, calls } = setup();
    expect(await repo.connections.privacy()).toBe("everyone");
    await repo.connections.setPrivacy("nobody");
    expect(calls.at(-1)).toMatchObject({ method: "PATCH", ifMatch: '"6"', body: { allowFriendRequests: false } });
    await expect(repo.connections.setPrivacy("groups")).rejects.toMatchObject({ code: "unsupported" });
  });

  it("group detail: role unknown, owner-only rights off, admin rights only when the server serves join requests", async () => {
    const admin = await setup().repo.groups.access("g1");
    expect(admin.kind).toBe("member");
    if (admin.kind !== "member") return;
    expect(admin.group).toMatchObject({ myRole: null, currency: null, memberCount: 2, pendingRequests: 1, visibility: "discoverable" });
    expect(admin.group.capabilities).toMatchObject({ decideJoins: true, changeRoles: false, transferOwnership: false, makeDiscoverable: false, createActivity: false });
    const member = await setup({ admin: false }).repo.groups.access("g1");
    expect(member.kind === "member" && member.group.capabilities.decideJoins).toBe(false);
  });

  it("non-members see nothing; a pending requester sees only the public preview", async () => {
    const { repo, calls } = setup();
    expect((await repo.groups.access("g2")).kind).toBe("not-available");
    expect(await repo.groups.discover("run", "all")).toEqual([expect.objectContaining({ id: "g2", description: "Sunday 10K", topic: null, size: null })]);
    await repo.groups.requestJoin("g2", "note");
    expect(calls.at(-1)).toMatchObject({ method: "POST", path: "/social-groups/g2/join-requests", key: expect.any(String) });
    expect(await repo.groups.access("g2")).toMatchObject({ kind: "join-requested", preview: { name: "Runners", requested: true } });
    await expect(repo.groups.discover("", "outdoors")).rejects.toMatchObject({ code: "unsupported" });
  });

  it("admin commands use the record revisions", async () => {
    const { repo, calls } = setup();
    await repo.groups.joinRequests("g1");
    await repo.groups.decide("r1", true);
    expect(calls.at(-1)).toMatchObject({ path: "/social-groups/g1/join-requests/r1/approve", ifMatch: '"2"' });
    await repo.groups.setRole("g1", "a-ben", "admin");
    expect(calls.at(-1)).toMatchObject({ method: "PATCH", path: "/social-groups/g1/memberships/m2", ifMatch: '"3"', body: { state: "ACTIVE", memberRole: "ADMIN" } });
    await repo.groups.invite("g1", [BEN]);
    expect(calls.at(-1)).toMatchObject({ path: "/social-groups/g1/invitations", body: { kind: "MEMBERSHIP", memberRole: "MEMBER", recipient: { userId: BEN } } });
    await repo.groups.updateSettings("g1", { name: "Hikers 2", visibility: "discoverable" });
    expect(calls.at(-1)).toMatchObject({ method: "PATCH", path: "/social-groups/g1", ifMatch: '"4"', body: { name: "Hikers 2", discoverable: true } });
    await expect(repo.groups.updateSettings("g1", { membersSeeBalances: true })).rejects.toMatchObject({ code: "unsupported" });
  });

  it("refuses everything P6-01 does not serve, never with fake data", async () => {
    const { repo, calls } = setup();
    const before = calls.length;
    for (const attempt of [
      () => repo.groups.create({ name: "x", description: "", topic: "other", currency: "toman", visibility: "private", inviteIds: [], clientOpId: "op" }),
      () => repo.groups.leave("g1", false),
      () => repo.groups.chatMembers("g1"),
      () => repo.activities.mine("all"),
      () => repo.polls.get("p"),
      () => repo.expenses.list({ kind: "group", id: "g1" }),
      () => repo.balances.mineAll(),
      () => repo.settlements.list(null),
      () => repo.lending.mine(),
      () => repo.albums.list("g1"),
      () => repo.challenges.list("g1"),
    ]) {
      const error = await attempt().then(() => null, (e: unknown) => e);
      expect(error).toBeInstanceOf(SocialError);
      expect((error as SocialError).code).toBe("unsupported");
    }
    expect(calls.length).toBe(before);
  });

  it("needs-you is composed only from served requests", async () => {
    const { repo } = setup();
    await repo.groups.directory();
    const items = await repo.inbox.list();
    expect(items.map((i) => i.kind).sort()).toEqual(["connection", "join-request"]);
  });
});
