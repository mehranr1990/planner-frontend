import { personalFixtures } from "@/fixtures/personal";
import { APP_TIME_ZONE, toZonedTime } from "@/lib/dates/zone";
import type { InboxItem, InboxState, Task, TimeBlock } from "../domain";
import type { Repositories, TaskQuery } from "../repositories";

/*
 * In-memory adapter over the sample fixtures. Deterministic: "today" is a
 * fixture constant, never the clock. Every read returns deep clones, so a
 * caller mutating a result can never change the fixtures or a later read.
 */

export interface MockFixtures {
  /** The adapter's "today" (calendar day "YYYY-MM-DD"). */
  today: string;
  tasks: readonly Task[];
  blocks: readonly TimeBlock[];
  inbox: readonly InboxItem[];
}

export interface MockRepositoriesOptions {
  /** Replaces parts of the default sample set. */
  fixtures?: Partial<MockFixtures>;
  /** Artificial delay per call, for loading states in previews. Default 0. */
  latencyMs?: number;
}

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 } as const;

const pad = (value: number) => String(value).padStart(2, "0");

/** Calendar day "YYYY-MM-DD" of an instant in the planner's time zone. */
function calendarDay(instant: string): string {
  const zoned = toZonedTime(new Date(instant), APP_TIME_ZONE);
  return `${zoned.getFullYear()}-${pad(zoned.getMonth() + 1)}-${pad(zoned.getDate())}`;
}

/** Dated before undated, then by day, time (timed first), priority; stable otherwise. */
function compareTasks(a: Task, b: Task): number {
  return (
    compareNullable(a.date, b.date) ||
    compareNullable(a.time, b.time) ||
    (a.priority ? PRIORITY_RANK[a.priority] : 4) - (b.priority ? PRIORITY_RANK[b.priority] : 4)
  );
}

/** Ascending; null sorts last. */
function compareNullable(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

function byCompletedAtDesc(a: Task, b: Task): number {
  return instantMs(b.completedAt) - instantMs(a.completedAt);
}

function instantMs(instant: string | undefined): number {
  return instant ? Date.parse(instant) : 0;
}

function matchesView(task: Task, view: TaskQuery["view"], day: string): boolean {
  switch (view) {
    case "today":
      return task.date === day || (task.status === "open" && task.date !== null && task.date < day);
    case "upcoming":
      return task.status === "open" && task.date !== null && task.date > day;
    case "completed":
      return task.status === "done";
    case "all":
      return true;
    default:
      return task.date === day;
  }
}

export function createMockRepositories({ fixtures, latencyMs = 0 }: MockRepositoriesOptions = {}): Repositories {
  const data: MockFixtures = { ...personalFixtures, ...fixtures };

  /** Resolves a deep clone after the configured latency. */
  async function respond<T>(value: T): Promise<T> {
    if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs));
    return structuredClone(value);
  }

  return {
    tasks: {
      list(query = {}) {
        const day = query.day ?? data.today;
        // No view and no day: everything (the "all" view).
        const view = query.view ?? (query.day ? undefined : "all");
        const tasks = data.tasks.filter(
          (task) => matchesView(task, view, day) && (!query.status || task.status === query.status),
        );
        tasks.sort(view === "completed" ? byCompletedAtDesc : compareTasks);
        return respond(tasks);
      },
      get(id) {
        return respond(data.tasks.find((task) => task.id === id) ?? null);
      },
    },
    blocks: {
      listForDay(day) {
        const blocks = data.blocks
          .filter((block) => calendarDay(block.start) <= day && day <= calendarDay(lastMoment(block.end)))
          .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
        return respond(blocks);
      },
    },
    inbox: {
      list(state?: InboxState) {
        const items = data.inbox
          .filter((item) => !state || item.state === state)
          .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
        return respond(items);
      },
      count() {
        return respond(data.inbox.filter((item) => item.state === "untriaged").length);
      },
    },
  };
}

/** The instant just before `end`, so a block ending at midnight stays on its own day. */
function lastMoment(end: string): string {
  return new Date(Date.parse(end) - 1).toISOString();
}
