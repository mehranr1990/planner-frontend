"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useTranslations } from "next-intl";
import type { Ref } from "react";
import { useReorderTasks, useUpdateTask } from "@/data/queries";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { cn } from "@/lib/cn";
import type { TaskGroup } from "../domain/group";
import { planDrop } from "../domain/reorder";
import { useTasksState } from "../tasks-context";
import { AddTaskRow } from "./add-task-row";
import { useList } from "./list-context";
import { GROUP_DROP_PREFIX, TaskGroupView } from "./task-group";
import { ROW_GRID, ROW_GRID_COMPLETED } from "./task-row";

/*
 * The list card: one white 32px container (no notch, no cards) on desktop
 * with the column header, the groups and the add row; on a phone the groups
 * sit on the canvas with card rows. Drag reorder through dnd-kit sortable
 * (mouse, touch with a hold, keyboard on the grip): the pure planDrop says
 * whether a drop reorders the group or moves the task into another group
 * (new time window, date, priority or area).
 */

/** Where a drop lands: the group and the insertion index without the dragged row. */
export function dropTarget(groups: readonly TaskGroup[], overId: string): { groupId: string; index: number } | null {
  if (overId.startsWith(GROUP_DROP_PREFIX)) {
    const groupId = overId.slice(GROUP_DROP_PREFIX.length);
    const group = groups.find((item) => item.id === groupId);
    return group ? { groupId, index: group.tasks.length } : null;
  }
  for (const group of groups) {
    const index = group.tasks.findIndex((task) => task.id === overId);
    if (index >= 0) return { groupId: group.id, index };
  }
  return null;
}

export function TaskList({ addRef }: { addRef: Ref<HTMLInputElement> }) {
  const t = useTranslations("Tasks.list");
  const { tab, today } = useTasksState();
  const { data, openReschedule } = useList();
  const { workHours } = usePlannerSettings();
  const reorder = useReorderTasks();
  const update = useUpdateTask();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const basis = tab === "completed" ? "completed" : "planned";
  const draggable = basis === "planned";
  const groups = data.groups;

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const target = dropTarget(groups, String(over.id));
    if (!target) return;
    const plan = planDrop({ taskId: String(active.id), groups, target, day: today, workHours, basis });
    if (plan.kind === "reorder") reorder.mutate({ ids: plan.ids });
    else if (plan.kind === "move") {
      update.mutate(
        { id: plan.id, patch: plan.patch },
        { onSuccess: () => reorder.mutate({ ids: plan.orderIds }) },
      );
    }
  };

  const rescheduleOverdue = (group: TaskGroup, anchor: HTMLElement) =>
    openReschedule(group.tasks.filter((task) => task.status === "open").map((task) => task.id), anchor);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div
        data-probe="tasks"
        data-tasks-list=""
        aria-label={t("label")}
        role="region"
        className={cn(
          "flex min-w-0 flex-col gap-3.5 lg:gap-0 lg:rounded-card lg:bg-surface lg:p-3 lg:pb-[18px]",
          data.isPlaceholder && "opacity-90",
        )}
      >
        <div
          aria-hidden="true"
          className={cn(
            "hidden min-h-7 items-center gap-3 px-3 text-[11px] font-bold text-fg-muted lg:grid",
            basis === "completed" ? ROW_GRID_COMPLETED : ROW_GRID,
          )}
        >
          <span />
          <span />
          <span>{t("columns.task")}</span>
          {basis === "completed" ? null : <span>{t("columns.priority")}</span>}
          <span className="text-center">{t("columns.energy")}</span>
          <span className="text-end">{t("columns.duration")}</span>
          <span className="text-end">{t("columns.when")}</span>
          <span />
        </div>
        {groups.map((group) => (
          <TaskGroupView
            key={group.id}
            group={group}
            basis={basis}
            draggable={draggable}
            onRescheduleOverdue={rescheduleOverdue}
          />
        ))}
        {basis === "completed" ? (
          <p className="px-1 py-2 text-xs font-semibold text-fg-muted lg:px-3">{t("completedNote")}</p>
        ) : (
          <AddTaskRow ref={addRef} />
        )}
      </div>
    </DndContext>
  );
}
