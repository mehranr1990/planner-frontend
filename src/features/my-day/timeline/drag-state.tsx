"use client";

import { createContext, useContext } from "react";
import type { DayBlock } from "../domain/day-blocks";
import type { DropOutcome } from "./apply-drop";
import { planPlacement, type DragItem, type DropPlan } from "./drop-plan";

/*
 * What the timeline columns, the blocks and the right rail may read while a
 * drag is in flight, and what they may ask the controller to do. Kept apart
 * from the controller so the columns do not import dnd-kit.
 */

export interface ActiveDrag {
  item: DragItem;
  /** What dropping right now would do; the ghost and the overlay label are drawn from it. */
  plan: DropPlan;
  /** Lifted with the keyboard: there is no pointer, the target is virtual. */
  keyboard: boolean;
}

export const ActiveDragContext = createContext<ActiveDrag | null>(null);

/** The drag in flight, or null. */
export function useActiveDrag(): ActiveDrag | null {
  return useContext(ActiveDragContext);
}

export interface DropActions {
  /** Carries a plan out (mutation, toast with Undo, announcement). Used for resize commits. */
  commit(plan: DropPlan): Promise<DropOutcome>;
  /** The blocks the query cache holds for a day, for overlap checks. */
  readDay(day: string): readonly DayBlock[];
  /** Polite screen-reader announcement. */
  announce(message: string): void;
}

const NO_ACTIONS: DropActions = {
  commit: async () => "noop",
  readDay: () => [],
  announce: () => undefined,
};

export const DropActionsContext = createContext<DropActions>(NO_ACTIONS);

export function useDropActions(): DropActions {
  return useContext(DropActionsContext);
}

export interface MyDayDragState {
  dragging: boolean;
  /** What is being dragged: an Unscheduled task or a timeline block. */
  kind: "task" | "block" | null;
  /** A block that can be unscheduled is over the Unscheduled card's drop target. */
  willUnschedule: boolean;
}

/** For the right rail: highlight the Unscheduled card while a block hovers it. */
export function useMyDayDragState(): MyDayDragState {
  const active = useActiveDrag();
  return {
    dragging: active !== null,
    kind: active?.item.type ?? null,
    willUnschedule: active?.plan.kind === "unschedule",
  };
}

/** The placement of the active drag when it lands on `day`, for that column's ghost; otherwise null. */
export function ghostFor(active: ActiveDrag | null, day: string) {
  const placement = active ? planPlacement(active.plan) : null;
  return active && placement?.day === day ? { placement, overlapping: planOverlaps(active.plan) } : null;
}

function planOverlaps(plan: DropPlan): boolean {
  return (plan.kind === "schedule" || plan.kind === "move") && plan.overlaps.length > 0;
}
