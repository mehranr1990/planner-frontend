"use client";

import { useRef, useState, type PointerEvent } from "react";
import { addDaysToDay } from "@/lib/dates/clock-time";
import type { WorkflowCategory } from "@/data/project-domain";
import type { TimeScale } from "./time-scale";

/*
 * Pointer dragging of bar ends (or the whole bar) for PJ-04 / PJ-05: snaps
 * to whole days, direction-aware through the scale (RTL), and reports the
 * new span on release; the caller sends it through useReschedule (preview
 * when anything depends on it). Keyboard users change dates in the task
 * drawer or the Gantt Dependencies list (drag is never the only way).
 */

export type BarEdge = "start" | "end" | "move";

export interface BarDrag {
  id: string;
  edge: BarEdge;
  days: number;
}

/** The span after dragging `edge` by `days` (start never passes end). */
export function draggedSpan(start: string, end: string, edge: BarEdge, days: number): { start: string; end: string } {
  if (edge === "move") return { start: addDaysToDay(start, days), end: addDaysToDay(end, days) };
  if (edge === "start") {
    const next = addDaysToDay(start, days);
    return { start: next > end ? end : next, end };
  }
  const next = addDaysToDay(end, days);
  return { start, end: next < start ? start : next };
}

export function useBarDrag(scale: TimeScale, onCommit: (id: string, edge: BarEdge, days: number) => void) {
  const [drag, setDrag] = useState<BarDrag | null>(null);
  const origin = useRef<{ x: number; id: string; edge: BarEdge } | null>(null);
  const handleProps = (id: string, edge: BarEdge) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      origin.current = { x: event.clientX, id, edge };
      setDrag({ id, edge, days: 0 });
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (!origin.current || origin.current.id !== id) return;
      const days = scale.daysFor(event.clientX - origin.current.x);
      setDrag((current) => (current && current.days === days ? current : { id, edge: origin.current!.edge, days }));
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (!origin.current || origin.current.id !== id) return;
      const days = scale.daysFor(event.clientX - origin.current.x);
      const { edge: dragged } = origin.current;
      origin.current = null;
      setDrag(null);
      if (days !== 0) onCommit(id, dragged, days);
    },
    onPointerCancel: () => {
      origin.current = null;
      setDrag(null);
    },
  });
  return { drag, handleProps };
}

/** Bar colours by status category (blocked = rose outline). */
export const BAR_CLASS: Record<WorkflowCategory, string> = {
  todo: "bg-scope-soft text-scope-deep",
  active: "bg-scope-deep text-on-accent",
  review: "bg-info-soft text-info-text inset-ring inset-ring-scope-deep/40",
  blocked: "bg-surface text-danger-text inset-ring-[1.5px] inset-ring-danger",
  done: "bg-success-soft text-success-text",
  canceled: "bg-raised text-fg-muted line-through",
};
