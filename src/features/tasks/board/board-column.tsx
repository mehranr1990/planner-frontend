"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "@/components/ui/toast";
import { useCreateTask } from "@/data/queries";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { cn } from "@/lib/cn";
import { columnDefaults, overloadMinutes, type BoardColumn as Column } from "../domain/board";
import { quickParse } from "../domain/quick-parse";
import { useList } from "../list/list-context";
import { useTasksState } from "../tasks-context";
import { useTasksFormat } from "../ui/use-tasks-format";
import { BoardCard } from "./board-card";
import { columnDropId, useBoardContext } from "./board-context";

/*
 * One board column: header (title · sub-label · count · duration), the
 * capacity bar on Today / Tomorrow, the pinned rose Overdue strip, the
 * cards with the hatched mint ghost where a drag would land, its states
 * (empty, "2 of 11 match") and "＋ Add".
 */

export function BoardColumnView({ column }: { column: Column }) {
  const t = useTranslations("Tasks.board");
  const format = useTasksFormat();
  const { activeId, target, totals } = useBoardContext();
  const { openReschedule, data } = useList();
  const { setNodeRef, isOver } = useDroppable({ id: columnDropId(column.id), data: { columnId: column.id } });
  const headingId = useId();

  const title = t(`columns.${column.id}`);
  const ids = column.tasks.map((task) => task.id);
  const activeIndex = activeId ? ids.indexOf(activeId) : -1;
  let ghostAt: number | null = null;
  if (activeId && target?.columnId === column.id && !(activeIndex >= 0 && target.index === activeIndex)) {
    ghostAt = activeIndex >= 0 && target.index >= activeIndex ? target.index + 1 : target.index;
  }
  const over = overloadMinutes(column);
  const total = totals?.get(column.id);
  const sub: string[] = [];
  if (column.id === "tomorrow" && column.day) sub.push(format.dateHeader(column.day));
  if (column.id === "week" && column.untilDay) sub.push(t("until", { date: format.dateHeader(column.untilDay) }));
  if (column.id === "later") sub.push(t("noDate"));
  sub.push(format.number(column.count));
  if (column.totalMinutes && column.id !== "later" && column.id !== "week") sub.push(format.durationShort(column.totalMinutes));

  const ghost = <li key="ghost" aria-hidden="true" className="min-h-[76px] bg-[repeating-linear-gradient(135deg,var(--personal-soft)_0_8px,transparent_8px_16px)] rounded-[20px] border-[1.5px] border-personal-deep" />;

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      data-board-column={column.id}
      className={cn(
        "flex w-[86vw] max-w-[340px] shrink-0 snap-center flex-col gap-2.5 self-start rounded-[24px] bg-subtle p-2.5 transition-shadow duration-200 motion-reduce:transition-none sm:w-[300px] lg:w-auto lg:min-w-[220px] lg:max-w-none lg:flex-1",
        isOver && activeId && "ring-2 ring-personal-deep",
      )}
    >
      <header className="flex flex-col gap-2 px-1.5 pt-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id={headingId} className="text-[15px] font-bold text-fg">
            {title}
            <span className="sr-only">, {t("cards", { count: column.count, n: format.number(column.count) })}</span>
          </h3>
          <span aria-hidden="true" className="truncate text-xs font-semibold text-fg-muted tabular">
            {sub.join(" · ")}
          </span>
        </div>
        {column.capacityMinutes ? <CapacityBar column={column} over={over} /> : null}
        {total !== undefined ? (
          <p className="text-xs font-semibold text-fg-muted">
            {t("match", { shown: format.number(column.count), total: format.number(total) })} · {t("filtersOn")}
          </p>
        ) : null}
      </header>

      {column.overdue.length ? (
        <div className="flex items-center justify-between gap-2 rounded-field bg-danger-soft px-3 py-2 text-xs font-bold text-danger-text">
          <span>{t("overdue", { n: format.number(column.overdue.length) })}</span>
          <button
            type="button"
            onClick={(event) => openReschedule(column.overdue.map((task) => task.id), event.currentTarget)}
            className="rounded underline underline-offset-2 focus-visible:focus-ring"
          >
            {t("reschedule")}
          </button>
        </div>
      ) : null}

      <SortableContext id={column.id} items={[...column.overdue.map((task) => task.id), ...ids]} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-2" aria-labelledby={headingId}>
          {column.overdue.map((task) => (
            <BoardCard key={task.id} task={task} columnId={column.id} index={0} overdue lifted={task.id === activeId} />
          ))}
          {column.tasks.map((task, index) => [
            ghostAt === index ? ghost : null,
            <BoardCard key={task.id} task={task} columnId={column.id} index={index} lifted={task.id === activeId} />,
          ])}
          {ghostAt !== null && ghostAt >= column.tasks.length ? ghost : null}
        </ul>
      </SortableContext>

      {column.count === 0 && ghostAt === null && !data.isPending ? (
        <div className="flex flex-col gap-1 rounded-[20px] border-[1.5px] border-dashed border-border px-4 py-5 text-center">
          <p className="text-sm font-bold text-fg-secondary">{t(column.id === "week" ? "emptyWeek" : "empty")}</p>
          <p className="text-xs font-semibold text-fg-muted">{t(column.id === "week" ? "emptyWeekHint" : "emptyHint")}</p>
        </div>
      ) : null}

      <ColumnAdd column={column} title={title} />
    </section>
  );
}

function CapacityBar({ column, over }: { column: Column; over: number }) {
  const t = useTranslations("Tasks.board");
  const format = useTasksFormat();
  const capacity = column.capacityMinutes ?? 0;
  const used = format.durationShort(column.totalMinutes);
  const cap = format.durationShort(capacity);
  const ratio = capacity ? Math.min(1, column.totalMinutes / capacity) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="meter"
        aria-label={t("capacityLabel", { used, capacity: cap })}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={Math.min(column.totalMinutes, capacity)}
        className="h-1.5 overflow-hidden rounded-pill bg-border"
      >
        <div
          className={cn("h-full rounded-pill transition-[width] duration-240 motion-reduce:transition-none", over ? "bg-danger" : "bg-primary")}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <p className={cn("text-xs font-semibold tabular", over ? "text-danger-text" : "text-fg-muted")}>
        {over
          ? t("overloaded", { used, capacity: cap, over: format.durationShort(over) })
          : t("free", { used, capacity: cap })}
      </p>
    </div>
  );
}

function ColumnAdd({ column, title }: { column: Column; title: string }) {
  const t = useTranslations("Tasks.board");
  const tUndo = useTranslations("Tasks.undo");
  const { today } = useTasksState();
  const { planning, workHours } = usePlannerSettings();
  const create = useCreateTask();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const defaults = columnDefaults(column, today, workHours);
  if (!defaults) return null;

  const submit = () => {
    const parsed = quickParse(value, today);
    if (!parsed.title.trim()) return;
    const date = parsed.date ?? (parsed.time ? today : defaults.date);
    create.mutate(
      {
        title: parsed.title.trim(),
        date,
        time: date ? (parsed.time ?? defaults.time) : null,
        priority: parsed.priority ?? null,
        durationMinutes: parsed.durationMinutes ?? planning.defaultDurationMinutes,
        energy: planning.defaultEnergy,
      },
      {
        onSuccess: () => toast({ tone: "success", title: tUndo("created") }),
        onError: () => toast({ tone: "danger", title: tUndo("failed") }),
      },
    );
    setValue("");
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("addLabel", { column: title })}
        className="flex min-h-11 items-center gap-2 rounded-field border border-border px-3.5 text-[13px] font-semibold text-fg-secondary hover:bg-surface focus-visible:focus-ring"
      >
        <Plus aria-hidden="true" size={15} />
        {t("add")}
      </button>
    );
  }
  return (
    <input
      autoFocus
      dir="auto"
      value={value}
      aria-label={t("addLabel", { column: title })}
      placeholder={t("addPlaceholder")}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (!value.trim()) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          submit();
        } else if (event.key === "Escape") {
          setValue("");
          setOpen(false);
        }
      }}
      className="min-h-11 rounded-field bg-surface px-3.5 text-sm text-fg outline-none placeholder:text-fg-muted focus-visible:focus-ring"
    />
  );
}
