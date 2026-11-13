import { describe, expect, it } from "vitest";
import { createApiJournalRepository, decodeJournalContent, encodeJournalContent } from "./api-journal-repository";
import { err, fakeApi, json, type FakeCall } from "./test-support";

/* Journal adapter against an in-memory fake of the documented daily check-in and mood contract (no network). */

const TODAY = "2026-11-12";
const AT = "2026-11-12T08:00:00.000Z";

interface FakeEntry { id: string; revision: number; localDate: string; content: { format: "MARKDOWN"; version: 1; content: string }; deleted: boolean; recordedAt: string; kind: "CHECK_IN" }
interface FakeMood { id: string; revision: number; localDate: string; mood: number; energy: number | null; note: null; journalEntryId: string | null; state: "RECORDED" | "VOID"; recordedAt: string }

function setup() {
  const entries: FakeEntry[] = [];
  const moods: FakeMood[] = [];
  let seq = 0;
  const state = { conflictOnce: false };
  const stamp = () => `2026-11-12T09:00:${String(++seq).padStart(2, "0")}.000Z`;
  const addMood = (body: FakeCall["body"], localDate: string, journalEntryId: string | null): FakeMood => {
    const mood: FakeMood = { id: `m${++seq}`, revision: 1, localDate, mood: Number(body.mood), energy: (body.energy as number | null) ?? null, note: null, journalEntryId, state: "RECORDED", recordedAt: stamp() };
    moods.push(mood);
    return mood;
  };
  const inRange = (day: string, query: FakeCall["query"]) => (!query.from || day >= query.from) && (!query.to || day < query.to);

  const api = fakeApi((call, parts) => {
    const { method, body, query } = call;
    if (parts[0] === "moods") {
      if (method === "GET") return json({ items: moods.filter((mood) => mood.state === "RECORDED" && inRange(mood.localDate, query)), nextCursor: null });
      if (method === "POST") return json(addMood(body, String(body.localDate), (body.journalEntryId as string) ?? null), 201);
      const mood = moods.find((item) => item.id === parts[1])!;
      if (call.ifMatch !== `"${mood.revision}"`) return err(409);
      mood.revision += 1;
      mood.recordedAt = stamp();
      if (body.void) mood.state = "VOID";
      else Object.assign(mood, body);
      return json(mood);
    }
    if (parts[1] === "daily-checkins") {
      if (method === "POST") {
        if (String(body.localDate) > TODAY) return err(400);
        if (entries.some((item) => item.localDate === body.localDate && !item.deleted)) return err(409);
        const entry: FakeEntry = { id: `e${++seq}`, revision: 1, localDate: String(body.localDate), content: body.content as FakeEntry["content"], deleted: false, recordedAt: stamp(), kind: "CHECK_IN" };
        entries.push(entry);
        const mood = body.mood ? addMood(body.mood as FakeCall["body"], entry.localDate, entry.id) : null;
        return json({ id: entry.id, revision: entry.revision, entry, mood }, 201);
      }
      if (parts[2]) {
        const entry = entries.find((item) => item.localDate === parts[2] && !item.deleted);
        if (!entry) return err(404);
        return json({ id: entry.id, revision: entry.revision, entry, mood: moods.findLast((mood) => mood.journalEntryId === entry.id && mood.state === "RECORDED") ?? null });
      }
      return json({ items: entries.filter((item) => !item.deleted && inRange(item.localDate, query)), nextCursor: null });
    }
    // /journal/entries/{id}
    const entry = entries.find((item) => item.id === parts[2])!;
    if (state.conflictOnce) {
      state.conflictOnce = false;
      entry.revision += 1;
      entry.content = { ...entry.content, content: `${entry.content.content}\nfrom elsewhere` };
      return err(409);
    }
    if (call.ifMatch !== `"${entry.revision}"`) return err(409);
    entry.revision += 1;
    entry.recordedAt = stamp();
    if (method === "DELETE") entry.deleted = true;
    else Object.assign(entry, body);
    return json(entry);
  });
  const seedEntry = (localDate: string, content: string): FakeEntry => {
    const entry: FakeEntry = { id: `e${++seq}`, revision: 1, localDate, content: { format: "MARKDOWN", version: 1, content }, deleted: false, recordedAt: AT, kind: "CHECK_IN" };
    entries.push(entry);
    return entry;
  };
  return { ...api, entries, moods, state, seedEntry, addMood, journal: createApiJournalRepository(api.client, { today: () => TODAY }) };
}

describe("journal content", () => {
  it("round-trips every field through the one Markdown text", () => {
    const entry = { text: "Line one\n## Went well\n\\## Tags\n", wentWell: "Slept\nwell", prompts: [{ id: "grateful for", answer: "" }, { id: "p2", answer: "A\n\nB" }], tags: ["work", "calm"] };
    expect(decodeJournalContent(encodeJournalContent(entry))).toEqual(entry);
    expect(decodeJournalContent("plain")).toEqual({ text: "plain", wentWell: "", prompts: [], tags: [] });
    expect(encodeJournalContent({ text: "only", wentWell: " ", prompts: [], tags: [] })).toBe("only");
  });
});

describe("journal adapter", () => {
  it("creates the day's check-in with its mood in one request", async () => {
    const t = setup();
    const change = await t.journal.checkIn(TODAY, { mood: 4, energy: "high", note: " calm " });
    expect(change.previous).toBeNull();
    expect(change.entry).toMatchObject({ day: TODAY, mood: 4, energy: "high", text: "calm" });
    expect(change.entry.checkedInAt).toBeTruthy();
    expect(t.writes()).toEqual(["POST /journal/daily-checkins"]);
    const post = t.calls.find((call) => call.method === "POST")!;
    expect(post.body).toMatchObject({ localDate: TODAY, content: { format: "MARKDOWN", version: 1, content: "calm" }, mood: { mood: 4, energy: 5 } });
    expect(post.key).toBeTruthy();
  });

  it("saves fields over the stored entry and rebases appended lines", async () => {
    const t = setup();
    t.seedEntry(TODAY, "first");
    await t.journal.append(TODAY, "from inbox");
    const saved = await t.journal.saveEntry(TODAY, { text: "first edited", baseText: "first", wentWell: "ww", tags: ["#Work"], mood: 2 });
    expect(saved).toMatchObject({ text: "first edited\nfrom inbox", wentWell: "ww", tags: ["work"], mood: 2, energy: "medium" });
    expect(t.writes()).toEqual(["PATCH /journal/entries/e1", "PATCH /journal/entries/e1", "POST /moods"]);
    expect(t.calls.findLast((call) => call.method === "POST")!.body).toMatchObject({ mood: 2, energy: 3, journalEntryId: "e1", localDate: TODAY });

    // Unchanged text → only the mood moves; clearing the mood voids it.
    await t.journal.saveEntry(TODAY, { energy: "low" });
    expect(t.writes().slice(3)).toEqual([expect.stringMatching(/^PATCH \/moods\//)]);
    expect((await t.journal.saveEntry(TODAY, { mood: null })).energy).toBeNull();
    expect(t.moods[0].state).toBe("VOID");
    expect((await t.journal.entry(TODAY))?.checkedInAt).toBeNull();
  });

  it("repeats the intent on fresh data after a 409", async () => {
    const t = setup();
    t.seedEntry(TODAY, "mine");
    t.state.conflictOnce = true;
    const { entry } = await t.journal.append(TODAY, "added");
    expect(entry.text).toBe("mine\nfrom elsewhere\nadded");
    expect(t.writes().length).toBe(2);
  });

  it("lists entries and mood rows for a range, without the future", async () => {
    const t = setup();
    const a = t.seedEntry("2026-11-10", encodeJournalContent({ text: "t", wentWell: "good", prompts: [], tags: [] }));
    t.addMood({ mood: 5, energy: 1 }, "2026-11-10", a.id);
    t.addMood({ mood: 3 }, "2026-11-11", null);
    t.seedEntry(TODAY, "");

    const entries = await t.journal.entries("2026-11-01", "2026-11-30");
    expect(entries.map((entry) => [entry.day, entry.mood, entry.energy])).toEqual([["2026-11-11", 3, "medium"], ["2026-11-10", 5, "low"]]);
    expect(t.calls[0].query).toMatchObject({ from: "2026-11-01", to: "2026-11-13" });
    expect(await t.journal.moods("2026-11-01", "2026-11-30")).toMatchObject([{ day: "2026-11-10", mood: 5, energy: "low", wentWell: "good" }, { day: "2026-11-11", mood: 3 }]);
    const before = t.calls.length;
    expect(await t.journal.entries("2026-12-01", "2026-12-31")).toEqual([]);
    expect(await t.journal.entry("2026-12-01")).toBeNull();
    expect(t.calls.length).toBe(before);
  });

  it("saves Shutdown's reflection and returns the mood row", async () => {
    const t = setup();
    const row = await t.journal.saveReflection(TODAY, { mood: 4, energy: "medium", wentWell: " shipped ", note: "tired" });
    expect(row).toMatchObject({ day: TODAY, mood: 4, energy: "medium", wentWell: "shipped", note: "tired" });
    expect(await t.journal.entry(TODAY)).toMatchObject({ text: "tired", wentWell: "shipped" });
  });

  it("removes the day and restores it as a new check-in", async () => {
    const t = setup();
    await t.journal.checkIn(TODAY, { mood: 4, energy: "high", note: "x" });
    const removed = await t.journal.removeEntry(TODAY);
    expect(removed).toMatchObject({ text: "x", mood: 4 });
    expect(t.writes().slice(1)).toEqual([expect.stringMatching(/^DELETE \/journal\/entries\//), expect.stringMatching(/^PATCH \/moods\//)]);
    expect(await t.journal.entry(TODAY)).toBeNull();
    await expect(t.journal.removeEntry(TODAY)).rejects.toMatchObject({ code: "not-found" });

    expect(await t.journal.restoreEntry(removed)).toMatchObject({ text: "x", mood: 4, energy: "high" });
    expect(t.entries.filter((entry) => !entry.deleted).length).toBe(1);
  });

  it("rejects bad input before any request and maps API refusals", async () => {
    const t = setup();
    await expect(t.journal.saveEntry("nope", { text: "x" })).rejects.toMatchObject({ code: "invalid" });
    await expect(t.journal.checkIn(TODAY, { mood: 9 as never, energy: "high" })).rejects.toMatchObject({ code: "invalid" });
    await expect(t.journal.append(TODAY, "  ")).rejects.toMatchObject({ code: "invalid" });
    expect(t.calls.length).toBe(0);
    await expect(t.journal.append("2026-12-01", "future")).rejects.toMatchObject({ code: "invalid" });
  });
});
