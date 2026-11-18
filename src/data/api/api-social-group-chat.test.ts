import { describe, expect, it } from "vitest";
import { createApiSocial } from "./api-social-repository";
import { err, fakeApi, json } from "./test-support";

/*
 * Contract fakes for ADR 0067: the Group's primary Messages conversation and
 * Group ledger actor ids. Not live evidence.
 */

const ME = "11111111-1111-4111-8111-111111111111";
const ACT_ME = "33333333-3333-4333-8333-333333333333";
const ACT_ANA = "44444444-4444-4444-8444-444444444444";
const CONV = "55555555-5555-4555-8555-555555555555";

function setup(opts: { canOpen: boolean; open?: boolean; join?: "ok" | "already" }) {
  let opened = opts.open ?? false;
  const fake = fakeApi((call, parts) => {
    const path = parts.join("/");
    if (path === "social-groups/g1/conversation" && call.method === "GET") return json({ groupId: "g1", conversationId: opened ? CONV : null, canOpen: opts.canOpen && !opened });
    if (path === "social-groups/g1/conversation/open") {
      opened = true;
      return json({ groupId: "g1", conversationId: CONV, canOpen: false }, 201);
    }
    if (path === "social-groups/g1/conversation/join") return opts.join === "already" ? err(409, "ALREADY_PARTICIPATING") : json({ id: CONV }, 201);
    if (path === "retention-policies") return json({ items: [{ version: "mp-rpc-v1.0-conversation", applicableContexts: ["CONVERSATION"] }] });
    if (path === "social-groups/g1") return json({ id: "g1", name: "Hikers", revision: 7 });
    if (path === "social-groups/g1/memberships")
      return json({
        items: [
          { actorId: ACT_ME, state: "ACTIVE", displayName: "Mehran R." },
          { actorId: ACT_ANA, state: "ACTIVE", displayName: "Ana" },
          { actorId: "66666666-6666-4666-8666-666666666666", state: "REVOKED", displayName: "Old" },
        ],
        nextCursor: null,
      });
    if (path === "social-groups/g1/access/me") return json({ accessId: "x", actorId: ACT_ME, role: "OWNER", state: "ACTIVE", generation: 1, revision: 1, groupState: "ACTIVE", capabilities: [] });
    if (path === "social-groups/g1/expenses" && call.method === "POST") return err(422, "PARTICIPANT_INELIGIBLE");
    return err(404);
  });
  return { ...fake, repo: createApiSocial(fake.client, { id: ME, name: "Mehran R." }) };
}

describe("Social Group chat (ADR 0067)", () => {
  it("a member waits until an Owner/Admin opens the chat; nothing is written", async () => {
    const { repo, writes } = setup({ canOpen: false });
    await expect(repo.groups.openChat!("g1")).rejects.toMatchObject({ reason: "CONVERSATION_NOT_OPEN" });
    expect(writes()).toEqual([]);
  });

  it("an admin opens once with the CONVERSATION policy and the group revision, then joins", async () => {
    const { repo, calls, writes } = setup({ canOpen: true });
    expect(await repo.groups.openChat!("g1")).toBe(CONV);
    expect(writes()).toEqual(["POST /social-groups/g1/conversation/open", "POST /social-groups/g1/conversation/join"]);
    const open = calls.find((c) => c.path.endsWith("/conversation/open"))!;
    expect(open).toMatchObject({ ifMatch: '"7"', key: expect.any(String), body: { retentionPolicyVersion: "mp-rpc-v1.0-conversation" } });
  });

  it("an already-joined member gets the same conversation", async () => {
    const { repo, writes } = setup({ canOpen: false, open: true, join: "already" });
    expect(await repo.groups.openChat!("g1")).toBe(CONV);
    expect(writes()).toEqual(["POST /social-groups/g1/conversation/join"]);
  });

  it("Group expenses name current members by actor id and send actor ids, never guessed user ids", async () => {
    const { repo, calls } = setup({ canOpen: false });
    const people = await repo.expenses.participants({ kind: "group", id: "g1" });
    expect(people.map((p) => p.id)).toEqual(["me", ACT_ANA]);
    await expect(
      repo.expenses.propose({ scope: { kind: "group", id: "g1" }, activityId: null, title: "Fuel", amount: 1001, payerId: ACT_ANA, day: "2026-11-20", split: { method: "equal", participants: ["me", ACT_ANA] }, receipt: null, clientOpId: "op" }),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(calls.at(-1)!.body).toMatchObject({ amountMinor: "1001", payerActorId: ACT_ANA, shares: [{ userId: ME }, { actorId: ACT_ANA }] });
    expect(calls.at(-1)!.body).not.toHaveProperty("payerUserId");
  });
});
