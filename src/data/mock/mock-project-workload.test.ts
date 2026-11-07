import { describe, expect, it } from "vitest";
import { createMockProjects } from "./mock-projects";
import { weekStartOf } from "./mock-project-workload";

const respond = <T>(value: T) => Promise.resolve(structuredClone(value));

describe("mock workload grid (PJ-11, D13)", () => {
  it("weeks start Saturday; rows carry capacity from Members and skip Viewers", async () => {
    expect(weekStartOf("2026-10-13")).toBe("2026-10-10");
    const store = createMockProjects({ respond });
    const grid = await store.workload.byWeek("website-redesign", { from: "2026-10-13", weeks: 6 });
    expect(grid.weeks[0]).toBe("2026-10-10");
    expect(grid.weeks).toHaveLength(6);
    expect(grid.rows.map((row) => row.person.id)).not.toContain("kamran");
    const kian = grid.rows.find((row) => row.person.id === "kian")!;
    expect(kian.capacity).toBe(32);
    expect(kian.cells).toHaveLength(6);
    const total = grid.rows.reduce((sum, row) => sum + row.cells.reduce((s, cell) => s + cell.hours, 0), 0);
    expect(total).toBeGreaterThan(0);
    expect(grid.unassigned).toHaveLength(6);
  });

  it("Members get only their own row; Viewers are refused", async () => {
    const store = createMockProjects({ respond });
    const member = await store.workload.byWeek("website-redesign", { from: "2026-10-13", weeks: 6 }, { previewRole: "member" });
    expect(member.rows.map((row) => row.person.id)).toEqual(["me"]);
    await expect(
      store.workload.byWeek("website-redesign", { from: "2026-10-13", weeks: 6 }, { previewRole: "viewer" }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});
