import { addDaysToDay, diffDays } from "@/lib/dates/clock-time";
import { IRAN_WEEK } from "@/lib/dates/week";
import type {
  EstimateCategory,
  FocusWindowStats,
  Habit,
  InsightContext,
  InsightHighlight,
  InsightPattern,
  InsightPatternId,
  InsightPatternResult,
  InsightsPeriod,
  InsightsSummary,
  MoodEntry,
  SignalsDay,
} from "../domain";
import type { InsightsRepository } from "../repositories";

/*
 * SAMPLE DATA — Insights (P15) for the mock adapter. The real API aggregates
 * the person's history; here the series are deterministic sample shapes from
 * the P15 board, scaled by how much history the sample person has, with real
 * fixture data laid over where it exists (habit titles, mood check-ins).
 * Every tab has its own threshold: below it the tab reports progress instead
 * of a pattern, so a chart never shows from too little data.
 */

/** Days of use before any pattern shows ("about 2 weeks"). */
export const INSIGHTS_REQUIRED_DAYS = 14;
/** Per-tab thresholds (P15 Partial data). */
export const INSIGHT_THRESHOLDS: Record<InsightPatternId, number> = {
  focus: 10, // sessions
  time: 3, // days with scheduled blocks
  signals: 14, // check-ins
  estimates: 15, // completed tasks with estimates
  habits: 10, // days of data per habit
};

const PERIOD_DAYS: Record<InsightsPeriod, number> = { "4w": 28, "3m": 91, year: 365 };
/** Signals points: daily for 4 weeks, weekly for 3 months, monthly for a year. */
const SIGNAL_STEP: Record<InsightsPeriod, { points: number; step: number }> = {
  "4w": { points: 28, step: 1 },
  "3m": { points: 13, step: 7 },
  year: { points: 12, step: 30 },
};

export interface MockInsightsOptions {
  today: string;
  /** Days of activity the sample person has (default 120: every period has data). */
  historyDays: number;
  /** Tabs that fail to calculate (P15 Error per tab). */
  failing: readonly InsightPatternId[];
  highlight: InsightHighlight | null;
  habits: readonly Habit[];
  moods: readonly MoodEntry[];
  respond<T>(value: T): Promise<T>;
}

/** Small deterministic hash → [0, 1). */
function noise(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

const r1 = (value: number) => Math.round(value * 10) / 10;

/** Board shape: deep mornings, a second wind mid-afternoon, a dip after lunch. */
const WORK_PROFILE = [0, 0, 0, 0, 0, 0, 0, 10, 28, 58, 60, 52, 20, 8, 12, 34, 30, 22, 12, 8, 14, 10, 4, 0];
const WEEKEND_PROFILE = [0, 0, 0, 0, 0, 0, 0, 0, 6, 12, 30, 34, 20, 6, 4, 10, 18, 20, 10, 8, 24, 18, 6, 0];

/** The best `length`-hour window of a day profile, and its share of the total. */
export function bestFocusWindow(minutesByHour: readonly number[], length = 3): { window: [number, number]; share: number } {
  const total = minutesByHour.reduce((sum, value) => sum + value, 0);
  let best = 0;
  let start = 0;
  for (let hour = 0; hour + length <= minutesByHour.length; hour += 1) {
    const sum = minutesByHour.slice(hour, hour + length).reduce((acc, value) => acc + value, 0);
    if (sum > best) {
      best = sum;
      start = hour;
    }
  }
  return { window: [start, start + length], share: total ? best / total : 0 };
}

function focusStats(profile: readonly number[], sessionsStarted: number, sessionsCompleted: number, scale: number): FocusWindowStats {
  const minutesByHour = profile.map((value) => Math.min(60, Math.round(value * scale)));
  const { window, share } = bestFocusWindow(minutesByHour);
  return {
    minutesByHour,
    totalMinutes: minutesByHour.reduce((sum, value) => sum + value, 0),
    sessionsStarted,
    sessionsCompleted,
    averageSessionMinutes: 41,
    bestWindow: window,
    bestShare: Math.round(share * 100) / 100,
    interruptedHour: 14,
  };
}

/** Board Context Ribbon (hours per day, week order Sat → Fri). */
const TIME_HOURS: Record<InsightContext, readonly number[]> = {
  personal: [2.5, 2, 3, 2.2, 2.6, 4.5, 5.5],
  projects: [3.5, 4, 2.5, 3, 3.8, 1, 0.4],
  teams: [1, 2.2, 2.6, 1.8, 1.2, 0.5, 0.1],
  companies: [1.2, 0.8, 1.6, 1.4, 0.6, 0.3, 0],
  other: [0.3, 0.4, 0.5, 0.2, 0.6, 0.8, 0.9],
};
const PREVIOUS_SHARE: Record<InsightContext, number> = { personal: 0.34, projects: 0.31, teams: 0.19, companies: 0.12, other: 0.04 };

const ESTIMATES: { id: EstimateCategory; ratio: number }[] = [
  { id: "design", ratio: 1.6 },
  { id: "writing", ratio: 1.35 },
  { id: "errands", ratio: 1.1 },
  { id: "admin", ratio: 0.8 },
];

/** Mood 1–5 and energy low/medium/high on the shared 0–10 scale. */
const moodScore = (mood: number) => (mood - 1) * 2.5;
const ENERGY_SCORE = { low: 2.5, medium: 5, high: 8 } as const;

/** Focus score ≥ 5 ⇔ ≥ 2h of focus (2.5 points per hour). */
const FOCUS_DAY_SCORE = 5;

export function createMockInsights({ today, historyDays, failing, highlight, habits, moods, respond }: MockInsightsOptions): InsightsRepository {
  /** Days of history inside the period window. */
  const daysIn = (period: InsightsPeriod) => Math.max(0, Math.min(historyDays, PERIOD_DAYS[period]));

  function signals(period: InsightsPeriod): SignalsDay[] {
    const { points, step } = SIGNAL_STEP[period];
    const available = Math.min(points, Math.floor(daysIn(period) / step));
    const moodByDay = new Map(moods.map((entry) => [entry.day, entry]));
    return Array.from({ length: available }, (_, index) => {
      const back = (available - 1 - index) * step;
      const day = addDaysToDay(today, -back);
      const wave = Math.sin(index * 0.7) * 1.4;
      const focus = r1(Math.max(0, Math.min(10, 5 + wave + (noise(`f${period}${day}`) - 0.5) * 3)));
      const real = step === 1 ? moodByDay.get(day) : undefined;
      // Mood follows focus a little (the observation), plus noise.
      const mood = real ? moodScore(real.mood) : r1(Math.max(0, Math.min(10, 4.4 + focus * 0.32 + (noise(`m${period}${day}`) - 0.5) * 2.4)));
      const energy = real ? ENERGY_SCORE[real.energy] : r1(Math.max(0, Math.min(10, 3.6 + focus * 0.3 + (noise(`e${period}${day}`) - 0.5) * 3)));
      return { day, mood, energy, focus };
    });
  }

  function habitRows(period: InsightsPeriod) {
    return habits
      .map((habit) => {
        const known = Math.max(0, Math.min(daysIn(period), diffDays(habit.startDay ?? today, today)));
        const h = noise(habit.id);
        const doneMood = r1(6.3 + h * 1.4);
        return { habitId: habit.id, title: habit.title, doneMood, notDoneMood: r1(doneMood - 0.1 - noise(`${habit.id}x`) * 1.5), known };
      })
      .filter((row) => row.known >= INSIGHT_THRESHOLDS.habits)
      .sort((a, b) => b.doneMood - b.notDoneMood - (a.doneMood - a.notDoneMood))
      .map((row) => ({ habitId: row.habitId, title: row.title, doneMood: row.doneMood, notDoneMood: row.notDoneMood }));
  }

  function build(id: InsightPatternId, period: InsightsPeriod): InsightPatternResult {
    const days = daysIn(period);
    const factor = days / 28;
    const collecting = (have: number): InsightPatternResult | null =>
      have < INSIGHT_THRESHOLDS[id] ? { status: "collecting", have, need: INSIGHT_THRESHOLDS[id] } : null;

    switch (id) {
      case "focus": {
        const started = Math.round(44 * factor);
        const gate = collecting(started);
        if (gate) return gate;
        const scale = period === "4w" ? 1 : period === "3m" ? 0.94 : 0.88;
        const work = focusStats(WORK_PROFILE, Math.round(35 * factor), Math.round(31 * factor), scale);
        const weekend = focusStats(WEEKEND_PROFILE, Math.round(9 * factor), Math.round(7 * factor), scale);
        const all = focusStats(
          WORK_PROFILE.map((value, hour) => (value * 5 + WEEKEND_PROFILE[hour]! * 2) / 7),
          started,
          Math.round(38 * factor),
          scale,
        );
        return { status: "ready", pattern: { id: "focus", byDays: { all, work, weekend } } };
      }
      case "time": {
        const gate = collecting(days);
        if (gate) return gate;
        const weekOrder = Array.from({ length: 7 }, (_, index) => (IRAN_WEEK.weekStartsOn + index) % 7);
        const tilt = period === "4w" ? 1 : period === "3m" ? 0.92 : 0.85;
        return {
          status: "ready",
          pattern: {
            id: "time",
            days: weekOrder.map((weekday, index) => ({
              weekday,
              minutes: {
                personal: Math.round(TIME_HOURS.personal[index]! * 60 * tilt),
                projects: Math.round(TIME_HOURS.projects[index]! * 60 * (2 - tilt)),
                teams: Math.round(TIME_HOURS.teams[index]! * 60),
                companies: Math.round(TIME_HOURS.companies[index]! * 60),
                other: Math.round(TIME_HOURS.other[index]! * 60),
              },
            })),
            previousShare: PREVIOUS_SHARE,
            topProject: "Website redesign",
          },
        };
      }
      case "signals": {
        const series = signals(period);
        const gate = collecting(period === "4w" ? series.length : days);
        if (gate) return gate;
        const avg = (values: number[]) => (values.length ? r1(values.reduce((sum, value) => sum + value, 0) / values.length) : 0);
        return {
          status: "ready",
          pattern: {
            id: "signals",
            days: series,
            moodWithFocus: avg(series.filter((day) => day.focus >= FOCUS_DAY_SCORE).map((day) => day.mood)),
            moodWithoutFocus: avg(series.filter((day) => day.focus < FOCUS_DAY_SCORE).map((day) => day.mood)),
          },
        };
      }
      case "estimates": {
        const gate = collecting(Math.round(30 * factor));
        if (gate) return gate;
        const top = ESTIMATES[0]!;
        // Conservative: round the overrun down to a 25% step (×1.6 → +50%).
        const bufferPercent = Math.floor(((top.ratio - 1) * 100) / 25) * 25;
        return {
          status: "ready",
          pattern: { id: "estimates", categories: ESTIMATES.map((row) => ({ ...row })), suggestion: bufferPercent > 0 ? { category: top.id, bufferPercent } : null },
        };
      }
      case "habits": {
        const rows = habitRows(period);
        if (!rows.length) return { status: "collecting", have: Math.min(days, INSIGHT_THRESHOLDS.habits - 1), need: INSIGHT_THRESHOLDS.habits };
        return { status: "ready", pattern: { id: "habits", rows } };
      }
    }
  }

  return {
    highlight() {
      return respond(historyDays >= INSIGHTS_REQUIRED_DAYS ? highlight : null);
    },
    summary(_day, period) {
      const activeDays = Math.min(historyDays, PERIOD_DAYS[period]);
      let headline: InsightsSummary["headline"] = null;
      const focus = build("focus", period);
      const topHabit = habitRows(period)[0];
      if (activeDays >= INSIGHTS_REQUIRED_DAYS && focus.status === "ready" && topHabit) {
        const pattern = focus.pattern as Extract<InsightPattern, { id: "focus" }>;
        headline = { focusWindow: pattern.byDays.all.bestWindow, habitId: topHabit.habitId, habitTitle: topHabit.title };
      }
      return respond({ period, activeDays, requiredDays: INSIGHTS_REQUIRED_DAYS, headline });
    },
    async pattern(id, _day, period) {
      if (failing.includes(id)) {
        await respond(null);
        throw new Error(`Couldn't calculate the ${id} pattern`);
      }
      // build() narrows by id at runtime; the generic return cannot be inferred from the switch.
      return respond(build(id, period) as never);
    },
  };
}
