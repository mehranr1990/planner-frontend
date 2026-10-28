"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, Check, GripVertical, Maximize2, Repeat } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { MouseEvent } from "react";
import { EnergyBars } from "@/components/ui/energy-bars";
import { useIsDesktop } from "@/components/ui/use-is-desktop";
import type { Task } from "@/data/domain";
import { taskDetailHref } from "@/features/personal/routes";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { isRtl } from "@/lib/locale/direction";
import { overdueDays, taskWhen } from "../domain/when";
import { useRowTouch } from "../mobile/use-row-touch";
import { useTasksState } from "../tasks-context";
import { priorityStyle } from "../ui/priority-style";
import { useTasksFormat } from "../ui/use-tasks-format";
import { InlineEditRow } from "./inline-edit";
import { useList } from "./list-context";
import { TaskCheck, taskDotClass } from "./task-parts";

/*
 * One task row (P03). Desktop (lg+): a 52px grid row inside the list card,
 * columns shared with the column header so they never drift. Phone: a 56px
 * card row (check · title + meta · energy · when) with swipe and long-press.
 * The ⤢ link opens Task detail (the P06 drawer on soft navigation); a click on
 * the title edits inline (desktop) or opens detail (phone).
 */

export const ROW_GRID = "lg:grid-cols-[16px_22px_minmax(0,1fr)_74px_22px_44px_86px_28px]";
export const ROW_GRID_COMPLETED = "lg:grid-cols-[16px_22px_minmax(0,1fr)_22px_44px_86px_28px]";

export const rowTitleId = (id: string) => `task-title-${id}`;

export interface TaskRowProps {
  task: Task;
  basis: "planned" | "completed";
  /** The row may be dragged (not in Completed). */
  draggable: boolean;
  /** Unscheduled rows always show the grip. */
  gripVisible?: boolean;
}

export function TaskRow({ task, basis, draggable, gripVisible = false }: TaskRowProps) {
  const t = useTranslations("Tasks.row");
  const tMobile = useTranslations("Tasks.mobile");
  const format = useTasksFormat();
  const router = useRouter();
  const desktop = useIsDesktop();
  const { locale } = usePreferences();
  const { today, selection, isSelected, select, toggleSelected, expandedId, setFocusedId, setExpandedId } =
    useTasksState();
  const { actions, visibleIds, openReschedule } = useList();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !draggable,
  });

  const selecting = selection.ids.length > 0;
  const selected = isSelected(task.id);
  const phase = actions.lifecycle.phase(task.id);
  const done = task.status === "done" || phase !== "none";
  const completedView = basis === "completed";

  const { offset, handlers, consumeClick } = useRowTouch({
    enabled: !desktop,
    rtl: isRtl(locale),
    swipe: !selecting,
    onComplete: () => actions.setDone(task, !done),
    onReschedule: () => openReschedule([task.id]),
    onLongPress: () => toggleSelected(task.id),
  });

  if (expandedId === task.id && desktop) {
    return (
      <li ref={setNodeRef} data-task-row={task.id} data-editing="">
        <InlineEditRow task={task} onClose={() => setExpandedId(null)} />
      </li>
    );
  }

  const onCheck = () => {
    if (selecting) toggleSelected(task.id);
    else actions.setDone(task, !done);
  };

  const onRowClick = (event: MouseEvent) => {
    if (consumeClick()) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      event.preventDefault();
      select(task.id, visibleIds, event);
      return;
    }
    // Phone selection mode: a tap anywhere on the row toggles it.
    if (!desktop && selecting) {
      event.preventDefault();
      toggleSelected(task.id);
    }
  };

  const onTitleClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.shiftKey || event.metaKey || event.ctrlKey || (!desktop && selecting)) return;
    setFocusedId(task.id);
    if (desktop) setExpandedId(task.id);
    else router.push(taskDetailHref(task.id));
  };

  const when = format.when(taskWhen(task, { day: today, basis }));
  const priority = priorityStyle(task.priority);
  const meta = metaPieces(task, today, t, format);
  const labels = task.labels ?? [];
  const checkLook = selecting ? (selected ? "selected" : "unselected") : done ? "done" : "open";
  const rtl = isRtl(locale);
  const endwardReveal = rtl ? offset < 0 : offset > 0;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition: transition }}
      data-task-row={task.id}
      data-selected={selected || undefined}
      data-done={done || undefined}
      className={cn(
        "group/row relative",
        "max-lg:overflow-hidden max-lg:rounded-row",
        isDragging && "z-10 shadow-elevated lg:rounded-field",
      )}
    >
      {offset !== 0 ? (
        <div
          aria-hidden="true"
          className={cn(
            "absolute inset-0 flex items-center gap-2 text-[13px] font-bold text-on-accent lg:hidden",
            endwardReveal ? "justify-start bg-primary ps-[18px]" : "justify-end bg-danger-text pe-[18px]",
          )}
        >
          {endwardReveal ? <Check size={16} strokeWidth={2.4} /> : <CalendarClock size={16} strokeWidth={2} />}
          {endwardReveal ? tMobile("swipeDone") : tMobile("swipeReschedule")}
        </div>
      ) : null}
      <div
        onClick={onRowClick}
        {...handlers}
        style={offset ? { transform: `translateX(${offset}px)` } : undefined}
        className={cn(
          "relative flex items-center gap-2.5 px-3 touch-pan-y",
          "max-lg:min-h-14 max-lg:rounded-row max-lg:bg-surface",
          "lg:grid lg:min-h-13 lg:gap-3 lg:rounded-field lg:py-1.5 lg:hover:bg-subtle",
          completedView ? ROW_GRID_COMPLETED : ROW_GRID,
          selected && "bg-(--row-selected) inset-ring-[1.5px] inset-ring-primary lg:hover:bg-(--row-selected)",
          offset === 0 && "transition-transform duration-200 motion-reduce:transition-none",
        )}
      >
        <span className="hidden lg:flex lg:items-center lg:justify-center">
          {draggable ? (
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              aria-label={t("drag", { title: task.title })}
              className={cn(
                "inline-flex h-7 w-4 cursor-grab touch-none items-center justify-center rounded text-icon-muted focus-visible:focus-ring focus-visible:opacity-100",
                gripVisible ? "opacity-50 group-hover/row:opacity-100" : "opacity-0 group-hover/row:opacity-60",
              )}
            >
              <GripVertical aria-hidden="true" size={16} />
            </button>
          ) : null}
        </span>

        <TaskCheck
          look={checkLook}
          onClick={(event) => {
            event.stopPropagation();
            if (event.shiftKey || event.metaKey || event.ctrlKey) select(task.id, visibleIds, event);
            else onCheck();
          }}
          aria-label={selecting ? t("select", { title: task.title }) : t(done ? "reopen" : "complete", { title: task.title })}
          aria-pressed={selecting ? selected : done}
        />

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <button
              type="button"
              id={rowTitleId(task.id)}
              onClick={onTitleClick}
              onFocus={() => setFocusedId(task.id)}
              className={cn(
                "min-w-0 max-w-full self-start rounded text-start text-[15px] font-semibold text-fg lg:text-sm focus-visible:focus-ring",
                done && "text-fg-muted line-through",
              )}
            >
              <bdi dir="auto" className="inline-block max-w-full truncate align-bottom">
                {task.title}
              </bdi>
            </button>
            <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] font-semibold text-fg-muted">
              <span aria-hidden="true" className={cn("size-[7px] shrink-0 rounded-full", taskDotClass(task))} />
              {meta.map((piece, index) => (
                <span key={piece.key} className={cn("min-w-0", piece.desktopOnly && "max-lg:hidden", piece.danger && "text-danger-text")}>
                  {index > 0 ? "· " : ""}
                  <bdi dir="auto">{piece.text}</bdi>
                </span>
              ))}
            </p>
          </div>
          {labels.length > 0 ? (
            <span className="hidden shrink-0 items-center gap-1 lg:inline-flex">
              <span className="inline-flex min-h-[22px] items-center rounded-pill border border-outline px-2 text-[11px] font-bold text-fg-secondary">
                <bdi dir="auto">{labels[0]}</bdi>
              </span>
              {labels.length > 1 ? (
                <span className="text-[11px] font-bold text-fg-muted">{t("moreLabels", { count: format.number(labels.length - 1) })}</span>
              ) : null}
            </span>
          ) : null}
          {task.recurring ? (
            <Repeat role="img" aria-label={t("repeats")} size={14} strokeWidth={1.8} className="hidden shrink-0 text-icon-muted lg:block" />
          ) : null}
        </div>

        {completedView ? null : (
          <span className="hidden items-center gap-1.5 text-xs font-bold lg:inline-flex">
            {task.priority ? (
              <>
                <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", priority.dot)} />
                <span className={priority.label}>{format.priority(task.priority)}</span>
              </>
            ) : null}
          </span>
        )}

        <span className="flex shrink-0 justify-center">
          <EnergyBars level={task.energy} />
        </span>

        <span className="hidden text-end text-xs font-semibold text-fg-muted tabular lg:block">
          {task.durationMinutes ? format.durationShort(task.durationMinutes) : ""}
        </span>

        <span
          className={cn(
            "shrink-0 text-end text-[11px] font-bold tabular lg:text-xs lg:font-semibold",
            when.overdue ? "text-danger-text" : "text-fg-secondary",
          )}
        >
          <bdi dir={/\d/.test(when.text) && when.text.includes(":") ? "ltr" : "auto"}>{when.text}</bdi>
        </span>

        <Link
          href={taskDetailHref(task.id)}
          aria-label={t("open", { title: task.title })}
          data-task-link=""
          className="hidden size-7 items-center justify-center rounded-full text-icon-muted opacity-0 hover:bg-raised hover:text-fg focus-visible:focus-ring focus-visible:opacity-100 group-hover/row:opacity-100 lg:inline-flex"
        >
          <Maximize2 aria-hidden="true" size={14} />
        </Link>
      </div>
    </li>
  );
}

export interface MetaPiece {
  key: string;
  text: string;
  desktopOnly?: boolean;
  danger?: boolean;
}

export type RowT = ReturnType<typeof useTranslations<"Tasks.row">>;

/** "Home · Bills · 1 day overdue" — area (dropped for Personal with a project), project, subtasks, goal, due, overdue. */
export function metaPieces(task: Task, today: string, t: RowT, format: ReturnType<typeof useTasksFormat>): MetaPiece[] {
  const pieces: MetaPiece[] = [];
  if (task.area) {
    if (!(task.area.id === "personal" && task.project)) pieces.push({ key: "area", text: task.area.name });
  } else if (task.scope !== "personal") {
    pieces.push({ key: "scope", text: format.scope(task.scope) });
  }
  if (task.project) pieces.push({ key: "project", text: task.project });
  if (task.subtasks && task.subtasks.total > 0) {
    pieces.push({
      key: "subtasks",
      desktopOnly: true,
      text: t("subtasks", { done: format.number(task.subtasks.done), total: format.number(task.subtasks.total) }),
    });
  }
  if (task.goalTitle) pieces.push({ key: "goal", desktopOnly: true, text: t("goal", { title: task.goalTitle }) });
  if (task.deadline && task.status === "open") {
    pieces.push({ key: "due", desktopOnly: true, text: t("due", { date: format.dateHeader(task.deadline) }) });
  }
  const late = overdueDays(task, today);
  if (late > 0) pieces.push({ key: "overdue", desktopOnly: true, text: t("overdue", { count: late, n: format.number(late) }) });
  return pieces;
}
