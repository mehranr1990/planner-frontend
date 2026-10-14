/*
 * SAMPLE DATA for the component and navigation styleguide pages. Static, no
 * domain logic: names are literal sample people; everything else that is
 * visible is translated (Styleguide namespace) by key.
 */

import type { AvatarGroupPerson } from "@/components/ui/avatar";

export const priorityOptions = [
  { value: "urgent", dot: "bg-danger" },
  { value: "high", dot: "bg-warning" },
  { value: "normal", dot: "bg-project-dot" },
  { value: "low", dot: "bg-icon-muted" },
] as const;

export type PriorityValue = (typeof priorityOptions)[number]["value"];

export const labelOptions = ["ui", "dashboard", "research", "bug", "copy"] as const;
export type LabelValue = (typeof labelOptions)[number];

export const repeatOptions = ["never", "daily", "workweek", "weekly", "custom"] as const;

export const samplePeople: readonly AvatarGroupPerson[] = [
  { name: "Kate Fischer", initials: "KF", tone: "team" },
  { name: "Jonathan Kelly", initials: "JK", tone: "personal" },
  { name: "Sara Parvizi", initials: "SP", tone: "project" },
  { name: "Peter Thomas", initials: "PT", tone: "company" },
  { name: "Mina Rahimi", initials: "MR", tone: "neutral" },
];

/** Ring card history (Cards board · Monthly focus): hours per month, goal 200. */
export const ringGoalHours = 200;
export const ringPeriods = [
  { id: "jul", hours: 104 },
  { id: "aug", hours: 122 },
  { id: "sep", hours: 140 },
  { id: "oct", hours: 160 },
] as const;
export type RingPeriodId = (typeof ringPeriods)[number]["id"];

export const ringTotalHours = 45;
export const ringEarnedToman = 1_700_000;

/** Rows for the ScrollArea sample. */
export const scrollRowCount = 12;

/** Async demos (confirm, submit) settle after this delay. */
export const SAMPLE_LATENCY_MS = 1200;

export function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
