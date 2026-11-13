import { describe, expect, it } from "vitest";
import { createApiMessaging } from "./api-messaging-repository";
import { err, fakeApi, json, type FakeCall } from "./test-support";

/* Contract fakes for the announcement read + acknowledge paths of the 864-op contract (M-A1: nullable `authorDisplayName`). */

const USER = { id: "u1", name: "Mehran Raeeszade" };
const A1 = "11111111-1111-4111-8111-111111111111";
const A2 = "22222222-2222-4222-8222-222222222222";
const version = (over: Record<string, unknown>) => ({
  authorDisplayName: "Sara Karimi",
  id: "v1",
  announcementId: A1,
  number: 1,
  title: "Office move",
  text: "We move on Saturday",
  acknowledgement: true,
  state: "PUBLISHED",
  pinned: false,
  revision: 1,
  publishedAt: "2026-11-10T08:00:00.000Z",
  createdAt: "2026-11-10T07:00:00.000Z",
  attachments: [],
  acknowledged: false,
  ...over,
});
const page = (items: unknown[]) => json({ items, nextCursor: null, hasMore: false });

function announcementsApi(opts: { totals?: number } = {}) {
  return fakeApi((call: FakeCall, parts) => {
    const tail = parts.join("/");
    if (tail === "teams/t1") return json({ id: "t1", title: "Design Team" });
    if (tail === "announcements/scopes/TEAM/t1")
      return page([
        version({}),
        version({ id: "v2", number: 2, title: "Office move (updated)" }),
        version({ id: "v3", number: 3, state: "DRAFT", title: "Draft" }),
        version({ id: "w1", announcementId: A2, authorDisplayName: null, acknowledgement: false, pinned: true, publishedAt: "2026-11-01T08:00:00.000Z" }),
      ]);
    if (tail === `announcements/${A1}/versions/v2/acknowledgements`) return opts.totals ? err(opts.totals) : json({ versionId: "v2", eligible: 12, acknowledged: 5 });
    if (call.method === "POST" && tail === `announcements/${A1}/versions/v2/acknowledge`) return json({}, 201);
    return err(404);
  });
}

describe("live announcements (M-A1)", () => {
  it("one card per announcement (latest published version); author only when served; manager totals; nothing invented", async () => {
    const api = announcementsApi();
    const list = await createApiMessaging(api.client, USER).announcements.list("t1", "team");
    expect(list.map((row) => row.id)).toEqual([A2, A1]);
    expect(list[0]).toMatchObject({ author: null, pinned: true, pinnedUntil: null, requireAck: false, ack: null });
    expect(list[1]).toMatchObject({
      title: "Office move (updated)",
      author: { name: "Sara Karimi", initials: "SK" },
      workspace: { kind: "team", workspaceId: "t1", name: "Design Team" },
      audience: null,
      scheduledFor: null,
      requireAck: true,
      acked: false,
      ack: { done: 5, total: 12, pending: [], lastReminderAt: null },
      canRemind: false,
    });
    expect(api.writes()).toEqual([]);
  });

  it("totals are manager-only: 403 → none; acknowledge posts on the shown version", async () => {
    const api = announcementsApi({ totals: 403 });
    const repo = createApiMessaging(api.client, USER);
    const list = await repo.announcements.list("t1", "team");
    expect(list.find((row) => row.id === A1)!.ack).toBeNull();
    await repo.announcements.ack(A1);
    expect(api.writes()).toEqual([`POST /announcements/${A1}/versions/v2/acknowledge`]);
  });

  it("publish, remind and the composer access stay refused without a request", async () => {
    const api = announcementsApi();
    const repo = createApiMessaging(api.client, USER);
    await expect(repo.announcements.access("t1")).rejects.toMatchObject({ code: "unavailable" });
    await expect(repo.announcements.remind(A1)).rejects.toMatchObject({ code: "unavailable" });
    expect(api.calls).toEqual([]);
  });
});
