import { describe, expect, it } from "vitest";
import { typedAs } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-teams";
import { catalogVersion } from "./api-retention";
import { createApiTeamFiles, createApiTeamInvitations, createApiTeamTasks } from "./api-team-work-repositories";
import { err, fakeApi, json } from "./test-support";

/* Team modules (1,045-op contract) against in-memory fakes of their endpoints (no network). */

const TEAM = "t1";
const member = (id: string, displayName: string) => ({ id, displayName, role: "MEMBER", state: "ACTIVE" });
const version = (over: Record<string, unknown> = {}) => ({
  id: "v1", fileId: "f1", number: 1, filename: "brief.pdf", mimeType: "application/pdf", expectedSize: 10, size: 10, sha256: null, status: "READY",
  uploader: { accessId: "a1", generation: 1 }, revision: 1, createdAt: "2026-11-10T08:00:00.000Z", ...over,
});
const file = (over: Record<string, unknown> = {}) => ({
  id: "f1", folderId: null, title: "brief.pdf", owner: { accessId: "a1", generation: 1 }, current: version(), latest: version(), versionCount: 1, removed: false,
  revision: 1, createdAt: "2026-11-10T08:00:00.000Z", updatedAt: "2026-11-10T08:00:00.000Z", can: { upload: true, edit: true, remove: true }, ...over,
});

describe("team files adapter", () => {
  it("lists folders and files per folder, named by the roster", async () => {
    const api = fakeApi((call, parts) => {
      if (parts[2] === "memberships") return json({ items: [member("a1", "Sara Ahmadi")], nextCursor: null });
      if (parts[2] === "file-folders") return json({ items: [{ id: "d1", parentId: null, title: "Specs", revision: 1, createdAt: "x", updatedAt: "x", can: { rename: true, remove: true } }], nextCursor: null });
      if (parts[2] === "files") return json({ items: call.query.folderId === "root" ? [file()] : [file({ id: "f2", folderId: "d1", current: null, latest: version({ status: "INITIATED", size: null }) })], nextCursor: null });
      return err(404);
    });
    const library = await createApiTeamFiles(typedAs<paths>(api.client)).list(TEAM);
    expect(library.folders).toEqual([{ id: "d1", name: "Specs", count: 1 }]);
    expect(library.files[0]).toMatchObject({ id: "f1", media: "pdf", state: "ready", version: 1, uploadedBy: { name: "Sara Ahmadi" }, taskIds: [] });
    // An upload whose bytes never arrived (earlier session) is failed, not uploading.
    expect(library.files[1]).toMatchObject({ id: "f2", state: "failed", failReason: "connection" });
  });

  it("uploads: create with idempotency key, then streams the bytes to complete with If-Match", async () => {
    let completed = false;
    const api = fakeApi((call, parts) => {
      if (parts[2] === "memberships") return json({ items: [member("a1", "Sara")], nextCursor: null });
      if (call.method === "POST" && parts.length === 3) return json(file({ id: "f9", current: null, latest: version({ id: "v9", fileId: "f9", status: "INITIATED", revision: 4 }) }), 201);
      if (parts[6] === "complete") {
        completed = true;
        return json(version({ id: "v9", fileId: "f9", revision: 5 }));
      }
      if (parts[4] === "versions") return json({ items: [version({ id: "v9", fileId: "f9" })], nextCursor: null });
      if (call.method === "GET" && parts[3] === "f9") return json(file({ id: "f9" }));
      return err(404);
    });
    const files = createApiTeamFiles(typedAs<paths>(api.client));
    const blob = new Blob(["%PDF-1"], { type: "application/pdf" });
    const result = await files.upload(TEAM, { name: "plan.pdf", sizeBytes: blob.size, folderId: null, file: blob });
    const create = api.calls.find((call) => call.method === "POST" && call.path === `/teams/${TEAM}/files`)!;
    expect(create.key).toBeTruthy();
    expect(create.body).toMatchObject({ folderId: null, title: "plan.pdf", upload: { filename: "plan.pdf", mimeType: "application/pdf", expectedSize: blob.size } });
    expect(api.calls.find((call) => call.path.endsWith("/complete"))!.ifMatch).toBe('"4"');
    expect(completed).toBe(true);
    expect(result).toMatchObject({ id: "f9", state: "ready" });
  });

  it("refuses types outside the allow-list and uploads without bytes, without a request", async () => {
    const api = fakeApi(() => err(500));
    const files = createApiTeamFiles(typedAs<paths>(api.client));
    await expect(files.upload(TEAM, { name: "a.exe", sizeBytes: 3, folderId: null, file: new Blob(["abc"]) })).rejects.toMatchObject({ code: "invalid" });
    await expect(files.upload(TEAM, { name: "a.pdf", sizeBytes: 3, folderId: null })).rejects.toMatchObject({ code: "invalid" });
    expect(api.calls).toHaveLength(0);
  });

  it("downloads the current READY version as bytes", async () => {
    const api = fakeApi((call, parts) => {
      if (parts[4] === "versions" && parts[6] === "download") return new Response("bytes", { status: 200, headers: { "Content-Type": "application/octet-stream" } });
      if (parts[4] === "versions") return json({ items: [version()], nextCursor: null });
      if (parts[3] === "f1") return json(file());
      return err(404);
    });
    const blob = await createApiTeamFiles(typedAs<paths>(api.client)).download(TEAM, "f1");
    expect(await blob.text()).toBe("bytes");
  });
});

describe("team tasks adapter", () => {
  const task = (id: string, over: Record<string, unknown> = {}) => ({ id, spaceId: "s1", scopeId: TEAM, createdByActorId: "x", title: `Task ${id}`, description: null, status: "OPEN", priority: "NONE", revision: 3, deletedAt: null, completedAt: null, ...over });
  const assignment = (over: Record<string, unknown> = {}) => ({
    id: "as1", taskId: "k1", assignee: { accessId: "me", generation: 1 }, issuer: { accessId: "a1", generation: 1 }, state: "PENDING", declineReason: null, endReason: null, revision: 7,
    createdAt: "2026-11-10T08:00:00.000Z", respondedAt: null, endedAt: null, can: { accept: true, decline: true, remove: false, reassign: false, remind: false }, ...over,
  });
  function setup() {
    const state = { board: "TODO" };
    const api = fakeApi((call, parts) => {
      const r = parts[2];
      if (r === "access") return json({ accessId: "me", actorId: "act", role: "MEMBER", generation: 1, capabilities: ["task.create"] });
      if (r === "memberships") return json({ items: [member("a1", "Sara"), member("me", "Mehran")], nextCursor: null });
      if (r === "task-planning")
        return json({
          items: [
            { task: task("k1", { priority: "HIGH" }), boardState: state.board, estimatedMinutes: 90, dueAt: null, scheduledDate: null, items: [{ id: "i1", planId: "p1", carriedFromPlanId: null, position: 0, revision: 1 }] },
            { task: task("k2"), boardState: "CANCELED", estimatedMinutes: null, dueAt: null, scheduledDate: null, items: [] },
            { task: task("k3"), boardState: "BLOCKED", estimatedMinutes: null, dueAt: null, scheduledDate: null, items: [] },
          ],
          nextCursor: null,
        });
      if (r === "plans") return json({ items: [{ id: "p1", kind: "WEEK", title: "W", startDate: "2026-11-14", endDate: "2026-11-20", timezone: "Asia/Tehran", spaceId: "s1", state: "ACTIVE", revision: 1, createdByActorId: "x", reviewSummary: null, reviewedByActorId: null, reviewedAt: null }], nextCursor: null });
      if (r === "assignments" && call.method === "GET") return json({ items: [assignment()], nextCursor: null });
      if (r === "assignments" && parts[4] === "accept") return json(assignment({ state: "ACCEPTED" }));
      if (r === "dependencies") return json({ revision: 1, edges: [{ id: "e1", predecessorId: "k1", successorId: "k3", kind: "FS", lagMinutes: 0, spaceId: "s1", scopeId: TEAM, revision: 1, retiredAt: null }] });
      if (r === "tasks" && parts[4] === "checklist") return json({ taskId: parts[3], revision: 1, items: [], done: parts[3] === "k1" ? 1 : 0, total: parts[3] === "k1" ? 4 : 0 });
      if (r === "tasks" && parts[4] === "board-state") {
        state.board = String(call.body.state);
        return json({});
      }
      return err(404);
    });
    return { ...api, tasks: createApiTeamTasks(typedAs<paths>(api.client)) };
  }

  it("maps board state, priority, estimate, plan week, assignments, dependencies and checklist progress", async () => {
    const t = setup();
    const list = await t.tasks.list(TEAM);
    expect(list.map((x) => x.id)).toEqual(["k1", "k3"]);
    expect(list[0]).toMatchObject({ status: "todo", priority: "high", estimateHours: 1.5, planWeek: "2026-11-14", progress: 25, goal: null, can: { edit: false, status: false } });
    expect(list[0]!.assignees).toEqual([{ person: { id: "me", name: "Mehran", initials: expect.any(String) }, state: "pending", by: { id: "a1", name: "Sara", initials: expect.any(String) } }]);
    expect(list[1]).toMatchObject({ status: "blocked", priority: null, blockedBy: ["k1"], planWeek: null });
  });

  it("accepts my pending assignment with its revision and moves board state with the task revision", async () => {
    const t = setup();
    await t.tasks.list(TEAM);
    await t.tasks.accept("k1", 3);
    expect(t.calls.find((call) => call.path.endsWith("/accept"))!.ifMatch).toBe('"7"');
    await t.tasks.setStatus("k1", "review", 3);
    const put = t.calls.find((call) => call.path.endsWith("/board-state"))!;
    expect(put).toMatchObject({ ifMatch: '"3"', body: { state: "REVIEW" } });
  });

  it("refuses what the contract does not serve", async () => {
    const t = setup();
    await expect(t.tasks.addComment("k1", "x")).rejects.toMatchObject({ code: "unsupported" });
    await expect(t.tasks.revertAccept("k1", 1)).rejects.toMatchObject({ code: "unsupported" });
    await expect(t.tasks.get("unknown")).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("team invitations (OD-4 recipient proof) and retention catalog", () => {
  it("fetches my own proof in the app, then accepts with X-Invitation-Proof and If-Match", async () => {
    const api = fakeApi((call, parts) => {
      if (parts[0] === "team-invitations" && parts.length === 1) return json({ items: [{ id: "inv1", contextLabel: "Team", revision: 2, expiresAt: "2026-12-01T00:00:00.000Z" }, { id: "inv2", contextLabel: "Company", revision: 1, expiresAt: "x" }], nextCursor: null });
      if (parts[2] === "proof") return json({ invitationId: "inv1", proof: "secret-proof", revision: 3, expiresAt: "x" });
      if (parts[2] === "accept") return json({ invitation: {}, membership: { scopeId: "scope-1" } }, 201);
      if (parts[0] === "teams") return json({ items: [{ id: "t9", scopeId: "scope-1" }], nextCursor: null });
      return err(404);
    });
    const invitations = createApiTeamInvitations(typedAs<paths>(api.client));
    const mine = await invitations.listMine();
    expect(mine).toEqual([{ id: "inv1", teamId: null, teamName: null, initials: null, inviter: null, role: null, memberCount: null, sentAt: null }]);
    expect(await invitations.accept("inv1")).toEqual({ teamId: "t9" });
    expect(api.calls.find((call) => call.path.endsWith("/proof"))!.ifMatch).toBe('"2"');
    const accept = api.calls.find((call) => call.path.endsWith("/accept"))!;
    expect(accept.ifMatch).toBe('"3"');
  });

  it("uses the single approved catalog policy, and refuses an empty catalog truthfully", async () => {
    const policy = { version: "mp-rpc-v1.0-work", applicableContexts: ["PROJECT", "TEAM"], marketScope: "IR", classRules: {}, createdAt: "x" };
    expect(await catalogVersion(fakeApi(() => json({ items: [policy] })).client, "TEAM")).toBe("mp-rpc-v1.0-work");
    await expect(catalogVersion(fakeApi(() => json({ items: [] })).client, "COMPANY")).rejects.toMatchObject({ code: "unsupported" });
    await expect(catalogVersion(fakeApi(() => json({ items: [policy, { ...policy, version: "b" }] })).client, "TEAM")).rejects.toMatchObject({ code: "unsupported" });
  });
});
