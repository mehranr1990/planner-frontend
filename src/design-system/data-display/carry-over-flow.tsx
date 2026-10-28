"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Direction } from "@/lib/locale/direction";

/*
 * Carry-over Flow v2 (DataVizRefine 08, approved): "What happened to the
 * work I planned?" Reads top → down: one total, a short split, outcome
 * cards. Streams never cross; each stream's width is its share of the total
 * and only confirms the proportion — the number is the hero on every card.
 * The context sets the emphasis (Completed in the Weekly review, Tomorrow in
 * Daily shutdown). Columns run along x, so RTL mirrors the x coordinates
 * (never a CSS flip). Streams morph on change (260ms; swapped under reduced
 * motion).
 */

export const FLOW_W = 820;
const GAP = 3;

const f1 = (value: number) => Number(value.toFixed(1));

export interface CarryOverGeometry {
  /** One closed stream per item, in item order. */
  streams: string[];
  height: number;
}

/** Streams from a centred source bar (width = share of the total) down to each item's column. */
export function carryOverGeometry(
  counts: readonly number[],
  { direction = "ltr", compact = false }: { direction?: Direction; compact?: boolean } = {},
): CarryOverGeometry {
  const n = counts.length;
  const y0 = compact ? 26 : 34;
  const y1 = compact ? 92 : 120;
  const srcW = compact ? 150 : 300;
  const minW = compact ? 10 : 14;
  const total = counts.reduce((sum, count) => sum + Math.max(0, count), 0);
  if (!n) return { streams: [], height: y1 + 2 };
  const widths = counts.map((count) => (total ? Math.max(minW, (Math.max(0, count) / total) * srcW) : srcW / n));
  // Lay the source segments in reading order, then centre the run.
  const order = direction === "rtl" ? counts.map((_, i) => n - 1 - i) : counts.map((_, i) => i);
  const segments: [number, number][] = [];
  let x = 0;
  for (const i of order) {
    segments[i] = [x, x + widths[i]!];
    x += widths[i]! + GAP;
  }
  const shift = FLOW_W / 2 - (x - GAP) / 2;
  const column = (i: number) => {
    const ltr = ((i + 0.5) / n) * FLOW_W;
    return direction === "rtl" ? FLOW_W - ltr : ltr;
  };
  const mid = (y0 + y1) / 2;
  const streams = counts.map((_, i) => {
    const a = segments[i]![0] + shift;
    const b = segments[i]![1] + shift;
    const w = b - a;
    const d0 = column(i) - w / 2;
    const d1 = column(i) + w / 2;
    return `M${f1(a)} ${y0} C${f1(a)} ${f1(mid)} ${f1(d0)} ${f1(mid)} ${f1(d0)} ${y1} L${f1(d1)} ${y1} C${f1(d1)} ${f1(mid)} ${f1(b)} ${f1(mid)} ${f1(b)} ${y0} Z`;
  });
  return { streams, height: y1 + 2 };
}

export interface CarryOverItem {
  id: string;
  count: number;
  label: string;
  /** CSS colour of the stream and the icon disc, e.g. "var(--warning)". */
  color: string;
  icon: ReactNode;
  /** One small action on the card ("Reschedule", "Sort later"). */
  cta?: ReactNode;
}

export interface CarryOverFlowProps {
  items: readonly CarryOverItem[];
  /** The source's caption ("planned this week"); the total is the sum of the items. */
  totalLabel: string;
  /** Accessible name of the outcome group. */
  label: string;
  /** The context's emphasised item. */
  emphasis?: string;
  formatNumber?: (value: number) => string;
  formatPercent?: (ratio: number) => string;
  direction?: Direction;
  compact?: boolean;
  className?: string;
}

export function CarryOverFlow({
  items,
  totalLabel,
  label,
  emphasis,
  formatNumber = String,
  formatPercent = (ratio) => `${Math.round(ratio * 100)}%`,
  direction = "ltr",
  compact = false,
  className,
}: CarryOverFlowProps) {
  const reduce = useReducedMotion();
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const { streams, height } = carryOverGeometry(
    items.map((item) => item.count),
    { direction, compact },
  );
  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <div className="relative max-sm:hidden">
        <svg viewBox={`0 0 ${FLOW_W} ${height}`} className="block w-full" aria-hidden>
          {streams.map((d, i) => (
            <motion.path
              key={items[i]!.id}
              animate={{ d }}
              initial={false}
              transition={{ duration: reduce ? 0 : 0.26, ease: "easeOut" }}
              fill={items[i]!.color}
              fillOpacity={items[i]!.id === emphasis ? 0.55 : 0.22}
            />
          ))}
        </svg>
        <p className="absolute inset-x-0 top-0 mx-auto flex w-fit items-center gap-2 rounded-2xl bg-surface px-4 py-1.5 shadow-sm inset-ring-[1.5px] inset-ring-line">
          <span className="text-xl font-semibold tabular text-fg">{formatNumber(total)}</span>
          <span className="text-xs font-semibold text-fg-muted">{totalLabel}</span>
        </p>
      </div>
      <ul aria-label={label} className={cn("grid gap-2.5", items.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
        {items.map((item) => {
          const on = item.id === emphasis;
          return (
            <li
              key={item.id}
              data-emphasis={on || undefined}
              className={cn(
                "flex min-h-32 min-w-0 flex-col gap-1.5 rounded-[22px] bg-subtle p-3.5",
                on && "bg-surface inset-ring-[1.5px] inset-ring-scope-deep",
              )}
            >
              <span className="flex items-center justify-between">
                <span aria-hidden className="grid size-7.5 place-items-center rounded-full text-white" style={{ background: item.color }}>
                  {item.icon}
                </span>
                <span className="text-xs font-semibold text-fg-muted tabular">{formatPercent(total ? item.count / total : 0)}</span>
              </span>
              <span className="mt-1 text-[34px] leading-none font-semibold text-fg tabular">{formatNumber(item.count)}</span>
              <span className="text-[13px] font-bold text-fg">{item.label}</span>
              {item.cta ? <span className="mt-auto pt-1">{item.cta}</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
