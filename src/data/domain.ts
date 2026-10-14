/*
 * Minimal Personal domain types, read off the final boards (P02 My Day,
 * P03 Tasks, P07 Inbox). They describe what the client consumes, in the
 * shape a JSON API would send: calendar days and instants are strings, never
 * Date objects, so a typed API client can return them unchanged.
 *
 * - Calendar day: "YYYY-MM-DD", Gregorian ISO, in the planner's time zone.
 *   The Jalali `?date=` URL form is a presentation concern (date-param.ts).
 * - Instant: ISO 8601 with an explicit offset ("2026-10-13T14:00:00+03:30").
 *
 * Deliberately not a backend model: fields arrive as screens need them.
 */

/** Same union as the design-system scopes; Personal aggregates all four. */
export type Scope = "personal" | "project" | "team" | "company";

export type TaskPriority = "urgent" | "high" | "medium" | "low";

export type EnergyLevel = "low" | "medium" | "high";

export type TaskStatus = "open" | "done";

export interface Area {
  id: string;
  name: string;
}

export interface Task {
  id: string;
  title: string;
  scope: Scope;
  area?: Area;
  /** Project (or side project) name shown on the meta line. */
  project?: string;
  priority: TaskPriority | null;
  energy: EnergyLevel | null;
  durationMinutes: number | null;
  /** Planned calendar day; null = no date (All view only). */
  date: string | null;
  /** "HH:mm" on `date`; null = unscheduled within the day. */
  time: string | null;
  /** Hard deadline day, when one exists ("due Fri 24 Mehr"). */
  deadline?: string;
  status: TaskStatus;
  /** Instant the task was completed (status "done" only). */
  completedAt?: string;
  subtasks?: { done: number; total: number };
  labels?: string[];
  recurring?: boolean;
  goalId?: string;
}

export type TimeBlockKind = "task" | "event" | "routine";

export interface TimeBlock {
  id: string;
  title: string;
  /** Instants with offset. */
  start: string;
  end: string;
  scope: Scope;
  kind: TimeBlockKind;
  /** The task this block schedules (kind "task"). */
  taskId?: string;
  done?: boolean;
}

export type InboxSource = "quick-add" | "voice" | "share" | "note" | "brain-dump";

export type InboxState = "untriaged" | "snoozed" | "archived";

export type InboxDestination = "task" | "event" | "note" | "journal" | "reminder";

export interface InboxItem {
  id: string;
  text: string;
  source: InboxSource;
  /** Instant the item was captured. */
  capturedAt: string;
  state: InboxState;
  /** Instant the item returns to triage (state "snoozed" only). */
  snoozedUntil?: string;
  /** Destination pre-selected from parsing. */
  suggested?: InboxDestination;
}
