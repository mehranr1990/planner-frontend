/*
 * SAMPLE DATA for TM-12 Team analytics: past weeks W31–W41 (Saturdays from
 * 1 Aug to 3 Oct 2026) of each team's plan history; the current week (W42)
 * comes live from the week plan. Done-task mix over 12 weeks by source
 * (prorated by the mock for shorter ranges). Team-level only: nothing per
 * person. partner-portal / android-sdk / data-migration are projects the
 * viewer cannot open (only an "Other projects" aggregate for Lead/Admin).
 */

export interface TeamPlanHistory {
  planned: readonly number[];
  done: readonly number[];
  carried: readonly number[];
  cycleMedianDays: number;
  /** Done tasks by source over 12 weeks: "team" or a project id. */
  mix12w: Readonly<Record<string, number>>;
}

export const FIRST_HISTORY_WEEK = "2026-08-01";

export const teamPlanHistory: Readonly<Record<string, TeamPlanHistory>> = {
  design: {
    planned: [14, 17, 16, 18, 17, 16, 15, 19, 16, 15, 18],
    done: [12, 13, 15, 12, 16, 11, 12, 15, 13, 12, 15],
    carried: [2, 3, 1, 4, 1, 4, 2, 3, 2, 2, 2],
    cycleMedianDays: 2.8,
    mix12w: { team: 95, "website-redesign": 33, "planner-app": 25, "partner-portal": 12 },
  },
  mobile: {
    planned: [8, 9, 8, 10, 9, 9, 8, 10, 9, 8, 9],
    done: [7, 8, 7, 8, 8, 7, 7, 9, 8, 7, 8],
    carried: [1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1],
    cycleMedianDays: 2.1,
    mix12w: { team: 60, "mobile-onboarding": 30, "android-sdk": 9 },
  },
  growth: {
    planned: [5, 6, 6, 5, 7, 6, 6, 5, 6, 7, 6],
    done: [4, 5, 5, 4, 6, 5, 5, 4, 5, 6, 5],
    carried: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    cycleMedianDays: 3.4,
    mix12w: { team: 40, "spring-campaign": 18, "website-redesign": 6, "data-migration": 4 },
  },
};
