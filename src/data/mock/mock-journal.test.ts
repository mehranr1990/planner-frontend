import { describe, expect, it } from "vitest";
import { sampleDays } from "@/fixtures/personal";
import { createMockRepositories } from "./mock-repositories";
import { normalizeJournalTags as normalizeTags, rebaseJournalText } from "../domain";

const today = sampleDays.today;

describe("mock journal (P14)", () => {
  it("lists a month newest first, merges written text onto check-ins and keeps today check-in only", async () => {
    const { journal } = createMockRepositories();
    const month = await journal.entries("2026-09-23", "2026-10-22");
    expect(month.map((entry) => entry.day)).toEqual([today, "2026-10-12", "2026-10-11", "2026-10-10", "2026-10-09", "2026-10-08", "2026-10-07"]);
    expect(month[1]).toMatchObject({ mood: 4, energy: "medium", tags: ["walk"], text: expect.stringContaining("Long walk") });
    expect(month[0]).toMatchObject({ mood: 4, text: "", checkedInAt: expect.any(String) });
    expect(await journal.entry("2026-09-01")).toBeNull();
  });

  it("auto-save upserts text, tags and prompts; a mood change stamps the check-in; a blank entry disappears", async () => {
    const { journal } = createMockRepositories();
    const day = "2026-10-05";
    const saved = await journal.saveEntry(day, { text: "Quiet day", tags: ["#Calm", " calm ", ""], prompts: [{ id: "grateful", answer: "Tea" }] });
    expect(saved).toMatchObject({ text: "Quiet day", tags: ["calm"], mood: null, checkedInAt: null });
    const mood = await journal.saveEntry(day, { mood: 2 });
    expect(mood).toMatchObject({ mood: 2, energy: "medium", checkedInAt: expect.any(String) });
    expect(await journal.moods(day, day)).toHaveLength(1);
    await journal.saveEntry(day, { mood: null, text: "", tags: [], prompts: [] });
    expect(await journal.entry(day)).toBeNull();
    expect(normalizeTags(["#A", "a", "b"])).toEqual(["a", "b"]);
  });

  it("check-in and append return the previous entry so Undo can restore or remove", async () => {
    const { journal } = createMockRepositories();
    const fresh = await journal.append("2026-10-01", "  Idea from Brain Dump ");
    expect(fresh.previous).toBeNull();
    expect(fresh.entry.text).toBe("Idea from Brain Dump");
    const more = await journal.append("2026-10-01", "Second line");
    expect(more.entry.text).toBe("Idea from Brain Dump\nSecond line");
    await journal.restoreEntry(more.previous!);
    expect((await journal.entry("2026-10-01"))?.text).toBe("Idea from Brain Dump");
    await journal.removeEntry("2026-10-01");
    expect(await journal.entry("2026-10-01")).toBeNull();

    const checkIn = await journal.checkIn("2026-10-12", { mood: 5, energy: "high", note: "Sunny" });
    expect(checkIn.previous?.mood).toBe(4);
    expect(checkIn.entry).toMatchObject({ mood: 5, energy: "high", text: expect.stringMatching(/sheet\.\nSunny$/) });
    await expect(journal.checkIn(today, { mood: 0 as never, energy: "low" })).rejects.toMatchObject({ code: "invalid" });
    await expect(journal.append(today, "  ")).rejects.toMatchObject({ code: "invalid" });
    await expect(journal.removeEntry("2026-01-01")).rejects.toMatchObject({ code: "not-found" });
  });

  it("auto-save patches only the given fields: a newer mood from the sheet survives a text save", async () => {
    const { journal } = createMockRepositories();
    const day = "2026-10-12";
    const base = (await journal.entry(day))!;
    await journal.checkIn(day, { mood: 2, energy: "low" });
    const saved = await journal.saveEntry(day, { text: "Editor text", baseText: base.text });
    expect(saved).toMatchObject({ mood: 2, energy: "low", tags: base.tags, text: "Editor text" });
    const mood = await journal.saveEntry(day, { mood: 5, energy: "high" });
    expect(mood).toMatchObject({ mood: 5, energy: "high", text: "Editor text", tags: base.tags });
  });

  it("an editor text save re-appends Inbox / Brain Dump / note lines that arrived after its base", async () => {
    const { journal } = createMockRepositories();
    const day = "2026-10-01";
    await journal.saveEntry(day, { text: "Morning", baseText: "" });
    await journal.append(day, "From Inbox");
    await journal.checkIn(day, { mood: 3, energy: "medium", note: "Sheet word" });
    const saved = await journal.saveEntry(day, { text: "Morning, then a calm afternoon", baseText: "Morning" });
    expect(saved.text).toBe("Morning, then a calm afternoon\nFrom Inbox\nSheet word");
    expect(saved.mood).toBe(3);
    // Rebased again from the editor's own saved text: nothing doubles.
    await journal.append(day, "Brain Dump line");
    const again = await journal.saveEntry(day, { text: "Morning, then a calm afternoon.", baseText: "Morning, then a calm afternoon" });
    expect(again.text).toBe("Morning, then a calm afternoon.\nFrom Inbox\nSheet word\nBrain Dump line");
    // Undo of an append still restores the entry before it.
    const appended = await journal.append(day, "Undo me");
    await journal.restoreEntry(appended.previous!);
    expect((await journal.entry(day))?.text).toBe(again.text);
  });

  it("rebases onto an empty base and leaves a diverged stored text to the editor", () => {
    expect(rebaseJournalText("Mine", "", "Inbox line")).toBe("Mine\nInbox line");
    expect(rebaseJournalText("Mine", "Old", "Old")).toBe("Mine");
    expect(rebaseJournalText("Mine", "Old", "Rewritten")).toBe("Mine");
    expect(rebaseJournalText("Mine", "Old", "Older")).toBe("Mine");
  });

  it("Shutdown's reflection keeps what was already written", async () => {
    const { journal } = createMockRepositories();
    await journal.saveReflection("2026-10-12", { mood: 3, energy: "low", wentWell: "Walk", note: "Tired" });
    expect(await journal.entry("2026-10-12")).toMatchObject({ mood: 3, wentWell: "Walk", text: expect.stringMatching(/^Long walk.*\nTired$/s) });
  });
});
