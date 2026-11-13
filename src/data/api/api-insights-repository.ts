import type { ApiClient } from "@/api/client";
import { addDaysToDay, parseDay } from "@/lib/dates/clock-time";
import type { InsightsPeriod } from "../domain";
import type { InsightsRepository } from "../repositories";
import { invalid, mapErrors, unsupported } from "./api-shared";

/*
 * Insights (Phase 13). The contract's /insights families return generic metric
 * cells (counts, minutes, money) per day/week/month; none of P15's patterns has
 * a source there: no hour-of-day focus distribution, no context split, no
 * estimate categories, and Journal/Mood analytics are rejected by the API
 * (blocker B4). So, honestly:
 * - summary: active days = days with tracked time (/insights/time, DAY buckets);
 *   never a headline.
 * - highlight: none. Every pattern tab: "cannot be calculated" (unsupported).
 */

/** Days of use before any pattern shows ("about 2 weeks"); same as the mock. */
const REQUIRED_DAYS = 14;
const PERIOD_DAYS: Record<InsightsPeriod, number> = { "4w": 28, "3m": 91, year: 365 };

export function createApiInsightsRepository(client: ApiClient): InsightsRepository {
  return {
    async highlight() {
      return null;
    },

    summary: (day, period) =>
      mapErrors(async () => {
        if (parseDay(day) === null) invalid(`Bad day "${day}"`);
        const { data } = await client.request("get", "/api/v1/insights/time", { query: { from: addDaysToDay(day, 1 - PERIOD_DAYS[period]), to: addDaysToDay(day, 1), grouping: "DAY" } });
        const activeDays = data.current.buckets.filter((bucket) => bucket.metrics.some((metric) => metric.sourceType === "TIME_ENTRY" && Number(metric.value) > 0)).length;
        return { period, activeDays, requiredDays: REQUIRED_DAYS, headline: null };
      }),

    async pattern() {
      return unsupported("The API has no source for this pattern");
    },
  };
}
