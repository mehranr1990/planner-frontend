"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { toast } from "@/components/ui/toast";
import { useUpdateTask } from "@/data/queries";
import { isDragData, parseDropId, type TaskDragData } from "@/features/my-day/drag";
import { useCalendarFormat } from "./use-calendar-format";

/*
 * Month view drag and drop: an Unscheduled task dropped on a day cell
 * (`day:*`, My Day's drop id) gets that date and no time (P04 rules). The
 * week view uses My Day's controller instead, where a slot sets the time too.
 */

export function MonthDndProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("Calendar.month");
  const format = useCalendarFormat();
  const updateTask = useUpdateTask();
  const [active, setActive] = useState<TaskDragData | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const handleStart = ({ active: item }: DragStartEvent) => {
    const data: unknown = item.data.current;
    setActive(isDragData(data) && data.type === "task" ? data : null);
  };

  const handleEnd = async ({ active: item, over }: DragEndEvent) => {
    setActive(null);
    const data: unknown = item.data.current;
    const target = over ? parseDropId(over.id) : null;
    if (!isDragData(data) || data.type !== "task" || target?.type !== "day") return;
    try {
      await updateTask.mutateAsync({ id: data.taskId, patch: { date: target.day, time: null } });
      toast({ tone: "success", title: t("dated", { date: format.dayMonth(target.day) }), description: <bdi dir="auto">{data.title}</bdi> });
    } catch {
      toast({ tone: "danger", title: t("dateFailed") });
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleStart} onDragEnd={handleEnd} onDragCancel={() => setActive(null)}>
      {children}
      <DragOverlay dropAnimation={null}>
        {active ? (
          <div className="max-w-60 truncate rounded-[14px] bg-surface px-3 py-2 text-sm font-semibold shadow-lg ring-1 ring-hairline">
            <bdi dir="auto">{active.title}</bdi>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
