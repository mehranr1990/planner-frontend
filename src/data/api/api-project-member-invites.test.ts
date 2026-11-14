import { describe, expect, it } from "vitest";
import { createApiProjectInvitations } from "./api-project-invitations";
import { createApiProjectMemberInviteRepository } from "./api-project-member-invites";
import { err, fakeApi, json } from "./test-support";

/* Contract fakes: inviter-side space invitations (proof never kept) and the recipient's decline without a note. */

const P = "p1";
const invitation = (id: string, over: Record<string, unknown> = {}) => ({
  id, spaceId: "s1", scopeId: "sc", kind: "MEMBERSHIP", memberRole: "MEMBER", state: "PENDING", revision: 3, expiresAt: "2026-11-21T09:00:00.000Z", acceptedAccessId: null, ...over,
});

describe("live project invitations (inviter)", () => {
  it("sends one MEMBERSHIP invitation per email through the space and drops the proof", async () => {
    const api = fakeApi((call, parts) => {
      if (parts[0] === "projects") return json({ id: P, spaceId: "s1", revision: 1 });
      if (call.method === "POST") return json({ invitation: invitation((call.body.recipient as { email: string }).email === "a@x.io" ? "i1" : "i2"), proof: "secret-proof" }, 201);
      return err(404);
    });
    const sent = await createApiProjectMemberInviteRepository(api.client).send(P, ["a@x.io", "b@x.io"], "manager");
    const posts = api.calls.filter((call) => call.method === "POST");
    expect(posts.map((call) => [call.path, call.body])).toEqual([
      ["/spaces/s1/invitations", { kind: "MEMBERSHIP", memberRole: "MANAGER", recipient: { email: "a@x.io" } }],
      ["/spaces/s1/invitations", { kind: "MEMBERSHIP", memberRole: "MANAGER", recipient: { email: "b@x.io" } }],
    ]);
    expect(posts.every((call) => call.key)).toBe(true);
    expect(sent.map((invite) => [invite.id, invite.email, invite.role, invite.expiresAt])).toEqual([
      ["i1", "a@x.io", "manager", "2026-11-21T09:00:00.000Z"],
      ["i2", "b@x.io", "manager", "2026-11-21T09:00:00.000Z"],
    ]);
    expect(JSON.stringify(sent)).not.toContain("secret-proof");
  });

  it("a later failure is partial and names the unsent emails", async () => {
    let posts = 0;
    const api = fakeApi((call, parts) => {
      if (parts[0] === "projects") return json({ id: P, spaceId: "s1", revision: 1 });
      if (call.method === "POST") return posts++ === 0 ? json({ invitation: invitation("i1"), proof: null }, 201) : err(429);
      return err(404);
    });
    await expect(createApiProjectMemberInviteRepository(api.client).send(P, ["a@x.io", "b@x.io", "c@x.io"], "member")).rejects.toMatchObject({
      code: "partial",
      failedIds: ["b@x.io", "c@x.io"],
    });
  });

  it("cancel = revoke with the invitation's revision; already answered sends nothing; the rest is refused", async () => {
    const api = fakeApi((call, parts) => {
      if (parts[0] === "projects") return json({ id: P, spaceId: "s1", revision: 1 });
      if (call.method === "GET") return json(invitation(parts[3]!, parts[3] === "i9" ? { state: "ACCEPTED" } : {}));
      if (call.method === "POST") return json(invitation("i1", { state: "REVOKED", revision: 4 }));
      return err(404);
    });
    const repo = createApiProjectMemberInviteRepository(api.client);
    await repo.cancel(P, "i1");
    await repo.cancel(P, "i9");
    expect(api.calls.filter((call) => call.method === "POST").map((call) => [call.path, call.ifMatch])).toEqual([["/spaces/s1/invitations/i1/revoke", '"3"']]);
    const before = api.calls.length;
    await expect(repo.send(P, ["g@x.io"], "guest")).rejects.toMatchObject({ code: "unsupported", message: "guest-role" });
    await expect(repo.listPending(P)).rejects.toMatchObject({ code: "unsupported" });
    await expect(repo.resend(P, "i1")).rejects.toMatchObject({ code: "unsupported" });
    expect(api.calls.length).toBe(before);
  });
});

describe("live project invitations (recipient)", () => {
  it("a decline with a note is refused without a request; without a note it answers with the proof", async () => {
    const api = fakeApi((call, parts) => {
      if (parts[0] === "project-invitations") return json({ items: [{ id: "i1", contextLabel: "Project", revision: 2, expiresAt: "2026-11-21T09:00:00.000Z" }], nextCursor: null });
      if (parts[2] === "proof") return json({ proof: "p", revision: 2 });
      if (parts[2] === "decline") return json({ invitation: invitation("i1", { state: "DECLINED" }) });
      return err(404);
    });
    const repo = createApiProjectInvitations(api.client);
    await expect(repo.decline("i1", "Busy this quarter")).rejects.toMatchObject({ code: "unsupported", message: "decline-note" });
    expect(api.calls).toEqual([]);
    await repo.decline("i1");
    expect(api.writes()).toEqual(["POST /invitations/i1/proof", "POST /invitations/i1/decline"]);
  });
});
