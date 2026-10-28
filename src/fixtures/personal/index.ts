/*
 * SAMPLE DATA — the Personal fixture set the mock repositories serve
 * (src/data/mock). Every module here is sample content for the fixed sample
 * day; nothing in production code should import it except the mock adapter.
 */

import type { DayPriorityRef, FocusSummary } from "@/data/domain";
import { sampleBlocks } from "./blocks";
import { sampleBrainDumpPages } from "./brain-dump";
import { sampleInboxItems } from "./inbox";
import { sampleFinance } from "./finance";
import { sampleGoals, sampleHabits, sampleInsight, sampleJournal, sampleMoods } from "./modules";
import { SAMPLE_DAY } from "./sample-day";
import { sampleAreas, sampleGoalTitles, sampleTasks } from "./tasks";

export { sampleBlocks } from "./blocks";
export { sampleBrainDumpPages } from "./brain-dump";
export { sampleInboxItems } from "./inbox";
export { sampleFinance, sampleTransactions, type SampleFinance, type SampleFinanceMonth } from "./finance";
export { sampleGoals, sampleHabits, sampleInsight, sampleJournal, sampleMoods } from "./modules";
export { SAMPLE_DAY, SAMPLE_NOW, sampleDays, sampleInstant } from "./sample-day";
export { sampleAreas, sampleGoalTitles, sampleTasks } from "./tasks";

/** Marks every export in this module as sample content. */
export const isSampleData = true;

/** P02 "Priorities · 3 for today": a task (14:00), the gym routine (17:15) and an unscheduled task. */
export const samplePriorities: Readonly<Record<string, readonly DayPriorityRef[]>> = {
  [SAMPLE_DAY]: [
    { kind: "task", id: "t-ui-design" },
    { kind: "block", id: "gym" },
    { kind: "task", id: "t-review-october-expenses" },
  ],
};

/** P02 Focus card: two Pomodoros done, in the first cycle of four. */
export const sampleFocus: Readonly<Record<string, FocusSummary>> = {
  [SAMPLE_DAY]: { sessionsCompleted: 2, cycle: 1 },
};

export const personalFixtures = {
  today: SAMPLE_DAY,
  tasks: sampleTasks,
  areas: sampleAreas,
  goalTitles: sampleGoalTitles,
  blocks: sampleBlocks,
  inbox: sampleInboxItems,
  priorities: samplePriorities,
  focus: sampleFocus,
  habits: sampleHabits,
  goals: sampleGoals,
  moods: sampleMoods,
  journal: sampleJournal,
  finance: sampleFinance,
  insight: sampleInsight,
  brainDump: sampleBrainDumpPages,
};
