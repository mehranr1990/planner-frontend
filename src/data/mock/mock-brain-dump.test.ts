import { describe, expect, it } from "vitest";
import { SAMPLE_DAY } from "@/fixtures/personal/sample-day";
import { createMockRepositories } from "./mock-repositories";

const day = SAMPLE_DAY;

describe("mock brain dump repository", () => {
  it("lists pages newest first with line and unsorted counts", async () => {
    const { brainDump } = createMockRepositories();
    const pages = await brainDump.pages();
    expect(pages.map((page) => page.day)).toEqual([day, "2026-10-12", "2026-10-11", "2026-10-08"]);
    expect(pages[0]).toEqual({ day, lineCount: 8, unsortedCount: 5 });
    expect(pages[1]).toMatchObject({ lineCount: 4, unsortedCount: 0 });
    expect(pages[2]).toMatchObject({ lineCount: 12, unsortedCount: 5 });
  });

  it("always lists today and serves an empty page for a day without one", async () => {
    const { brainDump } = createMockRepositories({ fixtures: { brainDump: [] } });
    expect(await brainDump.pages()).toEqual([{ day, lineCount: 0, unsortedCount: 0 }]);
    expect(await brainDump.page("2026-10-01")).toEqual({ day: "2026-10-01", lines: [], savedAt: null });
    await expect(brainDump.page("nope")).rejects.toMatchObject({ code: "invalid" });
  });

  it("saves lines by id, keeping sort tags and dropping trailing blanks", async () => {
    const { brainDump } = createMockRepositories();
    const saved = await brainDump.save(day, [
      { id: "bd-lease", text: "lease — call ali" },
      { id: "new-1", text: "fresh thought" },
      { id: "new-2", text: "  " },
    ]);
    expect(saved.lines).toEqual([
      { id: "bd-lease", text: "lease — call ali", sortedTo: "task", sortedDay: "2026-10-15" },
      { id: "new-1", text: "fresh thought" },
    ]);
    expect(saved.savedAt).not.toBeNull();
    await expect(brainDump.save(day, [{ id: "a", text: "x" }, { id: "a", text: "y" }])).rejects.toMatchObject({ code: "invalid" });
  });

  it("sorts, strikes and unsorts lines", async () => {
    const { brainDump } = createMockRepositories();
    let page = await brainDump.sort(day, ["bd-gift"], { to: "task", day: "2026-10-14", taskId: "t-1" });
    expect(page.lines.find((line) => line.id === "bd-gift")).toMatchObject({ sortedTo: "task", sortedDay: "2026-10-14", taskId: "t-1" });
    page = await brainDump.strike(day, ["bd-dentist"], true);
    expect(page.lines.find((line) => line.id === "bd-dentist")?.struck).toBe(true);
    page = await brainDump.unsort(day, ["bd-gift", "bd-dentist"]);
    expect(page.lines.find((line) => line.id === "bd-gift")).toEqual({ id: "bd-gift", text: "birthday gift for sara — she mentioned ceramics" });
    await expect(brainDump.sort(day, ["missing"], { to: "note" })).rejects.toMatchObject({ code: "not-found" });
  });

  it("sends lines to the Inbox as brain-dump captures; unsort drops them again", async () => {
    const { brainDump, inbox } = createMockRepositories();
    const before = await inbox.count();
    const page = await brainDump.sendToInbox(day, ["bd-book"]);
    const line = page.lines.find((item) => item.id === "bd-book")!;
    expect(line.sortedTo).toBe("inbox");
    const items = await inbox.list("untriaged");
    expect(items.find((item) => item.id === line.inboxItemId)).toMatchObject({ source: "brain-dump", text: line.text });
    expect(await inbox.count()).toBe(before + 1);
    await brainDump.unsort(day, ["bd-book"]);
    expect(await inbox.count()).toBe(before);
  });

  it("appends a thought from the Inbox and removes / restores lines in place", async () => {
    const { brainDump } = createMockRepositories();
    const line = await brainDump.add(day, "  from the inbox ");
    expect(line.text).toBe("from the inbox");
    await expect(brainDump.add(day, " ")).rejects.toMatchObject({ code: "invalid" });
    const { page, restore } = await brainDump.remove(day, ["bd-dashboard"]);
    expect(page.lines.some((item) => item.id === "bd-dashboard")).toBe(false);
    const back = await brainDump.restore(restore);
    expect(back.lines[1]?.id).toBe("bd-dashboard");
  });

  it("clears a page three ways and restores it", async () => {
    const repositories = createMockRepositories();
    const { brainDump, inbox } = repositories;
    const keep = await brainDump.clear(day, "keep");
    expect(keep.page.lines.map((line) => line.id)).toEqual(["bd-dashboard", "bd-gift", "bd-book", "bd-dentist", "bd-gym"]);
    const restored = await brainDump.restore(keep.restore);
    expect(restored.lines).toHaveLength(10);

    const before = await inbox.count();
    const moved = await brainDump.clear(day, "inbox");
    expect(moved.page.lines).toEqual([]);
    expect(moved.restore.inboxItemIds).toHaveLength(5);
    expect(await inbox.count()).toBe(before + 5);
    const undone = await brainDump.restore(moved.restore);
    expect(await inbox.count()).toBe(before);
    expect(undone.lines.find((line) => line.id === "bd-gift")?.sortedTo).toBeUndefined();

    const all = await brainDump.clear(day, "archive");
    expect(all.page.lines).toEqual([]);
    expect((await brainDump.pages())[0]).toEqual({ day, lineCount: 0, unsortedCount: 0 });
  });
});
