import { describe, expect, it } from "vitest";
import { SocialError } from "../social-repositories";
import { createApiSocial } from "./api-social-repository";
import { err, fakeApi, json } from "./test-support";

/*
 * Contract fake for the Social live adapter — connections, circles, blocks,
 * groups (access/me capabilities, history, invitations by proof, handovers),
 * group create via the retention catalog, notices and the exit flow. Exact
 * paths, If-Match revisions, Idempotency-Keys, and explicit refusals.
 */

const ME = "11111111-1111-4111-8111-111111111111";
const ANA = "22222222-2222-4222-8222-222222222222";
const BEN = "33333333-3333-4333-8333-333333333333";
const user = { id: ME, name: "Mehran R." };
const at = "2026-11-10T10:00:00.000Z";

const conn = (id: string, requester: string, recipient: string, state: string, revision = 1) => ({
  id,
  requesterUserId: requester,
  recipientUserId: recipient,
  requesterDisplayName: requester === ANA ? "Ana" : requester === BEN ? "Ben" : "Mehran R.",
  recipientDisplayName: recipient === ANA ? "Ana" : recipient === BEN ? "Ben" : "Mehran R.",
  state,
  revision,
  createdAt: at,
  updatedAt: at,
});
const group = { id: "g1", name: "Hikers", description: null, publicSummary: "Weekend hikes", discoverable: true, spaceId: "s1", scopeId: "sc1", revision: 4, state: "ACTIVE", createdAt: at, updatedAt: at };
const membership = (id: string, actorId: string, role: string, revision = 2, displayName: string | null = null) => ({ id, spaceId: "s1", scopeId: "sc1", actorId, memberRole: role === "OWNER" ? null : role, role, state: "ACTIVE", generation: 1, revision, displayName });
const accessFor = (role: "OWNER" | "ADMIN" | "MEMBER") => ({
  accessId: "m1",
  actorId: "a-me",
  role,
  state: "ACTIVE",
  generation: 1,
  revision: 2,
  groupState: "ACTIVE",
  capabilities: role === "OWNER" ? ["task.read", "settings.manage", "membership.member", "membership.admin", "membership.leave", "custody.handover"] : role === "ADMIN" ? ["task.read", "settings.manage", "membership.member", "membership.leave"] : ["task.read", "membership.leave"],
});

function setup({ role = "OWNER" as "OWNER" | "ADMIN" | "MEMBER", catalog = [{ version: "rp-7", applicableContexts: ["SOCIAL_GROUP"] }] as unknown[], obligations = [] as unknown[] } = {}) {
  const fake = fakeApi((call, parts) => {
    const path = parts.join("/");
    if (path === "social/discovery") return json({ items: call.body.email === "ana@example.test" ? [{ id: ANA, name: "Ana" }] : [] }, 201);
    if (path === "social/connections" && call.method === "GET") return json({ items: [conn("c1", ANA, ME, "PENDING", 3), conn("c2", ME, BEN, "ACCEPTED", 5)], nextCursor: null });
    if (path === "social/connections" && call.method === "POST") return json(conn("c9", ME, ANA, "PENDING"), 201);
    if (parts[0] === "social" && parts[1] === "connections" && parts.length === 4) return json(conn(parts[2]!, ANA, ME, "ACCEPTED", 4), 201);
    if (path === "social/circles" && call.method === "GET") return json({ items: [{ id: "k1", name: "Close", revision: 7 }], nextCursor: null });
    if (path === "social/circles/k1" && call.method === "PATCH") return json({ id: "k1", name: String(call.body.name), revision: 8 });
    if (path === "social/circles/k1/members" && call.method === "GET") return json({ items: [{ circleId: "k1", connectionId: "c2" }], nextCursor: null });
    if (path === "social/circles/k1/members/c2") return json({ circleId: "k1", connectionId: "c2" });
    if (path === "social/blocks" && call.method === "GET") return json({ items: [{ id: "b1", conversationId: null, active: true, revision: 3 }, { id: null, conversationId: null, active: false, revision: 1 }], nextCursor: null, hasMore: false });
    if (path === "social/blocks/b1/unblock") return json({ id: "b1", conversationId: null, active: false, revision: 4 }, 201);
    if (path === "social/privacy" && call.method === "GET") return json({ discoverable: false, allowFriendRequests: true, revision: 6 });
    if (path === "social/privacy") return json({ discoverable: false, allowFriendRequests: false, revision: 7 });
    if (path === "retention-policies") return json({ items: catalog });
    if (path === "social-groups" && call.method === "GET") return json({ items: [group], nextCursor: null });
    if (path === "social-groups" && call.method === "POST") return json({ ...group, id: call.body.id, name: call.body.name }, 201);
    if (path === "social-groups/discover") return json({ items: [{ id: "g2", name: "Runners", publicSummary: "Sunday 10K" }], nextCursor: null });
    if (path === "social-groups/g1") return call.method === "GET" ? json(group) : json({ ...group, name: String(call.body.name ?? group.name), revision: 5 });
    if (path === "social-groups/g1/access/me") return json(accessFor(role));
    if (path === "social-groups/g2" || path === "social-groups/g2/access/me") return err(404);
    if (path === "social-groups/g1/memberships" && call.method === "GET") return json({ items: [membership("m1", "a-me", role, 2, "Mehran R."), membership("m2", "a-ben", "MEMBER", 3, "Ben")], nextCursor: null });
    if (path === "social-groups/g1/memberships/m2") return json({ ...membership("m2", "a-ben", "ADMIN", 4) });
    if (path === "social-groups/g1/join-requests" && call.method === "GET") return role === "MEMBER" ? err(403) : json({ items: [{ id: "r1", groupId: "g1", requesterUserId: ANA, state: "PENDING", revision: 2 }], nextCursor: null });
    if (path === "social-groups/g1/join-requests/r1/approve") return json({ id: "r1", groupId: "g1", requesterUserId: ANA, state: "APPROVED", revision: 3 }, 201);
    if (path === "social-groups/g2/join-requests") return json({ id: "r9", groupId: "g2", requesterUserId: ME, state: "PENDING", revision: 1 }, 201);
    if (path === "social-groups/g2/balances/me") return err(404);
    if (path === "social-groups/g1/invitations") return json({ invitation: { id: "o1", spaceId: "s1", scopeId: "sc1", kind: "MEMBERSHIP", memberRole: "MEMBER", state: "PENDING", revision: 1, expiresAt: at, acceptedAccessId: null }, proof: "secret-proof" }, 201);
    if (path === "social-group-invitations/preview") return call.method === "GET" ? json({ contextLabel: "Social Group", offerCategory: "MEMBERSHIP", expiresAt: at }) : err(404);
    if (path === "social-group-invitations/o1/accept") return json({ invitation: { id: "o1", spaceId: "s1", scopeId: "sc1", kind: "MEMBERSHIP", memberRole: "MEMBER", state: "ACCEPTED", revision: 2, expiresAt: at, acceptedAccessId: "m9" }, membership: membership("m9", "a-me", "MEMBER") }, 201);
    if (path === "social-groups/g1/history") return json({ items: [{ id: "h1", actorId: "a-ben", actorDisplayName: "Ben", action: "membership.admit", resourceId: null, occurredAt: at }, { id: "h2", actorId: "a-me", actorDisplayName: "Mehran R.", action: "social.group.create", resourceId: null, occurredAt: "2026-11-01T10:00:00.000Z" }], nextCursor: null });
    const handover = { id: "ho1", spaceId: "s1", scopeId: "sc1", fromAccessId: "m1", toAccessId: "m2", state: "PENDING", revision: 1, expiresAt: at, expectedCustodyRevision: 1, acceptedAt: null };
    if (path === "social-groups/g1/handovers") return json(handover, 201);
    if (path === "social-groups/g1/handovers/ho1") return json(handover);
    if (path === "social-groups/g1/handovers/ho1/revoke") return json({ ...handover, state: "REVOKED", revision: 2 }, 201);
    if (path === "social-groups/g1/exit-check")
      return json({ groupId: "g1", membershipRevision: 9, obligations, departureConfirmation: obligations.length ? "confirm-abc" : null, deletion: role === "OWNER" ? { groupRevision: 4, outstandingLedgerCount: 0, outstandingPartyCount: 0, confirmation: null } : null });
    if (path === "social-groups/g1/leave") return call.body.outstandingBalanceConfirmation || obligations.length === 0 ? json({ id: "m1", revision: 10 }, 201) : err(409, "OUTSTANDING_BALANCE_CONFIRMATION_REQUIRED");
    if (path === "social-groups/g1/delete") return json({ id: "job1", groupId: "g1", revision: 1 }, 201);
    if (path === "social-groups/g1/lifecycle-job") return json({ jobId: "job1", generation: 2, revision: 5, state: "CLOSING_GRACE", recoveryDeadline: "2999-01-01T00:00:00.000Z", nextAt: at, stage: null, failureCode: null });
    if (path === "social-groups/g1/lifecycle-job/recovery-proof") return json({ jobId: "job1", generation: 2, revision: 6, recoveryDeadline: "2999-01-01T00:00:00.000Z", proof: "rp" }, 201);
    if (path === "social-groups/g1/lifecycle-job/recover") return json({ jobId: "job1", generation: 2, revision: 7, state: "CANCELED" }, 201);
    if (path === "social-notices") return json({ items: [{ id: "n1", kind: "EXPENSE_PROPOSED", activityId: null, groupId: "g1", resourceId: "e1", createdAt: at, readAt: null }], nextCursor: null });
    if (path === "social-notices/n1/read") return json({ id: "n1", kind: "EXPENSE_PROPOSED", activityId: null, groupId: "g1", resourceId: "e1", createdAt: at, readAt: at }, 201);
    return err(404);
  });
  return { ...fake, repo: createApiSocial(fake.client, user) };
}

describe("api-social-repository — connections & groups", () => {
  it("lookup: discovery then a request; unknown emails get the same answer and no request", async () => {
    const { repo, writes, calls } = setup();
    expect(await repo.connections.request("ana@example.test", "hi")).toEqual({ sent: true });
    expect(await repo.connections.request("nobody@example.test", "")).toEqual({ sent: true });
    expect(writes()).toEqual(["POST /social/discovery", "POST /social/connections", "POST /social/discovery"]);
    expect(calls.find((c) => c.path === "/social/connections" && c.method === "POST")).toMatchObject({ body: { recipientUserId: ANA }, key: expect.any(String) });
    await expect(repo.connections.request("+98 912 000", "")).rejects.toMatchObject({ code: "invalid" });
  });

  it("connections carry the server's display names; circle labels by connection id", async () => {
    const { repo } = setup();
    expect(await repo.connections.requests()).toEqual([expect.objectContaining({ id: "c1", direction: "incoming", person: { id: ANA, name: "Ana", initials: "A" } })]);
    expect(await repo.connections.list()).toEqual([expect.objectContaining({ person: expect.objectContaining({ id: BEN, name: "Ben" }), circleIds: ["k1"] })]);
  });

  it("accept / circle label / rename send the current revision as If-Match with an Idempotency-Key", async () => {
    const { repo, calls } = setup();
    await repo.connections.accept("c1");
    expect(calls.at(-1)).toMatchObject({ method: "POST", path: "/social/connections/c1/accept", ifMatch: '"3"', key: expect.any(String) });
    await repo.circles.list();
    await repo.circles.setMembership("k1", BEN, true);
    expect(calls.at(-1)).toMatchObject({ method: "PUT", path: "/social/circles/k1/members/c2", ifMatch: '"7"' });
    await repo.circles.list();
    await repo.circles.rename("k1", "Closest");
    expect(calls.at(-1)).toMatchObject({ method: "PATCH", path: "/social/circles/k1", ifMatch: '"7"', body: { name: "Closest" }, key: expect.any(String) });
  });

  it("blocks: only identifiable active rows; unblock with the row revision", async () => {
    const { repo, calls } = setup();
    expect(await repo.blocks.list()).toEqual([{ id: "b1", active: true }]);
    await repo.blocks.unblock("b1");
    expect(calls.at(-1)).toMatchObject({ method: "POST", path: "/social/blocks/b1/unblock", ifMatch: '"3"', key: expect.any(String) });
  });

  it("privacy maps allowFriendRequests and refuses the unserved “my groups” option", async () => {
    const { repo, calls } = setup();
    expect(await repo.connections.privacy()).toBe("everyone");
    await repo.connections.setPrivacy("nobody");
    expect(calls.at(-1)).toMatchObject({ method: "PATCH", ifMatch: '"6"', body: { allowFriendRequests: false } });
    await expect(repo.connections.setPrivacy("groups")).rejects.toMatchObject({ code: "unsupported" });
  });

  it("rights come from access/me capabilities, never from a request that happened to succeed", async () => {
    const owner = await setup({ role: "OWNER" }).repo.groups.access("g1");
    expect(owner).toMatchObject({ kind: "member", group: { myRole: "owner", memberCount: 2, pendingRequests: 1 } });
    if (owner.kind !== "member") return;
    expect(owner.group.capabilities).toMatchObject({ decideJoins: true, changeRoles: true, transferOwnership: true, deleteGroup: true, approveExpenses: true, createActivity: true });
    expect(owner.group.members.map((m) => [m.person.name, m.isSelf])).toEqual([
      ["Mehran R.", true],
      ["Ben", false],
    ]);
    const member = await setup({ role: "MEMBER" }).repo.groups.access("g1");
    expect(member.kind === "member" && member.group.capabilities).toMatchObject({ decideJoins: false, changeRoles: false, editSettings: false, approveExpenses: false, createActivity: true });
    const admin = await setup({ role: "ADMIN" }).repo.groups.access("g1");
    expect(admin.kind === "member" && admin.group.capabilities).toMatchObject({ decideJoins: true, changeRoles: false, transferOwnership: false, deleteGroup: false });
  });

  it("non-members see nothing; a pending requester sees only the public preview", async () => {
    const { repo, calls } = setup();
    expect((await repo.groups.access("g2")).kind).toBe("not-available");
    expect(await repo.groups.discover("run", "all")).toEqual([expect.objectContaining({ id: "g2", description: "Sunday 10K", topic: null, size: null })]);
    await repo.groups.requestJoin("g2", "note");
    expect(calls.at(-1)).toMatchObject({ method: "POST", path: "/social-groups/g2/join-requests", key: expect.any(String) });
    expect(await repo.groups.access("g2")).toMatchObject({ kind: "join-requested", preview: { name: "Runners", requested: true } });
  });

  it("admin commands use the record revisions; history maps to events", async () => {
    const { repo, calls } = setup();
    await repo.groups.access("g1");
    await repo.groups.joinRequests("g1");
    await repo.groups.decide("r1", true);
    expect(calls.at(-1)).toMatchObject({ path: "/social-groups/g1/join-requests/r1/approve", ifMatch: '"2"' });
    await repo.groups.setRole("g1", "a-ben", "admin");
    expect(calls.at(-1)).toMatchObject({ method: "PATCH", path: "/social-groups/g1/memberships/m2", ifMatch: '"3"', body: { state: "ACTIVE", memberRole: "ADMIN" } });
    await repo.groups.updateSettings("g1", { name: "Hikers 2", visibility: "discoverable" });
    expect(calls.at(-1)).toMatchObject({ method: "PATCH", path: "/social-groups/g1", ifMatch: '"4"', body: { name: "Hikers 2", discoverable: true } });
    await expect(repo.groups.updateSettings("g1", { membersSeeBalances: true })).rejects.toMatchObject({ code: "unsupported" });
    expect((await repo.groups.events("g1")).map((e) => [e.kind, e.actor.name])).toEqual([
      ["joined", "Ben"],
      ["created", "Mehran R."],
    ]);
  });

  it("group create takes the single catalog policy; an empty catalog refuses without writing", async () => {
    const ok = setup();
    const id = await ok.repo.groups.create({ name: "Climbers", description: "Rocks", topic: "other", currency: "irr", visibility: "private", inviteIds: [], clientOpId: "op1" });
    expect(ok.calls.at(-1)).toMatchObject({ method: "POST", path: "/social-groups", key: expect.any(String), body: { id, name: "Climbers", description: "Rocks", discoverable: false, retentionPolicyVersion: "rp-7" } });
    expect(ok.calls.at(-1)!.body).not.toHaveProperty("publicSummary");
    const none = setup({ catalog: [] });
    await expect(none.repo.groups.create({ name: "x", description: "", topic: "other", currency: "irr", visibility: "private", inviteIds: [], clientOpId: "op2" })).rejects.toMatchObject({ code: "unsupported", reason: "RETENTION_POLICY_UNAVAILABLE" });
    expect(none.writes()).toEqual([]);
  });

  it("invitations: the proof travels only in the link fragment and the X-Invitation-Proof header", async () => {
    const { repo, calls } = setup();
    const [link] = await repo.invitations.send("g1", [BEN]);
    expect(link).toEqual({ inviteId: "o1", href: "/social/invitations/o1#proof=secret-proof&rev=1" });
    expect(await repo.invitations.preview("o1", "secret-proof")).toEqual({ contextLabel: "Social Group", expiresAt: at });
    expect(await repo.invitations.respond("o1", "secret-proof", 3, true)).toEqual({ groupId: "g1" });
    const accept = calls.find((c) => c.path === "/social-group-invitations/o1/accept")!;
    // The revision issued with the proof, never an assumed value.
    expect(accept).toMatchObject({ ifMatch: '"3"' });
    const before = calls.length;
    await expect(repo.invitations.respond("o1", "secret-proof", 0, true)).rejects.toMatchObject({ code: "invalid" });
    expect(calls.length).toBe(before);
    expect(JSON.stringify(accept.query)).not.toContain("secret-proof");
  });

  it("handover: start returns the successor link; revoke uses the handover revision", async () => {
    const { repo, calls } = setup();
    expect(await repo.handovers.start("g1", "a-ben")).toEqual({ handoverId: "ho1", href: "/social/groups/g1?handover=ho1" });
    expect(calls.at(-1)).toMatchObject({ path: "/social-groups/g1/handovers", body: { successorAccessId: "m2" }, key: expect.any(String) });
    expect(await repo.handovers.get("g1", "ho1")).toMatchObject({ state: "pending", fromMe: true, toMe: false });
    await repo.handovers.respond("g1", "ho1", "revoke");
    expect(calls.at(-1)).toMatchObject({ path: "/social-groups/g1/handovers/ho1/revoke", ifMatch: '"1"' });
    await expect(repo.handovers.respond("g1", "ho1", "accept")).rejects.toMatchObject({ code: "invalid" });
  });

  it("exit: leave with obligations needs the explicit confirmation; delete and recovery keep secrets in the call", async () => {
    const owing = setup({ obligations: [{ ledgerKind: "GROUP", ledgerId: "g1", currency: "IRR", netMinor: "-150000", owedMinor: "150000", receivableMinor: "0" }] });
    const check = await owing.repo.exit.check("g1");
    expect(check).toMatchObject({ obligations: [{ ledger: { kind: "group", id: "g1" }, currency: "irr", net: -150000 }], departureConfirmation: "confirm-abc" });
    await expect(owing.repo.groups.leave("g1", false)).rejects.toMatchObject({ code: "conflict", reason: "OUTSTANDING_BALANCE_CONFIRMATION_REQUIRED" });
    await owing.repo.exit.check("g1");
    await owing.repo.exit.leave("g1", "confirm-abc");
    expect(owing.calls.at(-1)).toMatchObject({ path: "/social-groups/g1/leave", ifMatch: '"9"', body: { outstandingBalanceConfirmation: "confirm-abc" } });

    const owner = setup();
    await owner.repo.exit.deleteGroup("g1", "pw", null);
    expect(owner.calls.at(-1)).toMatchObject({ path: "/social-groups/g1/delete", ifMatch: '"4"', body: { password: "pw" } });
    expect(await owner.repo.exit.lifecycle("g1")).toMatchObject({ state: "CLOSING_GRACE", recoverable: true });
    await owner.repo.exit.recover("g1", "pw");
    expect(owner.calls.at(-2)).toMatchObject({ path: "/social-groups/g1/lifecycle-job/recovery-proof", ifMatch: '"5"' });
    expect(owner.calls.at(-1)).toMatchObject({ path: "/social-groups/g1/lifecycle-job/recover", ifMatch: '"6"', body: { generation: 2, password: "pw" } });
  });

  it("notices: routed by kind; mark-read is idempotent; needs-you adds action notices", async () => {
    const { repo, calls } = setup();
    expect(await repo.notices.list()).toEqual([{ id: "n1", kind: "EXPENSE_PROPOSED", href: "/social/groups/g1/expenses/e1", at, read: false }]);
    await repo.notices.read("n1");
    expect(calls.at(-1)).toMatchObject({ method: "POST", path: "/social-notices/n1/read", key: expect.any(String) });
    await repo.groups.directory();
    expect((await repo.inbox.list()).map((i) => i.kind).sort()).toEqual(["approve-expense", "connection", "join-request"]);
  });

  it("still refuses what the contract does not serve, without calling the server", async () => {
    const { repo, calls } = setup();
    const before = calls.length;
    for (const attempt of [() => repo.groups.chatMembers("g1"), () => repo.albums.list("g1"), () => repo.files.list("a1"), () => repo.groups.invites("g1"), () => repo.balances.between(BEN), () => repo.groups.setMyStatus("g1", null)]) {
      const error = await attempt().then(() => null, (e: unknown) => e);
      expect(error).toBeInstanceOf(SocialError);
      expect((error as SocialError).code).toBe("unsupported");
    }
    expect(calls.length).toBe(before);
  });
});
