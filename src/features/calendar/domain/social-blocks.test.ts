import { describe, expect, it } from "vitest";
import type { CalendarProjection } from "@/data/social-domain";
import { socialActivityIdOf, socialBlocksForDay } from "./social-blocks";

const projection = (over: Partial<CalendarProjection>): CalendarProjection => ({
  activityId: "a1",
  title: "Hike",
  source: "Mountain Friends",
  startDay: "2026-11-27",
  endDay: "2026-11-27",
  startTime: "07:30",
  rsvp: "going",
  ...over,
});

describe("social calendar blocks", () => {
  it("puts a timed activity on its start day as a read-only Social block (nominal hour)", () => {
    const [block] = socialBlocksForDay([projection({})], "2026-11-27");
    expect(block).toMatchObject({ title: "Hike", scope: "social", kind: "event", startMinutes: 450, endMinutes: 510, done: false });
    expect(socialActivityIdOf(block!.id)).toBe("a1");
    expect(socialActivityIdOf("block-1")).toBeNull();
  });

  it("leaves untimed activities and other days out of the grid", () => {
    expect(socialBlocksForDay([projection({ startTime: null })], "2026-11-27")).toEqual([]);
    expect(socialBlocksForDay([projection({})], "2026-11-28")).toEqual([]);
  });

  it("clamps a late start to the end of the day", () => {
    const [block] = socialBlocksForDay([projection({ startTime: "23:30" })], "2026-11-27");
    expect(block).toMatchObject({ startMinutes: 1410, endMinutes: 1440 });
  });
});
