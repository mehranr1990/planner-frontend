import { describe, expect, it } from "vitest";
import { createApiProjectFileRepository } from "./api-project-files-repository";
import { err, fakeApi, json } from "./test-support";

/* Contract fake for PJ-10 project files: library + folders + versions, bytes streamed to complete, DELETE with If-Match. */

const P = "p1";
const file = (id: string, over: Record<string, unknown> = {}) => ({
  id, projectId: P, target: { kind: "PROJECT", id: P }, filename: `${id}.pdf`, mimeType: "application/pdf", expectedSize: 2048, actualSize: 2000, sha256: null,
  status: "READY", revision: 2, createdAt: "2026-11-10T08:00:00.000Z", uploadExpiresAt: "2026-11-10T09:00:00.000Z", completedAt: "2026-11-10T08:01:00.000Z", ...over,
});
const entry = (id: string, over: Record<string, unknown> = {}) => ({ id, folderId: null, revision: 3, createdByActorId: "a-m1", currentVersionId: id, versionCount: 1, ...over });
const version = (id: string, number: number, over: Record<string, unknown> = {}) => ({
  id, rootFileId: "f1", number, createdByActorId: "a-m1", filename: `v${number}.pdf`, mimeType: "application/pdf", status: "READY", revision: 1, size: 100 * number, createdAt: `2026-11-1${number}T08:00:00.000Z`, ...over,
});
const roster = { items: [{ id: "m1", actorId: "a-m1", displayName: "Sara Ahmadi", state: "ACTIVE", role: "MANAGER", generation: 1 }], nextCursor: null };
const config = { maxBytes: 10_000, allowedTypes: ["application/pdf", "image/png"] };

describe("live project files", () => {
  it("lists folders and library files (uploader from the roster, current version from versions); archived folders and deleted files are left out", async () => {
    const api = fakeApi((call, parts) => {
      if (parts[2] === "file-folders")
        return json({ items: [{ id: "d1", parentId: null, title: "Specs", revision: 1, createdAt: "x", updatedAt: "x", archivedAt: null }, { id: "d2", parentId: null, title: "Old", revision: 1, createdAt: "x", updatedAt: "x", archivedAt: "2026-11-01T00:00:00.000Z" }], nextCursor: null });
      if (parts[2] === "file-library") return json({ items: [entry("f1", { folderId: "d1", versionCount: 2, currentVersionId: "v2" }), entry("f2"), entry("f3")], nextCursor: null });
      if (parts[2] === "members") return json(roster);
      if (parts[4] === "versions") return json({ items: [version("f1", 1), version("v2", 2), version("v3", 3, { status: "INITIATED" })], currentVersionId: "v2" });
      if (call.method === "GET" && parts[5] === "files" && parts.length === 6)
        return json({ items: [file("f2", { status: "REJECTED", mimeType: "image/png" }), file("f3", { status: "DELETED" })], nextCursor: null });
      return err(404);
    });
    const library = await createApiProjectFileRepository(api.client).list(P);
    expect(library.folders).toEqual([{ id: "d1", name: "Specs", count: 1 }]);
    expect(library.files.map((item) => [item.id, item.name, item.folderId, item.state, item.version, item.versions.length, item.sizeBytes, item.uploadedBy.name])).toEqual([
      ["f1", "v2.pdf", "d1", "ready", 2, 2, 200, "Sara Ahmadi"],
      ["f2", "f2.pdf", null, "blocked", 1, 0, 2000, "Sara Ahmadi"],
    ]);
  });

  it("upload into a folder and as a new version: server limits, Idempotency-Key, library If-Match, real bytes to complete; refusals send nothing", async () => {
    const completed: string[] = [];
    const api = fakeApi((call, parts) => {
      if (parts[3] === "config") return json(config);
      if (call.method === "POST" && parts[2] === "files" && parts.length === 3) return json(file(call.body.id as string, { status: "INITIATED", completedAt: null }), 201);
      if (call.method === "POST" && parts[4] === "versions") return json(file(call.body.id as string, { status: "INITIATED", completedAt: null }), 201);
      if (call.method === "POST" && parts[7] === "complete") return (completed.push(call.path), json(file(parts[6]!)));
      if (parts[4] === "metadata") return json(entry(parts[3]!));
      if (parts[4] === "versions") return json({ items: [version(parts[3]!, 1)], currentVersionId: parts[3] });
      if (parts[2] === "members") return json(roster);
      return err(404);
    });
    const repo = createApiProjectFileRepository(api.client);
    const bytes = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    const uploaded = await repo.upload(P, { name: "brief.pdf", sizeBytes: bytes.size, folderId: "d1", file: bytes });
    const post = api.calls.find((call) => call.method === "POST")!;
    expect([post.path, Boolean(post.key), post.body]).toEqual([
      `/projects/${P}/files`,
      true,
      { id: post.body.id, filename: "brief.pdf", mimeType: "application/pdf", expectedSize: bytes.size, target: { kind: "PROJECT", id: P }, folderId: "d1" },
    ]);
    expect(completed[0]).toBe(`/projects/${P}/content/PROJECT/${P}/files/${post.body.id}/complete`);
    expect(uploaded.state).toBe("ready");

    await repo.upload(P, { name: "brief.pdf", sizeBytes: bytes.size, folderId: null, asNewVersionOf: "f1", file: bytes });
    const next = api.calls.find((call) => call.method === "POST" && call.path.endsWith("/versions"))!;
    expect([next.path, next.ifMatch, Boolean(next.key), next.body.expectedSize]).toEqual([`/projects/${P}/files/f1/versions`, '"3"', true, bytes.size]);
    expect(completed[1]).toContain(`/files/${next.body.id}/complete`);

    const before = api.writes().length;
    await expect(repo.upload(P, { name: "a.txt", sizeBytes: 1, folderId: null, file: new Blob(["x"], { type: "text/plain" }) })).rejects.toMatchObject({ code: "invalid" });
    await expect(repo.upload(P, { name: "a.pdf", sizeBytes: 1, folderId: null, file: new Blob([new Uint8Array(20_000)], { type: "application/pdf" }) })).rejects.toMatchObject({ code: "invalid" });
    await expect(repo.upload(P, { name: "a.pdf", sizeBytes: 1, folderId: null })).rejects.toMatchObject({ code: "invalid" });
    expect(api.writes().length).toBe(before);
  });

  it("cancel deletes with the file revision; download streams the current READY version; restore re-uploads an old version's bytes", async () => {
    let current = "v2";
    const api = fakeApi((call, parts) => {
      if (call.method === "DELETE") return json(null, 204);
      if (parts[6] === "download") return new Response(`bytes-${parts[5]}`, { status: 200, headers: { "Content-Type": "application/octet-stream" } });
      if (parts[3] === "f9" && parts[4] === "versions") return json({ items: [version("f9", 1, { status: "INITIATED" })], currentVersionId: null });
      if (call.method === "GET" && parts[4] === "versions") return json({ items: [version("f1", 1), version("v2", 2)], currentVersionId: current });
      if (call.method === "POST" && parts[4] === "versions") return ((current = "v3"), json(file(call.body.id as string, { status: "INITIATED" }), 201));
      if (call.method === "POST" && parts[7] === "complete") return json(file(parts[6]!));
      if (parts[4] === "metadata") return json(entry("f1", { versionCount: 2 }));
      if (parts[2] === "members") return json(roster);
      if (call.method === "GET") return json(file(parts[6]!));
      return err(404);
    });
    const repo = createApiProjectFileRepository(api.client);
    await repo.cancel(P, "f1");
    expect(api.calls.filter((call) => call.method === "DELETE").map((call) => [call.path, call.ifMatch])).toEqual([[`/projects/${P}/content/PROJECT/${P}/files/f1`, '"2"']]);
    await expect(repo.download(P, "f9")).rejects.toMatchObject({ code: "invalid" });
    expect(await (await repo.download(P, "f1")).text()).toBe("bytes-v2");
    await repo.restoreVersion(P, "f1", 1);
    const restore = api.calls.find((call) => call.method === "POST" && call.path.endsWith("/versions"))!;
    expect([restore.body.filename, restore.ifMatch]).toEqual(["v1.pdf", '"3"']);
    expect(api.calls.some((call) => call.path === `/projects/${P}/files/f1/versions/f1/download`)).toBe(true);
  });
});
