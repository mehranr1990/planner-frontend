"use client";

import { useSortable } from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { KeyboardEventHandler, MouseEvent, MouseEventHandler, TouchEventHandler } from "react";
import { EnergyBars } from "@/components/ui/energy-bars";
import type { Task } from "@/data/domain";
import { taskDetailHref } from "@/features/personal/routes";
import { cn } from "@/lib/cn";
import { taskWhen } from "../domain/when";
import { useList } from "../list/list-context";
import { TaskCheck, taskDotClass } from "../list/task-parts";
import { metaPieces } from "../list/task-row";
import { useTasksState } from "../tasks-context";
import { priorityStyle } from "../ui/priority-style";
import { useTasksFormat } from "../ui/use-tasks-format";

/*
 * One board card (P03): the list row's data on a 20px card, never notched.
 * Selected = mint outline + square check; overdue keeps a rose outline. The
 * whole card picks up with the mouse (4px) or a long-press; the grip is the
 * keyboard handle (Space lifts). Cards settle into a new column with a
 * shared-layout spring (240ms), instant under reduced motion.
 */

export interface BoardCardProps {
  task: Task;
  columnId: string;
  index: number;
  overdue?: boolean;
  /** Done-column cards are not dragged. */
  draggable?: boolean;
  /** The card being dragged stays in place, dimmed. */
  lifted?: boolean;
}

export function BoardCard({ task, columnId, index, overdue = false, draggable = true, lifted = false }: BoardCardProps) {
  const t = useTranslations("Tasks.row");
  const tBoard = useTranslations("Tasks.board");
  const format = useTasksFormat();
  const reduced = useReducedMotion();
  const { today, selection, isSelected, select, toggleSelected } = useTasksState();
  const { actions, visibleIds } = useList();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useSortable({
    id: task.id,
    data: { columnId, index },
    disabled: !draggable,
  });

  const selecting = selection.ids.length > 0;
  const selected = isSelected(task.id);
  const done = task.status === "done" || actions.lifecycle.phase(task.id) !== "none";
  const when = format.when(taskWhen(task, { day: today }));
  const meta = metaPieces(task, today, t, format).filter((piece) => piece.key !== "overdue");
  const priority = priorityStyle(task.priority);
  const look = selecting ? (selected ? "selected" : "unselected") : done ? "done" : "open";

  const onCardClick = (event: MouseEvent) => {
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      event.preventDefault();
      select(task.id, visibleIds, event);
    } else if (selecting) {
      event.preventDefault();
      toggleSelected(task.id);
    }
  };

  return (
    <motion.li
      ref={setNodeRef}
      layoutId={reduced ? undefined : `board-${task.id}`}
      layout={reduced ? false : "position"}
      transition={{ type: "spring", duration: columnId === "done" ? 0.22 : 0.24, bounce: 0.2 }}
      data-task-row={task.id}
      data-selected={selected || undefined}
      onMouseDown={draggable ? (listeners?.onMouseDown as MouseEventHandler | undefined) : undefined}
      onTouchStart={draggable ? (listeners?.onTouchStart as TouchEventHandler | undefined) : undefined}
      onClick={onCardClick}
      className={cn(
        "group/card relative flex flex-col gap-1.5 rounded-[20px] border bg-surface p-3.5",
        overdue ? "border-danger" : "border-transparent",
        selected && "border-personal-deep bg-personal-soft/50 outline outline-1 outline-personal-deep",
        lifted && "opacity-40",
        draggable && "cursor-grab touch-manipulation",
      )}
    >
      <div className="flex items-start gap-2.5">
        <TaskCheck
          look={look}
          aria-label={t(selecting ? "select" : done ? "reopen" : "complete", { title: task.title })}
          aria-pressed={selecting ? selected : done}
          onClick={(event) => {
            event.stopPropagation();
            if (selecting) toggleSelected(task.id);
            else actions.setDone(task, !done);
          }}
          className="mt-px"
        />
        <Link
          href={taskDetailHref(task.id)}
          onClick={(event) => {
            if (selecting || event.shiftKey || event.metaKey || event.ctrlKey) event.preventDefault();
          }}
          className={cn(
            "min-w-0 flex-1 rounded text-sm font-bold leading-snug text-fg focus-visible:focus-ring",
            done && "text-fg-muted line-through",
          )}
        >
          <span dir="auto">{task.title}</span>
        </Link>
        {draggable ? (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            onKeyDown={listeners?.onKeyDown as KeyboardEventHandler | undefined}
            aria-label={tBoard("move", { title: task.title })}
            className="-me-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-icon-muted opacity-0 focus-visible:focus-ring focus-visible:opacity-100 group-hover/card:opacity-100 max-lg:hidden"
          >
            <GripVertical aria-hidden="true" size={14} />
          </button>
        ) : null}
      </div>
      {meta.length ? (
        <p className="flex min-w-0 items-center gap-1.5 ps-[32px] text-xs font-semibold text-fg-muted">
          <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", taskDotClass(task))} />
          <span className="truncate" dir="auto">
            {meta.map((piece) => piece.text).join(" · ")}
          </span>
        </p>
      ) : null}
      <div className="flex min-h-6 items-center gap-2 ps-[32px] text-xs font-semibold text-fg-secondary">
        {when.text ? (
          <span className={cn("font-bold tabular", when.overdue && "text-danger-text")}>
            <bdi dir={when.text.includes(":") ? "ltr" : "auto"}>{when.text}</bdi>
          </span>
        ) : null}
        <EnergyBars level={task.energy} />
        {task.durationMinutes ? <span className="text-fg-muted tabular">{format.durationShort(task.durationMinutes)}</span> : null}
        {task.priority ? (
          <span className="ms-auto inline-flex min-h-6 items-center gap-1.5 rounded-pill border border-border px-2 font-bold">
            <span aria-hidden="true" className={cn("size-1.5 rounded-full", priority.dot)} />
            <span className={priority.label}>{format.priority(task.priority)}</span>
          </span>
        ) : null}
      </div>
    </motion.li>
  );
}

/** The lifted copy under the pointer: tilted −2°, deep outline, no interaction. */
export function BoardCardPreview({ task }: { task: Task }) {
  const t = useTranslations("Tasks.row");
  const format = useTasksFormat();
  const { today } = useTasksState();
  const meta = metaPieces(task, today, t, format).filter((piece) => piece.key !== "overdue");
  return (
    <div className="flex -rotate-2 cursor-grabbing flex-col gap-1.5 rounded-[20px] border-[1.5px] border-personal-deep bg-surface p-3.5 shadow-elevated motion-reduce:rotate-0 rtl:rotate-2 rtl:motion-reduce:rotate-0">
      <div className="flex items-start gap-2.5">
        <TaskCheck look="open" tabIndex={-1} aria-hidden="true" className="mt-px" />
        <span dir="auto" className="min-w-0 flex-1 text-sm font-bold leading-snug text-fg">
          {task.title}
        </span>
      </div>
      {meta.length ? (
        <p className="flex min-w-0 items-center gap-1.5 ps-[32px] text-xs font-semibold text-fg-muted">
          <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", taskDotClass(task))} />
          <span className="truncate" dir="auto">
            {meta.map((piece) => piece.text).join(" · ")}
          </span>
        </p>
      ) : null}
      {task.durationMinutes ? (
        <span className="flex items-center gap-2 ps-[32px] text-xs font-semibold text-fg-muted tabular">
          <EnergyBars level={task.energy} />
          {format.durationShort(task.durationMinutes)}
        </span>
      ) : null}
    </div>
  );
}
