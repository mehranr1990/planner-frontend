import { describe, expect, it } from "vitest";
import { createApiHabitsRepository } from "./api-habits-repository";
import { revisionTag } from "./api-shared";
import { liveConfigured, liveSession } from "./live-support";

/* Phase 05 live check (skipped unless configured, see live-support.ts): create → done → mark → amount → edit → archive, then delete. */

describe.skipIf(!liveConfigured)("live habits", () => {
  it("create, check, skip, log an amount, edit, archive and restore", { timeout: 120_000 }, async () => {
    const { client, today, end } = await liveSession();
    const build = () => createApiHabitsRepository(client, { today: () => today });
    const made: string[] = [];
    try {
      const title = `P05 habit ${Date.now()}`;
      const habit = await build().create({ title, target: { amount: 8, unit: "glass" } });
      made.push(habit.id);
      expect(habit).toMatchObject({ title, target: { amount: 8, unit: "glass" } });
      const read = async () => (await build().list()).find((item) => item.id === habit.id);
      expect(await read()).toMatchObject({ title });

      // Done today, read back by a fresh adapter; then undone.
      const repo = build();
      expect((await repo.setDone(habit.id, today, true)).doneDays).toContain(today);
      expect((await read())?.doneDays).toContain(today);
      expect((await repo.setDone(habit.id, today, false)).doneDays).not.toContain(today);

      // Skip today, then clear the mark.
      const skipped = await build().setDayMark(habit.id, today, "skip");
      expect(skipped.skippedDays).toContain(today);
      expect((await build().setDayMark(habit.id, today, null)).skippedDays ?? []).not.toContain(today);

      // A partial amount is kept; the full target marks the day done.
      expect((await build().logAmount(habit.id, today, 3)).amounts?.[today]).toBe(3);
      const full = await build().logAmount(habit.id, today, 8);
      expect(full.doneDays).toContain(today);

      // Edit with a stale adapter (another one wrote since): recovers from the 409.
      const stale = build();
      await stale.list();
      await build().update(habit.id, { title: `${title} b` });
      expect((await stale.update(habit.id, { title: `${title} c` })).title).toBe(`${title} c`);

      // Archive leaves the active list; restore brings it back.
      await build().setArchived(habit.id, true);
      expect(await read()).toBeUndefined();
      await build().setArchived(habit.id, false);
      expect(await read()).toMatchObject({ title: `${title} c` });
    } finally {
      for (const id of made) {
        const { revision } = (await client.request("get", "/api/v1/habits/{id}", { path: { id } })).data;
        await client.request("delete", "/api/v1/habits/{id}", { path: { id }, header: { "If-Match": revisionTag(revision) } }).catch(() => undefined);
      }
      end();
    }
  });
});
