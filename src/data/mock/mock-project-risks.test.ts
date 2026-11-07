import { describe, expect, it } from "vitest";
import { createMockProjects } from "./mock-projects";

const respond = <T>(value: T) => Promise.resolve(structuredClone(value));

describe("mock risk register (PJ-09 / PJ-16)", () => {
  it("lists risks and issues separately; a risk that became an issue leaves the risk list", async () => {
    const { risks } = createMockProjects({ respond });
    expect((await risks.list("website-redesign", { kind: "risk" })).map((risk) => risk.code)).toEqual([
      "R-07",
      "R-05",
      "R-04",
      "R-03",
      "R-02",
    ]);
    expect((await risks.list("website-redesign", { kind: "issue" })).map((risk) => risk.code)).toEqual(["I-01", "I-02"]);
  });

  it("audits updates, rejects stale revisions, closes and converts", async () => {
    const { risks } = createMockProjects({ respond });
    const risk = await risks.get("legal-copy");
    const updated = await risks.update("legal-copy", { severity: "high" }, risk.revision);
    expect(updated.revision).toBe(risk.revision + 1);
    await expect(risks.update("legal-copy", { severity: "low" }, risk.revision)).rejects.toMatchObject({ code: "conflict" });
    expect((await risks.history("legal-copy"))[0]).toMatchObject({ field: "severity", from: "medium", to: "high" });
    const closed = await risks.close("legal-copy", { reason: "mitigated" }, updated.revision);
    expect(closed).toMatchObject({ status: "closed", open: false, closeReason: "mitigated" });

    const r07 = await risks.get("payment-api-delay");
    const issue = await risks.convert("payment-api-delay", r07.revision);
    expect(issue).toMatchObject({ code: "I-03", kind: "issue", severity: "high", fromRiskCode: "R-07" });
    expect(await risks.get("payment-api-delay")).toMatchObject({ closeReason: "became-issue", issueId: issue.id });
    await expect(risks.resolve(issue.id, " ", issue.revision)).rejects.toMatchObject({ code: "invalid" });
    expect(await risks.resolve(issue.id, "Keys renewed", issue.revision)).toMatchObject({ status: "closed" });
  });
});
