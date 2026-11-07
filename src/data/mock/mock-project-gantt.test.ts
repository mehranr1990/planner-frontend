import { describe, expect, it } from "vitest";
import { createMockProjects } from "./mock-projects";

const respond = <T>(value: T) => Promise.resolve(structuredClone(value));

describe("mock schedule links (PJ-05)", () => {
  it("adds, edits and removes links; refuses loops and duplicates", async () => {
    const { schedule } = createMockProjects({ respond });
    // bug-bash → uat-signoff exists: uat-signoff → bug-bash would loop.
    await expect(
      schedule.addLink("website-redesign", { predecessorId: "uat-signoff", successorId: "bug-bash", type: "FS", lagDays: 0 }),
    ).rejects.toMatchObject({ code: "invalid", message: "cycle" });
    await expect(
      schedule.addLink("website-redesign", { predecessorId: "bug-bash", successorId: "uat-signoff", type: "FS", lagDays: 0 }),
    ).rejects.toMatchObject({ message: "duplicate" });
    const link = await schedule.addLink("website-redesign", {
      predecessorId: "icon-set",
      successorId: "regression-plan",
      type: "SS",
      lagDays: -2,
    });
    expect((await schedule.updateLink("website-redesign", link.id, { type: "FF", lagDays: 3 })).type).toBe("FF");
    await schedule.removeLink("website-redesign", link.id);
    expect((await schedule.graph("website-redesign")).links.some((item) => item.id === link.id)).toBe(false);
  });

  it("computes the critical path to the final milestone", async () => {
    const { schedule } = createMockProjects({ respond });
    const path = await schedule.criticalPath("website-redesign");
    expect(path.at(-1)).toBe("launch");
    expect(path).toContain("launch-checklist");
  });

  it("refuses an unknown link", async () => {
    const { schedule } = createMockProjects({ respond });
    await expect(schedule.removeLink("website-redesign", "missing")).rejects.toMatchObject({ code: "not-found" });
  });
});
