import { describe, expect, it } from "vitest";
import { sampleRisks } from "@/fixtures/project-risks";
import { filterRisks, heatCounts, heatTier, pillCounts, severitySummary, sortRisks } from "./risk-model";

const risks = sampleRisks.filter((risk) => risk.kind === "risk" && risk.closeReason !== "became-issue");

describe("risk model (PJ-09)", () => {
  it("counts pills, heat cells and the phone summary from open risks only", () => {
    expect(pillCounts(risks)).toEqual({ open: 4, mine: 1, high: 2, closed: 1 });
    const cells = heatCounts(risks);
    expect(cells.get("high:high")).toBe(1);
    expect(cells.get("medium:high")).toBe(1);
    expect(cells.get("low:medium")).toBeUndefined();
    expect(severitySummary(risks)).toEqual({ high: 2, medium: 2, low: 0 });
  });

  it("sorts by matrix cell, filters by cell / owner, and tiers colours", () => {
    const open = filterRisks(risks, { pill: "open", cell: null, ownerId: null, milestoneId: null });
    expect(sortRisks(open, "score").map((risk) => risk.code)).toEqual(["R-07", "R-03", "R-05", "R-04"]);
    expect(
      filterRisks(risks, { pill: "open", cell: { severity: "high", probability: "low" }, ownerId: null, milestoneId: null }),
    ).toHaveLength(1);
    expect(filterRisks(risks, { pill: "open", cell: null, ownerId: "kian", milestoneId: null })).toHaveLength(1);
    expect(heatTier({ severity: "low", probability: "low" })).toBe(0);
    expect(heatTier({ severity: "critical", probability: "high" })).toBe(3);
  });
});
