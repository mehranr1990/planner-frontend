"use client";

import { useDroppable } from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useEffect, useId, useMemo, useRef, type KeyboardEvent } from "react";
import { ErrorState, LoadingState } from "@/components/feedback/state-views";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { dayDropId } from "@/features/my-day/drag";
import { blockStyle } from "@/features/my-day/ui/scope-style";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { useOpenSheet } from "@/features/sheets/sheet-params";
import { cn } from "@/lib/cn";
import { useCalendar } from "./calendar-context";
import { LayerChips } from "./calendar-toolbar";
import { monthCells, moveInGrid, type MonthCell } from "./domain/month-cells";
import { monthGridOf } from "./domain/navigation";
import type { CalendarData } from "./use-calendar-data";
import { useCalendarFormat } from "./use-calendar-format";

/*
 * Month view (P04): a role="grid" of day cells with a roving tab stop.
 * Arrows move by day / week (left / right follow the direction), Home / End
 * to the week's ends, PageUp / PageDown change month. Selecting a day (click,
 * Enter) shows its agenda in the side panel; double-click or N creates.
 * Cells show at most two chips and "+N"; the primary calendar's number is
 * large, the other one small. Cells are never notched. Each day is a drop
 * target for Unscheduled tasks (date without time, see MonthDndProvider).
 */

export function MonthView({ data }: { data: CalendarData }) {
  const t = useTranslations("Calendar");
  const format = useCalendarFormat();
  const { direction } = usePreferences();
  const { anchor, today, calendar, setAnchor, shift } = useCalendar();
  const { week } = usePlannerSettings();
  const openSheet = useOpenSheet();
  const headingId = useId();
  const hintId = useId();
  const grid = useRef<HTMLDivElement | null>(null);
  const pendingFocus = useRef(false);

  const cells = useMemo(
    () => monthCells(monthGridOf(anchor, calendar, week), data.byDay, today),
    [anchor, calendar, week, data.byDay, today],
  );
  const flat = cells.flat();

  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    grid.current?.querySelector<HTMLElement>(`[data-day="${anchor}"]`)?.focus();
  }, [anchor, cells]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = flat.findIndex((cell) => cell.day === anchor);
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      pendingFocus.current = true;
      shift(event.key === "PageUp" ? -1 : 1);
      return;
    }
    if (event.key === "n" || event.key === "N") {
      event.preventDefault();
      openSheet("quick-add");
      return;
    }
    const next = moveInGrid(index, event.key, flat.length, direction === "rtl");
    if (next === null || next === index) return;
    event.preventDefault();
    pendingFocus.current = true;
    setAnchor(flat[next]!.day);
  };

  return (
    <ProductCard as="section" aria-labelledby={headingId} className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-[1.1875rem] font-semibold [&:lang(fa)]:font-bold">
          {format.date(anchor, "monthYear")}{" "}
          <span className="text-sm font-semibold text-fg-muted">{format.altRange(flat[0]!.day, flat.at(-1)!.day)}</span>
        </h2>
        <LayerChips counts={data.counts} />
      </div>
      <p id={hintId} className="sr-only">
        {t("month.hint")}
      </p>
      {data.status === "error" ? (
        <ErrorState onRetry={data.refetch} />
      ) : data.status === "pending" ? (
        <LoadingState label={t("week.loading")}>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 35 }, (_, index) => (
              <Skeleton key={index} shape="tile" className="h-20 rounded-[16px]" />
            ))}
          </div>
        </LoadingState>
      ) : (
        <div
          ref={grid}
          role="grid"
          aria-labelledby={headingId}
          aria-describedby={hintId}
          onKeyDown={onKeyDown}
          className="flex flex-col gap-1.5"
        >
          <div role="row" className="grid grid-cols-7 gap-1.5">
            {cells[0]!.map((cell) => (
              <div
                key={cell.day}
                role="columnheader"
                className={cn("px-2 text-xs font-semibold", cell.isWeekend ? "text-weekend-text" : "text-fg-muted")}
              >
                {format.date(cell.day, "weekdayShort")}
              </div>
            ))}
          </div>
          {cells.map((row) => (
            <div key={row[0]!.day} role="row" className="grid grid-cols-7 gap-1.5">
              {row.map((cell) => (
                <MonthDay
                  key={cell.day}
                  cell={cell}
                  selected={cell.day === anchor}
                  onSelect={() => setAnchor(cell.day)}
                  onCreate={() => openSheet("quick-add")}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </ProductCard>
  );
}

function MonthDay({
  cell,
  selected,
  onSelect,
  onCreate,
}: {
  cell: MonthCell;
  selected: boolean;
  onSelect(): void;
  onCreate(): void;
}) {
  const t = useTranslations("Calendar.month");
  const format = useCalendarFormat();
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(cell.day), disabled: !cell.inMonth });

  if (!cell.inMonth) return <div role="gridcell" aria-disabled className="min-h-14 rounded-[16px] bg-raised/40 sm:min-h-24" />;

  const count = t("events", { count: cell.total, formatted: format.number(cell.total) });
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      data-day={cell.day}
      tabIndex={selected ? 0 : -1}
      aria-selected={selected}
      aria-current={cell.isToday ? "date" : undefined}
      aria-label={t("cellLabel", { date: format.kicker(cell.day), count })}
      onClick={onSelect}
      onDoubleClick={onCreate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex min-h-14 min-w-0 cursor-pointer flex-col gap-1 rounded-[16px] p-1.5 inset-ring inset-ring-hairline transition-colors sm:min-h-24 sm:p-2",
        cell.isWeekend ? "bg-danger-soft/40" : "bg-surface hover:bg-raised",
        selected && "inset-ring-2 inset-ring-scope-deep",
        isOver && "bg-scope-soft",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span
          className={cn(
            "grid size-7 place-items-center rounded-full text-sm font-bold tabular",
            cell.isToday ? "bg-scope-deep text-on-accent" : cell.isWeekend && "text-weekend-text",
          )}
        >
          {format.date(cell.day, "day")}
        </span>
        <span className="text-[10px] font-semibold text-fg-muted tabular max-sm:hidden">{format.altDate(cell.day, "day")}</span>
      </div>
      <div aria-hidden className="flex min-w-0 flex-col gap-1 max-sm:hidden">
        {cell.chips.map((block) => {
          const style = blockStyle({ scope: block.scope, kind: block.kind, done: block.done });
          return (
            <span key={block.id} className={cn("flex min-h-5 items-center gap-1 truncate rounded-md px-1.5 text-[11px] font-semibold", style.root)}>
              <span className={cn("size-1.5 shrink-0 rounded-full", style.dot)} />
              <bdi dir="auto" className={cn("truncate", style.title)}>
                {block.title}
              </bdi>
            </span>
          );
        })}
        {cell.overflow > 0 ? (
          <span className="rounded-md bg-raised px-1.5 text-[11px] font-bold text-fg-secondary">
            {t("more", { count: format.number(cell.overflow) })}
          </span>
        ) : null}
      </div>
      {cell.total > 0 ? (
        <div aria-hidden className="flex gap-0.5 sm:hidden">
          {cell.chips.map((block) => (
            <span key={block.id} className={cn("size-1.5 rounded-full", blockStyle({ scope: block.scope, kind: block.kind }).dot)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
