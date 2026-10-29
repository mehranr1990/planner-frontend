"use client";

import { Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { useLongPress } from "@/components/ui/use-long-press";
import { cn } from "@/lib/cn";
import type { Direction } from "@/lib/locale/direction";

/*
 * Habit Field (DataVizPersonal 06, frozen): all habits × days. Rows are
 * habits (icon + name, a button that selects the habit), columns are days
 * oldest → newest, streak · rate at the row end. Cells: done (deep, check),
 * not done (soft grey), skipped (hatched), rest (outline + dash), today
 * (outlined), upcoming (dashed), and "hidden" before a habit started
 * (blank, not grey).
 *
 * Tap a past / today cell to toggle done; long-press / right-click (or
 * Shift+F10) → skip. One cell is in the tab order; arrows move through the
 * field (left / right follow time, mirrored in RTL), Home / End jump along
 * the row.
 *
 * RTL (DataViz rule A): the grid lays out in the field's own `dir`, so
 * Saturday sits on the right — layout direction, never a CSS flip.
 * Motion: completed cells settle 0.9 → 1 (250ms); reduced motion swaps.
 */

export type HabitFieldCellState = "done" | "missed" | "open" | "skipped" | "rest" | "future" | "hidden";

export interface HabitFieldColumn {
  key: string;
  /** Short weekday ("Sa"); empty for dense periods. */
  weekday: string;
  /** Day of month (or a month name on the first day in the year view). */
  date: string;
  weekend: boolean;
  today: boolean;
}

export interface HabitFieldCell {
  state: HabitFieldCellState;
  /** "Read, 21 Mehr: done". */
  ariaLabel: string;
  /** Past or today after the start, and not a scheduled rest day. */
  interactive: boolean;
}

export interface HabitFieldRow {
  id: string;
  title: string;
  icon?: ReactNode;
  /** Aligned with the columns. */
  cells: readonly HabitFieldCell[];
  /** "7d". */
  streakText: string;
  /** "90%". */
  rateText: string;
}

export type HabitFieldSize = "md" | "sm" | "xs";

export interface HabitFieldProps {
  label: string;
  columns: readonly HabitFieldColumn[];
  rows: readonly HabitFieldRow[];
  /** "streak · rate". Omit to drop the summary column (the phone form, PM03). */
  summaryHeader?: string;
  /** The selected habit: its name button is pressed. */
  selectedId?: string | null;
  onSelectRow?: (id: string) => void;
  onToggle?: (rowId: string, columnKey: string) => void;
  onSkip?: (rowId: string, columnKey: string) => void;
  /** md 36px (14 days), sm 24px (month), xs 10px read-only (year). */
  size?: HabitFieldSize;
  direction?: Direction;
  legend?: readonly { state: HabitFieldCellState | "today"; label: string }[];
  className?: string;
}

const CELL_SIZE: Record<HabitFieldSize, string> = { md: "2.25rem", sm: "1.5rem", xs: "0.625rem" };
const GAP: Record<HabitFieldSize, string> = { md: "0.375rem", sm: "0.25rem", xs: "0.125rem" };

function cellLook(state: HabitFieldCellState | "today", size: HabitFieldSize) {
  return cn(
    size === "md" ? "rounded-xl" : size === "sm" ? "rounded-lg" : "rounded-[3px]",
    state === "done" && "bg-scope-deep text-on-accent",
    (state === "missed" || state === "open" || state === "today") && "bg-subtle",
    state === "skipped" && "bg-[repeating-linear-gradient(135deg,var(--color-line)_0_3px,var(--color-subtle)_3px_7px)]",
    state === "rest" && "inset-ring-[1.5px] inset-ring-line",
    state === "future" && "border-[1.5px] border-dashed border-outline",
    state === "hidden" && "invisible",
  );
}

function Cell({
  cell,
  today,
  size,
  tabbable,
  register,
  onToggle,
  onSkip,
  onKeyDown,
  onFocus,
}: {
  cell: HabitFieldCell;
  today: boolean;
  size: HabitFieldSize;
  tabbable: boolean;
  register: (element: HTMLElement | null) => void;
  onToggle?: () => void;
  onSkip?: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onFocus: () => void;
}) {
  const reduce = useReducedMotion();
  const interactive = cell.interactive && size !== "xs";
  const press = useLongPress(interactive ? onSkip : undefined);
  const ring = today && "ring-2 ring-scope-deep ring-offset-2 ring-offset-surface";
  const body =
    cell.state === "done" && size !== "xs" ? (
      <motion.span
        key="done"
        initial={reduce ? false : { scale: 0.9, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="grid place-items-center"
      >
        <Icon icon={Check} size={size === "md" ? 14 : 11} />
      </motion.span>
    ) : cell.state === "rest" && size !== "xs" ? (
      <span className="h-0.5 w-3 rounded-full bg-fg-muted" />
    ) : null;

  const style = { width: CELL_SIZE[size], height: CELL_SIZE[size] };
  if (size === "xs" || cell.state === "hidden") {
    return <span aria-hidden={cell.state === "hidden" || undefined} title={cell.state === "hidden" ? undefined : cell.ariaLabel} data-state={cell.state} style={style} className={cn("block", cellLook(cell.state, size), ring)} />;
  }
  return (
    <button
      type="button"
      ref={register}
      data-state={cell.state}
      aria-label={cell.ariaLabel}
      aria-pressed={cell.state === "done"}
      aria-disabled={!interactive || undefined}
      aria-keyshortcuts={interactive ? "Shift+F10" : undefined}
      tabIndex={tabbable ? 0 : -1}
      style={style}
      {...press.handlers}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onClick={() => {
        if (press.consumeClick() || !interactive) return;
        onToggle?.();
      }}
      className={cn(
        "grid place-items-center transition-colors duration-(--motion-fast) focus-visible:focus-ring",
        cellLook(cell.state, size),
        interactive ? "cursor-pointer hover:brightness-95" : "cursor-default",
        ring,
      )}
    >
      {body}
    </button>
  );
}

export function HabitField({
  label,
  columns,
  rows,
  summaryHeader,
  selectedId,
  onSelectRow,
  onToggle,
  onSkip,
  size = "md",
  direction = "ltr",
  legend,
  className,
}: HabitFieldProps) {
  const todayIndex = Math.max(
    0,
    columns.findIndex((column) => column.today),
  );
  const [active, setActive] = useState<{ row: number; col: number } | null>(null);
  const focus = active ?? { row: 0, col: todayIndex };
  const cells = useRef(new Map<string, HTMLElement>());

  const move = (event: KeyboardEvent, row: number, col: number) => {
    const forward = direction === "rtl" ? "ArrowLeft" : "ArrowRight";
    const back = direction === "rtl" ? "ArrowRight" : "ArrowLeft";
    let next = { row, col };
    if (event.key === forward) next = { row, col: Math.min(columns.length - 1, col + 1) };
    else if (event.key === back) next = { row, col: Math.max(0, col - 1) };
    else if (event.key === "ArrowDown") next = { row: Math.min(rows.length - 1, row + 1), col };
    else if (event.key === "ArrowUp") next = { row: Math.max(0, row - 1), col };
    else if (event.key === "Home") next = { row, col: 0 };
    else if (event.key === "End") next = { row, col: columns.length - 1 };
    else return;
    event.preventDefault();
    setActive(next);
    cells.current.get(`${next.row}:${next.col}`)?.focus();
  };

  const template = `minmax(7.5rem, 11rem) repeat(${columns.length}, ${CELL_SIZE[size]})${summaryHeader ? " minmax(3rem, auto)" : ""}`;

  return (
    <div data-slot="habit-field" className={cn("flex min-w-0 flex-col gap-4", className)}>
      <div className="-mx-1 overflow-x-auto px-1 py-1">
        <div role="group" aria-label={label} dir={direction} className="grid w-max max-w-full items-center" style={{ gridTemplateColumns: template, columnGap: GAP[size], rowGap: size === "xs" ? "0.5rem" : GAP[size] }}>
          <span aria-hidden="true" />
          {columns.map((column) => (
            <span
              key={column.key}
              aria-hidden="true"
              data-today={column.today || undefined}
              className={cn(
                "flex flex-col items-center whitespace-nowrap text-[0.625rem] font-bold leading-tight",
                column.weekend ? "text-weekend-text" : "text-fg-muted",
                size === "xs" && "items-start overflow-visible",
              )}
            >
              {column.weekday ? <span>{column.weekday}</span> : null}
              <span className={cn("tabular text-xs", column.today ? "text-scope-deep" : column.weekend ? "text-weekend-text" : "text-fg")}>{column.date}</span>
            </span>
          ))}
          {summaryHeader ? <span className="text-end text-[0.625rem] font-bold text-fg-muted">{summaryHeader}</span> : null}

          {rows.map((row, rowIndex) => {
            const selected = row.id === selectedId;
            return (
              <div key={row.id} role="presentation" className="contents" data-row={row.id}>
                <button
                  type="button"
                  aria-pressed={onSelectRow ? selected : undefined}
                  onClick={() => onSelectRow?.(row.id)}
                  className={cn(
                    "flex min-h-9 min-w-0 items-center gap-2.5 rounded-pill pe-2 text-start text-[0.8125rem] font-bold focus-visible:focus-ring",
                    selected ? "text-scope-deep" : "text-fg hover:text-scope-deep",
                  )}
                >
                  {row.icon ? (
                    <span aria-hidden="true" className={cn("grid size-7.5 shrink-0 place-items-center rounded-full", selected ? "bg-scope-deep text-on-accent" : "bg-scope-soft text-scope-deep")}>
                      {row.icon}
                    </span>
                  ) : null}
                  <span className="truncate">
                    <bdi dir="auto">{row.title}</bdi>
                  </span>
                </button>
                {row.cells.map((cell, colIndex) => (
                  <Cell
                    key={columns[colIndex]?.key ?? colIndex}
                    cell={cell}
                    today={columns[colIndex]?.today ?? false}
                    size={size}
                    tabbable={focus.row === rowIndex && focus.col === colIndex}
                    register={(element) => {
                      const key = `${rowIndex}:${colIndex}`;
                      if (element) cells.current.set(key, element);
                      else cells.current.delete(key);
                    }}
                    onToggle={onToggle ? () => onToggle(row.id, columns[colIndex]!.key) : undefined}
                    onSkip={onSkip ? () => onSkip(row.id, columns[colIndex]!.key) : undefined}
                    onKeyDown={(event) => move(event, rowIndex, colIndex)}
                    onFocus={() => setActive({ row: rowIndex, col: colIndex })}
                  />
                ))}
                {summaryHeader ? (
                  <span className="flex flex-col items-end leading-tight">
                    <span className="tabular text-sm font-bold">{row.streakText}</span>
                    <span className="tabular text-[0.6875rem] font-bold text-fg-muted">{row.rateText}</span>
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      {legend?.length ? (
        <ul className="flex flex-wrap gap-x-3.5 gap-y-2 border-t border-line pt-3" aria-hidden="true">
          {legend.map((item) => (
            <li key={item.state} className="inline-flex items-center gap-2 text-xs font-semibold text-fg-secondary">
              <span
                className={cn("size-5", cellLook(item.state, "md"), "rounded-[7px]", item.state === "today" && "ring-2 ring-scope-deep ring-offset-2 ring-offset-surface")}
              />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
