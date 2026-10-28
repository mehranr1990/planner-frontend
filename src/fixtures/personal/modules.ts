/*
 * SAMPLE DATA — the module reads Overview (P01) shows: habits, goals, mood,
 * the budget month and one insight, as drawn on the P01 board for the sample
 * day (Tue 21 Mehr 1405 = 2026-10-13).
 */

import type { Goal, Habit, InsightHighlight, JournalEntry, MoodEntry } from "@/data/domain";
import { SAMPLE_DAY, sampleDays, sampleInstant } from "./sample-day";

/** Marks every export in this module as sample content. */
export const isSampleData = true;

const FRIDAY = 5;

/** P12: the sample habits (but Read) started on 10 Mordad 1405. */
const HABITS_START = "2026-08-01";

/** "Read" — the pinned habit: an 11-day streak up to yesterday (Fridays rest), not done yet today. */
const readDays = [
  "2026-09-30",
  "2026-10-01",
  "2026-10-03",
  "2026-10-04",
  "2026-10-05",
  "2026-10-06",
  "2026-10-07",
  "2026-10-08",
  "2026-10-10",
  "2026-10-11",
  "2026-10-12",
];

/** P01 Habits card: Water, Walk and Meditate are done today (3 of 5). */
export const sampleHabits: readonly Habit[] = [
  {
    id: "h-water",
    title: "Water",
    pinned: false,
    doneDays: [sampleDays.yesterday, SAMPLE_DAY],
    restWeekdays: [],
    icon: "droplet",
    area: "Health",
    startDay: HABITS_START,
    target: { amount: 8, unit: "glasses" },
    amounts: { [SAMPLE_DAY]: 8 },
    timeOfDay: "anytime",
  },
  {
    id: "h-read",
    title: "Read",
    pinned: true,
    doneDays: readDays,
    restWeekdays: [FRIDAY],
    icon: "book",
    area: "Learning",
    startDay: "2026-09-01",
    target: { amount: 20, unit: "pages" },
    timeOfDay: "evening",
    preferredTime: "20:00",
    reminder: { time: "20:00", ifNotDone: true },
  },
  {
    id: "h-walk",
    title: "Walk",
    pinned: false,
    doneDays: [sampleDays.sunday, SAMPLE_DAY],
    restWeekdays: [],
    icon: "footprints",
    area: "Health",
    startDay: HABITS_START,
    skippedDays: [sampleDays.saturday],
    timeOfDay: "afternoon",
    preferredTime: "17:15",
  },
  { id: "h-meditate", title: "Meditate", pinned: false, doneDays: [sampleDays.yesterday, SAMPLE_DAY], restWeekdays: [], icon: "brain", startDay: HABITS_START, timeOfDay: "morning", preferredTime: "07:00" },
  { id: "h-journal", title: "Journal", pinned: false, doneDays: [sampleDays.yesterday], restWeekdays: [], icon: "pen", startDay: HABITS_START, timeOfDay: "evening" },
];

/**
 * P01 Goals card and P11 Goals: four active goals (the first three feed
 * Overview), three completed, one archived. Jalali: 1 Aban = 2026-10-23,
 * 1 Azar = 2026-11-22, 29 Esfand 1405 = 2027-03-20.
 */
export const sampleGoals: readonly Goal[] = [
  {
    id: "g-launch-planner-v1",
    title: "Launch Planner v1",
    progress: 0.64,
    status: "on-track",
    nextStep: "Beta",
    // 20 Aban 1405
    nextStepDay: "2026-11-11",
    area: "side project",
    target: "public launch with 40 beta users",
    // 30 Azar
    dueDay: "2026-12-21",
    milestones: [
      { id: "m-brief", title: "Brief", dueDay: "2026-09-23", doneDay: "2026-09-23", nextAction: "Goal agreed" },
      { id: "m-research", title: "Research", dueDay: "2026-09-30", doneDay: "2026-09-30", nextAction: "12 interviews" },
      { id: "m-design", title: "Design", dueDay: "2026-10-10", doneDay: "2026-10-10", nextAction: "Design pages" },
      // 2 Aban
      { id: "m-development", title: "Development", dueDay: "2026-10-24", doneDay: null, nextAction: "finish API" },
      { id: "m-beta", title: "Beta", dueDay: "2026-11-11", doneDay: null, nextAction: "50 beta users" },
    ],
    keyResults: [
      { id: "kr-screens", title: "Ship 6 core screens", current: 4, target: 6 },
      { id: "kr-beta", title: "Beta testers signed up", current: 18, target: 40 },
      { id: "kr-crash", title: "Crash-free sessions", current: 99.2, target: 99.5, unit: "%" },
    ],
    money: { label: "Budget · launch costs", savedToman: 3_200_000, targetToman: 8_000_000 },
    notes: "Why: a calm planner I actually use. Scope: Personal only for v1.",
  },
  {
    id: "g-run-100km",
    title: "Run 100 km this month",
    progress: 0.41,
    status: "on-track",
    nextStep: "5 km run",
    nextStepDay: sampleDays.tomorrow,
    area: "Health",
    // 30 Mehr
    dueDay: "2026-10-22",
    measure: { current: 41, target: 100, unit: "km" },
    habitIds: ["h-walk"],
  },
  {
    id: "g-emergency-fund",
    title: "Emergency fund",
    progress: 0.28,
    status: "behind",
    nextStep: null,
    nextStepDay: null,
    behindDays: 3,
    area: "Finance",
    target: "60M Toman saved",
    dueDay: "2027-03-20",
    milestones: [
      { id: "m-fund-10", title: "10M saved", dueDay: "2026-08-22", doneDay: "2026-08-20" },
      { id: "m-fund-20", title: "20M saved", dueDay: sampleDays.saturday, doneDay: null, nextAction: "Add 2M transfer on 1 Aban" },
      { id: "m-fund-40", title: "40M saved", dueDay: "2027-01-20", doneDay: null },
    ],
    money: { label: "Savings · emergency fund", savedToman: 16_800_000, targetToman: 60_000_000 },
  },
  {
    id: "g-read-12-books",
    title: "Read 12 books",
    progress: 0.58,
    status: "on-track",
    nextStep: "Book 7 · “Deep Work”",
    nextStepDay: null,
    area: "Learning",
    dueDay: "2027-03-20",
    measure: { current: 7, target: 12, unit: "books" },
    habitIds: ["h-read"],
  },
  {
    id: "g-couch-to-5k",
    title: "Couch to 5K",
    progress: 1,
    status: "on-track",
    nextStep: null,
    nextStepDay: null,
    area: "Health",
    lifecycle: "completed",
    completedDay: "2026-09-28",
  },
  {
    id: "g-new-laptop",
    title: "Save for a new laptop",
    progress: 1,
    status: "on-track",
    nextStep: null,
    nextStepDay: null,
    area: "Finance",
    lifecycle: "completed",
    completedDay: "2026-08-14",
  },
  {
    id: "g-portfolio-site",
    title: "Portfolio site",
    progress: 1,
    status: "on-track",
    nextStep: null,
    nextStepDay: null,
    area: "side project",
    lifecycle: "completed",
    completedDay: "2026-07-02",
  },
  {
    id: "g-learn-italian",
    title: "Learn Italian basics",
    progress: 0.12,
    status: "on-track",
    nextStep: null,
    nextStepDay: null,
    area: "Learning",
    lifecycle: "archived",
  },
];

/** P01 Mood card: the last seven days, today "Good" with medium energy, checked in at 09:10. */
export const sampleMoods: readonly MoodEntry[] = (
  [
    ["2026-10-07", 3, "medium", 21],
    ["2026-10-08", 4, "high", 21],
    ["2026-10-09", 3, "low", 22],
    ["2026-10-10", 5, "high", 21],
    ["2026-10-11", 4, "medium", 20],
    ["2026-10-12", 4, "medium", 21],
    [SAMPLE_DAY, 4, "medium", 9],
  ] as const
).map(([day, mood, energy, hour]) => ({ day, mood, energy, at: sampleInstant(day, hour, hour === 9 ? 10 : 0) }));

/** P01 Insight card: "Your best focus is 09–12. Today's deep work is already booked there." */
export const sampleInsight: InsightHighlight = {
  id: "i-best-focus-window",
  kind: "best-focus-window",
  startHour: 9,
  endHour: 12,
  bookedToday: true,
};

/**
 * P14 Journal: what was written on the check-in days (board copy). The mock
 * merges each onto that day's mood; today stays a check-in-only entry.
 */
export const sampleJournal: readonly JournalEntry[] = (
  [
    ["2026-10-12", "Long walk after work, finally finished the budget sheet.", ["walk"], 21],
    ["2026-10-11", "Slept badly. Kept the day small and that was fine.", ["sleep"], 20],
    ["2026-10-10", "Family lunch at maman's. Planned the week in 15 minutes.", ["family"], 21],
    ["2026-10-08", "Good energy all day. Closed the onboarding ticket.", ["work"], 21],
  ] as const
).map(([day, text, tags, hour]) => {
  const mood = sampleMoods.find((entry) => entry.day === day)!;
  return {
    day,
    mood: mood.mood,
    energy: mood.energy,
    checkedInAt: mood.at,
    wentWell: "",
    text,
    prompts: [],
    tags: [...tags],
    updatedAt: sampleInstant(day, hour, 30),
  };
});
