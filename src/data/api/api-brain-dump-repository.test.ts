import { describe, expect, it, vi } from "vitest";
import { RepositoryError } from "../repositories";
import { createApiBrainDumpRepository } from "./api-brain-dump-repository";
import { err, fakeApi, json } from "./test-support";

/* Brain Dump adapter against an in-memory fake of the /brain-dump/pages contract (no network). */

interface Line { id: string; text: string; sortedTo: string | null; sortedDay: string | null; targetId: string | null; struck: boolean }

const DAY = "2026-11-14";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function setup() {
  let lines: Line[] = [];
  let captures = 0;
  const line = (n: number, text: string, over: Partial<Line> = {}): Line => ({ id: id(n), text, sortedTo: null, sortedDay: null, targetId: null, struck: false, ...over });
  const page = () => ({ day: DAY, lines, savedAt: lines.length ? "2026-11-14T08:00:00.000Z" : null, revision: 1 });
  const api = fakeApi((call, parts) => {
    if (parts[2] === undefined) return json({ items: [{ day: "2026-11-10", lineCount: 3, unsortedCount: 1 }] });
    if (parts[2] !== DAY) return err(400, "invalid_format");
    const ids = (call.body.ids as string[] | undefined) ?? [];
    const pick = (fn: (l: Line) => Line) => {
      if (ids.some((x) => !lines.some((l) => l.id === x))) return err(404);
      lines = lines.map((l) => (ids.includes(l.id) ? fn(l) : l));
      return json(page());
    };
    switch (`${call.method} ${parts[3] ?? ""}`) {
      case "GET ":
        return json(page());
      case "PUT ":
        lines = (call.body.lines as { id: string; text: string }[]).map((l) => ({ ...(lines.find((x) => x.id === l.id) ?? line(0, "")), id: l.id, text: l.text }));
        return json(page());
      case "POST lines": {
        const added = line(0, String(call.body.text), { id: String(call.body.id) });
        lines.push(added);
        return json(added, 201);
      }
      case "POST sort":
        return pick((l) => ({ ...l, sortedTo: String(call.body.to), sortedDay: (call.body.day as string) ?? null, targetId: (call.body.targetId as string) ?? null }));
      case "POST strike":
        return pick((l) => ({ ...l, struck: Boolean(call.body.struck) }));
      case "POST unsort":
        return pick((l) => ({ ...l, sortedTo: null, sortedDay: null, targetId: null }));
      case "POST send-to-inbox":
        return pick((l) => ({ ...l, sortedTo: "INBOX", targetId: id(900 + ++captures) }));
      case "POST remove": {
        const removed = lines.map((l, position) => ({ ...l, position })).filter((l) => ids.includes(l.id));
        lines = lines.filter((l) => !ids.includes(l.id));
        return json({ page: page(), removed });
      }
      case "POST restore": {
        for (const back of call.body.lines as (Line & { position: number })[]) {
          const { position, ...rest } = back;
          lines.splice(Math.min(position, lines.length), 0, rest);
        }
        return json(page());
      }
    }
    return err(500);
  });
  const inbox = { drop: vi.fn(async () => ({}) as never) };
  const repo = createApiBrainDumpRepository(api.client, { today: () => DAY, inbox });
  return { ...api, repo, inbox, seed: (next: Line[]) => (lines = next), line, get lines() { return lines; } };
}

describe("brain dump adapter", () => {
  it("lists pages newest first and always includes today", async () => {
    const t = setup();
    expect(await t.repo.pages()).toEqual([
      { day: DAY, lineCount: 0, unsortedCount: 0 },
      { day: "2026-11-10", lineCount: 3, unsortedCount: 1 },
    ]);
  });

  it("reads a page with destinations mapped to the domain", async () => {
    const t = setup();
    t.seed([t.line(1, "Call dentist", { sortedTo: "TASK", targetId: id(50), sortedDay: "2026-11-15" }), t.line(2, "Book", { sortedTo: "INBOX", targetId: id(60) }), t.line(3, "x", { struck: true })]);
    const page = await t.repo.page(DAY);
    expect(page.lines).toEqual([
      { id: id(1), text: "Call dentist", sortedTo: "task", sortedDay: "2026-11-15", taskId: id(50) },
      { id: id(2), text: "Book", sortedTo: "inbox", inboxItemId: id(60) },
      { id: id(3), text: "x", struck: true },
    ]);
  });

  it("rejects a bad day and non-uuid ids without a request", async () => {
    const t = setup();
    await expect(t.repo.page("14-11-2026")).rejects.toMatchObject({ code: "invalid" });
    await expect(t.repo.save(DAY, [{ id: "bd-1", text: "a" }])).rejects.toBeInstanceOf(RepositoryError);
    expect(t.calls).toHaveLength(0);
  });

  it("auto-saves lines in order without trailing blanks, and appends a thought", async () => {
    const t = setup();
    const page = await t.repo.save(DAY, [{ id: id(1), text: "one" }, { id: id(2), text: "  " }]);
    expect(t.calls[0]!.body).toEqual({ lines: [{ id: id(1), text: "one" }] });
    expect(page.lines).toHaveLength(1);
    const added = await t.repo.add(DAY, "  from inbox ");
    expect(added.text).toBe("from inbox");
    await expect(t.repo.add(DAY, " ")).rejects.toMatchObject({ code: "invalid" });
  });

  it("sorts with the created task as target, strikes, and sends to Inbox through the server", async () => {
    const t = setup();
    t.seed([t.line(1, "a"), t.line(2, "b")]);
    let page = await t.repo.sort(DAY, [id(1)], { to: "task", day: "2026-11-15", taskId: id(70) });
    expect(t.calls.at(-1)!.body).toEqual({ ids: [id(1)], to: "TASK", day: "2026-11-15", targetId: id(70) });
    expect(page.lines[0]).toMatchObject({ sortedTo: "task", taskId: id(70) });
    page = await t.repo.strike(DAY, [id(2)], true);
    expect(page.lines[1]!.struck).toBe(true);
    page = await t.repo.sendToInbox(DAY, [id(2)]);
    expect(page.lines[1]).toMatchObject({ sortedTo: "inbox", inboxItemId: id(901) });
    await expect(t.repo.sort(DAY, [id(99)], { to: "note" })).rejects.toMatchObject({ code: "not-found" });
  });

  it("unsort drops the capture a send created", async () => {
    const t = setup();
    t.seed([t.line(1, "a", { sortedTo: "INBOX", targetId: id(60) })]);
    const page = await t.repo.unsort(DAY, [id(1)]);
    expect(page.lines[0]!.sortedTo).toBeUndefined();
    expect(t.inbox.drop).toHaveBeenCalledWith(id(60));
  });

  it("removes and restores lines at their positions", async () => {
    const t = setup();
    t.seed([t.line(1, "a"), t.line(2, "b", { sortedTo: "NOTE" }), t.line(3, "c")]);
    const { page, restore } = await t.repo.remove(DAY, [id(2)]);
    expect(page.lines.map((l) => l.id)).toEqual([id(1), id(3)]);
    expect(restore).toMatchObject({ day: DAY, positions: [1], inboxItemIds: [] });
    const back = await t.repo.restore(restore);
    expect(back.lines.map((l) => l.id)).toEqual([id(1), id(2), id(3)]);
    expect(back.lines[1]!.sortedTo).toBe("note");
  });

  it("clears to the Inbox (send + remove) and undoes it, dropping the captures", async () => {
    const t = setup();
    t.seed([t.line(1, "a", { sortedTo: "TASK", targetId: id(70) }), t.line(2, "b"), t.line(3, "c", { struck: true })]);
    const moved = await t.repo.clear(DAY, "inbox");
    expect(t.writes()).toEqual([`POST /brain-dump/pages/${DAY}/send-to-inbox`, `POST /brain-dump/pages/${DAY}/remove`]);
    expect(moved.page.lines).toHaveLength(0);
    expect(moved.restore.inboxItemIds).toEqual([id(901)]);
    const undone = await t.repo.restore(moved.restore);
    expect(t.inbox.drop).toHaveBeenCalledWith(id(901));
    expect(undone.lines.map((l) => l.sortedTo)).toEqual(["task", undefined, undefined]);
  });

  it("keep leaves the unsorted lines on the page", async () => {
    const t = setup();
    t.seed([t.line(1, "a", { struck: true }), t.line(2, "b")]);
    const kept = await t.repo.clear(DAY, "keep");
    expect(kept.page.lines.map((l) => l.id)).toEqual([id(2)]);
  });
});
