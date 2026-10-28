import type { Task, TaskLink } from "@/data/domain";
import { addDaysToDay } from "@/lib/dates/clock-time";

/*
 * Pure rules of the P06 task detail: which folder tabs show, which
 * dependencies still block (softly), and when a weekly task comes back.
 */

export type DetailTab = "subtasks" | "notes" | "activity" | "links";

type Dependency = Extract<TaskLink, { kind: "blockedBy" | "blocks" }>;

/** Subtasks and Notes always; Activity and Links only with content. */
export function detailTabs(task: Pick<Task, "activity" | "links">): DetailTab[] {
  const tabs: DetailTab[] = ["subtasks", "notes"];
  if (task.activity?.length) tabs.push("activity");
  if (task.links?.length) tabs.push("links");
  return tabs;
}

/** Open "blocked by" dependencies: a soft warning before completing, never a hard block. */
export function openBlockers(task: Pick<Task, "links">): Dependency[] {
  return (task.links ?? []).filter((link): link is Dependency => link.kind === "blockedBy" && !link.done);
}

/** The next occurrence of a recurring (weekly) task, or null when it has no date or does not repeat. */
export function nextOccurrence(task: Pick<Task, "recurring" | "date">): string | null {
  return task.recurring && task.date ? addDaysToDay(task.date, 7) : null;
}
