import {
  insightContexts,
  insightPatternIds,
  insightsPeriods,
  type InsightContext,
  type InsightPatternId,
  type InsightsPeriod,
  type TimePattern,
} from "@/data/domain";

/*
 * P15 rules kept out of the components: URL params, Context Ribbon shares and
 * the observation numbers the cards and tabs print.
 */

export const INSIGHTS_HREF = "/personal/insights";

export function parseInsightsTab(value: string | null): InsightPatternId {
  return insightPatternIds.includes(value as InsightPatternId) ? (value as InsightPatternId) : "focus";
}

export function parseInsightsPeriod(value: string | null): InsightsPeriod {
  return insightsPeriods.includes(value as InsightsPeriod) ? (value as InsightsPeriod) : "4w";
}

/** "/personal/insights?tab=time&period=3m": the tab is always named (links reference a pattern); the default period is left out. */
export function insightsHref(tab: InsightPatternId = "focus", period: InsightsPeriod = "4w"): string {
  const search = new URLSearchParams();
  search.set("tab", tab);
  if (period !== "4w") search.set("period", period);
  return `${INSIGHTS_HREF}?${search.toString()}`;
}

/** Share (0–1) of all tracked time per context over the period. */
export function contextShares(pattern: Pick<TimePattern, "days">): Record<InsightContext, number> {
  const totals = Object.fromEntries(insightContexts.map((id) => [id, 0])) as Record<InsightContext, number>;
  for (const day of pattern.days) for (const id of insightContexts) totals[id] += day.minutes[id];
  const all = insightContexts.reduce((sum, id) => sum + totals[id], 0);
  return Object.fromEntries(insightContexts.map((id) => [id, all ? totals[id] / all : 0])) as Record<InsightContext, number>;
}

/** Whole percentage points between two shares (0–1), rounded each first like the labels. */
export function sharePointsChange(now: number, before: number): number {
  return Math.round(now * 100) - Math.round(before * 100);
}

/** Days rotated to start on the person's week start (the adapter may use another). */
export function inWeekOrder<T extends { weekday: number }>(days: readonly T[], weekStartsOn: number): T[] {
  return [...days].sort((a, b) => ((a.weekday - weekStartsOn + 7) % 7) - ((b.weekday - weekStartsOn + 7) % 7));
}
