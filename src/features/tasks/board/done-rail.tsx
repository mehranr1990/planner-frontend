"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { Check, ChevronsLeftRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { DONE_COLUMN_ID } from "../domain/board";
import { useTasksFormat } from "../ui/use-tasks-format";
import { BoardCard } from "./board-card";
import { columnDropId, useBoardContext } from "./board-context";

/*
 * The Done rail: a narrow vertical target (drop = complete, with the undo
 * toast) that a click, or "Show done", expands into a column of today's
 * completed cards.
 */

export function DoneRail() {
  const t = useTranslations("Tasks.board");
  const format = useTasksFormat();
  const { model, activeId, doneExpanded, setDoneExpanded } = useBoardContext();
  const { setNodeRef, isOver } = useDroppable({ id: columnDropId(DONE_COLUMN_ID), data: { columnId: DONE_COLUMN_ID } });
  const { done } = model;
  const label = t("doneRail", { n: format.number(done.count) });
  const hot = isOver && activeId !== null;

  if (!doneExpanded) {
    return (
      <button
        ref={setNodeRef}
        type="button"
        aria-expanded={false}
        aria-label={`${label}. ${t("expandDone")}`}
        onClick={() => setDoneExpanded(true)}
        data-board-column={DONE_COLUMN_ID}
        className={cn(
          "flex w-[86vw] max-w-[340px] shrink-0 snap-center flex-col items-center gap-3 self-start rounded-[24px] bg-subtle px-2.5 py-5 text-center transition-[background-color,box-shadow] duration-220 motion-reduce:transition-none focus-visible:focus-ring sm:w-[300px] lg:w-[108px]",
          hot && "bg-personal-soft ring-2 ring-personal-deep",
        )}
      >
        <span className="text-sm font-bold text-fg lg:[writing-mode:vertical-rl] lg:rotate-180 lg:rtl:rotate-0">{label}</span>
        <span aria-hidden="true" className="inline-flex size-7 items-center justify-center rounded-full bg-primary text-on-accent">
          <Check size={15} strokeWidth={2.6} />
        </span>
        <span className="text-[11px] font-semibold text-fg-muted">{t("dropToComplete")}</span>
      </button>
    );
  }

  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      data-board-column={DONE_COLUMN_ID}
      className={cn(
        "flex w-[86vw] max-w-[340px] shrink-0 snap-center flex-col gap-2.5 self-start rounded-[24px] bg-subtle p-2.5 sm:w-[300px] lg:w-[240px]",
        hot && "ring-2 ring-personal-deep",
      )}
    >
      <header className="flex items-center justify-between gap-2 px-1.5 pt-1.5">
        <h3 className="text-[15px] font-bold text-fg">{label}</h3>
        <button
          type="button"
          aria-expanded
          aria-label={t("collapseDone")}
          onClick={() => setDoneExpanded(false)}
          className="inline-flex size-8 items-center justify-center rounded-full text-icon-muted hover:bg-surface focus-visible:focus-ring"
        >
          <ChevronsLeftRight aria-hidden="true" size={15} />
        </button>
      </header>
      <SortableContext id={DONE_COLUMN_ID} items={done.tasks.map((task) => task.id)}>
        <ul className="flex flex-col gap-2">
          {done.tasks.map((task, index) => (
            <BoardCard key={task.id} task={task} columnId={DONE_COLUMN_ID} index={index} draggable={false} />
          ))}
        </ul>
      </SortableContext>
      {done.count === 0 ? <p className="px-1.5 pb-2 text-xs font-semibold text-fg-muted">{t("doneEmpty")}</p> : null}
      <p className="px-1.5 pb-1 text-[11px] font-semibold text-fg-muted">{t("dropToComplete")}</p>
    </section>
  );
}
