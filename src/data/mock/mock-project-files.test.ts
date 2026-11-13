import { describe, expect, it } from "vitest";
import { createMockFiles } from "./mock-project-files";
import { createProjectWorkStore } from "./mock-project-work";

const respond = <T>(value: T) => Promise.resolve(structuredClone(value));

function setup(role: "owner" | "guest" = "owner") {
  return createMockFiles({
    store: createProjectWorkStore(),
    respond,
    now: "2026-10-13T14:35:00+03:30",
    roleOf: (_id, options) => options?.previewRole ?? role,
    stepMs: 0,
  });
}

describe("mock files (PJ-10)", () => {
  it("lists one folder level with counts; guests see only shared + their linked files", async () => {
    const { files } = setup();
    const library = await files.list("website-redesign");
    expect(library.total).toBe(18);
    expect(library.folders.map((folder) => [folder.name, folder.count])).toEqual([
      ["Design", 7],
      ["Specs", 4],
      ["Payments", 3],
      ["Shared with guests", 2],
    ]);
    const guest = await files.list("website-redesign", { previewRole: "guest" });
    expect(guest.folders.map((folder) => folder.name)).toEqual(["Shared with guests"]);
    expect(guest.files.every((file) => file.folderId === null || file.folderId === "guests")).toBe(true);
  });

  it("runs upload → scanning → ready, blocks types from the server config, refuses download until ready", async () => {
    const { files, tick } = setup();
    const blocked = await files.upload("website-redesign", { name: "run.exe", sizeBytes: 10, folderId: null });
    expect(blocked).toMatchObject({ state: "blocked", blockReason: "type" });
    const file = await files.upload("website-redesign", { name: "brief.pdf", sizeBytes: 1000, folderId: "specs" });
    expect(file.state).toBe("queued");
    await expect(files.download("website-redesign", file.id)).rejects.toMatchObject({ code: "invalid" });
    for (let i = 0; i < 6; i += 1) tick();
    const scanning = (await files.list("website-redesign")).files.find((candidate) => candidate.id === file.id);
    expect(scanning?.state).toBe("scanning");
    tick();
    const ready = (await files.list("website-redesign")).files.find((candidate) => candidate.id === file.id);
    expect(ready?.state).toBe("ready");
    expect(await files.download("website-redesign", file.id)).toBeInstanceOf(Blob);
  });

  it("the in-flight fixture fails once, retries, and restore creates a new version", async () => {
    const { files, tick } = setup();
    tick();
    const failed = (await files.list("website-redesign")).files.find((file) => file.id === "empty-states");
    expect(failed).toMatchObject({ state: "failed", failReason: "connection" });
    expect((await files.retry("website-redesign", "empty-states")).state).toBe("queued");
    const restored = await files.restoreVersion("website-redesign", "checkout-final", 3);
    expect(restored.version).toBe(5);
    expect(restored.versions[0]).toMatchObject({ version: 5, restoredFrom: 3 });
    const next = await files.upload("website-redesign", {
      name: "Checkout — final.fig",
      sizeBytes: 100,
      folderId: "design",
      asNewVersionOf: "checkout-final",
    });
    expect(next.version).toBe(6);
  });
});
