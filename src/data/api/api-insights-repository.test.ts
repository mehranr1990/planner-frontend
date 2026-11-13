import { describe, expect, it } from "vitest";
import { createApiInsightsRepository } from "./api-insights-repository";
import { err, fakeApi, json } from "./test-support";

/* Insights adapter against an in-memory fake of /insights/time (no network). */

const DAY = "2026-11-12";
const cell = (sourceType: string, value: string | null) => ({ id: "m", sourceType, value });

function setup(fail = false) {
  const api = fakeApi(() =>
    fail
      ? err(400)
      : json({
          current: {
            buckets: [
              { from: "2026-11-10", metrics: [cell("TIME_ENTRY", "50")] },
              { from: "2026-11-11", metrics: [cell("TIME_ENTRY", "0"), cell("FOCUS_SESSION", "3")] },
              { from: "2026-11-12", metrics: [cell("TIME_ENTRY", null), cell("TIME_ENTRY", "25")] },
            ],
          },
        }),
  );
  return { ...api, insights: createApiInsightsRepository(api.client) };
}

describe("insights adapter", () => {
  it("counts days with tracked time and never invents a headline", async () => {
    const t = setup();
    expect(await t.insights.summary(DAY, "4w")).toEqual({ period: "4w", activeDays: 2, requiredDays: 14, headline: null });
    expect(t.calls[0]).toMatchObject({ path: "/insights/time", query: { from: "2026-10-16", to: "2026-11-13", grouping: "DAY" } });
    await t.insights.summary(DAY, "year");
    expect(t.calls[1].query.from).toBe("2025-11-13");
  });

  it("has no highlight and reports every pattern as not calculable, without a request", async () => {
    const t = setup();
    expect(await t.insights.highlight(DAY)).toBeNull();
    await expect(t.insights.pattern("focus", DAY, "4w")).rejects.toMatchObject({ code: "unsupported" });
    await expect(t.insights.pattern("signals", DAY, "3m")).rejects.toMatchObject({ code: "unsupported" });
    expect(t.calls.length).toBe(0);
  });

  it("rejects a bad day before any request and maps API refusals", async () => {
    await expect(setup().insights.summary("nope", "4w")).rejects.toMatchObject({ code: "invalid" });
    await expect(setup(true).insights.summary(DAY, "4w")).rejects.toMatchObject({ code: "invalid" });
  });
});
