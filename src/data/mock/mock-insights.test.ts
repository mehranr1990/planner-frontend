import { describe, expect, it } from "vitest";
import { sampleDays } from "@/fixtures/personal";
import { bestFocusWindow, INSIGHT_THRESHOLDS } from "./mock-insights";
import { createMockRepositories } from "./mock-repositories";

const today = sampleDays.today;

describe("mock insights (P15)", () => {
  it("finds the best focus window and its share", () => {
    const hours = Array.from({ length: 24 }, (_, hour) => (hour >= 9 && hour < 12 ? 50 : hour === 15 ? 30 : 0));
    expect(bestFocusWindow(hours)).toEqual({ window: [9, 12], share: 150 / 180 });
  });

  it("serves a headline and ready, deterministic patterns with enough history", async () => {
    const { insights } = createMockRepositories();
    const summary = await insights.summary(today, "4w");
    expect(summary).toMatchObject({ activeDays: 28, requiredDays: 14 });
    expect(summary.headline?.focusWindow).toEqual([9, 12]);
    const focus = await insights.pattern("focus", today, "4w");
    expect(focus.status).toBe("ready");
    if (focus.status === "ready") {
      expect(focus.pattern.byDays.all.minutesByHour).toHaveLength(24);
      expect(focus.pattern.byDays.all).toMatchObject({ sessionsStarted: 44, sessionsCompleted: 38, bestWindow: [9, 12] });
    }
    const signals = await insights.pattern("signals", today, "4w");
    expect(signals.status === "ready" && signals.pattern.days).toHaveLength(28);
    expect(await insights.pattern("signals", today, "4w")).toEqual(signals);
    const estimates = await insights.pattern("estimates", today, "4w");
    expect(estimates.status === "ready" && estimates.pattern.suggestion).toEqual({ category: "design", bufferPercent: 50 });
    const habits = await insights.pattern("habits", today, "4w");
    // Real habit titles; "Read" started 2026-09-01 so it still has ≥ 10 days.
    expect(habits.status === "ready" && habits.pattern.rows.map((row) => row.title).sort()).toEqual(["Journal", "Meditate", "Read", "Walk", "Water"].sort());
  });

  it("reports progress per tab below each threshold, and no headline", async () => {
    const { insights } = createMockRepositories({ fixtures: { insights: { historyDays: 6 } } });
    const summary = await insights.summary(today, "4w");
    expect(summary).toMatchObject({ activeDays: 6, headline: null });
    expect(await insights.pattern("focus", today, "4w")).toEqual({ status: "collecting", have: 9, need: INSIGHT_THRESHOLDS.focus });
    expect(await insights.pattern("signals", today, "4w")).toEqual({ status: "collecting", have: 6, need: 14 });
    expect((await insights.pattern("time", today, "4w")).status).toBe("ready");
    expect(await insights.highlight(today)).toBeNull();
  });

  it("fails one tab without touching the others", async () => {
    const { insights } = createMockRepositories({ fixtures: { insights: { failing: ["signals"] } } });
    await expect(insights.pattern("signals", today, "4w")).rejects.toThrow();
    expect((await insights.pattern("time", today, "4w")).status).toBe("ready");
  });
});
