import { describe, expect, it } from "vitest";
import { createApiInvitationFeed } from "./api-invitation-feed";
import { err, fakeApi, json } from "./test-support";

const AT = "2026-11-25T08:00:00.000Z";
const item = (id: string, kind: string, readAt: string | null = null) => ({
  invitationId: id,
  kind,
  targetId: `t-${id}`,
  targetDisplayName: `Target ${id}`,
  inviterDisplayName: id === "a" ? "Sara" : null,
  role: id === "a" ? "MEMBER" : null,
  createdAt: AT,
  readAt,
  revision: 2,
  expiresAt: "2026-12-02T08:00:00.000Z",
});

function setup() {
  return fakeApi((call, [root, kind, id, action]) => {
    if (root !== "invitation-notifications") return err(404);
    if (call.method === "GET") return json(call.query.after === "c2" ? { items: [item("b", call.query.kind!, AT)], nextCursor: null } : { items: [item("a", call.query.kind!)], nextCursor: "c2" });
    if (call.method === "POST" && action === "read" && kind === "SOCIAL_GROUP" && id === "a") return json({ invitationId: "a", readAt: AT });
    return err(404);
  });
}

describe("live invitation notification feed", () => {
  it("lists one kind with limit / after and maps every field", async () => {
    const { client, calls } = setup();
    const feed = createApiInvitationFeed(client);
    const page = await feed.list("socialGroup");
    expect(calls[0]).toMatchObject({ method: "GET", path: "/invitation-notifications", query: { kind: "SOCIAL_GROUP", limit: "25" } });
    expect(calls[0]!.query).not.toHaveProperty("after");
    expect(page).toEqual({
      items: [{ id: "a", kind: "socialGroup", targetId: "t-a", targetName: "Target a", inviterName: "Sara", role: "MEMBER", createdAt: AT, readAt: null, revision: 2, expiresAt: "2026-12-02T08:00:00.000Z" }],
      next: "c2",
    });
    const next = await feed.list("socialGroup", "c2");
    expect(calls[1]!.query).toMatchObject({ after: "c2" });
    expect(next).toMatchObject({ items: [{ id: "b", inviterName: null, role: null, readAt: AT }], next: null });
  });

  it("maps every kind to the API enum", async () => {
    const { client, calls } = setup();
    const feed = createApiInvitationFeed(client);
    for (const kind of ["project", "team", "company", "conversation", "meeting", "socialGroup"] as const) await feed.list(kind);
    expect(calls.map((call) => call.query.kind)).toEqual(["PROJECT", "TEAM", "COMPANY", "CONVERSATION", "MEETING", "SOCIAL_GROUP"]);
  });

  it("marks read with an empty body (no accept, no If-Match) and maps a missing offer to not-found", async () => {
    const { client, calls } = setup();
    const feed = createApiInvitationFeed(client);
    expect(await feed.markRead("socialGroup", "a")).toEqual({ readAt: AT });
    expect(calls[0]).toMatchObject({ method: "POST", path: "/invitation-notifications/SOCIAL_GROUP/a/read", body: {}, ifMatch: null });
    await expect(feed.markRead("project", "gone")).rejects.toMatchObject({ code: "not-found" });
  });
});
