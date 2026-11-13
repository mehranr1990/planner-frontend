import { describe, expect, it } from "vitest";
import { createApiInboxRepository } from "./api-inbox-repository";
import { err, fakeApi, json } from "./test-support";

/* Inbox adapter against an in-memory fake of the documented /capture contract (no network). */

interface FakeCapture { id: string; revision: number; type: string; text: string; voiceFileId: null; state: "INBOX" | "TRIAGED" | "ARCHIVED"; targetTaskId: string | null; targetNoteId: null; targetJournalId: null; createdAt: string }

function setup() {
  const items: FakeCapture[] = [];
  const state = { stale: false };
  const seed = (id: string, over: Partial<FakeCapture> = {}): FakeCapture => {
    const item: FakeCapture = { id, revision: 1, type: "DRAFT", text: `Text ${id}`, voiceFileId: null, state: "INBOX", targetTaskId: null, targetNoteId: null, targetJournalId: null, createdAt: `2026-11-1${items.length}T08:00:00.000Z`, ...over };
    items.push(item);
    return item;
  };
  const api = fakeApi((call, parts) => {
    if (call.method === "GET" && !parts[1]) return json({ items: items.filter((item) => item.state === call.query.state), nextCursor: null });
    if (call.method === "POST") return json(seed(`c${items.length + 1}`, { type: String(call.body.type), text: String(call.body.text) }), 201);
    const item = items.find((entry) => entry.id === parts[1]);
    if (!item) return err(404);
    if (call.method === "GET") return json(item);
    if (state.stale) {
      state.stale = false;
      item.revision += 1;
      return err(409);
    }
    if (call.ifMatch !== `"${item.revision}"`) return err(409);
    item.revision += 1;
    item.state = call.body.archive ? "ARCHIVED" : "INBOX";
    return json(item);
  });
  return { ...api, items, seed, state, inbox: createApiInboxRepository(api.client) };
}

describe("inbox adapter", () => {
  it("lists captures by state, newest first", async () => {
    const t = setup();
    t.seed("a", { type: "TASK" });
    t.seed("b", { state: "ARCHIVED" });
    t.seed("c", { state: "TRIAGED", targetTaskId: "t9" });
    t.seed("d", { type: "VOICE_MEMO" });

    expect((await t.inbox.list()).map((item) => [item.id, item.state])).toEqual([["d", "untriaged"], ["b", "archived"], ["a", "untriaged"]]);
    expect(await t.inbox.list("untriaged")).toMatchObject([{ id: "d", source: "voice" }, { id: "a", suggested: "task", source: "quick-add" }]);
    expect(await t.inbox.list("processed")).toMatchObject([{ id: "c", processedTo: "task", taskId: "t9" }]);
    expect(await t.inbox.list("snoozed")).toEqual([]);
    expect(await t.inbox.count()).toBe(2);
    expect(t.writes()).toEqual([]);
  });

  it("captures text with an idempotency key", async () => {
    const t = setup();
    const item = await t.inbox.capture({ text: " buy milk ", source: "brain-dump" });
    expect(item).toMatchObject({ text: "buy milk", source: "brain-dump", state: "untriaged" });
    expect(t.calls[0]).toMatchObject({ method: "POST", path: "/capture", body: { type: "DRAFT", text: "buy milk" } });
    expect(t.calls[0].key).toBeTruthy();
    await t.inbox.capture({ text: "idea", source: "note" });
    expect(t.calls[1].body).toMatchObject({ type: "NOTE" });
    await expect(t.inbox.capture({ text: "  " })).rejects.toMatchObject({ code: "invalid" });
    expect(t.calls.length).toBe(2);
  });

  it("stores processed and dropped as archived and restores them", async () => {
    const t = setup();
    t.seed("a");
    t.seed("b");
    await t.inbox.list();

    expect(await t.inbox.process("a", { to: "task", taskId: "t1" })).toMatchObject({ state: "processed", processedTo: "task", taskId: "t1" });
    expect(await t.inbox.drop("b")).toMatchObject({ state: "dropped" });
    expect(t.calls.filter((call) => call.method === "PATCH").map((call) => [call.path, call.body, call.ifMatch])).toEqual([["/capture/a", { archive: true }, '"1"'], ["/capture/b", { archive: true }, '"1"']]);
    expect(await t.inbox.list()).toEqual([]);
    expect((await t.inbox.list("processed")).map((item) => item.id)).toEqual(["a"]);
    expect((await t.inbox.list("dropped")).map((item) => item.id)).toEqual(["b"]);

    const restored = await t.inbox.restore(["a", "b"]);
    expect(restored.map((item) => [item.state, item.processedTo])).toEqual([["untriaged", undefined], ["untriaged", undefined]]);
    expect(t.items.every((item) => item.state === "INBOX")).toBe(true);
  });

  it("archives with one retry on a stale revision and skips what is already archived", async () => {
    const t = setup();
    t.seed("a");
    t.state.stale = true;
    expect(await t.inbox.archive(["a"])).toMatchObject([{ id: "a", state: "archived" }]);
    expect(t.writes()).toEqual(["PATCH /capture/a", "PATCH /capture/a"]);
    await t.inbox.archive(["a"]);
    expect(t.writes().length).toBe(2);
  });

  it("refuses snooze, converted captures and unknown ids", async () => {
    const t = setup();
    t.seed("c", { state: "TRIAGED" });
    await expect(t.inbox.snooze(["c"], "2026-11-13T08:00:00.000Z")).rejects.toMatchObject({ code: "unsupported" });
    await expect(t.inbox.restore(["c"])).rejects.toMatchObject({ code: "unsupported" });
    await expect(t.inbox.archive(["nope"])).rejects.toMatchObject({ code: "not-found" });
    expect(t.writes()).toEqual([]);
  });
});
