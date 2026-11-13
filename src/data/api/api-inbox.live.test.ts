import { describe, expect, it } from "vitest";
import { createApiInboxRepository } from "./api-inbox-repository";
import { liveConfigured, liveSession } from "./live-support";

/*
 * Phase 09 live check (skipped unless configured, see live-support.ts): capture → list / count →
 * archive (+409 recovery) → restore → process → drop → restore. Captures have no DELETE: the
 * test captures are left archived.
 */

describe.skipIf(!liveConfigured)("live inbox", () => {
  it("capture, list, archive, restore, process, drop", { timeout: 120_000 }, async () => {
    const { client, end } = await liveSession();
    const build = () => createApiInboxRepository(client);
    const made: string[] = [];
    try {
      const text = `P09 capture ${Date.now()}`;
      const count = await build().count();
      const item = await build().capture({ text: `  ${text}  `, source: "quick-add" });
      made.push(item.id);
      const note = await build().capture({ text: `${text} note`, source: "note" });
      made.push(note.id);
      expect(item).toMatchObject({ text, state: "untriaged" });
      expect(await build().count()).toBe(count + 2);
      const untriaged = await build().list("untriaged");
      expect(untriaged.find((entry) => entry.id === item.id)).toMatchObject({ text, state: "untriaged" });
      expect(untriaged.find((entry) => entry.id === note.id)).toMatchObject({ suggested: "note" });
      // Newest capture first.
      expect(untriaged.findIndex((entry) => entry.id === note.id)).toBeLessThan(untriaged.findIndex((entry) => entry.id === item.id));

      // Archive from an adapter holding an old revision (another one archived and restored since).
      const stale = build();
      await stale.list("untriaged");
      await build().archive([item.id]);
      await build().restore([item.id]);
      expect(await stale.archive([item.id])).toMatchObject([{ id: item.id, state: "archived" }]);
      expect((await build().list("archived")).some((entry) => entry.id === item.id)).toBe(true);
      expect(await build().count()).toBe(count + 1);
      expect(await build().restore([item.id])).toMatchObject([{ id: item.id, state: "untriaged" }]);

      // Processed and dropped leave triage; Undo brings them back.
      const page = build();
      expect(await page.process(item.id, { to: "journal" })).toMatchObject({ state: "processed", processedTo: "journal" });
      expect(await page.drop(note.id)).toMatchObject({ state: "dropped" });
      expect(await build().count()).toBe(count);
      expect((await page.restore([item.id, note.id])).map((entry) => entry.state)).toEqual(["untriaged", "untriaged"]);
      expect(await build().count()).toBe(count + 2);

      await expect(build().snooze([item.id], new Date(Date.now() + 3_600_000).toISOString())).rejects.toMatchObject({ code: "unsupported" });
    } finally {
      if (made.length) await build().archive(made).catch(() => undefined);
      end();
    }
  });
});
