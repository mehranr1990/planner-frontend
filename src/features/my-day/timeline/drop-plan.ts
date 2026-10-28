import type { EnergyLevel, Scope, TimeBlockKind } from "@/data/domain";
import { formatClockTime } from "@/lib/dates/clock-time";
import type { DayBlock, MinuteSpan } from "../domain/day-blocks";
import { overlapsWith } from "../domain/overlap";
import { nextFreeSlot, resolvePlacement, type Placement } from "../domain/placement";
import {
  blockDragData,
  type BlockDragData,
  type ParsedDropId,
  type TaskDragData,
} from "../drag";

/*
 * What a drop (or a resize commit) means, decided without React or dnd-kit:
 * the drag item and where it landed go in, a plan comes out (schedule, move,
 * unschedule, reject or nothing). The preview ghost, the announcements and
 * the mutations all read the same plan, so what you see is what is saved.
 */

/** The payload of a timeline block: the shared contract plus what the overlay and the plan need. */
export interface TimelineBlockDragData extends BlockDragData {
  day: string;
  title: string;
  scope: Scope;
  kind: TimeBlockKind;
  energy: EnergyLevel | null;
  startMinutes: number;
  endMinutes: number;
}

export type DragItem = TaskDragData | TimelineBlockDragData;

export function timelineBlockDragData(block: DayBlock, day: string): TimelineBlockDragData {
  return {
    ...blockDragData(block),
    day,
    title: block.title,
    scope: block.scope,
    kind: block.kind,
    energy: block.energy,
    startMinutes: block.startMinutes,
    endMinutes: block.endMinutes,
  };
}

/** Narrows a dnd-kit `data.current` to something this controller can place. */
export function readDragItem(value: unknown): DragItem | null {
  if (typeof value !== "object" || value === null) return null;
  const data = value as Partial<DragItem> & { type?: unknown };
  if (data.type === "task" && "taskId" in data) return value as TaskDragData;
  if (data.type === "block" && "blockId" in data && "day" in data && "startMinutes" in data) {
    return value as TimelineBlockDragData;
  }
  return null;
}

/** Where a block was before a change; the Undo target. */
export interface PreviousPlacement {
  day: string;
  /** "HH:mm". */
  start: string;
  durationMinutes: number;
}

export interface OverlapHit {
  id: string;
  title: string;
  minutes: number;
}

export type RejectReason = "no-target" | "out-of-range" | "too-short" | "not-unschedulable";

export type DropPlan =
  | { kind: "schedule"; taskId: string; title: string; placement: Placement; overlaps: OverlapHit[] }
  | {
      kind: "move";
      blockId: string;
      taskId?: string;
      title: string;
      placement: Placement;
      previous: PreviousPlacement;
      overlaps: OverlapHit[];
      /** The length changed (a resize), not just the start. */
      resized: boolean;
    }
  | { kind: "unschedule"; blockId: string; taskId: string; title: string; previous: PreviousPlacement }
  | { kind: "reject"; reason: RejectReason; title: string }
  | { kind: "noop" };

export interface PlanDropInput {
  item: DragItem;
  /** What the pointer (or keyboard target) is over; null when over nothing of ours. */
  over: ParsedDropId | null;
  /** Unsnapped start of the dragged item in the over column, grab offset already removed. */
  rawStartMinutes: number | null;
  /** The day's blocks, for overlap checks. */
  blocksForDay: (day: string) => readonly DayBlock[];
  /** A task without a duration takes this (planner setting). */
  defaultDurationMinutes: number;
}

const toPrevious = (item: TimelineBlockDragData): PreviousPlacement => ({
  day: item.day,
  start: formatClockTime(item.startMinutes),
  durationMinutes: item.endMinutes - item.startMinutes,
});

export function planDrop({ item, over, rawStartMinutes, blocksForDay, defaultDurationMinutes }: PlanDropInput): DropPlan {
  const title = item.title;
  if (!over) return { kind: "reject", reason: "no-target", title };

  if (over.type === "unscheduled") {
    if (item.type === "task") return { kind: "noop" };
    if (!item.taskId) return { kind: "reject", reason: "not-unschedulable", title };
    return { kind: "unschedule", blockId: item.blockId, taskId: item.taskId, title, previous: toPrevious(item) };
  }

  if (rawStartMinutes === null) return { kind: "reject", reason: "no-target", title };
  const durationMinutes =
    item.type === "task" ? (item.durationMinutes ?? defaultDurationMinutes) : item.endMinutes - item.startMinutes;
  const result = resolvePlacement({ day: over.day, startMinutes: rawStartMinutes, durationMinutes });
  if (!result.ok) return { kind: "reject", reason: result.reason, title };
  const { placement } = result;
  const overlaps = overlapsWith(
    blocksForDay(placement.day),
    { startMinutes: placement.startMinutes, endMinutes: placement.endMinutes },
    item.type === "block" ? item.blockId : undefined,
  );

  if (item.type === "task") return { kind: "schedule", taskId: item.taskId, title, placement, overlaps };

  if (placement.day === item.day && placement.startMinutes === item.startMinutes) return { kind: "noop" };
  return {
    kind: "move",
    blockId: item.blockId,
    taskId: item.taskId,
    title,
    placement,
    previous: toPrevious(item),
    overlaps,
    resized: false,
  };
}

/** A resize commit as a plan: same day, new span, `previous` is the span before. */
export function planResize(input: {
  block: Pick<DayBlock, "id" | "title" | "taskId">;
  day: string;
  before: MinuteSpan;
  after: MinuteSpan;
  blocksForDay: (day: string) => readonly DayBlock[];
}): DropPlan {
  const { block, day, before, after } = input;
  const durationMinutes = after.endMinutes - after.startMinutes;
  const result = resolvePlacement({ day, startMinutes: after.startMinutes, durationMinutes });
  if (!result.ok) return { kind: "reject", reason: result.reason, title: block.title };
  if (before.startMinutes === after.startMinutes && before.endMinutes === after.endMinutes) return { kind: "noop" };
  return {
    kind: "move",
    blockId: block.id,
    taskId: block.taskId,
    title: block.title,
    placement: result.placement,
    previous: { day, start: formatClockTime(before.startMinutes), durationMinutes: before.endMinutes - before.startMinutes },
    overlaps: overlapsWith(input.blocksForDay(day), after, block.id),
    resized: true,
  };
}

/** The placement a plan will save, for the ghost; null for plans that do not place anything. */
export function planPlacement(plan: DropPlan): Placement | null {
  return plan.kind === "schedule" || plan.kind === "move" ? plan.placement : null;
}

/**
 * Where a keyboard-lifted item starts when it has no pointer: a block stays
 * where it is; a task goes to the next free half hour after now (today) or at
 * the start of work (any other day), like the S shortcut.
 */
export function initialKeyboardTarget(input: {
  item: DragItem;
  day: string;
  isToday: boolean;
  nowMinutes: number;
  workStartMinutes: number;
  blocks: readonly DayBlock[];
  defaultDurationMinutes: number;
}): { day: string; startMinutes: number } {
  const { item } = input;
  if (item.type === "block") return { day: item.day, startMinutes: item.startMinutes };
  const duration = item.durationMinutes ?? input.defaultDurationMinutes;
  const after = input.isToday ? input.nowMinutes : input.workStartMinutes;
  const start = nextFreeSlot(input.blocks, after, duration) ?? input.workStartMinutes;
  return { day: input.day, startMinutes: start };
}
