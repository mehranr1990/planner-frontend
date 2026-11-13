import { describe, expect, it } from "vitest";
import { dayOfInstant } from "@/lib/dates/clock-time";
import { createApiFocus } from "./api-focus";
import { revisionTag } from "./api-shared";
import { liveConfigured, liveSession } from "./live-support";

/* Phase 07 live check (skipped unless configured, see live-support.ts): two finished cycles become two time entries counted on the day; the entries are voided afterwards. */

describe.skipIf(!liveConfigured)("live focus stats", () => {
  it("records finished cycles as time entries and counts them on the day", { timeout: 120_000 }, async () => {
    const { client, end } = await liveSession();
    const recorded = async () => (await client.request("get", "/api/v1/time-entries", { query: { limit: "100", state: "RECORDED" } })).data.items;
    const before = new Set((await recorded()).map((entry) => entry.id));
    try {
      // Both cycles end in the last minutes, on the day the later one ends.
      const now = Date.now() - 2000;
      const day = dayOfInstant(new Date(now).toISOString());
      const spans = [{ endAt: now - 120_000, ms: 60_000 }, { endAt: now, ms: 90_000 }];
      const sameDay = dayOfInstant(new Date(spans[0]!.endAt - spans[0]!.ms).toISOString()) === day;

      const start = await createApiFocus(client).focusToday(day);
      const focus = createApiFocus(client);
      const after = await focus.recordFocusSessions(day, { count: 2, cycle: 3, spans });
      expect(after.cycle).toBe(3);
      if (sameDay) expect(after.sessionsCompleted).toBe(start.sessionsCompleted + 2);
      // A fresh adapter reads the same count from the server (its cycle position is browser state).
      expect((await createApiFocus(client).focusToday(day)).sessionsCompleted).toBe(after.sessionsCompleted);

      const created = (await recorded()).filter((entry) => !before.has(entry.id));
      expect(created).toHaveLength(2);
      expect(created.map((entry) => Date.parse(entry.endAt) - Date.parse(entry.startAt)).sort((a, b) => a - b)).toEqual([60_000, 90_000]);

      // Without actual times nothing is written.
      await expect(focus.recordFocusSessions(day, { count: 1, cycle: 4 })).rejects.toMatchObject({ code: "unsupported" });
      expect((await recorded()).filter((entry) => !before.has(entry.id))).toHaveLength(2);
    } finally {
      for (const entry of (await recorded()).filter((item) => !before.has(item.id))) {
        await client.request("delete", "/api/v1/time-entries/{id}", { path: { id: entry.id }, header: { "If-Match": revisionTag(entry.revision) } }).catch(() => undefined);
      }
      end();
    }
  });
});
