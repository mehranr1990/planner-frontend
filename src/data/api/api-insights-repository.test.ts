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

  it("has no highlight (no source for today's booking)", async () => {
    expect(await setup().insights.highlight(DAY)).toBeNull();
  });

  it("maps patterns: query window and timezone, ready / collecting / unavailable", async () => {
    const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    grid[0]![9] = 60; // Sunday (work day) 09:00
    grid[0]![10] = 30;
    grid[5]![20] = 30; // Friday (weekend) 20:00
    const results: Record<string, unknown> = {
      focus: { status: "ready", pattern: { id: "focus", minutesByWeekdayHour: grid, totalMinutes: 120, entries: 6, trackedEntries: 4, bestWindow: [9, 11], bestShare: 7500 } },
      time: { status: "ready", pattern: { id: "time", days: Array.from({ length: 7 }, (_, weekday) => ({ weekday, minutes: { personal: 60, projects: 0, teams: 0, companies: 0, other: 0 } })), totals: {}, previousShare: null } },
      signals: { status: "ready", pattern: { id: "signals", days: [{ day: "2026-11-11", mood: 5, energy: 1, focusMinutes: 240 }, { day: "2026-11-12", mood: null, energy: null, focusMinutes: 0 }], moodWithFocus: 5, moodWithoutFocus: null } },
      estimates: { status: "collecting", have: 2, need: 5 },
      habits: { status: "unavailable", reason: "TASK_CATEGORIES_NOT_RECORDED" },
    };
    const api = fakeApi((call) => json(results[call.query.id!]));
    const insights = createApiInsightsRepository(api.client);

    const focus = await insights.pattern("focus", DAY, "4w");
    expect(api.calls[0]).toMatchObject({ path: "/insights/patterns", query: { id: "focus", from: "2026-10-16", to: DAY } });
    expect(api.calls[0]!.query.timezone).toBeTruthy();
    if (focus.status !== "ready") throw new Error("not ready");
    expect(focus.pattern.byDays.all).toMatchObject({ totalMinutes: 120, sessionsCompleted: 6, sessionsStarted: null, averageSessionMinutes: 20, bestWindow: [9, 11], bestShare: 0.75, interruptedHour: null });
    expect(focus.pattern.byDays.work).toMatchObject({ totalMinutes: 90, sessionsCompleted: null, bestWindow: [9, 11], bestShare: 1 });
    expect(focus.pattern.byDays.weekend).toMatchObject({ totalMinutes: 30, bestWindow: [19, 21] });

    const time = await insights.pattern("time", DAY, "3m");
    expect(time).toMatchObject({ status: "ready", pattern: { previousShare: null, topProject: null } });

    const signals = await insights.pattern("signals", DAY, "4w");
    expect(signals).toEqual({ status: "ready", pattern: { id: "signals", days: [{ day: "2026-11-11", mood: 10, energy: 2.5, focus: 10 }], moodWithFocus: 10, moodWithoutFocus: null } });

    expect(await insights.pattern("estimates", DAY, "4w")).toEqual({ status: "collecting", have: 2, need: 5 });
    expect(await insights.pattern("habits", DAY, "4w")).toEqual({ status: "unavailable", reason: "TASK_CATEGORIES_NOT_RECORDED" });
  });

  it("maps estimates categories and the suggestion as served", async () => {
    const api = fakeApi(() => json({ status: "ready", pattern: { id: "estimates", categories: [{ id: "writing", ratio: 1.4, tasks: 3, estimatedMinutes: 100, actualMinutes: 140 }], suggestion: { category: "writing", bufferPercent: 40 }, excluded: { uncategorized: 1, unestimated: 0, untracked: 2 } } }));
    expect(await createApiInsightsRepository(api.client).pattern("estimates", DAY, "year")).toEqual({
      status: "ready",
      pattern: { id: "estimates", categories: [{ id: "writing", ratio: 1.4 }], suggestion: { category: "writing", bufferPercent: 40 } },
    });
    expect(api.calls[0]!.query.from).toBe("2025-11-13");
  });

  it("rejects a bad day before any request and maps API refusals", async () => {
    await expect(setup().insights.summary("nope", "4w")).rejects.toMatchObject({ code: "invalid" });
    await expect(setup(true).insights.summary(DAY, "4w")).rejects.toMatchObject({ code: "invalid" });
  });
});
