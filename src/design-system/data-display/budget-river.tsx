"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import type { Direction } from "@/lib/locale/direction";
import { smoothPath } from "./goal-milestone-path";

/*
 * Budget River (DataVizPersonal · 01, approved and frozen): "where has my
 * money flowed during this period?" Categories are stacked, centred streams
 * along time; the stream width is the day's spending. Points after
 * `todayIndex` are the forecast, faded behind a dashed "today" line.
 *
 * Interaction: hover / tap / arrow keys select a point → tooltip island with
 * the total and the top category. A legend chip isolates a stream (others
 * dim to 30%). Esc clears the isolation.
 *
 * RTL (DataViz rule A): time flows right → left, labels sit on the left end.
 * Every x is mirrored in the geometry — the chart is never CSS-flipped.
 * Motion: streams reveal from the start of time once (700ms); a period
 * change morphs the paths in place (450ms). Reduced motion: static.
 */

export interface RiverSeries {
  id: string;
  label: string;
  /** Any CSS colour, e.g. "var(--viz-food)". */
  color: string;
  /** One value per point (same length as `points`). */
  values: readonly number[];
}

export interface BudgetRiverProps {
  series: readonly RiverSeries[];
  /** One label per point, shown in the tooltip ("Tue, 21 Mehr"). */
  points: readonly string[];
  /** Last actual point; later ones are the forecast. Default: the last point. */
  todayIndex?: number;
  /** Accessible name: a one-sentence summary of the chart. */
  label: string;
  formatValue(value: number): string;
  /** Tooltip line for the top category: (label, formatted value) → "Top: Food · 330K". */
  topText(label: string, value: string): string;
  forecastLabel?: string;
  /** Accessible name of the legend (isolate a stream). */
  legendLabel?: string;
  direction?: Direction;
  /** Phone form: no side labels (the chip legend names the streams). */
  compact?: boolean;
  /** Moving-average half window applied before drawing (the board smooths ±2 days). */
  smoothing?: number;
  className?: string;
}

export const RIVER_W = 820;
export const RIVER_H = 240;
const GAP = 2.5;

type Point = readonly [number, number];

export interface RiverStream {
  id: string;
  /** Closed band path. */
  band: string;
  /** Top edge line. */
  edge: string;
  /** Label anchor at the end of time. */
  labelX: number;
  labelY: number;
}

export interface RiverGeometry {
  streams: RiverStream[];
  /** x of each point. */
  xs: number[];
  step: number;
  labelAnchor: "start" | "end";
}

/** Moving average with a ±`half` window (edges use what exists). */
export function smoothSeries(values: readonly number[], half: number): number[] {
  if (half <= 0) return [...values];
  return values.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let k = i - half; k <= i + half; k += 1) {
      if (k >= 0 && k < values.length) {
        sum += values[k]!;
        count += 1;
      }
    }
    return sum / count;
  });
}

/** Stacked, centred streams in the 820×240 view box (DataVizPersonal `river`), mirrored for RTL. */
export function riverGeometry(
  series: readonly Pick<RiverSeries, "id" | "values">[],
  { direction = "ltr", compact = false, smoothing = 2 }: { direction?: Direction; compact?: boolean; smoothing?: number } = {},
): RiverGeometry {
  const n = Math.max(0, ...series.map((item) => item.values.length));
  const rtl = direction === "rtl";
  const padStart = compact ? 10 : 18;
  const padEnd = compact ? 10 : 104;
  const step = n > 1 ? (RIVER_W - padStart - padEnd) / (n - 1) : 0;
  const x = (i: number) => (rtl ? RIVER_W - padStart - i * step : padStart + i * step);
  const xs = Array.from({ length: n }, (_, i) => x(i));
  const smoothed = series.map((item) => smoothSeries(item.values, smoothing));
  const totals = xs.map((_, i) => smoothed.reduce((sum, values) => sum + (values[i] ?? 0), 0));
  const max = Math.max(0, ...totals);
  if (n < 2 || max <= 0) return { streams: [], xs, step, labelAnchor: rtl ? "end" : "start" };

  const scale = (RIVER_H * 0.66) / max;
  const phase = 30 / n;
  const centre = (i: number) => RIVER_H / 2 + 12 * Math.sin(((i + 1) * phase) / 4.2) - 6 * Math.cos(((i + 1) * phase) / 2.3);
  const taper = (i: number) => (i === 0 || i === n - 1 ? 0.62 : i === 1 || i === n - 2 ? 0.86 : 1);
  const tops: Point[][] = series.map(() => []);
  const bottoms: Point[][] = series.map(() => []);
  for (let i = 0; i < n; i += 1) {
    const k = taper(i);
    let y = centre(i) - (totals[i]! * scale * k + GAP * (series.length - 1)) / 2;
    smoothed.forEach((values, s) => {
      tops[s]!.push([xs[i]!, y]);
      y += (values[i] ?? 0) * scale * k;
      bottoms[s]!.push([xs[i]!, y]);
      y += GAP;
    });
  }
  const labelIndex = Math.max(0, n - 3);
  const labelX = rtl ? xs[n - 1]! - 10 : xs[n - 1]! + 10;
  const streams = series.map((item, s) => ({
    id: item.id,
    band: `${smoothPath(tops[s]!)} ${smoothPath([...bottoms[s]!].reverse()).replace(/^M/, "L")} Z`,
    edge: smoothPath(tops[s]!),
    labelX,
    labelY: (tops[s]![labelIndex]![1] + bottoms[s]![labelIndex]![1]) / 2 + 4,
  }));
  // Labels never overlap: at least 15 units apart, top to bottom.
  for (let i = 1; i < streams.length; i += 1) {
    if (streams[i]!.labelY - streams[i - 1]!.labelY < 15) streams[i]!.labelY = streams[i - 1]!.labelY + 15;
  }
  return { streams, xs, step, labelAnchor: rtl ? "end" : "start" };
}

export function BudgetRiver({
  series,
  points,
  todayIndex = points.length - 1,
  label,
  formatValue,
  topText,
  forecastLabel,
  legendLabel,
  direction = "ltr",
  compact = false,
  smoothing = 2,
  className,
}: BudgetRiverProps) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const rtl = direction === "rtl";
  const geometry = riverGeometry(series, { direction, compact, smoothing });
  const [selected, setSelected] = useState<number | null>(null);
  const [isolated, setIsolated] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const n = points.length;
  const today = Math.min(Math.max(0, todayIndex), n - 1);
  const active = selected ?? today;
  const focusId = hovered ?? isolated;
  const todayX = geometry.xs[today] ?? 0;
  const hasForecast = today < n - 1;

  // Tooltip: the raw (unsmoothed) day.
  const dayValues = series.map((item) => item.values[active] ?? 0);
  const dayTotal = dayValues.reduce((a, b) => a + b, 0);
  const topIndex = dayValues.indexOf(Math.max(...dayValues));
  const top = series[topIndex];
  const tipX = ((geometry.xs[active] ?? 0) / RIVER_W) * 100;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    const move = (to: number) => {
      event.preventDefault();
      setSelected(Math.min(today, Math.max(0, to)));
    };
    if (event.key === forward) move(active + 1);
    else if (event.key === back) move(active - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(today);
    else if (event.key === "Escape") {
      setIsolated(null);
      setSelected(null);
    }
  };

  const opacity = (id: string, base: number) => (focusId && focusId !== id ? base * 0.3 : base);
  const reveal = reduce ? undefined : { initial: { scaleX: 0 }, animate: { scaleX: 1 }, transition: { duration: 0.7, ease: "easeOut" as const } };
  const morph = reduce ? { duration: 0 } : { duration: 0.45, ease: "easeInOut" as const };

  return (
    <div data-slot="budget-river" className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div
        role="group"
        aria-label={label}
        aria-roledescription="chart"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onMouseLeave={() => setSelected(null)}
        className="relative rounded-tile focus-visible:focus-ring"
      >
        <svg viewBox={`0 0 ${RIVER_W} ${RIVER_H}`} className="block h-auto w-full overflow-visible" aria-hidden="true">
          <defs>
            <clipPath id={`${uid}-actual`}>
              <motion.rect
                x={rtl ? todayX : 0}
                y={-20}
                width={rtl ? RIVER_W - todayX : todayX}
                height={RIVER_H + 40}
                style={{ transformBox: "fill-box", transformOrigin: rtl ? "right" : "left" }}
                {...reveal}
              />
            </clipPath>
            <clipPath id={`${uid}-forecast`}>
              <rect x={rtl ? 0 : todayX} y={-20} width={rtl ? todayX : RIVER_W - todayX} height={RIVER_H + 40} />
            </clipPath>
          </defs>
          {(["actual", "forecast"] as const).map((part) =>
            part === "forecast" && !hasForecast ? null : (
              <g key={part} clipPath={`url(#${uid}-${part})`} opacity={part === "forecast" ? 0.45 : 1}>
                {geometry.streams.map((stream, s) => (
                  <g key={stream.id} data-stream={part === "actual" ? stream.id : undefined}>
                    <motion.path
                      initial={false}
                      animate={{ d: stream.band }}
                      transition={morph}
                      fill={series[s]!.color}
                      fillOpacity={opacity(stream.id, 0.42)}
                    />
                    <motion.path
                      initial={false}
                      animate={{ d: stream.edge }}
                      transition={morph}
                      fill="none"
                      stroke={series[s]!.color}
                      strokeWidth={1.6}
                      strokeOpacity={opacity(stream.id, 0.9)}
                    />
                  </g>
                ))}
              </g>
            ),
          )}
          {hasForecast ? (
            <g>
              <line x1={todayX} x2={todayX} y1={8} y2={RIVER_H - 8} stroke="var(--color-scope-deep, currentColor)" strokeWidth={1.5} strokeDasharray="4 4" />
              {forecastLabel ? (
                <text x={rtl ? todayX - 8 : todayX + 8} y={18} textAnchor={rtl ? "end" : "start"} className="fill-fg-muted text-[11px] font-semibold">
                  {forecastLabel}
                </text>
              ) : null}
            </g>
          ) : null}
          {compact
            ? null
            : geometry.streams.map((stream, s) => (
                <text
                  key={stream.id}
                  x={stream.labelX}
                  y={stream.labelY}
                  textAnchor={geometry.labelAnchor}
                  opacity={opacity(stream.id, 1)}
                  className="fill-fg text-[13px] font-semibold"
                >
                  {series[s]!.label}
                </text>
              ))}
          {/* Hit columns: one per actual point. */}
          {geometry.xs.slice(0, today + 1).map((x, i) => (
            <rect
              key={i}
              x={x - geometry.step / 2}
              y={0}
              width={geometry.step}
              height={RIVER_H}
              fill="transparent"
              onMouseEnter={() => setSelected(i)}
              onClick={() => setSelected(i)}
            />
          ))}
          <line x1={geometry.xs[active] ?? 0} x2={geometry.xs[active] ?? 0} y1={14} y2={RIVER_H - 14} stroke="currentColor" strokeOpacity={0.35} strokeWidth={1} />
        </svg>
        {n > 0 ? (
          <div
            role="status"
            data-slot="river-tooltip"
            className="pointer-events-none absolute top-1 z-10 flex flex-col gap-0.5 rounded-field bg-elevated px-3 py-2 text-xs shadow-island"
            style={{ insetInlineStart: `clamp(0%, ${rtl ? 100 - tipX : tipX}% - 4rem, calc(100% - 9rem))` }}
          >
            <span className="font-semibold text-fg-muted">{points[active]}</span>
            <span className="tabular text-base font-bold text-fg">{formatValue(dayTotal)}</span>
            {top && dayTotal > 0 ? <span className="font-semibold text-warning-text">{topText(top.label, formatValue(dayValues[topIndex]!))}</span> : null}
          </div>
        ) : null}
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label={legendLabel}>
        {series.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              aria-pressed={isolated === item.id}
              onClick={() => setIsolated((current) => (current === item.id ? null : item.id))}
              onMouseEnter={() => setHovered(item.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(item.id)}
              onBlur={() => setHovered(null)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-pill px-3 text-xs font-bold transition-[opacity,background-color] duration-120 focus-visible:focus-ring",
                isolated === item.id ? "bg-scope-soft text-scope-deep" : "bg-subtle text-fg-secondary hover:text-fg",
                focusId && focusId !== item.id && "opacity-60",
              )}
            >
              <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: item.color }} />
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
