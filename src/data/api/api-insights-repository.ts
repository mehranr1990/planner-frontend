import { typedAs, type ApiClient, type ResponseDataIn } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-personal";
import { addDaysToDay, parseDay } from "@/lib/dates/clock-time";
import { IRAN_WEEK } from "@/lib/dates/week";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import type { FocusWindowStats, InsightContext, InsightDayFilter, InsightPattern, InsightPatternResult, InsightsPeriod } from "../domain";
import type { InsightsRepository } from "../repositories";
import { invalid, mapErrors } from "./api-shared";

/*
 * Insights (Phase 13 + B4). Summary: active days = days with tracked time
 * (/insights/time, DAY buckets); never a headline. Highlight: none (no source
 * for "today's deep work sits in the window").
 * Patterns: GET /insights/patterns over the period's local days (inclusive) in
 * the account timezone. ready / collecting / unavailable map one to one.
 * - Scales follow the mock's shared 0–10 rule: mood (m − 1) × 2.5; energy
 *   1–5 → low / medium / high = 2.5 / 5 / 8 (≤2 low, 3 medium, ≥4 high, the
 *   Journal reading); focus 2.5 points per hour, at most 10. Days without a
 *   mood are left out of Signals (no invented values).
 * - Shares arrive in basis points (÷ 10 000). Focus day filters are derived
 *   from the weekday × hour grid (work / weekend days of the planner week); the
 *   API records no per-filter session counts, no started or interrupted
 *   sessions, and no top project: those stay null.
 */

type ApiResult = ResponseDataIn<paths, "/api/v1/insights/patterns", "get">;
type ApiPattern = Extract<ApiResult, { status: "ready" }>["pattern"];
type ApiFocus = Extract<ApiPattern, { id: "focus" }>;

/** Days of use before any pattern shows ("about 2 weeks"); same as the mock. */
const REQUIRED_DAYS = 14;
const PERIOD_DAYS: Record<InsightsPeriod, number> = { "4w": 28, "3m": 91, year: 365 };
const CONTEXTS: readonly InsightContext[] = ["personal", "projects", "teams", "companies", "other"];

const moodScore = (mood: number) => (mood - 1) * 2.5;
const energyScore = (energy: number | null) => (energy === null || energy === 3 ? 5 : energy < 3 ? 2.5 : 8);
const focusScore = (minutes: number) => Math.min(10, Math.round((minutes / 60) * 2.5 * 10) / 10);
const r1 = (value: number) => Math.round(value * 10) / 10;

function focusStats(api: ApiFocus, filter: InsightDayFilter): FocusWindowStats {
  const days = filter === "all" ? null : new Set<number>(filter === "work" ? IRAN_WEEK.workDays : IRAN_WEEK.weekendDays);
  const rows = api.minutesByWeekdayHour.filter((_, weekday) => !days || days.has(weekday));
  const minutesByHour = Array.from({ length: 24 }, (_, hour) => rows.reduce((sum, row) => sum + (row[hour] ?? 0), 0));
  const total = minutesByHour.reduce((sum, value) => sum + value, 0);
  // The server's rule: the best two adjacent hours.
  let best = -1;
  let bestMinutes = 0;
  for (let hour = 0; hour < 23; hour++) {
    const pair = minutesByHour[hour]! + minutesByHour[hour + 1]!;
    if (pair > bestMinutes) [best, bestMinutes] = [hour, pair];
  }
  const all = filter === "all";
  return {
    minutesByHour,
    totalMinutes: total,
    sessionsCompleted: all ? api.entries : null,
    sessionsStarted: null,
    averageSessionMinutes: all && api.entries > 0 ? Math.round(api.totalMinutes / api.entries) : null,
    bestWindow: best >= 0 ? [best, best + 2] : null,
    bestShare: best >= 0 && total > 0 ? bestMinutes / total : null,
    interruptedHour: null,
  };
}

function toPattern(api: ApiPattern): InsightPattern {
  switch (api.id) {
    case "focus":
      return { id: "focus", byDays: { all: focusStats(api, "all"), work: focusStats(api, "work"), weekend: focusStats(api, "weekend") } };
    case "time":
      return {
        id: "time",
        days: api.days.map((day) => ({ weekday: day.weekday, minutes: Object.fromEntries(CONTEXTS.map((id) => [id, day.minutes[id]])) as Record<InsightContext, number> })),
        previousShare: api.previousShare ? (Object.fromEntries(CONTEXTS.map((id) => [id, api.previousShare![id] / 10_000])) as Record<InsightContext, number>) : null,
        topProject: null,
      };
    case "signals":
      return {
        id: "signals",
        days: api.days.filter((day) => day.mood !== null).map((day) => ({ day: day.day, mood: moodScore(day.mood!), energy: energyScore(day.energy), focus: focusScore(day.focusMinutes) })),
        moodWithFocus: api.moodWithFocus === null ? null : r1(moodScore(api.moodWithFocus)),
        moodWithoutFocus: api.moodWithoutFocus === null ? null : r1(moodScore(api.moodWithoutFocus)),
      };
    case "estimates":
      return { id: "estimates", categories: api.categories.map((row) => ({ id: row.id, ratio: row.ratio })), suggestion: api.suggestion };
    case "habits":
      return {
        id: "habits",
        rows: api.rows
          .filter((row) => row.doneMood !== null && row.notDoneMood !== null)
          .map((row) => ({ habitId: row.habitId, title: row.title, doneMood: r1(moodScore(row.doneMood!)), notDoneMood: r1(moodScore(row.notDoneMood!)) }))
          .sort((a, b) => b.doneMood - b.notDoneMood - (a.doneMood - a.notDoneMood)),
      };
  }
}

export function createApiInsightsRepository(client: ApiClient): InsightsRepository {
  const api = typedAs<paths>(client);
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

    pattern: (id, day, period) =>
      mapErrors(async () => {
        if (parseDay(day) === null) invalid(`Bad day "${day}"`);
        const query = { id, from: addDaysToDay(day, 1 - PERIOD_DAYS[period]), to: day, timezone: getPlannerTimeZone() };
        const { data } = await api.request("get", "/api/v1/insights/patterns", { query });
        if (data.status === "ready") return { status: "ready", pattern: toPattern(data.pattern) } as InsightPatternResult<never>;
        if (data.status === "collecting") return { status: "collecting", have: data.have, need: data.need };
        return { status: "unavailable", reason: data.reason };
      }),
  };
}
