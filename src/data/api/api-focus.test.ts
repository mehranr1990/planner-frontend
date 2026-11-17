import { describe, expect, it } from "vitest";
import { createApiFocus } from "./api-focus";
import { err, fakeApi, json } from "./test-support";

/* Focus stats adapter against an in-memory fake of /time-entries and /productivity/summary (no network). */

const DAY = "2026-11-12";
const END = Date.parse("2026-11-12T09:25:00.000Z");

function setup(reject = false) {
  let entries = 2;
  const api = fakeApi((call, parts) => {
    if (parts[0] === "productivity") return json({ days: call.query.from === DAY ? [{ localDate: DAY, entryCount: entries }] : [] });
    if (reject) return err(400);
    entries += 1;
    return json({ id: `e${entries}` }, 201);
  });
  return { ...api, focus: createApiFocus(api.client) };
}

describe("focus adapter", () => {
  it("reads the day's recorded entries as finished sessions", async () => {
    const t = setup();
    expect(await t.focus.focusToday(DAY)).toEqual({ sessionsCompleted: 2, cycle: 1 });
    expect(t.calls[0].query).toMatchObject({ from: DAY, to: "2026-11-13" });
    expect(await t.focus.focusToday("2026-11-20")).toEqual({ sessionsCompleted: 0, cycle: 1 });
    await expect(t.focus.focusToday("nope")).rejects.toMatchObject({ code: "invalid" });
  });

  it("records each finished cycle as a manual entry with its actual times", async () => {
    const t = setup();
    const summary = await t.focus.recordFocusSessions(DAY, { count: 2, cycle: 3, spans: [{ endAt: END, ms: 25 * 60_000 }, { endAt: END + 1, ms: 10 }] });
    expect(summary).toEqual({ sessionsCompleted: 3, cycle: 3 });
    const posts = t.calls.filter((call) => call.method === "POST");
    expect(posts.length).toBe(1);
    expect(posts[0]).toMatchObject({ path: "/time-entries", body: { startAt: "2026-11-12T09:00:00.000Z", endAt: "2026-11-12T09:25:00.000Z" } });
    expect(posts[0].key).toBeTruthy();
    expect((await t.focus.focusToday(DAY)).cycle).toBe(3);
  });

  it("writes nothing without actual times or for bad input", async () => {
    const t = setup();
    await expect(t.focus.recordFocusSessions(DAY, { count: 1, cycle: 2 })).rejects.toMatchObject({ code: "unsupported" });
    await expect(t.focus.recordFocusSessions(DAY, { count: 0, cycle: 1, spans: [] })).rejects.toMatchObject({ code: "invalid" });
    await expect(t.focus.recordFocusSessions("nope", { count: 1, cycle: 1, spans: [{ endAt: END, ms: 60_000 }] })).rejects.toMatchObject({ code: "invalid" });
    expect(t.calls.length).toBe(0);
  });

  it("reports a rejected entry instead of counting it", async () => {
    const t = setup(true);
    await expect(t.focus.recordFocusSessions(DAY, { count: 1, cycle: 2, spans: [{ endAt: END, ms: 60_000 }] })).rejects.toMatchObject({ code: "invalid" });
  });

  it("does not write a manual entry for a cycle its recoverable session recorded", async () => {
    const t = setup();
    t.focus.focusRecovery!.claim(END);
    await t.focus.recordFocusSessions(DAY, { count: 2, cycle: 2, spans: [{ endAt: END, ms: 25 * 60_000 }, { endAt: END + 60_000, ms: 25 * 60_000 }] });
    const posts = t.calls.filter((call) => call.method === "POST");
    expect(posts.map((call) => call.body.endAt)).toEqual(["2026-11-12T09:26:00.000Z"]);
  });
});

describe("recoverable focus sessions", () => {
  const session = (patch: Record<string, unknown> = {}) => ({ id: "00000000-0000-4000-8000-000000000001", revision: 1, state: "IDLE", recoveryState: "READY", workMs: 0, ...patch });

  it("creates a recoverable stopwatch session", async () => {
    const api = fakeApi((call) => {
      expect(call.body).toMatchObject({ title: "Focus", mode: "STOPWATCH", recoverable: true });
      expect(call.key).toBeTruthy();
      return json(session(), 201);
    });
    expect(await createApiFocus(api.client).focusRecovery!.create("Focus")).toEqual({ id: session().id, revision: 1, state: "IDLE", recoveryState: "READY", workMs: 0 });
  });

  it("sends commands with If-Match and keeps the same retry key after a stale revision", async () => {
    const keys: (string | null)[] = [];
    let first = true;
    const api = fakeApi((call) => {
      if (call.method === "GET") return json(session({ revision: 4 }));
      keys.push(call.key);
      if (first) {
        first = false;
        expect(call.ifMatch).toBe(`"1"`);
        return err(409);
      }
      expect(call.ifMatch).toBe(`"4"`);
      expect(call.body).toEqual({ action: "HEARTBEAT" });
      return json(session({ revision: 5, state: "RUNNING", recoveryState: "HEALTHY" }));
    });
    const next = await createApiFocus(api.client).focusRecovery!.command({ id: session().id, revision: 1, state: "RUNNING", recoveryState: "HEALTHY", workMs: 0 }, "HEARTBEAT", "k-1");
    expect(next).toMatchObject({ revision: 5, recoveryState: "HEALTHY" });
    expect(keys).toEqual(["k-1", "k-1"]);
  });

  it("sends EXTEND minutes and refuses EXTEND without them", async () => {
    const api = fakeApi((call) => {
      expect(call.body).toEqual({ action: "EXTEND", minutes: 5 });
      return json(session({ revision: 2, state: "RUNNING" }));
    });
    const recovery = createApiFocus(api.client).focusRecovery!;
    const running = { id: session().id, revision: 1, state: "RUNNING" as const, recoveryState: "HEALTHY" as const, workMs: 0 };
    await recovery.command(running, "EXTEND", "k", 5);
    await expect(recovery.command(running, "EXTEND", "k")).rejects.toMatchObject({ code: "invalid" });
  });
});
