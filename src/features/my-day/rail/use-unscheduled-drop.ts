"use client";

import { useDroppable } from "@dnd-kit/core";
import { isDragData, UNSCHEDULED_DROP_ID } from "../drag";

/*
 * The Unscheduled zone as a drop target (id `unscheduled`). Dropping a task's
 * block there takes it off the timeline; the controller does that, this only
 * says when to show the affordance: while a task block is being dragged
 * (`ready`), and more strongly while it is over the zone (`over`). Events,
 * routines and breaks cannot be unscheduled, so they never light it up.
 */
export function useUnscheduledDrop(enabled: boolean) {
  const { setNodeRef, isOver, active } = useDroppable({ id: UNSCHEDULED_DROP_ID, disabled: !enabled });
  const data: unknown = active?.data.current;
  const ready = enabled && isDragData(data) && data.type === "block" && data.taskId !== undefined;
  return { setNodeRef, ready, over: ready && isOver };
}
