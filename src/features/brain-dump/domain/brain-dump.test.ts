import { describe, expect, it } from "vitest";
import { lineBody, lineKind, mergeTags, pageDayOf, pageStats, parseLine, splitLines, toggleTodo } from "./brain-dump";

describe("brain dump domain", () => {
  it("starts a new page at 04:00", () => {
    expect(pageDayOf("2026-10-13T03:59:00+03:30")).toBe("2026-10-12");
    expect(pageDayOf("2026-10-13T04:00:00+03:30")).toBe("2026-10-13");
  });

  it("counts written, sorted and unsorted lines (blank lines are not lines)", () => {
    expect(
      pageStats([
        { id: "a", text: "one" },
        { id: "b", text: " " },
        { id: "c", text: "two", sortedTo: "note" },
        { id: "d", text: "three", struck: true },
      ]),
    ).toEqual({ lines: 3, sorted: 2, unsorted: 1 });
  });

  it("knows the Markdown shortcuts", () => {
    expect(lineKind("- milk")).toBe("bullet");
    expect(lineKind("[] milk")).toBe("todo");
    expect(lineKind("[x] milk")).toBe("done");
    expect(lineKind("milk")).toBe("plain");
    expect(lineBody("[] renew gym")).toBe("renew gym");
    expect(toggleTodo("[] a")).toBe("[x] a");
    expect(toggleTodo("[x] a")).toBe("[] a");
  });

  it("pre-fills the Convert popover from the line", () => {
    const parsed = parseLine("- call ali tomorrow", "2026-10-13");
    expect(parsed.title.startsWith("Call ali")).toBe(true);
    expect(parsed.date).toBe("2026-10-14");
  });

  it("takes the store's tags but keeps the draft text", () => {
    const merged = mergeTags(
      [
        { id: "a", text: "typing more", struck: true },
        { id: "b", text: "local only" },
      ],
      { day: "2026-10-13", savedAt: null, lines: [{ id: "a", text: "old", sortedTo: "inbox", inboxItemId: "i-1" }] },
    );
    expect(merged).toEqual([
      { id: "a", text: "typing more", sortedTo: "inbox", inboxItemId: "i-1" },
      { id: "b", text: "local only" },
    ]);
    expect(splitLines("a\r\nb\nc")).toEqual(["a", "b", "c"]);
  });
});
