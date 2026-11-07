import { describe, expect, it } from "vitest";
import { createMockProjects } from "./mock-projects";

const respond = <T>(value: T) => Promise.resolve(structuredClone(value));

describe("mock project calendar (PJ-07)", () => {
  it("serves task due dates, milestones and project events in range only", async () => {
    const { calendar } = createMockProjects({ respond });
    const items = await calendar.range("website-redesign", "2026-10-01", "2026-10-31");
    expect(new Set(items.map((item) => item.kind))).toEqual(new Set(["task", "milestone", "event"]));
    expect(items.every((item) => item.day >= "2026-10-01" && item.day <= "2026-10-31")).toBe(true);
    expect(items.find((item) => item.id === "event:ev-sprint-review")).toMatchObject({ time: "10:00", invited: 6 });
  });

  it("guests only get their shared tasks; busy slots are untitled", async () => {
    const { calendar } = createMockProjects({ respond });
    const guest = await calendar.range("website-redesign", "2026-10-01", "2026-12-31", { previewRole: "guest" });
    expect(guest.every((item) => item.kind === "task")).toBe(true);
    const busy = await calendar.myBusy("2026-10-13", "2026-10-13");
    expect(busy).toEqual([{ day: "2026-10-13", start: "14:00", end: "16:00" }]);
  });
});
