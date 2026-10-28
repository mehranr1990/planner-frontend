import { describe, expect, it } from "vitest";
import type { TimeBlock } from "@/data/domain";
import { sampleBlocks, sampleDays, sampleTasks } from "@/fixtures/personal";
import { overlapMinutes, spansOverlap, toDayBlocks } from "./day-blocks";

describe("toDayBlocks", () => {
  it("projects the sample day onto minutes, in start order, with energy and priority from tasks", () => {
    const blocks = toDayBlocks(sampleBlocks, sampleDays.today, sampleTasks);
    expect(blocks.map((block) => [block.id, block.startMinutes, block.endMinutes])).toEqual([
      ["morning-routine", 480, 525],
      ["deep-work", 540, 660],
      ["design-review", 660, 705],
      ["lunch", 780, 825],
      ["ui-design", 840, 960],
      ["client-call", 990, 1020],
      ["gym", 1035, 1095],
    ]);
    const ui = blocks.find((block) => block.id === "ui-design")!;
    expect(ui).toMatchObject({ energy: "high", priority: "high", durationMinutes: 120, done: false, kind: "task" });
    // Events carry their own energy and no priority.
    expect(blocks.find((block) => block.id === "client-call")).toMatchObject({ energy: "medium", priority: null });
    expect(blocks.find((block) => block.id === "deep-work")?.done).toBe(true);
  });

  it("leaves energy null without a task or own energy", () => {
    const [block] = toDayBlocks(
      [{ id: "x", title: "X", start: "2026-10-13T10:00:00+03:30", end: "2026-10-13T11:00:00+03:30", scope: "personal", kind: "task", taskId: "missing" }],
      sampleDays.today,
    );
    expect(block?.energy).toBeNull();
    expect(block?.priority).toBeNull();
  });

  it("clamps a block that spans midnight to each day, and ignores blocks on other days", () => {
    const span: TimeBlock = {
      id: "span",
      title: "Span",
      start: "2026-10-13T23:00:00+03:30",
      end: "2026-10-14T01:00:00+03:30",
      scope: "personal",
      kind: "event",
    };
    expect(toDayBlocks([span], "2026-10-13")[0]).toMatchObject({ startMinutes: 1380, endMinutes: 1440, durationMinutes: 60 });
    expect(toDayBlocks([span], "2026-10-14")[0]).toMatchObject({ startMinutes: 0, endMinutes: 60, durationMinutes: 60 });
    expect(toDayBlocks([span], "2026-10-15")).toEqual([]);
  });
});

describe("spans", () => {
  it("overlap only when they share minutes; touching edges do not", () => {
    const a = { startMinutes: 60, endMinutes: 120 };
    expect(spansOverlap(a, { startMinutes: 120, endMinutes: 150 })).toBe(false);
    expect(spansOverlap(a, { startMinutes: 90, endMinutes: 150 })).toBe(true);
    expect(overlapMinutes(a, { startMinutes: 90, endMinutes: 150 })).toBe(30);
    expect(overlapMinutes(a, { startMinutes: 120, endMinutes: 150 })).toBe(0);
    expect(overlapMinutes(a, { startMinutes: 0, endMinutes: 600 })).toBe(60);
  });
});
