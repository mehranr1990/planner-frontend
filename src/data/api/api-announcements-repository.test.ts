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

function announcementsApi(opts: { totals?: number; capabilities?: string[]; failPublish?: number } = {}) {
  let publishFailures = opts.failPublish ?? 0;
  return fakeApi((call: FakeCall, parts) => {
    const tail = parts.join("/");
    if (tail === "teams/t1") return json({ id: "t1", title: "Design Team" });
    if (tail === "teams/t1/access/me") return opts.capabilities ? json({ actorId: "act-me", capabilities: opts.capabilities }) : err(403);
    if (tail === "projects/p1/access/me") return json({ actorId: "act-me", capabilities: opts.capabilities ?? [] });
    if (call.method === "POST" && tail === "announcements") return json({ ...call.body, revision: 1, createdAt: "2026-11-14T08:00:00.000Z" }, 201);
    if (call.method === "POST" && /^announcements\/[^/]+\/versions$/.test(tail)) return json(version({ ...call.body, announcementId: parts[1], state: "DRAFT", revision: 4, publishedAt: null }), 201);
    if (call.method === "POST" && /^announcements\/[^/]+\/versions\/[^/]+\/publish$/.test(tail)) return publishFailures-- > 0 ? err(503) : json(version({ id: parts[3], announcementId: parts[1] }), 201);
    if (tail === "projects/p1") return json({ id: "p1", title: "Apollo" });
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
      canRemind: true,
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

  it("remind needs a listed announcement (OD-13)", async () => {
    const api = announcementsApi();
    const repo = createApiMessaging(api.client, USER);
    await expect(repo.announcements.remind(A1)).rejects.toMatchObject({ code: "not-found" });
    expect(api.calls).toEqual([]);
  });

  it("composer access from the root access/me hint: Team announcement.publish, Project meeting.create; not admitted → hidden", async () => {
    const repo = (capabilities?: string[]) => createApiMessaging(announcementsApi({ capabilities }).client, USER).announcements;
    expect(await repo().access("t1", "team")).toEqual({ canPublish: false, audiences: [] });
    expect(await repo(["task.read"]).access("t1", "team")).toEqual({ canPublish: false, audiences: [] });
    expect(await repo(["announcement.publish"]).access("t1", "team")).toEqual({ canPublish: true, audiences: [{ kind: "workspace", label: "Design Team", memberIds: [] }] });
    expect(await repo(["meeting.create"]).access("p1", "project")).toMatchObject({ canPublish: true, audiences: [{ label: "Apollo" }] });
    expect(await repo(["announcement.publish"]).access("p1", "project")).toMatchObject({ canPublish: false });
    expect(await repo(["announcement.publish"]).access("t1")).toEqual({ canPublish: false, audiences: [] });
  });

  it("publish: announcement → draft version → publish ALL (If-Match draft revision, Idempotency-Key per step)", async () => {
    const api = announcementsApi();
    const repo = createApiMessaging(api.client, USER).announcements;
    const input = {
      workspace: { kind: "team" as const, workspaceId: "t1", name: "Design Team" },
      title: " Office move ",
      body: "Saturday",
      audience: { kind: "workspace" as const, label: "Design Team", memberIds: [] },
      pinDays: null,
      requireAck: true,
      scheduleAt: null,
      clientOpId: "op-1",
    };
    const id = await repo.publish(input);
    const writes = api.calls.filter((call) => call.method === "POST");
    expect(writes.map((call) => call.path.replace(id, "{id}").replace(String(writes[1]!.body.id), "{v}"))).toEqual([
      "/announcements",
      "/announcements/{id}/versions",
      "/announcements/{id}/versions/{v}/publish",
    ]);
    expect(writes[0]!.body).toEqual({ id, kind: "TEAM", sourceId: "t1" });
    expect(writes[1]!.body).toMatchObject({ title: "Office move", text: "Saturday", acknowledgement: true });
    expect(writes[2]).toMatchObject({ ifMatch: '"4"', body: { audience: "ALL" } });
    expect(new Set(writes.map((call) => call.key)).size).toBe(3);
  });

  it("publish failure → no success; retrying the same clientOpId replays the same ids and keys", async () => {
    const api = announcementsApi({ failPublish: 1 });
    const repo = createApiMessaging(api.client, USER).announcements;
    const input = {
      workspace: { kind: "team" as const, workspaceId: "t1", name: "Design Team" },
      title: "T",
      body: "B",
      audience: { kind: "workspace" as const, label: "Design Team", memberIds: [] },
      pinDays: null,
      requireAck: false,
      scheduleAt: null,
      clientOpId: "op-3",
    };
    await expect(repo.publish(input)).rejects.toBeTruthy();
    const id = await repo.publish(input);
    const writes = api.calls.filter((call) => call.method === "POST");
    expect(writes).toHaveLength(6);
    expect(writes.slice(3).map((call) => [call.path, call.key])).toEqual(writes.slice(0, 3).map((call) => [call.path, call.key]));
    expect(writes[0]!.body.id).toBe(id);
  });

  it("schedule, pin end and audience subsets are refused before any write", async () => {
    const api = announcementsApi();
    const repo = createApiMessaging(api.client, USER).announcements;
    const base = {
      workspace: { kind: "team" as const, workspaceId: "t1", name: "Design Team" },
      title: "T",
      body: "B",
      audience: { kind: "workspace" as const, label: "Design Team", memberIds: [] },
      pinDays: null,
      requireAck: false,
      scheduleAt: null,
      clientOpId: "op-2",
    };
    await expect(repo.publish({ ...base, scheduleAt: "2026-11-20T06:00:00.000Z" })).rejects.toMatchObject({ code: "unavailable" });
    await expect(repo.publish({ ...base, pinDays: 7 })).rejects.toMatchObject({ code: "unavailable" });
    await expect(repo.publish({ ...base, audience: { kind: "subset", label: "Design", memberIds: ["x"] } })).rejects.toMatchObject({ code: "unavailable" });
    expect(api.writes()).toEqual([]);
  });
});
