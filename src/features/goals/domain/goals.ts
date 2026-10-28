import type { Goal, GoalMilestone } from "@/data/domain";
import type { MilestoneNodeState } from "@/design-system/data-display/goal-milestone-path";
import { diffDays } from "@/lib/dates/clock-time";

/*
 * Pure P11 rules: which goals each list shows, the state of each milestone
 * on the path, the default folder tab, and what "Plan next step" plans.
 */

export const GOAL_TABS = ["journey", "results", "linked", "notes"] as const;
export type GoalTab = (typeof GOAL_TABS)[number];

export const LIST_TABS = ["active", "completed", "archived"] as const;
export type GoalListTab = (typeof LIST_TABS)[number];

/** A completed goal stays in Active (in its Completed state) for this many days, then moves to Completed. */
export const COMPLETED_GRACE_DAYS = 3;

export function isGoalTab(value: string | null | undefined): value is GoalTab {
  return typeof value === "string" && (GOAL_TABS as readonly string[]).includes(value);
}

export function isListTab(value: string | null | undefined): value is GoalListTab {
  return typeof value === "string" && (LIST_TABS as readonly string[]).includes(value);
}

/** Recently completed goals (within the grace days) still show under Active. */
export function inGrace(goal: Goal, today: string): boolean {
  return goal.lifecycle === "completed" && !!goal.completedDay && diffDays(goal.completedDay, today) < COMPLETED_GRACE_DAYS;
}

/** The Active list: active goals, then goals completed in the last few days. */
export function activeList(active: readonly Goal[], completed: readonly Goal[], today: string): Goal[] {
  return [...active, ...completed.filter((goal) => inGrace(goal, today))];
}

/** The Completed list leaves out goals still in their Active grace days. */
export function completedList(completed: readonly Goal[], today: string): Goal[] {
  return completed.filter((goal) => !inGrace(goal, today));
}

export const hasMilestones = (goal: Goal) => (goal.milestones?.length ?? 0) > 0;
export const hasKeyResults = (goal: Goal) => (goal.keyResults?.length ?? 0) > 0;

/** Key results become the default tab when a goal has them but no milestones. */
export function defaultTab(goal: Goal): GoalTab {
  return !hasMilestones(goal) && hasKeyResults(goal) ? "results" : "journey";
}

/** The milestone in progress: the first one not reached. */
export function currentMilestone(goal: Goal): GoalMilestone | null {
  return goal.milestones?.find((item) => !item.doneDay) ?? null;
}

/** The next milestone to plan for (P11: "Next milestone · Beta" while Development is in progress). */
export function nextMilestone(goal: Goal): GoalMilestone | null {
  const open = (goal.milestones ?? []).filter((item) => !item.doneDay);
  return open[1] ?? open[0] ?? null;
}

/** Path state of a milestone; the one in progress turns "late" once its due day has passed. */
export function milestoneState(goal: Goal, milestone: GoalMilestone, today: string): MilestoneNodeState {
  if (milestone.doneDay) return "done";
  if (milestone !== currentMilestone(goal)) return "next";
  return milestone.dueDay && milestone.dueDay < today ? "late" : "current";
}

/** Days the milestone in progress is behind (0 when on time). */
export function lateDays(goal: Goal, today: string): number {
  const current = currentMilestone(goal);
  if (!current?.dueDay || current.dueDay >= today) return goal.status === "behind" ? (goal.behindDays ?? 0) : 0;
  return diffDays(current.dueDay, today);
}

export function isDelayed(goal: Goal, today: string): boolean {
  return goal.lifecycle !== "completed" && (goal.status === "behind" || lateDays(goal, today) > 0);
}

export function isReached(goal: Goal): boolean {
  return goal.lifecycle === "completed" || goal.progress >= 1;
}

/** Calendar days from today to the deadline (negative once passed), or null without one. */
export function daysLeft(goal: Goal, today: string): number | null {
  return goal.dueDay ? diffDays(today, goal.dueDay) : null;
}

/** "Plan next step": the task title — the milestone's next action, else the milestone itself. */
export function planStepTitle(milestone: GoalMilestone): string {
  return milestone.nextAction?.trim() || milestone.title;
}
