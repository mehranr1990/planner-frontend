import type { Task, TimeBlockKind } from "@/data/domain";
import { addDaysToDay, snapTo } from "@/lib/dates/clock-time";
import type { WeekConfig } from "@/lib/dates/week";
import type { DayBlock } from "@/features/my-day/domain/day-blocks";
import { overlapsWith } from "@/features/my-day/domain/overlap";
import { resolvePlacement } from "@/features/my-day/domain/placement";
import { rescheduleOptions, type RescheduleOption, type RescheduleOptionId } from "@/features/my-day/domain/reschedule";
import type { RescheduleTarget } from "@/features/my-day/my-day-context";

/*
 * What a Reschedule request moves and where it can go, as plain data: the
 * session component only fetches and draws. A request names a block, a task
 * or several blocks; this resolves them to MoveItems, lists the rows to offer
 * and turns a chosen slot into one placement per item.
 */

/** One thing that moves: an existing block, or a task that has no block yet. */
export interface MoveItem {
  /** "block": has a block (move it). "task": needs scheduling. */
  type: "block" | "task";
  blockId?: string;
  taskId?: string;
  title: string;
  /** Kind of the block it is or will become ("task" for a task). */
  blockKind: TimeBlockKind;
  /** The day it sits on now. */
  day: string;
  /** Where it starts now; null for a task without a block. */
  startMinutes: number | null;
  durationMinutes: number;
}

export interface ResolvedTarget {
  items: MoveItem[];
  /** The day the items come from: the day whose blocks shape the suggestions. */
  sourceDay: string;
  /** Shared length of everything moving. */
  totalMinutes: number;
  /** The single item's title; empty for several. */
  title: string;
}

export interface TargetContext {
  /** The day on screen: where a bare task is (re)scheduled from. */
  day: string;
  /** Blocks of every day that was fetched, keyed by day. */
  blocksByDay: Readonly<Record<string, readonly DayBlock[]>>;
  tasks: readonly Task[];
  defaultDurationMinutes: number;
}

function findBlock(
  blocksByDay: TargetContext["blocksByDay"],
  match: (block: DayBlock) => boolean,
): { block: DayBlock; day: string } | null {
  for (const [day, blocks] of Object.entries(blocksByDay)) {
    const block = blocks.find(match);
    if (block) return { block, day };
  }
  return null;
}

function blockItem(block: DayBlock, day: string): MoveItem {
  return {
    type: "block",
    blockId: block.id,
    taskId: block.taskId,
    title: block.title,
    blockKind: block.kind,
    day,
    startMinutes: block.startMinutes,
    durationMinutes: block.durationMinutes,
  };
}

/** The items a request moves, or null when none of them can be found any more. */
export function resolveTarget(target: RescheduleTarget, context: TargetContext): ResolvedTarget | null {
  const items: MoveItem[] = [];
  if (target.kind === "block") {
    const found = findBlock(context.blocksByDay, (block) => block.id === target.id);
    if (found) items.push(blockItem(found.block, found.day));
  } else if (target.kind === "blocks") {
    for (const id of target.ids) {
      const found = findBlock(context.blocksByDay, (block) => block.id === id);
      if (found) items.push(blockItem(found.block, found.day));
    }
  } else {
    // A task that already has a block is rescheduled through it.
    const found = findBlock(context.blocksByDay, (block) => block.taskId === target.id);
    const task = context.tasks.find((item) => item.id === target.id);
    if (found) {
      items.push(blockItem(found.block, found.day));
    } else if (task) {
      items.push({
        type: "task",
        taskId: task.id,
        title: task.title,
        blockKind: "task",
        day: context.day,
        startMinutes: null,
        durationMinutes: task.durationMinutes ?? context.defaultDurationMinutes,
      });
    }
  }
  const [first] = items;
  if (!first) return null;
  return {
    items,
    sourceDay: first.day,
    totalMinutes: items.reduce((sum, item) => sum + item.durationMinutes, 0),
    title: items.length === 1 ? first.title : "",
  };
}

export interface RescheduleRows {
  options: RescheduleOption[];
  /** Index of the row that starts selected. */
  initialIndex: number;
}

export interface RowsInput {
  now: string;
  resolved: ResolvedTarget;
  blocksByDay: Readonly<Record<string, readonly DayBlock[]>>;
  week: WeekConfig;
  workHours: { start: string; end: string };
  preselect?: RescheduleOptionId;
}

/**
 * The rows to offer. The moving blocks are lifted out of their days first, so
 * a block's own slot reads as free. Several blocks at once offer only whole-day
 * moves (no "Later today", no "Back to Unscheduled"); a task with no block has
 * nothing to go back to; the next-working-day row folds into Tomorrow when it
 * is the same day.
 */
export function rescheduleRows(input: RowsInput): RescheduleRows {
  const { resolved } = input;
  const moving = new Set(resolved.items.flatMap((item) => (item.blockId ? [item.blockId] : [])));
  const without: Record<string, readonly DayBlock[]> = {};
  for (const [day, blocks] of Object.entries(input.blocksByDay)) {
    without[day] = blocks.filter((block) => !moving.has(block.id));
  }
  const [only] = resolved.items;
  const single = resolved.items.length === 1 && only !== undefined;

  const all = rescheduleOptions({
    now: input.now,
    day: resolved.sourceDay,
    blocks: without[resolved.sourceDay] ?? [],
    blocksByDay: without,
    task: {
      durationMinutes: resolved.totalMinutes,
      kind: single ? only.blockKind : "event",
    },
    week: input.week,
    workHours: input.workHours,
  });

  const options = all.filter((option) => {
    if (option.id === "next-working-day" && option.sameAsTomorrow) return false;
    // A task with no block is already in Unscheduled.
    if (single) return option.id !== "unscheduled" || only.type === "block";
    return option.id !== "later-today" && option.id !== "unscheduled";
  });
  const preselected = input.preselect ? options.findIndex((option) => option.id === input.preselect) : -1;
  return { options, initialIndex: Math.max(0, preselected) };
}

export interface PlannedMove {
  item: MoveItem;
  day: string;
  /** "HH:mm" for the repository. */
  start: string;
  startMinutes: number;
  durationMinutes: number;
}

/** Items one after the other from `startMinutes`, each on the 15-minute grid; null when one would leave its day. */
export function planPlacements(items: readonly MoveItem[], day: string, startMinutes: number): PlannedMove[] | null {
  const moves: PlannedMove[] = [];
  let cursor = startMinutes;
  for (const item of items) {
    const result = resolvePlacement({ day, startMinutes: cursor, durationMinutes: item.durationMinutes });
    if (!result.ok) return null;
    const { placement } = result;
    moves.push({
      item,
      day,
      start: placement.start,
      startMinutes: placement.startMinutes,
      durationMinutes: placement.durationMinutes,
    });
    cursor = snapTo(placement.endMinutes, 15, "ceil");
  }
  return moves;
}

/** The first block a planned move double-books, so a pick that overlaps is said out loud. */
export function firstOverlap(
  moves: readonly PlannedMove[],
  blocksOnDay: readonly DayBlock[],
): { title: string; minutes: number } | null {
  for (const move of moves) {
    const [hit] = overlapsWith(
      blocksOnDay,
      { startMinutes: move.startMinutes, endMinutes: move.startMinutes + move.durationMinutes },
      move.item.blockId,
    );
    if (hit) return { title: hit.title, minutes: hit.minutes };
  }
  return null;
}

/** Days whose blocks a session needs: the screen's days, today and the days a suggestion can land on. */
export function sessionDays(day: string, today: string): string[] {
  const days = new Set<string>();
  for (let offset = 0; offset <= 2; offset += 1) days.add(addDaysToDay(day, offset));
  // Tomorrow and the next working day (up to a weekend away).
  for (let offset = 0; offset <= 3; offset += 1) days.add(addDaysToDay(today, offset));
  return [...days];
}
