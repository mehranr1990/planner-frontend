import type { FocusSummary, Goal, GoalMilestone, Habit, MoodEntry, MoodLevel, ReviewStep, ReviewWin, Task } from "@/data/domain";
import { completion } from "@/features/habits/domain/habits";
import { currentMilestone, isDelayed } from "@/features/goals/domain/goals";
import { outcome, type RouteDraft } from "@/features/shutdown/domain/shutdown";
import { addDaysToDay, dayOfInstant, dayToLocalDate, localDateToDay, weekdayOfDay } from "@/lib/dates/clock-time";
import { parseDateParam } from "@/lib/dates/date-param";
import { getDayKind, getWeekDates, type DayKind, type WeekConfig } from "@/lib/dates/week";

/*
 * P16 Weekly review, pure: the week's days and whether it can be reviewed
 * yet, what got done and what slipped, habits and mood as two numbers, goal
 * deltas, win suggestions, the Weekly Story's tone and next week's strip.
 */

export const REVIEW_STEPS: readonly ReviewStep[] = ["wins", "carry", "goals", "plan", "reflect"];
export const MAX_WINS = 5;
export const MAX_PRIORITIES = 3;
/** "Weekly Review unlocks after 3 days of planning." */
export const MIN_REVIEW_DAYS = 3;
/** A habit counts as kept at this share of its scheduled days. */
export const KEPT_RATIO = 0.8;

export function isReviewStep(value: string | null | undefined): value is ReviewStep {
  return REVIEW_STEPS.includes(value as ReviewStep);
}

/** The 7 calendar days of the week a :week param (Jalali "1405-07-18") falls in; null when it is not a date. */
export function reviewWeekDays(param: string, week: WeekConfig): string[] | null {
  const date = parseDateParam(param);
  return date ? getWeekDates(date, week).map(localDateToDay) : null;
}

export type ReviewAvailability = { status: "open" } | { status: "too-early"; firstReviewDay: string };

/**
 * Open once at least three of the week's days have passed (today counts);
 * past weeks are always open. Too early, it names the review day (Settings ›
 * weekly review weekday) inside the week, or the week's last day.
 */
export function reviewAvailability(days: readonly string[], today: string, reviewWeekday: number): ReviewAvailability {
  const elapsed = days.filter((day) => day <= today).length;
  if (elapsed >= MIN_REVIEW_DAYS) return { status: "open" };
  const firstReviewDay = days.find((day) => weekdayOfDay(day) === reviewWeekday) ?? days.at(-1)!;
  return { status: "too-early", firstReviewDay };
}

export interface WeekTasks {
  /** Completed during the week (by completion day, else planned day). */
  completed: Task[];
  /** Still open, planned on a day of the week up to today. */
  unfinished: Task[];
}

export function weekTasks(tasks: readonly Task[], days: readonly string[], today: string): WeekTasks {
  const inWeek = new Set(days);
  const completed = tasks.filter((task) => task.status === "done" && inWeek.has(task.completedAt ? dayOfInstant(task.completedAt) : (task.date ?? "")));
  const unfinished = tasks.filter((task) => task.status === "open" && task.date !== null && inWeek.has(task.date) && task.date <= today);
  return { completed, unfinished };
}

export interface CarryCounts {
  planned: number;
  completed: number;
  /** Routed to another day (tomorrow, a picked day, this week). */
  moved: number;
  /** Left where they are. */
  overdue: number;
  inbox: number;
  dropped: number;
}

/** The Carry-over Flow's counts: Daily Shutdown's outcome over the week, Tomorrow and Later folded into "moved". */
export function carryCounts(completed: number, unfinished: readonly Task[], draft: RouteDraft): CarryCounts {
  const day = outcome(completed, unfinished, draft);
  return { planned: day.planned, completed: day.completed, moved: day.tomorrow + day.later, overdue: day.overdue, inbox: day.inbox, dropped: day.dropped };
}

export interface HabitsWeek {
  /** Habits at or above KEPT_RATIO of their scheduled days. */
  kept: number;
  /** Habits with at least one day that counted. */
  total: number;
  /** Done ÷ counted days across all habits; null without any. */
  rate: number | null;
}

export function habitsWeek(habits: readonly Habit[], days: readonly string[], today: string): HabitsWeek {
  let kept = 0;
  let total = 0;
  let done = 0;
  let possible = 0;
  for (const habit of habits) {
    if (habit.archived) continue;
    const result = completion(habit, days, today);
    if (result.ratio === null) continue;
    total += 1;
    done += result.done;
    possible += result.possible;
    if (result.ratio >= KEPT_RATIO) kept += 1;
  }
  return { kept, total, rate: possible ? done / possible : null };
}

/** Mean mood of the check-ins on `days`; null without any. */
export function averageMood(moods: readonly MoodEntry[], days: readonly string[]): number | null {
  const inWeek = moods.filter((entry) => days.includes(entry.day));
  return inWeek.length ? inWeek.reduce((sum, entry) => sum + entry.mood, 0) / inWeek.length : null;
}

export function moodLevel(average: number): MoodLevel {
  return Math.min(5, Math.max(1, Math.round(average))) as MoodLevel;
}

export function focusMinutes(days: readonly (FocusSummary | null)[], sessionMinutes: number): number {
  return days.reduce((sum, day) => sum + (day?.sessionsCompleted ?? 0) * sessionMinutes, 0);
}

export type StoryTone = "good" | "mixed" | "hard";

/** Never punishing: "hard" only picks the calm colours and kind copy. */
export function storyTone({ doneRatio, mood }: { doneRatio: number | null; mood: number | null }): StoryTone {
  const score = [doneRatio === null ? null : doneRatio * 5, mood].filter((value): value is number => value !== null);
  if (!score.length) return "mixed";
  const mean = score.reduce((sum, value) => sum + value, 0) / score.length;
  return mean >= 3.5 ? "good" : mean < 2.5 ? "hard" : "mixed";
}

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 } as const;

/** Wins worth keeping: milestones reached, week-long streaks, then the most important completed tasks. */
export function suggestWins(
  completed: readonly Task[],
  goals: readonly Goal[],
  habits: readonly Habit[],
  days: readonly string[],
  today: string,
  limit = 8,
): ReviewWin[] {
  const milestones: ReviewWin[] = goals.flatMap((goal) =>
    (goal.milestones ?? [])
      .filter((milestone) => milestone.doneDay !== null && days.includes(milestone.doneDay))
      .map((milestone) => ({ id: `milestone:${milestone.id}`, title: `${milestone.title} · ${goal.title}`, source: "milestone" as const })),
  );
  const streaks: ReviewWin[] = habits
    .filter((habit) => {
      const week = completion(habit, days, today);
      return !habit.archived && week.ratio === 1 && week.done >= MIN_REVIEW_DAYS;
    })
    .map((habit) => ({ id: `habit:${habit.id}`, title: habit.title, source: "habit" as const }));
  const tasks: ReviewWin[] = [...completed]
    .sort((a, b) => (a.priority ? PRIORITY_RANK[a.priority] : 4) - (b.priority ? PRIORITY_RANK[b.priority] : 4))
    .map((task) => ({ id: `task:${task.id}`, title: task.title, source: "task" as const }));
  return [...milestones, ...streaks, ...tasks].slice(0, limit);
}

export interface GoalWeek {
  goal: Goal;
  /** Progress gained this week (0–1): the share of milestones reached during the week. */
  delta: number;
  next: GoalMilestone | null;
  delayed: boolean;
}

export function goalsWeek(goals: readonly Goal[], days: readonly string[], today: string): GoalWeek[] {
  return goals
    .filter((goal) => (goal.lifecycle ?? "active") === "active")
    .map((goal) => {
      const milestones = goal.milestones ?? [];
      const reached = milestones.filter((milestone) => milestone.doneDay !== null && days.includes(milestone.doneDay)).length;
      return {
        goal,
        delta: milestones.length ? reached / milestones.length : 0,
        next: currentMilestone(goal),
        delayed: isDelayed(goal, today),
      };
    });
}

export interface PlanDay {
  day: string;
  kind: DayKind;
  /** Working minutes the day offers (half on Thursday, none on Friday). */
  capacityMinutes: number;
  /** Minutes already planned there plus carry-over tasks placed on it. */
  loadMinutes: number;
  /** Carry-over task ids placed on the day. */
  placed: string[];
}

/** Next week's strip: the 7 days after `days`, their capacity and load. */
export function nextWeekPlan(
  days: readonly string[],
  tasks: readonly Task[],
  placements: Readonly<Record<string, string>>,
  { workMinutes, defaultDuration, week }: { workMinutes: number; defaultDuration: number; week: WeekConfig },
): PlanDay[] {
  const placedIds = new Set(Object.keys(placements));
  return Array.from({ length: 7 }, (_, index) => {
    const day = addDaysToDay(days[0]!, 7 + index);
    const kind = getDayKind(dayToLocalDate(day), week);
    const placed = Object.entries(placements).flatMap(([id, target]) => (target === day ? [id] : []));
    const loadMinutes = tasks
      .filter((task) => task.status === "open" && (placedIds.has(task.id) ? placements[task.id] === day : task.date === day))
      .reduce((sum, task) => sum + (task.durationMinutes ?? defaultDuration), 0);
    const capacityMinutes = kind === "work" ? workMinutes : kind === "half" ? Math.round(workMinutes / 2) : 0;
    return { day, kind, capacityMinutes, loadMinutes, placed };
  });
}
