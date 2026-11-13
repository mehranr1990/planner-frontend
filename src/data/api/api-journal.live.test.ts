import { describe, expect, it } from "vitest";
import { addDaysToDay } from "@/lib/dates/clock-time";
import { createApiJournalRepository } from "./api-journal-repository";
import { liveConfigured, liveSession } from "./live-support";

/*
 * Phase 08 live check (skipped unless configured, see live-support.ts) on a past day of the test
 * account: write → read → check-in → append → reflection → remove → Undo → remove (cleanup).
 */

describe.skipIf(!liveConfigured)("live journal", () => {
  it("entry, mood check-in, append, reflection, remove and restore", { timeout: 120_000 }, async () => {
    const { client, today, end } = await liveSession();
    const build = () => createApiJournalRepository(client, { today: () => today });
    const day = addDaysToDay(today, -3);
    try {
      // Leftovers of an interrupted run would make the day non-empty.
      await build().removeEntry(day).catch(() => undefined);
      expect(await build().entry(day)).toBeNull();

      const stamp = `P08 ${Date.now()}`;
      const saved = await build().saveEntry(day, { text: `${stamp}\n## Went well\nsecond line`, wentWell: "slept", tags: ["live", "p08"] });
      expect(saved).toMatchObject({ day, text: `${stamp}\n## Went well\nsecond line`, wentWell: "slept", tags: ["live", "p08"], mood: null });
      expect(await build().entry(day)).toMatchObject({ text: saved.text, wentWell: "slept", tags: ["live", "p08"] });

      // Mood check-in keeps the text and stamps the mood.
      const checked = await build().checkIn(day, { mood: 4, energy: "high", note: "ok" });
      expect(checked.previous).toMatchObject({ mood: null });
      expect(checked.entry).toMatchObject({ mood: 4, energy: "high", wentWell: "slept" });
      expect(await build().moods(day, day)).toMatchObject([{ day, mood: 4, energy: "high" }]);

      // Append (Inbox → Journal), then the shutdown reflection changes the mood.
      const appended = await build().append(day, "from inbox");
      expect(appended.entry.text.endsWith("from inbox")).toBe(true);
      expect(await build().saveReflection(day, { mood: 2, energy: "low", wentWell: "finished" })).toMatchObject({ day, mood: 2, energy: "low" });
      const full = await build().entry(day);
      expect(full).toMatchObject({ mood: 2, energy: "low", wentWell: "finished", tags: ["live", "p08"] });
      expect((await build().entries(day, day)).map((entry) => entry.day)).toEqual([day]);

      // Remove → nothing left; Undo puts the same content back.
      const removed = await build().removeEntry(day);
      expect(removed.text).toBe(full!.text);
      expect(await build().entry(day)).toBeNull();
      expect(await build().moods(day, day)).toEqual([]);
      const restored = await build().restoreEntry(removed);
      expect(restored).toMatchObject({ text: full!.text, wentWell: "finished", mood: 2, energy: "low", tags: ["live", "p08"] });

      // The API refuses future days: no entry, nothing written.
      expect(await build().entry(addDaysToDay(today, 1))).toBeNull();
    } finally {
      await build().removeEntry(day).catch(() => undefined);
      end();
    }
  });
});
