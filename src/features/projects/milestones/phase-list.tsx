"use client";

import { closestCenter, DndContext, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type Announcements, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Check, GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Progress } from "@/design-system/feedback/progress";
import { Icon } from "@/components/ui/icon";
import type { PhaseRow } from "@/data/project-domain";
import { cn } from "@/lib/cn";
import { useProjectFormat } from "../format";

/*
 * PhaseList (PJ-08 left column): ordered phases with dates, task counts and
 * a linear bar; done phases carry a check, the current phase an outline.
 * Manager+ reorder by drag (mouse 4px, 200ms long-press, or the grip with
 * Space / arrows / Space, Esc cancels) with live-region announcements.
 * Phones: read-only chips above the milestones (PJM03 "phases become pills").
 */

export interface PhaseListProps {
  rows: readonly PhaseRow[];
  currentPhaseId: string | null;
  canReorder: boolean;
  onReorder: (phaseIds: string[]) => void;
}

export function PhaseList({ rows, currentPhaseId, canReorder, onReorder }: PhaseListProps) {
  const t = useTranslations("Milestones.phases");
  const tBoard = useTranslations("Tasks.board");
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = rows.map((row) => row.phase.id);
  const name = useMemo(() => new Map(rows.map((row) => [row.phase.id, row.phase.name])), [rows]);
  const announcements: Announcements = {
    onDragStart: ({ active }) => tBoard("drag.start", { title: name.get(String(active.id)) ?? "" }),
    onDragOver: ({ over }) => (over ? tBoard("drag.over", { column: name.get(String(over.id)) ?? "" }) : undefined),
    onDragEnd: ({ active, over }) =>
      over
        ? tBoard("drag.drop", { title: name.get(String(active.id)) ?? "", column: name.get(String(over.id)) ?? "" })
        : tBoard("drag.cancel", { title: name.get(String(active.id)) ?? "" }),
    onDragCancel: ({ active }) => tBoard("drag.cancel", { title: name.get(String(active.id)) ?? "" }),
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, String(active.id));
    onReorder(next);
  };

  return (
    <>
      {/* Phones: chips. */}
      <ul aria-label={t("label")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:hidden">
        {rows.map(({ phase, tasksDone, tasksTotal }) => (
          <li
            key={phase.id}
            aria-current={phase.id === currentPhaseId ? "step" : undefined}
            className={cn(
              "inline-flex min-h-8 shrink-0 items-center gap-1 rounded-pill px-3 text-xs font-semibold",
              phase.id === currentPhaseId ? "bg-scope-soft text-scope-deep" : "text-fg-secondary inset-ring inset-ring-outline",
            )}
          >
            <bdi>{phase.name}</bdi>
            {phase.done ? <Icon icon={Check} size={12} /> : null}
            {phase.id === currentPhaseId ? <FormatCount done={tasksDone} total={tasksTotal} /> : null}
          </li>
        ))}
      </ul>
      <section aria-label={t("label")} className="flex flex-col gap-2 rounded-[28px] bg-surface p-3 max-sm:hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{ announcements, screenReaderInstructions: { draggable: tBoard("drag.instructions") } }}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ol className="flex flex-col gap-1.5">
              {rows.map((row) => (
                <PhaseItem key={row.phase.id} row={row} current={row.phase.id === currentPhaseId} draggable={canReorder} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
        <p className="px-2 pt-1 text-xs font-medium text-fg-secondary">{t("hint")}</p>
      </section>
    </>
  );
}

function FormatCount({ done, total }: { done: number; total: number }) {
  const t = useTranslations("Milestones.phases");
  const format = useProjectFormat();
  return <span>{t("count", { done: format.number(done), total: format.number(total) })}</span>;
}

function PhaseItem({ row, current, draggable }: { row: PhaseRow; current: boolean; draggable: boolean }) {
  const t = useTranslations("Milestones.phases");
  const tBoard = useTranslations("Tasks.board");
  const format = useProjectFormat();
  const { phase, tasksDone, tasksTotal } = row;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: phase.id,
    disabled: !draggable,
  });
  return (
    <li
      ref={setNodeRef}
      data-phase={phase.id}
      aria-current={current ? "step" : undefined}
      style={{ transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined, transition }}
      className={cn(
        "flex flex-col gap-1.5 rounded-[20px] p-3",
        current && "inset-ring-[1.5px] inset-ring-scope-deep",
        isDragging && "relative z-10 bg-surface shadow-elevated",
      )}
    >
      <div className="flex items-center gap-2">
        {draggable ? (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={tBoard("move", { title: phase.name })}
            className="-ms-1 inline-flex size-6 shrink-0 cursor-grab items-center justify-center rounded-full text-icon-muted focus-visible:focus-ring"
          >
            <Icon icon={GripVertical} size={14} />
          </button>
        ) : null}
        {phase.done ? (
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-on-accent">
            <Icon icon={Check} size={12} />
            <span className="sr-only">{t("done")}</span>
          </span>
        ) : null}
        <bdi className="min-w-0 flex-1 truncate text-sm font-bold text-fg">{phase.name}</bdi>
        <span className="text-xs font-semibold text-fg-secondary">
          {t("count", { done: format.number(tasksDone), total: format.number(tasksTotal) })}
        </span>
      </div>
      <span className="text-xs font-medium text-fg-secondary">{format.range(phase.start, phase.end)}</span>
      <Progress size="sm" value={tasksTotal ? (tasksDone / tasksTotal) * 100 : 0} label={phase.name} />
    </li>
  );
}
