import type { Task } from "@/data/domain";
import type { TaskPatch } from "@/data/repositories";
import type { TaskGroup } from "./group";
import { defaultTimeForWindow, windowOfTime, type ClockWindow } from "./time-of-day";

/*
 * What dropping a row on (group, index) means. Pure: the UI hit-tests the
 * drop, asks for a plan and runs it through the mutations.
 *
 *   inside a group           manual order (reorder)
 *   other time-of-day group  a time inside that window (kept when already
 *                            inside), the date becomes today; Unscheduled
 *                            clears the time; Overdue is no target
 *   Date / Area / Priority   sets the date / area (or context) / priority
 *   None                     manual order only
 */

/** `index` is the insertion position among the target group's tasks without the dragged one. */
export interface DropTarget {
  groupId: string;
  index: number;
}

export type DropPlan =
  /** Same group: persist this id order (the whole group) with `reorder`. */
  | { kind: "reorder"; ids: string[] }
  /** Another group: apply `patch`, then, in manual sorts, persist `orderIds`. */
  | { kind: "move"; id: string; patch: TaskPatch; orderIds: string[] }
  | { kind: "none"; reason: "unknown" | "overdue" | "completed" | "unchanged" };

export interface DropInput {
  taskId: string;
  groups: readonly TaskGroup[];
  target: DropTarget;
  /** The planner's today. */
  day: string;
  workHours: { start: string; end: string };
  /** "completed": rows of the Completed view are not rearranged. */
  basis?: "planned" | "completed";
}

/** `ids` with `id` taken out and put back at `index` (clamped). */
export function moveInList(ids: readonly string[], id: string, index: number): string[] {
  const rest = ids.filter((item) => item !== id);
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** Moves a task into a clock window of `day` (the list's time groups, the board's time columns). */
export function patchForWindow(
  task: Task,
  window: ClockWindow,
  input: Pick<DropInput, "day" | "workHours">,
): TaskPatch {
  const patch: TaskPatch = {};
  if (task.date !== input.day) patch.date = input.day;
  // A time already inside the window stays, even when only the date changes.
  const time = windowOfTime(task.time) === window ? task.time : defaultTimeForWindow(window, input.workHours);
  if (time !== task.time) patch.time = time;
  return patch;
}

function patchForGroup(task: Task, group: TaskGroup, input: DropInput): TaskPatch | "overdue" {
  switch (group.kind) {
    case "overdue":
      return "overdue";
    case "morning":
    case "afternoon":
    case "evening":
      return patchForWindow(task, group.kind, input);
    case "unscheduled": {
      const patch: TaskPatch = {};
      if (task.date !== null && task.date < input.day && task.status === "open") patch.date = input.day;
      if (task.time !== null) patch.time = null;
      return patch;
    }
    case "date":
      return group.day === undefined || group.day === task.date ? {} : { date: group.day };
    case "area":
      if (group.scope) return { area: null, scope: group.scope };
      return { area: group.area ?? null };
    case "priority":
      return group.priority === task.priority ? {} : { priority: group.priority ?? null };
    default:
      return {};
  }
}

export function planDrop(input: DropInput): DropPlan {
  const { taskId, groups, target } = input;
  if (input.basis === "completed") return { kind: "none", reason: "completed" };
  const source = groups.find((group) => group.tasks.some((task) => task.id === taskId));
  const destination = groups.find((group) => group.id === target.groupId);
  const task = source?.tasks.find((item) => item.id === taskId);
  if (!source || !destination || !task) return { kind: "none", reason: "unknown" };

  const destinationIds = destination.tasks.map((item) => item.id);
  const orderIds = moveInList(destinationIds, taskId, target.index);

  if (source.id === destination.id) {
    if (orderIds.every((id, index) => id === destinationIds[index])) return { kind: "none", reason: "unchanged" };
    return { kind: "reorder", ids: orderIds };
  }

  const patch = patchForGroup(task, destination, input);
  if (patch === "overdue") return { kind: "none", reason: "overdue" };
  return { kind: "move", id: taskId, patch, orderIds };
}
