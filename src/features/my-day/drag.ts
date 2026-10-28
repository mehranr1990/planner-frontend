import type { EnergyLevel } from "@/data/domain";
import type { DayBlock } from "./domain/day-blocks";

/*
 * The drag contract shared by the timeline (draggable blocks, day columns,
 * the DndContext controller) and the right rail (draggable task rows, the
 * Unscheduled drop zone). Pure ids, payloads and geometry: no React, no
 * dnd-kit imports, so both sides and the tests agree on one definition.
 *
 *   draggable  task:<taskId>    payload TaskDragData   (Unscheduled rows)
 *   draggable  block:<blockId>  payload BlockDragData  (timeline blocks)
 *   droppable  day:<YYYY-MM-DD> a timeline column; geometry via DropRegistry
 *   droppable  unscheduled      the Unscheduled card; dropping a task block there unschedules it
 *
 * Done blocks are not draggable. Events, routines and breaks are movable but
 * cannot be dropped on Unscheduled (the controller checks BlockDragData.taskId).
 */

export const UNSCHEDULED_DROP_ID = "unscheduled";

export type TaskDragId = `task:${string}`;
export type BlockDragId = `block:${string}`;
export type DayDropId = `day:${string}`;

export const taskDragId = (taskId: string): TaskDragId => `task:${taskId}`;
export const blockDragId = (blockId: string): BlockDragId => `block:${blockId}`;
export const dayDropId = (day: string): DayDropId => `day:${day}`;

export interface TaskDragData {
  type: "task";
  taskId: string;
  title: string;
  durationMinutes: number | null;
  energy: EnergyLevel | null;
}

export interface BlockDragData {
  type: "block";
  blockId: string;
  /** Set for task blocks: only these can be dropped on Unscheduled. */
  taskId?: string;
  durationMinutes: number;
}

export type DragData = TaskDragData | BlockDragData;

export function taskDragData(task: {
  id: string;
  title: string;
  durationMinutes: number | null;
  energy: EnergyLevel | null;
}): TaskDragData {
  return { type: "task", taskId: task.id, title: task.title, durationMinutes: task.durationMinutes, energy: task.energy };
}

export function blockDragData(block: Pick<DayBlock, "id" | "taskId" | "durationMinutes">): BlockDragData {
  return { type: "block", blockId: block.id, taskId: block.taskId, durationMinutes: block.durationMinutes };
}

/** Narrows the `data.current` of a dnd-kit active item. */
export function isDragData(value: unknown): value is DragData {
  if (typeof value !== "object" || value === null) return false;
  const { type } = value as { type?: unknown };
  return type === "task" ? "taskId" in value : type === "block" ? "blockId" in value : false;
}

/** Done blocks are not draggable; every other block is. */
export function isBlockDraggable(block: Pick<DayBlock, "done">): boolean {
  return !block.done;
}

export type ParsedDropId = { type: "day"; day: string } | { type: "unscheduled" };

/** Splits a droppable id; null for anything that is not ours. */
export function parseDropId(id: string | number): ParsedDropId | null {
  if (typeof id !== "string") return null;
  if (id === UNSCHEDULED_DROP_ID) return { type: "unscheduled" };
  const prefix = "day:";
  return id.startsWith(prefix) && id.length > prefix.length ? { type: "day", day: id.slice(prefix.length) } : null;
}

// ── Pixel ↔ minute mapping ───────────────────────────────────────────────

/** Timeline scale: 64px per hour. */
export const PX_PER_MINUTE = 64 / 60;

/** Keyboard drag and resize move by this much per arrow press. */
export const KEYBOARD_STEP_MINUTES = 15;

export const pxToMinutes = (px: number, pxPerMinute: number = PX_PER_MINUTE): number => px / pxPerMinute;

/**
 * What a timeline column tells the controller about itself. `getTop` reads
 * the column's viewport top lazily (the page may scroll mid-drag), at the
 * y where `windowStartMinutes` is drawn.
 */
export interface DayColumnGeometry {
  day: string;
  windowStartMinutes: number;
  windowEndMinutes: number;
  pxPerMinute: number;
  /** Viewport y of the window start; null while the column is not mounted. */
  getTop(): number | null;
}

/** Unsnapped minute-of-day under a viewport y in a column; null when its top is unknown. */
export function minutesAtClientY(geometry: DayColumnGeometry, clientY: number): number | null {
  const top = geometry.getTop();
  return top === null ? null : geometry.windowStartMinutes + pxToMinutes(clientY - top, geometry.pxPerMinute);
}

export interface DropRegistry {
  /** Registers (or replaces) a column; returns the function that removes it. */
  register(geometry: DayColumnGeometry): () => void;
  get(day: string): DayColumnGeometry | undefined;
  /** Registered days in ascending order (the left-to-right columns of the 3-days view). */
  days(): string[];
  /** Unsnapped minutes at a viewport y within `day`'s column. */
  minutesAt(day: string, clientY: number): number | null;
}

export function createDropRegistry(): DropRegistry {
  const columns = new Map<string, DayColumnGeometry>();
  return {
    register(geometry) {
      columns.set(geometry.day, geometry);
      return () => {
        // A newer registration for the same day must survive an older cleanup.
        if (columns.get(geometry.day) === geometry) columns.delete(geometry.day);
      };
    },
    get: (day) => columns.get(day),
    days: () => [...columns.keys()].sort(),
    minutesAt(day, clientY) {
      const geometry = columns.get(day);
      return geometry ? minutesAtClientY(geometry, clientY) : null;
    },
  };
}
