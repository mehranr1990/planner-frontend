"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import type { Direction } from "@/lib/locale/direction";

/*
 * Budget Flow (DataVizAdd · B, approved and frozen): "where is the money
 * going?" One source capsule (income) feeds soft ribbons into a scannable
 * category list with share and amount; ribbon width at the source = amount.
 * The unspent part flows to a dashed "Remaining" row so income and spending
 * reconcile. Spent is neutral, never red.
 *
 * The rows are real buttons: select one to highlight its ribbon (the others
 * dim to 30%, as on hover).
 *
 * RTL (DataViz rule A): cause → effect follows reading, so the source sits
 * on the right and ribbons run right → left. The SVG mirrors every x in its
 * geometry; the capsule and the list are logical layout — never CSS-flipped.
 * Motion: ribbons reveal from the source (400ms); reduced motion: static.
 */

export interface FlowRow {
  id: string;
  label: string;
  /** Any CSS colour, e.g. "var(--viz-food)". */
  color: string;
  value: number;
}

export interface BudgetFlowProps {
  income: number;
  rows: readonly FlowRow[];
  /** Accessible name: a one-sentence summary. */
  label: string;
  remainingLabel: string;
  formatValue(value: number): string;
  /** 0.38 → "38%". */
  formatShare(ratio: number): string;
  /** The Remaining row's share line: 0.35 → "35% of income". */
  remainingShare(ratio: number): string;
  direction?: Direction;
  compact?: boolean;
  className?: string;
}

/** Ribbon box (stretched horizontally to fit; y is in px). */
export const FLOW_W = 400;
const PAD = 18;
const ROW_GAP = 3;

export interface FlowRibbon {
  id: string;
  d: string;
  /** Source band [a, b] and the target row centre. */
  a: number;
  b: number;
  ty: number;
  rest: boolean;
}

const f1 = (value: number) => Number(value.toFixed(1));

/**
 * Ribbons from the source (start edge) to each row (end edge), the board's
 * `flow()`; with `rest > 0` a last "rest" ribbon carries the remainder.
 */
export function flowGeometry(
  income: number,
  values: readonly number[],
  { height, direction = "ltr", compact = false }: { height: number; direction?: Direction; compact?: boolean },
): FlowRibbon[] {
  const spent = values.reduce((a, b) => a + b, 0);
  const rest = Math.max(0, income - spent);
  const all = rest > 0 ? [...values, rest] : [...values];
  const whole = Math.max(income, spent);
  if (!all.length || whole <= 0) return [];
  const mirror = (x: number) => (direction === "rtl" ? FLOW_W - x : x);
  const top = PAD;
  const bottom = height - PAD;
  const unit = (bottom - top - ROW_GAP * all.length) / whole;
  const gap = (bottom - top) / all.length;
  const x0 = mirror(0);
  const x1 = mirror(FLOW_W);
  const mx = (x0 + x1) / 2;
  let y = top;
  return all.map((value, i) => {
    const h = value * unit;
    const a = y;
    const b = y + h;
    y += h + ROW_GAP;
    const ty = top + gap * (i + 0.5);
    const th = Math.max(6, Math.min(compact ? 14 : 22, h * 0.45));
    const d = `M${f1(x0)} ${f1(a)} C${f1(mx)} ${f1(a)} ${f1(mx)} ${f1(ty - th / 2)} ${f1(x1)} ${f1(ty - th / 2)} L${f1(x1)} ${f1(ty + th / 2)} C${f1(mx)} ${f1(ty + th / 2)} ${f1(mx)} ${f1(b)} ${f1(x0)} ${f1(b)} Z`;
    return { id: i < values.length ? String(i) : "rest", d, a, b, ty, rest: i >= values.length };
  });
}

export function BudgetFlow({
  income,
  rows,
  label,
  remainingLabel,
  formatValue,
  formatShare,
  remainingShare,
  direction = "ltr",
  compact = false,
  className,
}: BudgetFlowProps) {
  const reduce = useReducedMotion();
  const height = compact ? 300 : 420;
  const ribbons = flowGeometry(
    income,
    rows.map((row) => row.value),
    { height, direction, compact },
  );
  const [selected, setSelected] = useState<string | null>(rows[0]?.id ?? null);
  const [hovered, setHovered] = useState<string | null>(null);
  const focus = hovered ?? selected;
  const spent = rows.reduce((sum, row) => sum + row.value, 0);
  const rest = Math.max(0, income - spent);
  const sourceEnd = ribbons.length ? ribbons[ribbons.length - 1]!.b : PAD;
  const idOf = (ribbon: FlowRibbon) => (ribbon.rest ? "rest" : rows[Number(ribbon.id)]!.id);
  const dim = (id: string) => (focus && focus !== id ? 0.3 : 1);

  return (
    <div role="group" aria-label={label} data-slot="budget-flow" className={cn("flex min-w-0 items-stretch", className)} style={{ height }}>
      {/* Source capsule: income. */}
      <div aria-hidden="true" className="relative shrink-0" style={{ width: compact ? 14 : 22 }}>
        <span
          className="absolute inset-x-0 rounded-pill bg-linear-to-b from-scope-dot to-scope-deep"
          style={{ top: PAD, height: Math.max(0, sourceEnd - PAD) }}
        />
      </div>
      <svg aria-hidden="true" viewBox={`0 0 ${FLOW_W} ${height}`} preserveAspectRatio="none" className="block h-full min-w-10 flex-1">
        <motion.g
          initial={reduce ? false : { scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          style={{ transformBox: "fill-box", transformOrigin: direction === "rtl" ? "right" : "left" }}
        >
          {ribbons.map((ribbon) => {
            const id = idOf(ribbon);
            const color = ribbon.rest ? "var(--color-scope-dot)" : rows[Number(ribbon.id)]!.color;
            return (
              <path
                key={id}
                d={ribbon.d}
                data-ribbon={id}
                fill={color}
                fillOpacity={(ribbon.rest ? 0.08 : focus === id ? 0.6 : 0.28) * dim(id)}
                stroke={ribbon.rest ? color : "none"}
                strokeDasharray={ribbon.rest ? "5 5" : undefined}
                strokeOpacity={dim(id)}
                vectorEffect="non-scaling-stroke"
                className="transition-[fill-opacity,stroke-opacity] duration-120"
              />
            );
          })}
        </motion.g>
      </svg>
      <ul className={cn("flex shrink-0 flex-col", compact ? "w-[58%]" : "w-1/2")} style={{ paddingBlock: PAD }}>
        {rows.map((row) => (
          <li key={row.id} className="flex min-h-0 flex-1 items-center">
            <button
              type="button"
              aria-pressed={selected === row.id}
              onClick={() => setSelected((current) => (current === row.id ? null : row.id))}
              onMouseEnter={() => setHovered(row.id)}
              onMouseLeave={() => setHovered(null)}
              style={{ opacity: dim(row.id) === 1 ? 1 : 0.55 }}
              className={cn(
                "flex w-full min-w-0 items-center gap-2 rounded-pill px-2.5 py-1.5 text-start text-sm transition-[opacity,box-shadow] duration-120 focus-visible:focus-ring",
                selected === row.id ? "bg-surface font-bold text-fg inset-ring-[1.5px] inset-ring-scope-dot" : "font-semibold text-fg-secondary hover:text-fg",
              )}
            >
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: row.color }} />
              <span className="min-w-0 flex-1 truncate">{row.label}</span>
              <span className="tabular rounded-pill bg-subtle px-2 py-0.5 text-[0.6875rem] text-fg-muted">{formatShare(spent ? row.value / spent : 0)}</span>
              <span className="tabular w-16 shrink-0 text-end font-bold text-fg">{formatValue(row.value)}</span>
            </button>
          </li>
        ))}
        {rest > 0 ? (
          <li className="flex min-h-0 flex-1 items-center" data-flow-rest>
            <div className="flex w-full min-w-0 items-center gap-2 px-2.5 py-1.5 text-sm font-semibold text-fg-secondary">
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full border border-dashed border-scope-deep" />
              <span className="min-w-0 flex-1 truncate">{remainingLabel}</span>
              <span className="tabular rounded-pill bg-subtle px-2 py-0.5 text-[0.6875rem] text-fg-muted">{remainingShare(income ? rest / income : 0)}</span>
              <span className="tabular w-16 shrink-0 text-end font-bold text-scope-deep">{formatValue(rest)}</span>
            </div>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
