import { describe, expect, it } from "vitest";
import { sampleNow, sampleScheduleBlocks } from "@/fixtures/shell";
import { deriveScheduleBlocks, elapsedPercent, scheduleStatus, visibleScheduleBlocks } from "./schedule";

// Instants with an explicit Tehran offset, like the fixture.
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 13, h, m) - 210 * 60_000);

describe("schedule helpers", () => {
  it("derives status from now", () => {
    const block = { start: at(14), end: at(16) };
    expect(scheduleStatus(block, at(13, 59))).toBe("upcoming");
    expect(scheduleStatus(block, at(14))).toBe("current");
    expect(scheduleStatus(block, at(15, 59))).toBe("current");
    expect(scheduleStatus(block, at(16))).toBe("done");
  });

  it("computes the elapsed share, clamped", () => {
    const block = { start: at(14), end: at(16) };
    expect(elapsedPercent(block, at(14, 35))).toBe(29.2);
    expect(elapsedPercent(block, at(15))).toBe(50);
    expect(elapsedPercent(block, at(12))).toBe(0);
    expect(elapsedPercent(block, at(17))).toBe(100);
  });

  it("sorts and annotates the sample day", () => {
    const shuffled = [...sampleScheduleBlocks].reverse();
    const derived = deriveScheduleBlocks(shuffled, sampleNow);
    expect(derived.map((b) => b.id)).toEqual(sampleScheduleBlocks.map((b) => b.id));
    expect(derived.filter((b) => b.status === "done").map((b) => b.id)).toEqual([
      "morning-routine",
      "deep-work",
      "design-review",
      "lunch",
    ]);
    expect(derived.find((b) => b.status === "current")?.id).toBe("ui-design");
    expect(derived.filter((b) => b.status === "upcoming").map((b) => b.id)).toEqual(["client-call", "gym"]);
  });

  it("keeps the last done, the current and the next upcoming blocks", () => {
    const visible = visibleScheduleBlocks(deriveScheduleBlocks(sampleScheduleBlocks, sampleNow));
    expect(visible.map((b) => b.id)).toEqual(["lunch", "ui-design", "client-call", "gym"]);
    const evening = visibleScheduleBlocks(deriveScheduleBlocks(sampleScheduleBlocks, at(16, 10)));
    // Nothing running: up to three upcoming blocks.
    expect(evening.map((b) => b.status)).toEqual(["done", "upcoming", "upcoming"]);
  });
});
