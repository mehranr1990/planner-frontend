import type { InboxItem, InboxState, Task, TaskStatus, TimeBlock } from "./domain";

/*
 * The data seam. UI reaches data only through these interfaces (via the
 * React Query hooks in queries.ts); the mock adapter implements them today,
 * a typed API client or an offline store can implement them later without
 * touching a component. Every method is async so any of those fits.
 *
 * Filtering and ordering are the adapter's job, never the UI's.
 */

export type TaskView = "today" | "upcoming" | "all" | "completed";

export interface TaskQuery {
  /**
   * - today: tasks dated `day` (any status) plus open overdue tasks
   * - upcoming: open tasks dated after `day`
   * - all: every task, dated or not
   * - completed: done tasks, most recently completed first
   *
   * Without a view, `day` alone returns the tasks dated on that day; with
   * neither, every task (as "all").
   */
  view?: TaskView;
  /** Calendar day "YYYY-MM-DD": "today" for the views; defaults to the adapter's today. */
  day?: string;
  status?: TaskStatus;
}

export interface TasksRepository {
  list(query?: TaskQuery): Promise<Task[]>;
  get(id: string): Promise<Task | null>;
}

export interface BlocksRepository {
  /** Blocks overlapping the calendar day, in start order. */
  listForDay(day: string): Promise<TimeBlock[]>;
}

export interface InboxRepository {
  /** Items in one state (all states when omitted), newest capture first. */
  list(state?: InboxState): Promise<InboxItem[]>;
  /** Untriaged items only — the rail and More badge (P07: "not snoozed"). */
  count(): Promise<number>;
}

export interface Repositories {
  tasks: TasksRepository;
  blocks: BlocksRepository;
  inbox: InboxRepository;
}
