"use client";

import { useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import type { Task } from "@/data/domain";
import { cn } from "@/lib/cn";
import { exceedsEnergy } from "../domain/energy";
import { taskDragData, taskDragId } from "../drag";
import { useMyDay } from "../my-day-context";
import { EnergyBars } from "../ui/energy-bars";
import { blockStyle } from "../ui/scope-style";
import { useMyDayFormat } from "../ui/use-my-day-format";

/*
 * One Unscheduled task: a draggable row (id `task:<id>`, payload from
 * drag.ts), 52px, 16px radius, never notched. The controller (the timeline's
 * DndContext) turns a drop into a schedule; the row only offers itself, and
 * on a keyboard is lifted with Space like any dnd-kit item. Selecting a row
 * (click or focus) is what the S shortcut acts on.
 */

export interface UnscheduledRowProps {
  task: Task;
  selected: boolean;
  onSelect: (taskId: string) => void;
  /** False for the copy of the list that is not on screen (card vs tray), so ids never collide. */
  dragEnabled: boolean;
}

export function UnscheduledRow({ task, selected, onSelect, dragEnabled }: UnscheduledRowProps) {
  const t = useTranslations("MyDay.unscheduled");
  const format = useMyDayFormat();
  const { day, energy } = useMyDay();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: taskDragId(task.id),
    data: taskDragData(task),
    disabled: !dragEnabled,
  });

  const overdue = task.date !== null && task.date < day;
  const needsMore = task.energy !== null && exceedsEnergy(task, energy);
  const needs = needsMore && task.energy ? t("needsEnergy", { level: task.energy }) : undefined;

  return (
    <li>
      <div
        ref={setNodeRef}
        {...attributes}
        {...(dragEnabled ? listeners : undefined)}
        aria-current={selected ? "true" : undefined}
        data-selected={selected || undefined}
        data-dragging={isDragging || undefined}
        data-exceeds-energy={needsMore || undefined}
        title={needs}
        onFocus={() => onSelect(task.id)}
        onClick={() => onSelect(task.id)}
        className={cn(
          "flex min-h-13 touch-pan-y items-center gap-2.5 rounded-field ps-2 pe-3 inset-ring inset-ring-hairline",
          "cursor-grab select-none active:cursor-grabbing",
          selected && "inset-ring-[1.5px] inset-ring-scope-deep",
          isDragging && "opacity-40",
        )}
      >
        <Icon icon={GripVertical} size={16} className="shrink-0 text-icon-muted" />
        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", overdue ? "bg-danger" : blockStyle({ scope: task.scope, kind: "task" }).dot)} />
        {/* The dot is colour; say it too. */}
        {overdue ? <span className="sr-only">{t("overdueMark")}</span> : null}
        <span className={cn("min-w-0 flex-1 truncate text-sm font-semibold", needsMore && "text-fg-muted")}>
          <bdi dir="auto" className="inline-block max-w-full truncate align-bottom">{task.title}</bdi>
        </span>
        {needs ? <span className="sr-only">{needs}</span> : null}
        <EnergyBars level={task.energy} className={cn(needsMore && "opacity-60")} />
        <span className="min-w-11 shrink-0 whitespace-nowrap text-end text-[0.8125rem] font-bold tabular">
          {task.durationMinutes !== null ? (
            format.duration(task.durationMinutes)
          ) : (
            <>
              <span aria-hidden>—</span>
              <span className="sr-only">{t("noEstimate")}</span>
            </>
          )}
        </span>
      </div>
    </li>
  );
}
