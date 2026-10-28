import { describe, expect, it } from "vitest";
import { FULL_DAY } from "./day-blocks";
import {
  autoFit,
  protectedSpan,
  suggestFreeSlot,
  MIN_BLOCK_MINUTES,
  nextFreeSlot,
  resizeFromEdge,
  resolvePlacement,
  snap15,
} from "./placement";
import { dayBlock, sampleDayBlocks } from "./test-utils";

const DAY = "2026-10-13";

describe("snap15", () => {
  it("is the 15-minute grid", () => {
    expect([0, 7, 8, 14, 15, 22, 23].map((value) => snap15(value))).toEqual([0, 0, 15, 15, 15, 15, 30]);
  });
});

describe("resolvePlacement", () => {
  it("snaps the start and keeps the duration", () => {
    const result = resolvePlacement({ day: DAY, startMinutes: 14 * 60 + 7, durationMinutes: 20 });
    expect(result).toEqual({
      ok: true,
      placement: { day: DAY, startMinutes: 840, durationMinutes: 20, endMinutes: 860, start: "14:00" },
    });
  });

  it("keeps a 10m task at 10m", () => {
    const result = resolvePlacement({ day: DAY, startMinutes: 600, durationMinutes: 10 });
    expect(result.ok && result.placement.durationMinutes).toBe(10);
  });

  it("rejects durations under the minimum", () => {
    expect(resolvePlacement({ day: DAY, startMinutes: 600, durationMinutes: MIN_BLOCK_MINUTES - 1 })).toEqual({ ok: false, reason: "too-short" });
    expect(resolvePlacement({ day: DAY, startMinutes: 600, durationMinutes: 0 })).toEqual({ ok: false, reason: "too-short" });
    expect(resolvePlacement({ day: DAY, startMinutes: 600, durationMinutes: Number.NaN })).toEqual({ ok: false, reason: "too-short" });
  });

  it("stays inside 00:00–24:00 by default, and may end exactly at midnight", () => {
    expect(resolvePlacement({ day: DAY, startMinutes: -30, durationMinutes: 30 })).toEqual({ ok: false, reason: "out-of-range" });
    expect(resolvePlacement({ day: DAY, startMinutes: 1425, durationMinutes: 30 })).toEqual({ ok: false, reason: "out-of-range" });
    const midnight = resolvePlacement({ day: DAY, startMinutes: 1410, durationMinutes: 30 });
    expect(midnight.ok && midnight.placement).toMatchObject({ start: "23:30", endMinutes: 1440 });
  });

  it("honours a narrower window", () => {
    const window = { startMinutes: 480, endMinutes: 1200 };
    expect(resolvePlacement({ day: DAY, startMinutes: 450, durationMinutes: 30 }, window)).toEqual({ ok: false, reason: "out-of-range" });
    expect(resolvePlacement({ day: DAY, startMinutes: 1190, durationMinutes: 30 }, window)).toEqual({ ok: false, reason: "out-of-range" });
    expect(resolvePlacement({ day: DAY, startMinutes: 1170, durationMinutes: 30 }, window).ok).toBe(true);
  });
});

describe("resizeFromEdge", () => {
  const span = { startMinutes: 840, endMinutes: 960 };

  it("moves the end by the delta, snapped", () => {
    expect(resizeFromEdge(span, "end", 50)).toEqual({ startMinutes: 840, endMinutes: 1005 });
    expect(resizeFromEdge(span, "end", -29)).toEqual({ startMinutes: 840, endMinutes: 930 });
  });

  it("moves the start by the delta, snapped", () => {
    expect(resizeFromEdge(span, "start", -20)).toEqual({ startMinutes: 825, endMinutes: 960 });
    expect(resizeFromEdge(span, "start", 40)).toEqual({ startMinutes: 885, endMinutes: 960 });
  });

  it("never shrinks below 15 minutes", () => {
    expect(resizeFromEdge(span, "end", -500)).toEqual({ startMinutes: 840, endMinutes: 855 });
    expect(resizeFromEdge(span, "start", 500)).toEqual({ startMinutes: 945, endMinutes: 960 });
  });

  it("keeps a block that is already shorter than 15 minutes from growing when shrunk", () => {
    expect(resizeFromEdge({ startMinutes: 600, endMinutes: 610 }, "end", -30)).toEqual({ startMinutes: 600, endMinutes: 610 });
  });

  it("stays inside the window", () => {
    expect(resizeFromEdge(span, "end", 5000)).toEqual({ startMinutes: 840, endMinutes: 1440 });
    expect(resizeFromEdge(span, "start", -5000)).toEqual({ startMinutes: 0, endMinutes: 960 });
    expect(resizeFromEdge(span, "end", 5000, { startMinutes: 480, endMinutes: 1200 }).endMinutes).toBe(1200);
  });
});

describe("nextFreeSlot", () => {
  const blocks = sampleDayBlocks();

  it("finds the next gap that holds the task, on :00/:30", () => {
    // After 14:35 (UI design runs to 16:00), 16:00–16:30 holds a 20m reply.
    expect(nextFreeSlot(blocks, 14 * 60 + 35, 20)).toBe(960);
    // 45m does not fit before the 16:30 call or the 17:15 gym: after the gym, 18:30.
    expect(nextFreeSlot(blocks, 14 * 60 + 35, 45)).toBe(1110);
  });

  it("after the last block it is the placeholder slot: 18:30", () => {
    expect(nextFreeSlot(blocks, 1095, 30)).toBe(1110);
  });

  it("takes the slot right away when the time is free", () => {
    expect(nextFreeSlot(blocks, 11 * 60 + 45, 30)).toBe(720);
    expect(nextFreeSlot([], 9 * 60, 30)).toBe(540);
  });

  it("treats breaks as busy", () => {
    expect(nextFreeSlot([dayBlock("lunch", "13:00", "14:00", { kind: "break" })], 13 * 60, 30)).toBe(840);
  });

  it("rounds up to the step", () => {
    expect(nextFreeSlot([], 9 * 60 + 1, 30)).toBe(570);
    expect(nextFreeSlot([], 9 * 60 + 1, 30, FULL_DAY, 15)).toBe(555);
  });

  it("is null when nothing fits in the window", () => {
    expect(nextFreeSlot(blocks, 1095, 30, { startMinutes: 480, endMinutes: 1100 })).toBeNull();
    expect(nextFreeSlot([dayBlock("all", "00:00", "24:00")], 0, 15)).toBeNull();
  });

  it("starts no earlier than the window", () => {
    expect(nextFreeSlot([], 0, 30, { startMinutes: 480, endMinutes: 1200 })).toBe(480);
  });
});

describe("autoFit (the S shortcut)", () => {
  const blocks = sampleDayBlocks();

  it("fits the next free gap after now, else after the last block", () => {
    expect(autoFit(blocks, { durationMinutes: 20 }, 875)).toBe(960);
    expect(autoFit(blocks, { durationMinutes: 65 }, 875)).toBe(1110);
  });

  it("uses a default length for a task without one, and reports a full day as null", () => {
    expect(autoFit(blocks, { durationMinutes: null }, 875)).toBe(960);
    expect(autoFit(blocks, { durationMinutes: 60 }, 875, { startMinutes: 480, endMinutes: 1100 })).toBeNull();
  });
});

describe("protected focus window", () => {
  const guard = protectedSpan({ start: "09:00", end: "12:00" });

  it("reads the setting as minutes; off or backwards is no window", () => {
    expect(guard).toEqual({ startMinutes: 540, endMinutes: 720 });
    expect(protectedSpan(null)).toBeNull();
    expect(protectedSpan({ start: "12:00", end: "09:00" })).toBeNull();
  });

  it("suggestions skip the window when on, and use it when off", () => {
    const blocks = [dayBlock("a", "13:00", "14:00")];
    const work = { startMinutes: 540, endMinutes: 1020 };
    expect(autoFit(blocks, { durationMinutes: 60 }, 540, work)).toBe(540);
    expect(autoFit(blocks, { durationMinutes: 60 }, 540, work, 30, guard)).toBe(720);
    expect(suggestFreeSlot(blocks, 540, 60, work, guard)).toBe(720);
  });

  it("falls back into the window only when nothing fits outside it", () => {
    const work = { startMinutes: 540, endMinutes: 780 };
    expect(suggestFreeSlot([dayBlock("a", "12:00", "13:00")], 540, 60, work, guard)).toBe(540);
  });

  it("manual placement inside the window stays allowed", () => {
    const result = resolvePlacement({ day: "2026-10-13", startMinutes: 600, durationMinutes: 60 }, { startMinutes: 540, endMinutes: 1020 });
    expect(result).toMatchObject({ ok: true, placement: { start: "10:00" } });
  });
});
