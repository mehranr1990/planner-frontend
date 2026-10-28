import { personalFixtures } from "@/fixtures/personal";
import type { SampleFinance } from "@/fixtures/personal/finance";
import { SAMPLE_NOW } from "@/fixtures/personal/sample-day";
import {
  dayOfInstant,
  dayToLocalDate,
  durationBetween,
  formatClockTime,
  instantAt,
  localDateToDay,
  MINUTES_PER_DAY,
  minutesOfInstant,
  parseClockTime,
  parseDay,
} from "@/lib/dates/clock-time";
import { getWeekDates, IRAN_WEEK } from "@/lib/dates/week";
import type {
  Area,
  BrainDumpPage,
  DayPriority,
  DayPriorityRef,
  FocusSummary,
  Goal,
  Habit,
  InboxItem,
  InboxSource,
  InboxState,
  InsightHighlight,
  InsightPatternId,
  JournalEntry,
  MoodEntry,
  Task,
  TimeBlock,
  WeeklyReview,
} from "../domain";
import {
  RepositoryError,
  type BlockPlacement,
  type NewTaskInput,
  type Repositories,
  type TaskPatch,
  type TaskSnapshot,
  type UnscheduledQuery,
} from "../repositories";
import { countTasks, filterTasks, priorityRank, sortTasks } from "../task-query";
import { createMockBrainDump } from "./mock-brain-dump";
import { createMockGoals } from "./mock-goals";
import { createMockFinance } from "./mock-finance";
import { createMockHabits } from "./mock-habits";
import { createMockInsights } from "./mock-insights";
import { createMockJournal } from "./mock-journal";
import { createMockReview } from "./mock-review";

/*
 * In-memory adapter over the sample fixtures. Deterministic: "today" is a
 * fixture constant, never the clock. Each adapter instance copies the
 * fixtures into its own mutable store, so mutations (schedule, move, done…)
 * never leak into the fixtures, another instance or a test. Every read
 * returns deep clones, so a caller mutating a result can never change the
 * store or a later read.
 */

export interface MockFixtures {
  /** The adapter's "today" (calendar day "YYYY-MM-DD"). */
  today: string;
  /** The adapter's "now" instant, used for completion stamps. Default: SAMPLE_NOW's time of day on `today`. */
  now?: string;
  tasks: readonly Task[];
  /** Areas offered by the picker and the Area filter, besides the ones tasks already use. */
  areas?: readonly Area[];
  /** Goal titles by goal id; the adapter puts them on tasks as `goalTitle`. */
  goalTitles?: Readonly<Record<string, string>>;
  blocks: readonly TimeBlock[];
  inbox: readonly InboxItem[];
  /** Day priorities by calendar day, in rank order. */
  priorities?: Readonly<Record<string, readonly DayPriorityRef[]>>;
  /** Focus sessions by calendar day; a day without an entry has none. */
  focus?: Readonly<Record<string, FocusSummary>>;
  habits?: readonly Habit[];
  goals?: readonly Goal[];
  moods?: readonly MoodEntry[];
  /** Journal entries (P14) besides the mood check-ins; merged onto the mood of the same day. */
  journal?: readonly JournalEntry[];
  /** Finance (P13): budget months, transactions, bills; null = no finance data. */
  finance?: SampleFinance | null;
  insight?: InsightHighlight | null;
  /** Insights (P15): days of history the sample person has (default 120) and tabs that fail to calculate. */
  insights?: { historyDays?: number; failing?: readonly InsightPatternId[] };
  /** Brain Dump pages (P08), one per day. */
  brainDump?: readonly BrainDumpPage[];
  /** Weekly reviews (P16) in progress or finished. */
  reviews?: readonly WeeklyReview[];
}

export interface MockRepositoriesOptions {
  /** Replaces parts of the default sample set. */
  fixtures?: Partial<MockFixtures>;
  /** Artificial delay per call, for loading states in previews. Default 0. */
  latencyMs?: number;
}

/** A block's length when neither the caller nor its task says. */
const DEFAULT_BLOCK_MINUTES = 30;

const MAX_PRIORITIES = 3;

/** Dated before undated, then by day, time (timed first), priority; stable otherwise. */
function compareTasks(a: Task, b: Task): number {
  return (
    compareNullable(a.date, b.date) ||
    compareNullable(a.time, b.time) ||
    priorityRank(a) - priorityRank(b)
  );
}

/** Priority rank, then the nearer deadline, then title: the Unscheduled card's order. */
function compareUnscheduled(a: Task, b: Task): number {
  return (
    priorityRank(a) - priorityRank(b) ||
    compareNullable(a.deadline ?? null, b.deadline ?? null) ||
    a.title.localeCompare(b.title, "en")
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

/** The instant just before `end`, so a block ending at midnight stays on its own day. */
function lastMoment(end: string): string {
  return new Date(Date.parse(end) - 1).toISOString();
}

function overlapsDay(block: TimeBlock, day: string): boolean {
  return dayOfInstant(block.start) <= day && day <= dayOfInstant(lastMoment(block.end));
}

function byStart(a: TimeBlock, b: TimeBlock): number {
  return Date.parse(a.start) - Date.parse(b.start);
}

/** Validates a placement and returns its minutes-of-day span. */
function resolveSpan(placement: BlockPlacement, fallbackMinutes: number): { startMinutes: number; durationMinutes: number } {
  const startMinutes = parseClockTime(placement.start);
  if (startMinutes === null || startMinutes >= MINUTES_PER_DAY) {
    throw new RepositoryError("invalid", `Not a start time: "${placement.start}"`);
  }
  const durationMinutes = placement.durationMinutes ?? fallbackMinutes;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new RepositoryError("invalid", `Not a duration: ${durationMinutes}`);
  }
  if (startMinutes + durationMinutes > MINUTES_PER_DAY) {
    throw new RepositoryError("invalid", "A block cannot leave its day");
  }
  return { startMinutes, durationMinutes };
}

export function createMockRepositories({ fixtures, latencyMs = 0 }: MockRepositoriesOptions = {}): Repositories {
  const source: MockFixtures = { ...personalFixtures, ...fixtures };
  const today = source.today;

  // The adapter's own mutable copies.
  const tasks: Task[] = structuredClone([...source.tasks]);
  for (const item of tasks) {
    const goalTitle = item.goalId ? source.goalTitles?.[item.goalId] : undefined;
    if (goalTitle) item.goalTitle = goalTitle;
  }
  const blocks: TimeBlock[] = structuredClone([...source.blocks]);
  const inboxItems: InboxItem[] = structuredClone([...source.inbox]);
  const priorityRefs = new Map<string, DayPriorityRef[]>(
    Object.entries(structuredClone(source.priorities ?? {})).map(([day, refs]) => [day, [...refs]]),
  );
  const focus: Record<string, FocusSummary> = structuredClone({ ...source.focus });
  const habits: Habit[] = structuredClone([...(source.habits ?? [])]);
  const goals: Goal[] = structuredClone([...(source.goals ?? [])]);
  const insight = source.insight ?? null;
  let blockCounter = 0;

  const nowInstant = source.now ?? instantAt(today, minutesOfInstant(SAMPLE_NOW));
  const extraAreas: Area[] = structuredClone([...(source.areas ?? [])]);
  let taskCounter = 0;
  let subtaskCounter = 0;
  let noteCounter = 0;
  let inboxCounter = 0;

  /** Resolves a deep clone after the configured latency. */
  async function respond<T>(value: T): Promise<T> {
    if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs));
    return structuredClone(value);
  }

  function taskOrThrow(id: string): Task {
    const task = tasks.find((item) => item.id === id);
    if (!task) throw new RepositoryError("not-found", `No task "${id}"`);
    return task;
  }

  function inboxOrThrow(id: string): InboxItem {
    const item = inboxItems.find((entry) => entry.id === id);
    if (!item) throw new RepositoryError("not-found", `No inbox item "${id}"`);
    return item;
  }

  function captureItem(text: string, source: InboxSource): InboxItem {
    if (text.trim() === "") throw new RepositoryError("invalid", "A capture needs text");
    let id: string;
    do {
      inboxCounter += 1;
      id = `i-new-${inboxCounter}`;
    } while (inboxItems.some((item) => item.id === id));
    const item: InboxItem = { id, text: text.trim(), source, capturedAt: nowInstant, state: "untriaged" };
    inboxItems.push(item);
    return item;
  }

  /** Snoozed items whose time has come return to triage, tagged (P07 Snooze rule). */
  function wakeSnoozed() {
    const now = Date.parse(nowInstant);
    for (const item of inboxItems) {
      if (item.state === "snoozed" && item.snoozedUntil && Date.parse(item.snoozedUntil) <= now) {
        item.state = "untriaged";
        item.backFromSnooze = true;
        delete item.snoozedUntil;
      }
    }
  }

  function blockOrThrow(id: string): TimeBlock {
    const block = blocks.find((item) => item.id === id);
    if (!block) throw new RepositoryError("not-found", `No block "${id}"`);
    return block;
  }

  function taskBlock(taskId: string): TimeBlock | undefined {
    return blocks.find((item) => item.kind === "task" && item.taskId === taskId);
  }

  /** Runs a multi-step write; if it throws, tasks and blocks are exactly as they were. */
  function atomically<T>(write: () => T): T {
    const savedTasks = structuredClone(tasks);
    const savedBlocks = structuredClone(blocks);
    try {
      return write();
    } catch (error) {
      tasks.splice(0, tasks.length, ...savedTasks);
      blocks.splice(0, blocks.length, ...savedBlocks);
      throw error;
    }
  }

  function knownAreas(): Area[] {
    const byId = new Map<string, Area>();
    for (const area of [...extraAreas, ...tasks.flatMap((item) => (item.area ? [item.area] : []))]) {
      if (!byId.has(area.id)) byId.set(area.id, { id: area.id, name: area.name });
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
  }

  /** An area by id from the known set (so a stale name never sticks), or as given. */
  function resolveArea(area: Area): Area {
    const known = knownAreas().find((item) => item.id === area.id);
    return { id: area.id, name: known?.name ?? area.name };
  }

  /** Checks the title, days, time and duration shared by create and update. */
  function validateFields(fields: Pick<NewTaskInput, "date" | "time" | "durationMinutes" | "deadline"> & { title?: string }): void {
    if (fields.title !== undefined && fields.title.trim() === "") throw new RepositoryError("invalid", "A task needs a title");
    for (const day of [fields.date, fields.deadline]) {
      if (day && !parseDay(day)) throw new RepositoryError("invalid", `Not a day: "${day}"`);
    }
    if (fields.time) {
      const minutes = parseClockTime(fields.time);
      if (minutes === null || minutes >= MINUTES_PER_DAY) throw new RepositoryError("invalid", `Not a time: "${fields.time}"`);
    }
    const duration = fields.durationMinutes;
    if (duration !== undefined && duration !== null && (!Number.isFinite(duration) || duration <= 0)) {
      throw new RepositoryError("invalid", `Not a duration: ${duration}`);
    }
  }

  /** Applies a patch to a task and keeps its block in step. Callers wrap it in atomically(). */
  /** Points a task at a goal; rejects "not-found" for an unknown goal id. */
  function linkGoal(task: Task, goalId: string): void {
    const title = goals.find((goal) => goal.id === goalId)?.title ?? source.goalTitles?.[goalId];
    if (!title) throw new RepositoryError("not-found", `No goal "${goalId}"`);
    task.goalId = goalId;
    task.goalTitle = title;
  }

  function applyPatch(task: Task, patch: TaskPatch): void {
    validateFields(patch);
    const date = patch.date !== undefined ? patch.date : task.date;
    let time = patch.time !== undefined ? patch.time : task.time;
    if (date === null) {
      if (patch.time) throw new RepositoryError("invalid", "A time needs a date");
      time = null;
    }
    const durationMinutes = patch.durationMinutes !== undefined ? patch.durationMinutes : task.durationMinutes;

    const block = taskBlock(task.id);
    if (block) {
      if (time === null || date === null) {
        blocks.splice(blocks.indexOf(block), 1);
      } else {
        const length = durationMinutes ?? durationBetween(block.start, block.end);
        place(block, { day: date, start: time, durationMinutes: length }, length);
      }
      if (patch.title !== undefined) block.title = patch.title.trim();
      if (patch.scope !== undefined) block.scope = patch.scope;
    }

    if (patch.title !== undefined) task.title = patch.title.trim();
    task.date = date;
    task.time = time;
    task.durationMinutes = durationMinutes;
    if (patch.priority !== undefined) task.priority = patch.priority;
    if (patch.energy !== undefined) task.energy = patch.energy;
    if (patch.scope !== undefined) task.scope = patch.scope;
    if (patch.recurring !== undefined) task.recurring = patch.recurring;
    if (patch.area !== undefined) {
      if (patch.area) task.area = resolveArea(patch.area);
      else delete task.area;
    }
    if (patch.project !== undefined) {
      if (patch.project) task.project = patch.project;
      else delete task.project;
    }
    if (patch.deadline !== undefined) {
      if (patch.deadline) task.deadline = patch.deadline;
      else delete task.deadline;
    }
    if (patch.labels !== undefined) {
      if (patch.labels.length > 0) task.labels = [...patch.labels];
      else delete task.labels;
    }
    if (patch.goalId !== undefined) {
      if (patch.goalId) linkGoal(task, patch.goalId);
      else {
        delete task.goalId;
        delete task.goalTitle;
      }
    }
    if (patch.description !== undefined) {
      const text = patch.description.trim();
      if (text) task.description = text;
      else delete task.description;
    }
    if (patch.checklist !== undefined) {
      const items = patch.checklist.map((item) => {
        if (item.title.trim() === "") throw new RepositoryError("invalid", "A subtask needs a title");
        return { id: item.id ?? `st-${(subtaskCounter += 1)}`, title: item.title.trim(), done: item.done };
      });
      if (items.length > 0) {
        task.checklist = items;
        task.subtasks = { done: items.filter((item) => item.done).length, total: items.length };
      } else {
        delete task.checklist;
        delete task.subtasks;
      }
    }
  }

  /** A read copy with dependency links refreshed from the tasks they name. */
  function withLinks(task: Task): Task {
    if (!task.links?.some((link) => link.kind === "blockedBy" || link.kind === "blocks")) return task;
    return {
      ...task,
      links: task.links.map((link) => {
        if (link.kind !== "blockedBy" && link.kind !== "blocks") return link;
        const other = tasks.find((item) => item.id === link.taskId);
        return other ? { ...link, title: other.title, done: other.status === "done", date: other.date } : link;
      }),
    };
  }

  /** The tasks for ids that must all exist and appear once. */
  function uniqueTasks(ids: readonly string[]): Task[] {
    const found = ids.map(taskOrThrow);
    if (new Set(ids).size !== ids.length) throw new RepositoryError("invalid", "A task can only be listed once");
    return found;
  }

  /** Writes a block's span from a validated placement and syncs its task. */
  function place(block: TimeBlock, placement: BlockPlacement, fallbackMinutes: number): TimeBlock {
    const { startMinutes, durationMinutes } = resolveSpan(placement, fallbackMinutes);
    block.start = instantAt(placement.day, startMinutes);
    block.end = instantAt(placement.day, startMinutes + durationMinutes);
    if (block.kind === "task" && block.taskId) {
      const task = tasks.find((item) => item.id === block.taskId);
      if (task) {
        task.date = placement.day;
        task.time = formatClockTime(startMinutes);
        task.durationMinutes = durationMinutes;
      }
    }
    return block;
  }

  function resolvePriority(ref: DayPriorityRef, index: number): DayPriority | null {
    const rank = (index + 1) as DayPriority["rank"];
    if (ref.kind === "task") {
      const task = tasks.find((item) => item.id === ref.id);
      if (!task) return null;
      return {
        rank,
        kind: "task",
        id: task.id,
        title: task.title,
        scope: task.scope,
        time: task.time,
        durationMinutes: task.durationMinutes,
        energy: task.energy,
      };
    }
    const block = blocks.find((item) => item.id === ref.id);
    if (!block) return null;
    const task = block.taskId ? tasks.find((item) => item.id === block.taskId) : undefined;
    return {
      rank,
      kind: "block",
      id: block.id,
      title: block.title,
      scope: block.scope,
      time: formatClockTime(minutesOfInstant(block.start)),
      durationMinutes: durationBetween(block.start, block.end),
      energy: block.energy ?? task?.energy ?? null,
    };
  }

  function resolvePriorities(day: string): DayPriority[] {
    const resolved: DayPriority[] = [];
    for (const ref of priorityRefs.get(day) ?? []) {
      const priority = resolvePriority(ref, resolved.length);
      if (priority) resolved.push(priority);
    }
    return resolved.slice(0, MAX_PRIORITIES);
  }

  return {
    tasks: {
      list(query = {}) {
        const day = query.day ?? today;
        // No view and no day: everything (the "all" view).
        const view = query.view ?? (query.day ? undefined : "all");
        const matches = filterTasks(tasks, query, { today });
        // Without a sort the view's legacy order stays (My Day depends on it).
        const sorted = query.sort
          ? sortTasks(matches, query.sort, day, view)
          : matches.sort(view === "completed" ? byCompletedAtDesc : compareTasks);
        return respond(sorted);
      },
      get(id) {
        const task = tasks.find((item) => item.id === id);
        return respond(task ? withLinks(task) : null);
      },
      listUnscheduled({ day, range, week = IRAN_WEEK }: UnscheduledQuery) {
        const scheduledToday = new Set(
          blocks.filter((block) => block.taskId && overlapsDay(block, day)).map((block) => block.taskId),
        );
        const weekEnd = localDateToDay(getWeekDates(dayToLocalDate(day), week)[6]!);
        const inRange = (task: Task, date: string): boolean => {
          switch (range) {
            case "today":
              return date <= day;
            case "overdue":
              return date < day;
            case "week":
              return date > day && date <= weekEnd;
          }
        };
        const matches = tasks.filter(
          (task) =>
            task.status === "open" &&
            task.time === null &&
            task.date !== null &&
            !scheduledToday.has(task.id) &&
            inRange(task, task.date),
        );
        matches.sort(compareUnscheduled);
        return respond(matches);
      },
      counts(query = {}) {
        return respond(countTasks(tasks, query, { today }));
      },
      listAreas() {
        return respond(knownAreas());
      },
      async create(input) {
        validateFields(input);
        if (input.time && !input.date) throw new RepositoryError("invalid", "A time needs a date");
        const orders = tasks.flatMap((item) => (item.order === undefined ? [] : [item.order]));
        let id: string;
        do {
          taskCounter += 1;
          id = `t-new-${taskCounter}`;
        } while (tasks.some((item) => item.id === id));
        const task: Task = {
          id,
          title: input.title.trim(),
          scope: input.scope ?? "personal",
          priority: input.priority ?? null,
          energy: input.energy ?? null,
          durationMinutes: input.durationMinutes ?? null,
          date: input.date ?? null,
          time: input.time ?? null,
          status: "open",
          order: orders.length > 0 ? Math.max(...orders) + 1 : 0,
          createdAt: nowInstant,
        };
        if (input.area) task.area = resolveArea(input.area);
        if (input.project) task.project = input.project;
        if (input.deadline) task.deadline = input.deadline;
        if (input.labels?.length) task.labels = [...input.labels];
        if (input.recurring) task.recurring = true;
        if (input.goalId) linkGoal(task, input.goalId);
        if (input.source) task.activity = [{ id: `a-${id}-created`, at: nowInstant, kind: "created", source: input.source }];
        tasks.push(task);
        return respond(task);
      },
      async update(id, patch) {
        const task = taskOrThrow(id);
        atomically(() => applyPatch(task, patch));
        return respond(taskOrThrow(id));
      },
      async setDone(id, done) {
        const task = taskOrThrow(id);
        task.status = done ? "done" : "open";
        if (done) task.completedAt = nowInstant;
        else delete task.completedAt;
        const block = taskBlock(id);
        if (block) block.done = done;
        return respond(task);
      },
      async reorder({ ids }) {
        const ordered = uniqueTasks(ids);
        const current = ordered.map((item) => item.order);
        const reusable = current.every((order) => order !== undefined) && new Set(current).size === current.length;
        if (reusable) {
          const slots = (current as number[]).sort((a, b) => a - b);
          ordered.forEach((item, index) => {
            item.order = slots[index];
          });
        } else {
          const all = tasks.flatMap((item) => (item.order === undefined ? [] : [item.order]));
          const start = all.length > 0 ? Math.max(...all) + 1 : 0;
          ordered.forEach((item, index) => {
            item.order = start + index;
          });
        }
        await respond(undefined);
      },
      async remove(ids) {
        const doomed = uniqueTasks(ids);
        const gone = new Set(ids);
        const positions = doomed.map((item) => tasks.indexOf(item)).sort((a, b) => a - b);
        const snapshot: TaskSnapshot = {
          tasks: positions.map((position) => structuredClone(tasks[position]!)),
          blocks: structuredClone(blocks.filter((block) => block.taskId && gone.has(block.taskId))),
          positions,
        };
        for (const position of [...positions].reverse()) tasks.splice(position, 1);
        for (let index = blocks.length - 1; index >= 0; index--) {
          const block = blocks[index]!;
          if (block.taskId && gone.has(block.taskId)) blocks.splice(index, 1);
        }
        return respond({ restore: snapshot });
      },
      async restore(snapshot) {
        const restored = new Set<string>();
        snapshot.tasks.forEach((item, index) => {
          if (tasks.some((existing) => existing.id === item.id)) return;
          tasks.splice(Math.min(snapshot.positions[index] ?? tasks.length, tasks.length), 0, structuredClone(item));
          restored.add(item.id);
        });
        for (const block of snapshot.blocks) {
          if (block.taskId && restored.has(block.taskId) && !blocks.some((existing) => existing.id === block.id)) {
            blocks.push(structuredClone(block));
          }
        }
        await respond(undefined);
      },
      async bulkUpdate(ids, patch) {
        const targets = uniqueTasks(ids);
        atomically(() => {
          for (const target of targets) applyPatch(target, patch);
        });
        return respond(ids.map(taskOrThrow));
      },
      async addNote(id, body) {
        const task = taskOrThrow(id);
        const text = body.trim();
        if (!text) throw new RepositoryError("invalid", "A note needs text");
        noteCounter += 1;
        task.notes = [...(task.notes ?? []), { id: `note-${noteCounter}`, body: text, createdAt: nowInstant }];
        return respond(withLinks(task));
      },
    },
    blocks: {
      listForDay(day) {
        return respond(blocks.filter((block) => overlapsDay(block, day)).sort(byStart));
      },
      async schedule(taskId, placement) {
        const task = taskOrThrow(taskId);
        let block = blocks.find((item) => item.taskId === taskId);
        if (!block) {
          blockCounter += 1;
          block = {
            id: `blk-${task.id}-${blockCounter}`,
            title: task.title,
            start: instantAt(placement.day, 0),
            end: instantAt(placement.day, 0),
            scope: task.scope,
            kind: "task",
            taskId: task.id,
          };
          // Validate before the block joins the store, so a rejected placement leaves nothing behind.
          place(block, placement, task.durationMinutes ?? DEFAULT_BLOCK_MINUTES);
          blocks.push(block);
        } else {
          place(block, placement, durationBetween(block.start, block.end));
        }
        return respond(block);
      },
      async move(blockId, placement) {
        const block = blockOrThrow(blockId);
        place(block, placement, durationBetween(block.start, block.end));
        return respond(block);
      },
      async unschedule(blockId) {
        const block = blockOrThrow(blockId);
        if (block.kind !== "task") {
          throw new RepositoryError("forbidden", "Only a task block can go back to Unscheduled");
        }
        blocks.splice(blocks.indexOf(block), 1);
        const task = block.taskId ? tasks.find((item) => item.id === block.taskId) : undefined;
        if (task) task.time = null;
        await respond(undefined);
      },
      async setDone(blockId, done) {
        const block = blockOrThrow(blockId);
        block.done = done;
        const task = block.taskId ? tasks.find((item) => item.id === block.taskId) : undefined;
        if (task) {
          task.status = done ? "done" : "open";
          if (done) task.completedAt = nowInstant;
          else delete task.completedAt;
        }
        return respond(block);
      },
    },
    inbox: {
      list(state?: InboxState) {
        wakeSnoozed();
        const items = inboxItems
          .filter((item) => (state ? item.state === state : item.state !== "processed" && item.state !== "dropped"))
          // Back from snooze first, then newest capture first.
          .sort((a, b) => Number(Boolean(b.backFromSnooze)) - Number(Boolean(a.backFromSnooze)) || Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
        return respond(items);
      },
      count() {
        wakeSnoozed();
        return respond(inboxItems.filter((item) => item.state === "untriaged").length);
      },
      async capture({ text, source = "quick-add" }) {
        return respond(captureItem(text, source));
      },
      async snooze(ids, until) {
        if (Number.isNaN(Date.parse(until))) throw new RepositoryError("invalid", `Not an instant: "${until}"`);
        const items = ids.map(inboxOrThrow);
        for (const item of items) {
          item.state = "snoozed";
          item.snoozedUntil = until;
          delete item.backFromSnooze;
        }
        return respond(items);
      },
      async archive(ids) {
        const items = ids.map(inboxOrThrow);
        for (const item of items) {
          item.state = "archived";
          delete item.snoozedUntil;
        }
        return respond(items);
      },
      async process(id, { to, taskId }) {
        const item = inboxOrThrow(id);
        item.state = "processed";
        item.processedTo = to;
        if (taskId) item.taskId = taskId;
        delete item.snoozedUntil;
        return respond(item);
      },
      async drop(id) {
        const item = inboxOrThrow(id);
        item.state = "dropped";
        return respond(item);
      },
      async restore(ids) {
        const items = ids.map(inboxOrThrow);
        for (const item of items) {
          item.state = "untriaged";
          delete item.snoozedUntil;
          delete item.processedTo;
          delete item.taskId;
          delete item.backFromSnooze;
        }
        return respond(items);
      },
    },
    plan: {
      priorities(day) {
        return respond(resolvePriorities(day));
      },
      async setPriorities(day, refs) {
        if (refs.length > MAX_PRIORITIES) {
          throw new RepositoryError("invalid", `At most ${MAX_PRIORITIES} priorities per day`);
        }
        const keys = new Set(refs.map((ref) => `${ref.kind}:${ref.id}`));
        if (keys.size !== refs.length) throw new RepositoryError("invalid", "A priority can only be ranked once");
        for (const ref of refs) {
          if (ref.kind === "task") taskOrThrow(ref.id);
          else blockOrThrow(ref.id);
        }
        priorityRefs.set(
          day,
          refs.map((ref) => ({ kind: ref.kind, id: ref.id })),
        );
        return respond(resolvePriorities(day));
      },
      focusToday(day) {
        return respond(focus[day] ?? { sessionsCompleted: 0, cycle: 1 });
      },
      async recordFocusSessions(day, { count, cycle }) {
        if (parseDay(day) === null) throw new RepositoryError("invalid", `Bad day "${day}"`);
        if (!Number.isInteger(count) || count < 1 || !Number.isInteger(cycle) || cycle < 1) {
          throw new RepositoryError("invalid", "Focus sessions need a positive count and cycle");
        }
        const current = focus[day] ?? { sessionsCompleted: 0, cycle: 1 };
        focus[day] = { sessionsCompleted: current.sessionsCompleted + count, cycle };
        return respond(focus[day]);
      },
    },
    habits: createMockHabits({ habits, today, respond }),
    goals: createMockGoals({ goals, tasks, today, respond }),
    journal: createMockJournal({ moods: source.moods ?? [], entries: source.journal ?? [], now: nowInstant, respond }),
    finance: createMockFinance({ finance: source.finance ?? null, respond }),
    insights: createMockInsights({
      today,
      historyDays: source.insights?.historyDays ?? 120,
      failing: source.insights?.failing ?? [],
      highlight: insight,
      habits,
      moods: source.moods ?? [],
      respond,
    }),
    review: createMockReview({ reviews: source.reviews ?? [], now: nowInstant, respond }),
    brainDump: createMockBrainDump({
      pages: source.brainDump ?? [],
      today,
      now: nowInstant,
      respond,
      captureInbox: (text) => captureItem(text, "brain-dump"),
      dropInbox: (id) => {
        const item = inboxItems.find((entry) => entry.id === id);
        if (item) item.state = "dropped";
      },
    }),
  };
}

