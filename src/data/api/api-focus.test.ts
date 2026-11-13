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
});
