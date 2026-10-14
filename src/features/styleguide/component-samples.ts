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

/** Habit ring card (P00 D′ · "Read 30 pages"): completion % per Jalali month. */
export const ringPages = 30;
export const ringPeriods = [
  { id: "tir", completion: 84 },
  { id: "mordad", completion: 90 },
  { id: "shahrivar", completion: 76 },
  { id: "mehr", completion: 88 },
] as const;
export type RingPeriodId = (typeof ringPeriods)[number]["id"];

/** Habit details: reminder at 20:00, best streak in days. */
export const ringReminder = new Date(2026, 9, 14, 20, 0);
export const ringBestStreak = 21;

/** Rows for the ScrollArea sample. */
export const scrollRowCount = 12;

/** Async demos (confirm, submit) settle after this delay. */
export const SAMPLE_LATENCY_MS = 1200;

export function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
