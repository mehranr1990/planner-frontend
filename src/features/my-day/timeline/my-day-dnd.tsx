"use client";

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragMoveEvent,
  type DragStartEvent,
  type DropAnimation,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import { useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { dismiss, toast } from "@/components/ui/toast";
import type { TimeBlock } from "@/data/domain";
import { blockKeys, useMoveBlock, useScheduleTask, useUnscheduleBlock } from "@/data/queries";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { workWindow } from "../domain/capacity";
import { toDayBlocks, type DayBlock } from "../domain/day-blocks";
import { parseDropId } from "../drag";
import { DropRegistryProvider, useDropRegistry } from "../drop-registry";
import { usePlannerNow, useMyDay } from "../my-day-context";
import { useMyDayFormat, type MyDayFormat } from "../ui/use-my-day-format";
import { applyPlan, type DropDeps, type DropMessageKey, type DropOutcome, type DropTranslate } from "./apply-drop";
import { DragOverlayCard } from "./drag-overlay-card";
import { ActiveDragContext, DropActionsContext, type ActiveDrag, type DropActions } from "./drag-state";
import { initialKeyboardTarget, planDrop, planPlacement, readDragItem, type DragItem, type DropPlan } from "./drop-plan";
import { moveKeyboardTarget, type KeyboardTarget } from "./keyboard";
import { DayKeyboardSensor, revealBand } from "./keyboard-sensor";

/*
 * The DndContext of My Day: one controller for the timeline and the right
 * rail. Rows from Unscheduled (task:*) and timeline blocks (block:*) are
 * dragged; day columns (day:*) and the Unscheduled card are the targets.
 * Decisions come from planDrop and results from applyPlan, so this file is
 * only wiring: sensors, the pointer-to-minutes mapping, the keyboard cursor,
 * the overlay and the live region.
 *
 * Mouse needs 4px of travel, touch a 200ms long-press (8px tolerance) so the
 * page and the inner timeline still scroll; Space lifts, arrows move, Enter
 * drops, Escape cancels (Enter on a block that is not lifted opens it).
 */

const ARROW_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

const isKeyboardEvent = (event: Event | null | undefined): boolean => event?.type.startsWith("key") ?? false;

/** Viewport y of the pointer that started the drag; null for the keyboard. */
function clientYOf(event: Event | null | undefined): number | null {
  if (!event || isKeyboardEvent(event)) return null;
  if ("touches" in event) {
    const touches = event as TouchEvent;
    return (touches.touches[0] ?? touches.changedTouches?.[0])?.clientY ?? null;
  }
  return "clientY" in event ? (event as MouseEvent).clientY : null;
}

/** The pointer decides the target; with no pointer (keyboard) the overlay rect does. */
const detectCollisions: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args);

/** One-line key of a plan, so the ghost only re-renders when the target changes. */
function planKey(plan: DropPlan): string {
  switch (plan.kind) {
    case "schedule":
    case "move":
      return [
        plan.kind,
        plan.placement.day,
        plan.placement.startMinutes,
        plan.placement.durationMinutes,
        plan.overlaps.map((hit) => hit.id).join(","),
      ].join(":");
    case "reject":
      return `reject:${plan.reason}`;
    default:
      return plan.kind;
  }
}

const noop = () => undefined;

export function MyDayDndProvider({ children }: { children: ReactNode }) {
  return (
    <DropRegistryProvider>
      <DndController>{children}</DndController>
    </DropRegistryProvider>
  );
}

type DragTranslator = ReturnType<typeof useTranslations<"MyDay.drag">>;

function DndController({ children }: { children: ReactNode }) {
  const registry = useDropRegistry();
  const { day: shownDay, isToday } = useMyDay();
  const now = usePlannerNow();
  const settings = usePlannerSettings();
  const format = useMyDayFormat();
  const t = useTranslations("MyDay.drag");
  const reduceMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const scheduleTask = useScheduleTask();
  const moveBlock = useMoveBlock();
  const unscheduleBlock = useUnscheduleBlock();

  const [active, setActive] = useState<ActiveDrag | null>(null);
  const [message, setMessage] = useState("");
  const [lastAccepted, setLastAccepted] = useState(false);

  // Drag-lifetime values: read by sensors and handlers, never rendered.
  const activeItem = useRef<DragItem | null>(null);
  const keyboardTarget = useRef<KeyboardTarget | null>(null);
  const grabOffsetMinutes = useRef(0);
  // Where the pointer really is: dnd-kit's delta also counts scrolling (auto-scroll at the edges), which would shift the drop time.
  const pointerY = useRef<number | null>(null);
  const lastKey = useRef("");

  const defaultDurationMinutes = settings.planning.defaultDurationMinutes;
  const work = workWindow(settings.workHours);

  const announce = useCallback((text: string) => {
    // A changing node so a repeated sentence is announced again.
    setMessage((previous) => (previous === text ? `${text}​` : text));
  }, []);

  const readDay = useCallback(
    (day: string): DayBlock[] => toDayBlocks(queryClient.getQueryData<TimeBlock[]>(blockKeys.day(day)) ?? [], day),
    [queryClient],
  );

  const translate: DropTranslate = useCallback((key: DropMessageKey, values) => t(key, values), [t]);
  const dayLabel = useCallback((day: string) => `${format.weekday(day)} ${format.dayMonth(day)}`, [format]);

  const deps: DropDeps = {
    schedule: scheduleTask.mutateAsync,
    move: moveBlock.mutateAsync,
    unschedule: async (input) => unscheduleBlock.mutateAsync(input),
    notify: toast,
    dismissToast: dismiss,
    announce,
    t: translate,
    format,
    dayLabel,
  };

  const commit = (plan: DropPlan): Promise<DropOutcome> => applyPlan(plan, deps);
  // The latest closures for consumers that outlive a render (the actions context).
  const latest = useRef({ commit, readDay, announce });
  useLayoutEffect(() => {
    latest.current = { commit, readDay, announce };
  });
  const actions = useMemo<DropActions>(
    () => ({
      commit: (plan) => latest.current.commit(plan),
      readDay: (day) => latest.current.readDay(day),
      announce: (text) => latest.current.announce(text),
    }),
    [],
  );

  /** What dropping now would do, from the dnd-kit event of a start, move or end. */
  const computePlan = (
    item: DragItem,
    event: Pick<DragMoveEvent, "over" | "delta" | "activatorEvent">,
  ): DropPlan => {
    let over = event.over ? parseDropId(event.over.id) : null;
    let rawStartMinutes: number | null = null;
    if (isKeyboardEvent(event.activatorEvent)) {
      const target = keyboardTarget.current;
      over = target ? { type: "day", day: target.day } : null;
      rawStartMinutes = target?.startMinutes ?? null;
    } else if (over?.type === "day") {
      const startY = clientYOf(event.activatorEvent);
      const y = pointerY.current ?? (startY === null ? null : startY + event.delta.y);
      const minutes = y === null ? null : registry.minutesAt(over.day, y);
      rawStartMinutes = minutes === null ? null : minutes - grabOffsetMinutes.current;
    }
    return planDrop({ item, over, rawStartMinutes, blocksForDay: readDay, defaultDurationMinutes });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const item = readDragItem(event.active.data.current);
    if (!item) return;
    const keyboard = isKeyboardEvent(event.activatorEvent);
    activeItem.current = item;
    grabOffsetMinutes.current = 0;
    keyboardTarget.current = null;
    pointerY.current = keyboard ? null : clientYOf(event.activatorEvent);

    if (keyboard) {
      keyboardTarget.current = initialKeyboardTarget({
        item,
        day: shownDay,
        isToday,
        nowMinutes: now.minutes,
        workStartMinutes: work.startMinutes,
        blocks: readDay(shownDay),
        defaultDurationMinutes,
      });
    } else if (item.type === "block") {
      // Keep the spot of the block that was grabbed under the pointer.
      const startY = clientYOf(event.activatorEvent);
      const grabbed = startY === null ? null : registry.minutesAt(item.day, startY);
      grabOffsetMinutes.current = grabbed === null ? 0 : grabbed - item.startMinutes;
    }

    const plan = computePlan(item, { over: null, delta: { x: 0, y: 0 }, activatorEvent: event.activatorEvent });
    lastKey.current = planKey(plan);
    setActive({ item, plan, keyboard });
    announce(t("lifted", { title: item.title }));
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const item = activeItem.current;
    if (!item) return;
    const keyboard = isKeyboardEvent(event.activatorEvent);
    const plan = computePlan(item, event);
    const key = planKey(plan);
    if (key === lastKey.current) return;
    lastKey.current = key;
    setActive({ item, plan, keyboard });
    // The pointer user sees the ghost; the keyboard user hears where it is.
    if (keyboard) announce(describeTarget(plan, item, t, format, dayLabel));
  };

  const reset = () => {
    activeItem.current = null;
    keyboardTarget.current = null;
    pointerY.current = null;
    lastKey.current = "";
    setActive(null);
  };

  const handleDragEnd = (event: DragMoveEvent) => {
    const item = activeItem.current;
    if (!item) return;
    const plan = computePlan(item, event);
    reset();
    setLastAccepted(planPlacement(plan) !== null || plan.kind === "unschedule");
    void applyPlan(plan, deps);
  };

  const handleDragCancel = () => {
    const item = activeItem.current;
    reset();
    setLastAccepted(false);
    if (item) announce(t("cancelled", { title: item.title }));
  };

  const pointerDragging = active !== null && !active.keyboard;
  useEffect(() => {
    if (!pointerDragging) return;
    const track = (event: MouseEvent | TouchEvent) => {
      const y = "touches" in event ? event.touches[0]?.clientY : event.clientY;
      if (y !== undefined) pointerY.current = y;
    };
    document.addEventListener("mousemove", track, { passive: true });
    document.addEventListener("touchmove", track, { passive: true });
    return () => {
      document.removeEventListener("mousemove", track);
      document.removeEventListener("touchmove", track);
    };
  }, [pointerDragging]);

  const coordinateGetter = useCallback<KeyboardCoordinateGetter>(
    (event, { currentCoordinates, context }) => {
      const item = activeItem.current;
      const target = keyboardTarget.current;
      if (!item || !target || !ARROW_KEYS.has(event.key)) return undefined;
      event.preventDefault();
      const rtl = event.target instanceof Element && getComputedStyle(event.target).direction === "rtl";
      const durationMinutes =
        item.type === "task" ? (item.durationMinutes ?? defaultDurationMinutes) : item.endMinutes - item.startMinutes;
      const next = moveKeyboardTarget(target, event.key, { days: registry.days(), rtl, durationMinutes }) ?? target;
      keyboardTarget.current = next;

      const geometry = registry.get(next.day);
      if (!geometry || geometry.getTop() === null) return currentCoordinates;
      const targetY = (): number =>
        (geometry.getTop() ?? 0) + (next.startMinutes - geometry.windowStartMinutes) * geometry.pxPerMinute;
      // Keep the target on screen (the page scrolls by itself only for pointer drags).
      revealBand(targetY(), durationMinutes * geometry.pxPerMinute);
      const column = context.droppableRects.get(`day:${next.day}`);
      return { x: column ? column.left + 8 : currentCoordinates.x, y: targetY() };
    },
    [registry, defaultDurationMinutes],
  );

  const keyboardOptions = useMemo(
    () => ({
      // Enter belongs to "open" until something is lifted, then it drops.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
      coordinateGetter,
    }),
    [coordinateGetter],
  );
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(DayKeyboardSensor, keyboardOptions),
  );

  // An accepted drop folds into its block (the block pops in); a refused one settles back.
  const dropAnimation: DropAnimation | null | undefined = reduceMotion
    ? null
    : lastAccepted
      ? {
          duration: 180,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          keyframes: ({ transform }) => [
            { transform: CSS.Transform.toString(transform.initial), opacity: 1 },
            { transform: CSS.Transform.toString({ ...transform.initial, scaleX: 0.94, scaleY: 0.94 }), opacity: 0 },
          ],
        }
      : undefined;

  return (
    <DropActionsContext.Provider value={actions}>
      <ActiveDragContext.Provider value={active}>
        <DndContext
          sensors={sensors}
          collisionDetection={detectCollisions}
          autoScroll={{ threshold: { x: 0.1, y: 0.15 } }}
          accessibility={{
            screenReaderInstructions: { draggable: t("instructions") },
            // Announcements go through the live region below; dnd-kit's stay quiet.
            announcements: {
              onDragStart: noop,
              onDragMove: noop,
              onDragOver: noop,
              onDragEnd: noop,
              onDragCancel: noop,
            },
          }}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {children}
          <DragOverlay dropAnimation={dropAnimation}>{active ? <DragOverlayCard active={active} /> : null}</DragOverlay>
        </DndContext>
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-slot="my-day-live-region">
          {message}
        </div>
      </ActiveDragContext.Provider>
    </DropActionsContext.Provider>
  );
}

/** The sentence a keyboard user hears when the target moves. */
function describeTarget(
  plan: DropPlan,
  item: DragItem,
  t: DragTranslator,
  format: MyDayFormat,
  dayLabel: (day: string) => string,
): string {
  if (plan.kind === "schedule" || plan.kind === "move") {
    const { placement, overlaps } = plan;
    const where = t("hoverAt", {
      title: item.title,
      time: format.clock(placement.startMinutes),
      day: dayLabel(placement.day),
    });
    const first = [...overlaps].sort((a, b) => b.minutes - a.minutes)[0];
    return first
      ? `${where} ${t("toastOverlap", { other: first.title, duration: format.duration(first.minutes) })}`
      : where;
  }
  if (plan.kind === "unschedule") return t("hoverUnscheduled", { title: item.title });
  if (plan.kind === "reject" && plan.reason === "out-of-range") return t("rejectedOutOfRange", { title: item.title });
  return t("hoverNothing", { title: item.title });
}
