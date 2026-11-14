import { describe, expect, it } from "vitest";
import { createApiProjectFileRepository } from "./api-project-files-repository";
import { err, fakeApi, json } from "./test-support";

/* Contract fake for PJ-10 project files: PROJECT-target content files, bytes streamed to complete, DELETE with If-Match. */

const P = "p1";
const file = (id: string, over: Record<string, unknown> = {}) => ({
  id, projectId: P, target: { kind: "PROJECT", id: P }, filename: `${id}.pdf`, mimeType: "application/pdf", expectedSize: 2048, actualSize: 2000, sha256: null,
  status: "READY", revision: 2, createdAt: "2026-11-10T08:00:00.000Z", uploadExpiresAt: "2026-11-10T09:00:00.000Z", completedAt: "2026-11-10T08:01:00.000Z", ...over,
});

describe("live project files", () => {
  it("lists the project's own files at the root; deleted ones are left out; no uploader is invented", async () => {
    const api = fakeApi((call, parts) => {
      if (call.method === "GET" && parts[5] === "files" && parts.length === 6)
        return json({ items: [file("f1"), file("f2", { status: "REJECTED", mimeType: "image/png" }), file("f3", { status: "DELETED" })], nextCursor: null });
      return err(404);
    });
    const library = await createApiProjectFileRepository(api.client).list(P);
    expect(api.calls[0]!.path).toBe(`/projects/${P}/content/PROJECT/${P}/files`);
    expect(library.folders).toEqual([]);
    expect(library.files.map((entry) => [entry.id, entry.state, entry.media, entry.sizeBytes, entry.uploadedBy.name])).toEqual([
      ["f1", "ready", "pdf", 2000, ""],
      ["f2", "blocked", "image", 2000, ""],
    ]);
  });

  it("upload: initiate with Idempotency-Key, stream the real bytes to complete; refusals send nothing", async () => {
    let completed: unknown = null;
    const api = fakeApi((call, parts) => {
      if (call.method === "POST" && parts[2] === "files") return json(file(call.body.id as string, { status: "INITIATED", completedAt: null }), 201);
      if (call.method === "POST" && parts[7] === "complete") return ((completed = call.path), json(file(parts[6]!)));
      if (call.method === "GET") return json(file(parts[6]!));
      return err(404);
    });
    const repo = createApiProjectFileRepository(api.client);
    const bytes = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    const uploaded = await repo.upload(P, { name: "brief.pdf", sizeBytes: bytes.size, folderId: null, file: bytes });
    const post = api.calls.find((call) => call.method === "POST")!;
    expect([post.path, Boolean(post.key), post.body]).toEqual([
      `/projects/${P}/files`,
      true,
      { id: post.body.id, filename: "brief.pdf", mimeType: "application/pdf", expectedSize: bytes.size, target: { kind: "PROJECT", id: P } },
    ]);
    expect(completed).toBe(`/projects/${P}/content/PROJECT/${P}/files/${post.body.id}/complete`);
    expect(uploaded.state).toBe("ready");

    const before = api.calls.length;
    await expect(repo.upload(P, { name: "a.pdf", sizeBytes: 1, folderId: "fold1", file: bytes })).rejects.toMatchObject({ code: "unsupported" });
    await expect(repo.upload(P, { name: "a.pdf", sizeBytes: 1, folderId: null, asNewVersionOf: "f1", file: bytes })).rejects.toMatchObject({ code: "unsupported" });
    await expect(repo.upload(P, { name: "a.exe", sizeBytes: 1, folderId: null, file: new Blob(["x"]) })).rejects.toMatchObject({ code: "invalid" });
    await expect(repo.upload(P, { name: "a.pdf", sizeBytes: 1, folderId: null })).rejects.toMatchObject({ code: "invalid" });
    await expect(repo.restoreVersion(P, "f1", 1)).rejects.toMatchObject({ code: "unsupported" });
    expect(api.calls.length).toBe(before);
  });

  it("cancel deletes with the file revision; download only when READY", async () => {
    const api = fakeApi((call, parts) => {
      if (call.method === "DELETE") return json(null, 204);
      if (parts[7] === "download") return new Response("bytes", { status: 200, headers: { "Content-Type": "application/octet-stream" } });
      if (call.method === "GET") return json(file(parts[6]!, parts[6] === "f9" ? { status: "INITIATED" } : {}));
      return err(404);
    });
    const repo = createApiProjectFileRepository(api.client);
    await repo.cancel(P, "f1");
    expect(api.calls.filter((call) => call.method === "DELETE").map((call) => [call.path, call.ifMatch])).toEqual([[`/projects/${P}/content/PROJECT/${P}/files/f1`, '"2"']]);
    await expect(repo.download(P, "f9")).rejects.toMatchObject({ code: "invalid" });
    expect(await (await repo.download(P, "f1")).text()).toBe("bytes");
  });
});
