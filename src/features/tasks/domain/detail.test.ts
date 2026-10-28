import { describe, expect, it } from "vitest";
import { detailTabs, nextOccurrence, openBlockers } from "./detail";

describe("task detail rules", () => {
  it("hides empty Activity and Links but always shows Subtasks and Notes", () => {
    expect(detailTabs({})).toEqual(["subtasks", "notes"]);
    expect(
      detailTabs({
        activity: [{ id: "a", at: "2026-10-13T09:00:00+03:30", kind: "scheduled", time: "14:00" }],
        links: [{ id: "f", kind: "file", name: "x.png", sizeBytes: 1 }],
      }),
    ).toEqual(["subtasks", "notes", "activity", "links"]);
  });

  it("only open blocked-by dependencies warn", () => {
    const blockers = openBlockers({
      links: [
        { id: "1", kind: "blockedBy", taskId: "a", title: "A", done: false },
        { id: "2", kind: "blockedBy", taskId: "b", title: "B", done: true },
        { id: "3", kind: "blocks", taskId: "c", title: "C", done: false },
      ],
    });
    expect(blockers.map((link) => link.id)).toEqual(["1"]);
  });

  it("a weekly task comes back seven days later", () => {
    expect(nextOccurrence({ recurring: true, date: "2026-10-13" })).toBe("2026-10-20");
    expect(nextOccurrence({ recurring: false, date: "2026-10-13" })).toBeNull();
    expect(nextOccurrence({ recurring: true, date: null })).toBeNull();
  });
});
