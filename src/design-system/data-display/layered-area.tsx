"use client";

import { useState, type KeyboardEvent } from "react";
import type { Direction } from "@/lib/locale/direction";
import { cn } from "@/lib/cn";
import { smoothPath } from "./goal-milestone-path";

/*
 * Layered Area (DataVizAdd C): "How are several related signals changing over
 * time?" Soft overlapping areas on one shared 0–10 scale, points, a dashed
 * inspection guide and a multi-value "tiny island" tooltip. The emphasised
 * metric moves to the top layer and the others fade to 12% (300ms). Time
 * runs along x: RTL mirrors coordinates (never a CSS flip). Inspect with
 * hover/click, or focus the chart and use the arrow keys (Home/End too).
 */

type Point = [number, number];

export interface LayeredAreaSeries {
  id: string;
  label: string;
  /** CSS colour, e.g. "var(--viz-mood)". */
  color: string;
  /** 0–10 values, one per point, oldest first. */
  values: readonly number[];
}

export interface LayeredAreaProps {
  series: readonly LayeredAreaSeries[];
  /** Label per point (tooltip title + sr table), oldest first. */
  pointLabels: readonly string[];
  /** Point indexes to label on the axis. */
  axisTicks?: readonly number[];
  /** Accessible name of the chart. */
  label: string;
  emphasis?: string | null;
  /** 0–10 value text (digits per preference). */
  formatValue?: (value: number) => string;
  /** Initially inspected point (default: the last). */
  defaultSelected?: number;
  direction?: Direction;
  compact?: boolean;
  className?: string;
}

export const LAYERED_W = 820;
const TOP = 14;

const f1 = (value: number) => Number(value.toFixed(1));

/** x for point i of n (mirrored for RTL) and y for a 0–10 value, in the LAYERED_W × height view box. */
export function layeredScales(n: number, { height, direction = "ltr", compact = false }: { height: number; direction?: Direction; compact?: boolean }) {
  const padStart = compact ? 26 : 40;
  const padEnd = compact ? 10 : 16;
  const base = height - 30;
  const x = (i: number) => {
    const ltr = n <= 1 ? padStart : padStart + (i / (n - 1)) * (LAYERED_W - padStart - padEnd);
    return f1(direction === "rtl" ? LAYERED_W - ltr : ltr);
  };
  const y = (value: number) => f1(base - (Math.max(0, Math.min(10, value)) / 10) * (base - TOP));
  return { x, y, base };
}

/** Line and closed area for one series. */
export function layeredPaths(values: readonly number[], options: { height: number; direction?: Direction; compact?: boolean }) {
  const { x, y, base } = layeredScales(values.length, options);
  const points: Point[] = values.map((value, i) => [x(i), y(value)]);
  if (!points.length) return { line: "", area: "", points };
  const line = smoothPath(points);
  return { line, area: `${line} L${points[points.length - 1]![0]} ${base} L${points[0]![0]} ${base} Z`, points };
}

export function LayeredArea({
  series,
  pointLabels,
  axisTicks = [],
  label,
  emphasis = null,
  formatValue = (value) => value.toFixed(1),
  defaultSelected,
  direction = "ltr",
  compact = false,
  className,
}: LayeredAreaProps) {
  const height = compact ? 200 : 260;
  const n = pointLabels.length;
  const [selected, setSelected] = useState(() => Math.max(0, Math.min(n - 1, defaultSelected ?? n - 1)));
  const sel = Math.max(0, Math.min(n - 1, selected));
  const { x, y, base } = layeredScales(n, { height, direction, compact });
  const geometry = series.map((item) => ({ item, ...layeredPaths(item.values, { height, direction, compact }) }));
  // Emphasised layer last = on top.
  const ordered = emphasis ? [...geometry.filter((g) => g.item.id !== emphasis), ...geometry.filter((g) => g.item.id === emphasis)] : geometry;
  const step = n > 1 ? Math.abs(x(1) - x(0)) : LAYERED_W;
  const forward = direction === "rtl" ? "ArrowLeft" : "ArrowRight";
  const back = direction === "rtl" ? "ArrowRight" : "ArrowLeft";

  function onKeyDown(event: KeyboardEvent) {
    const next =
      event.key === forward ? sel + 1 : event.key === back ? sel - 1 : event.key === "Home" ? 0 : event.key === "End" ? n - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setSelected(Math.max(0, Math.min(n - 1, next)));
  }

  if (!n) return null;
  const tipLeft = Math.min(84, Math.max(16, (x(sel) / LAYERED_W) * 100));

  return (
    <figure className={cn("relative m-0", className)} data-slot="layered-area">
      <div
        role="img"
        tabIndex={0}
        aria-label={`${label}. ${pointLabels[sel]}: ${series.map((item) => `${item.label} ${formatValue(item.values[sel] ?? 0)}`).join(", ")}`}
        onKeyDown={onKeyDown}
        className="rounded-tile focus-visible:focus-ring"
      >
        <svg viewBox={`0 0 ${LAYERED_W} ${height}`} aria-hidden="true" className="block h-auto w-full">
          {[0, 2, 4, 6, 8, 10].map((tick) => (
            <g key={tick}>
              <line x1={x(0)} x2={x(n - 1)} y1={y(tick)} y2={y(tick)} className="stroke-hairline" strokeDasharray={tick ? "2 4" : undefined} />
              <text
                x={direction === "rtl" ? LAYERED_W - 4 : 4}
                y={y(tick) + 4}
                textAnchor={direction === "rtl" ? "end" : "start"}
                className="fill-fg-muted text-[11px] tabular"
              >
                {formatValue(tick).replace(/[.٫]0$/, "")}
              </text>
            </g>
          ))}
          {ordered.map(({ item, line, area }) => {
            const faded = emphasis !== null && emphasis !== item.id;
            return (
              <g
                key={item.id}
                data-layer={item.id}
                style={{ opacity: faded ? 0.12 : 1 }}
                className="transition-opacity duration-300 motion-reduce:transition-none"
              >
                <path d={area} fill={item.color} fillOpacity={emphasis === item.id ? 0.32 : 0.18} className="transition-[d] duration-450 ease-in-out motion-reduce:transition-none" />
                <path d={line} fill="none" stroke={item.color} strokeWidth={2.5} strokeLinecap="round" className="transition-[d] duration-450 ease-in-out motion-reduce:transition-none" />
              </g>
            );
          })}
          <line x1={x(sel)} x2={x(sel)} y1={TOP} y2={base} className="stroke-fg-muted" strokeDasharray="3 4" data-slot="guide" />
          {series.map((item) => (
            <circle key={item.id} cx={x(sel)} cy={y(item.values[sel] ?? 0)} r={5} fill={item.color} className="stroke-surface" strokeWidth={2} />
          ))}
          {axisTicks.map((i) => (
            <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="fill-fg-muted text-[11px] font-semibold">
              {pointLabels[i]}
            </text>
          ))}
          {/* Hit columns: hover or click to inspect a point. */}
          {pointLabels.map((_, i) => (
            <rect
              key={i}
              x={x(i) - step / 2}
              y={0}
              width={step}
              height={height}
              fill="transparent"
              onMouseEnter={() => setSelected(i)}
              onClick={() => setSelected(i)}
            />
          ))}
        </svg>
      </div>
      <div
        aria-hidden="true"
        data-slot="tooltip"
        className="pointer-events-none absolute top-0 flex -translate-x-1/2 flex-col gap-0.5 rounded-tile bg-elevated px-3 py-2 text-xs shadow-tooltip"
        // Physical: x is already mirrored in the view box for RTL.
        style={{ left: `${tipLeft}%` }}
      >
        <span className="font-bold text-fg-muted">{pointLabels[sel]}</span>
        {series.map((item) => (
          <span key={item.id} className="flex items-center gap-2 font-semibold text-fg-secondary">
            <span className="size-2 rounded-full" style={{ background: item.color }} />
            {item.label}
            <b className="ms-auto tabular text-fg">{formatValue(item.values[sel] ?? 0)}</b>
          </span>
        ))}
      </div>
    </figure>
  );
}
