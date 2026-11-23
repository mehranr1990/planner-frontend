import { describe, expect, it } from "vitest";
import { createApiMessaging } from "./api-messaging-repository";
import { createApiNotificationsRepository } from "./api-notifications-repository";
import { createApiProjectCapacityRepository } from "./api-project-capacity-repository";
import { createApiProjectLifecycle } from "./api-project-directory-repository";
import { err, fakeApi, json } from "./test-support";

/* Contract fakes for the five approved features: module × channel notifications, manual project status, member capacity, DM archive / delete for me, email offers. */

const page = (items: unknown[]) => ({ items, nextCursor: null });

describe("notification module channels", () => {
  const prefs = (moduleChannels: Record<string, { IN_APP: boolean; WEB_PUSH: boolean; EMAIL: boolean }>) => ({
    id: "n1", spaceId: "s", ownerUserId: "u", createdByUserId: "u", revision: 4, createdAt: "", updatedAt: "",
    inApp: true, email: false, webPush: true, reactivateOnReopen: true, quietStart: null, quietEnd: null,
    availableChannels: ["IN_APP", "WEB_PUSH"], webPushPublicKey: null, moduleChannels,
  });

  it("maps all six modules and patches whole rows with uppercase keys", async () => {
    const all = { IN_APP: true, WEB_PUSH: true, EMAIL: true };
    const served = { PERSONAL: all, PROJECTS: { IN_APP: true, WEB_PUSH: false, EMAIL: false }, TEAMS: all, COMPANY: all, MESSAGING_MEETINGS: all, SOCIAL: all };
    const api = fakeApi((call) => json(prefs(served), 200, call.method === "GET" ? '"4"' : '"5"'));
    const repo = createApiNotificationsRepository(api.client);
    const read = await repo.preferences();
    expect(read.modules?.projects).toEqual({ inApp: true, webPush: false, email: false });
    expect(read.modules?.messaging).toEqual({ inApp: true, webPush: true, email: true });

    await repo.updatePreferences({ modules: { projects: { inApp: true, email: false, webPush: true } } });
    const patch = api.calls.find((call) => call.method === "PATCH")!;
    expect(patch.ifMatch).toBe('"4"');
    expect(patch.key).toBeTruthy();
    expect(patch.body).toEqual({ moduleChannels: { PROJECTS: { IN_APP: true, EMAIL: false, WEB_PUSH: true } } });
  });
});

describe("manual project status", () => {
  it("sends a status-only PATCH with the project revision", async () => {
    const api = fakeApi((call, parts) => {
      if (parts[0] === "projects" && parts.length === 2 && call.method === "GET") return json({ id: "p1", revision: 7, state: "ACTIVE", manualStatus: "PLANNED" });
      if (call.method === "PATCH") return json({ id: "p1", revision: 8, manualStatus: "ON_HOLD" });
      return err(404);
    });
    // The summary re-read afterwards is outside this fake (not found); the write is what matters here.
    await createApiProjectLifecycle(api.client).setManualStatus("p1", "on-hold").catch(() => undefined);
    const patch = api.calls.find((call) => call.method === "PATCH")!;
    expect(patch.path).toBe("/projects/p1");
    expect(patch.ifMatch).toBe('"7"');
    expect(patch.body).toEqual({ manualStatus: "ON_HOLD" });
  });
});

describe("project member capacity", () => {
  const roster = page([{ id: "m1", state: "ACTIVE", generation: 3 }]);
  const template = (revision: number, weekdays: (number | null)[] | null) => ({
    projectId: "p1",
    member: { accessId: "m1", generation: 3 },
    template: weekdays ? { timezone: "Asia/Tehran", effectiveFrom: "2030-01-01", weekdays } : null,
    revision,
  });

  it("reads and saves the override with the member generation and template revision", async () => {
    const api = fakeApi((call, parts) => {
      if (parts[2] === "members") return json(roster);
      if (call.method === "PUT") return json(template(2, call.body.template ? [null, 360, null, null, null, null, 0] : null));
      return json(template(1, null));
    });
    const repo = createApiProjectCapacityRepository(api.client);
    const current = await repo.template("p1", "m1");
    expect(current).toEqual({ personId: "m1", template: null, revision: 1 });
    expect(api.calls.find((call) => call.path.includes("capacity-templates"))!.query).toEqual({ generation: "3" });

    const saved = await repo.saveTemplate("p1", current, { timezone: "Asia/Tehran", effectiveFrom: "2030-01-01", weekdays: [null, 360, null, null, null, null, 0] });
    const put = api.calls.find((call) => call.method === "PUT")!;
    expect(put.ifMatch).toBe('"1"');
    expect(put.body).toEqual({ member: { accessId: "m1", generation: 3 }, template: { timezone: "Asia/Tehran", effectiveFrom: "2030-01-01", weekdays: [null, 360, null, null, null, null, 0] } });
    expect(saved.revision).toBe(2);
  });

  it("a stale revision is a conflict and is not retried", async () => {
    const api = fakeApi((call, parts) => (parts[2] === "members" ? json(roster) : call.method === "PUT" ? err(409, "CONFLICT") : err(404)));
    await expect(createApiProjectCapacityRepository(api.client).saveTemplate("p1", { personId: "m1", template: null, revision: 1 }, null)).rejects.toMatchObject({ code: "conflict" });
    expect(api.calls.filter((call) => call.method === "PUT")).toHaveLength(1);
  });

  it("returns every requested day with advisory overbooking", async () => {
    const api = fakeApi((_call, parts) =>
      parts[2] === "members"
        ? json(roster)
        : json({
            projectId: "p1", fromDate: "2030-01-05", toDate: "2030-01-07", timezone: "Asia/Tehran", basis: "EXPLICIT_ACCEPTED_ASSIGNMENT_ALLOCATIONS",
            rows: [
              { member: { accessId: "m1", generation: 3 }, date: "2030-01-06", capacityMinutes: null, allocatedMinutes: 0, overbookedMinutes: null, taskCount: 0, estimatedMinutes: 0, unknownEstimates: 0 },
              { member: { accessId: "m1", generation: 3 }, date: "2030-01-05", capacityMinutes: 480, allocatedMinutes: 600, overbookedMinutes: 120, taskCount: 2, estimatedMinutes: 600, unknownEstimates: 0 },
            ],
          }),
    );
    const days = await createApiProjectCapacityRepository(api.client).effective("p1", "m1", { from: "2030-01-05", to: "2030-01-07", timezone: "Asia/Tehran" });
    expect(days.map((day) => [day.date, day.capacityMinutes, day.overbookedMinutes])).toEqual([
      ["2030-01-05", 480, 120],
      ["2030-01-06", null, null],
    ]);
    expect(api.calls.at(-1)!.query).toEqual({ generation: "3", fromDate: "2030-01-05", toDate: "2030-01-07", timezone: "Asia/Tehran" });
  });
});

describe("conversation archive, delete for me and email offers", () => {
  const settings = { conversationId: "c1", linkPreviews: null, newcomerHistory: null, membersCanPin: null, revision: 9, canManage: true, me: { linkPreviews: null, collapseBlocked: false, archived: false, hidden: false, revision: 2 } };
  const USER = { id: "u1", name: "Mehran" };

  it("archive / delete for me patch my preferences with my own revision", async () => {
    const api = fakeApi((call, parts) => {
      if (parts[2] === "settings") return json(settings);
      if (parts[2] === "preferences") return json({ ...settings, me: { ...settings.me, revision: 3 } });
      return err(404);
    });
    const repo = createApiMessaging(api.client, USER);
    await repo.conversations.archive("c1", true);
    await repo.conversations.deleteForMe("c1");
    const patches = api.calls.filter((call) => call.method === "PATCH");
    expect(patches.map((call) => [call.path, call.ifMatch, call.body])).toEqual([
      ["/conversations/c1/preferences", '"2"', { archived: true }],
      ["/conversations/c1/preferences", '"2"', { deleteForMe: true }],
    ]);
  });

  it("the archived box asks the server for archived conversations only", async () => {
    const api = fakeApi(() => json(page([])));
    await createApiMessaging(api.client, USER).conversations.list("all", { archived: true });
    expect(api.calls.find((call) => call.path === "/conversations")!.query).toMatchObject({ archived: "true" });
  });

  it("an email offer uses the conversation revision and a fresh id; a claim grants only a pending invitation", async () => {
    const api = fakeApi((call, parts) => {
      if (call.method === "GET" && parts.length === 2) return json({ id: "c1", revision: 5 });
      if (parts[2] === "email-invitations") return json({ id: call.body.id, state: "PENDING", revision: 1, expiresAt: "2030-01-08T00:00:00.000Z" }, 201);
      if (parts[2] === "claim-email") return json({ id: "inv1", conversationId: "c1", kind: "PRIVATE_GROUP", inviterActorId: "a9", inviterDisplayName: "Sara", state: "PENDING", revision: 2, expiresAt: "2030-01-08T00:00:00.000Z" });
      return err(404);
    });
    const repo = createApiMessaging(api.client, USER);
    const offer = await repo.conversations.inviteByEmail("c1", " exact@example.com ");
    const post = api.calls.find((call) => call.path === "/conversations/c1/email-invitations")!;
    expect(post.ifMatch).toBe('"5"');
    expect(post.key).toBeTruthy();
    expect(post.body).toMatchObject({ email: "exact@example.com" });
    expect(offer).toMatchObject({ email: "exact@example.com", state: "pending", revision: 1 });

    const invitation = await repo.conversations.claimEmailInvitation("inv1", "proof-token");
    const claim = api.calls.find((call) => call.path.endsWith("/claim-email"))!;
    expect(claim.ifMatch).toBe('"1"');
    expect(JSON.stringify(claim.query)).not.toContain("proof-token");
    expect(invitation).toMatchObject({ id: "inv1", revision: 2, kind: "group", inviterName: "Sara" });
  });
});
