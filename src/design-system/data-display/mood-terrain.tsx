"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId, useState, type KeyboardEvent } from "react";
import type { EnergyLevel, MoodLevel } from "@/data/domain";
import { cn } from "@/lib/cn";
import type { Direction } from "@/lib/locale/direction";
import { smoothPath } from "./goal-milestone-path";

/*
 * Mood Terrain v2 (DataVizRefine · 03, approved and frozen): "how did my
 * mood and energy move together?" Elevation = mood (five levels; the dotted
 * horizon is "Okay"), the warm soil strata under each day = energy (one, two
 * or three layers lit for Low / Medium / High). Three energy dots and the
 * day label sit under every day; a selected day gets a light column and a
 * tooltip island.
 *
 * Days without a check-in get no anchor; the land between known days is
 * interpolated (never invented past the first / last check-in).
 *
 * RTL (DataViz rule A): time flows right → left; every x is mirrored in the
 * geometry and the gradients are reordered — the chart is never CSS-flipped.
 * Motion: the selected point rises from the ground (200ms), the land morphs
 * when a mood changes. Reduced motion: instant.
 */

export interface TerrainDay {
  /** Calendar day; the key. */
  day: string;
  /** Axis label ("Tue 21" / "س ۲۱"). */
  label: string;
  /** Tooltip heading ("Tue, 21 Mehr"). */
  tipLabel: string;
  mood: MoodLevel | null;
  energy: EnergyLevel | null;
  /** Friday: the label is red. */
  weekend?: boolean;
}

export interface TerrainOptions {
  direction?: Direction;
  compact?: boolean;
}

export const TERRAIN_W = 820;
const ENERGY_RANK: Record<EnergyLevel, number> = { low: 1, medium: 2, high: 3 };
const STRATA_OPACITY = [0.55, 0.42, 0.32] as const;
const OFF_OPACITY = 0.05;
const STRATUM = 11;

type Point = readonly [number, number];

export interface TerrainGeometry {
  width: number;
  height: number;
  /** x of each day. */
  xs: number[];
  /** y of each day's anchor (interpolated for days without a check-in). */
  ys: number[];
  ground: number;
  /** The land's surface line. */
  surface: string;
  /** Closed land shape (surface down to the bottom). */
  land: string;
  /** Three soil strata, each with gradient stops in ascending offset order. */
  strata: { k: 1 | 2 | 3; d: string; stops: { offset: number; opacity: number }[] }[];
  /** Five level guides, Great first. */
  levels: { mood: MoodLevel; y: number }[];
  horizonY: number;
  labelX: number;
  labelAnchor: "start" | "end";
  /** Column width per day (hit area). */
  step: number;
  dotsY: number;
  labelY: number;
}

/** Moods with the gaps filled by linear interpolation between known days (ends clamp to the nearest). */
export function fillMoods(moods: readonly (number | null)[]): number[] {
  const known = moods.flatMap((mood, index) => (mood === null ? [] : [[index, mood] as const]));
  if (!known.length) return moods.map(() => 3);
  return moods.map((mood, index) => {
    if (mood !== null) return mood;
    const after = known.find(([i]) => i > index);
    const before = [...known].reverse().find(([i]) => i < index);
    if (!before) return after![1];
    if (!after) return before[1];
    return before[1] + ((after[1] - before[1]) * (index - before[0])) / (after[0] - before[0]);
  });
}

function band(top: readonly Point[], bottom: readonly Point[]): string {
  return `${smoothPath(top)} L${smoothPath([...bottom].reverse()).slice(1)} Z`;
}

export function terrainGeometry(days: readonly Pick<TerrainDay, "mood" | "energy">[], { direction = "ltr", compact = false }: TerrainOptions = {}): TerrainGeometry {
  const rtl = direction === "rtl";
  const W = TERRAIN_W;
  const H = compact ? 240 : 280;
  const n = days.length;
  const padStart = compact ? 28 : 70;
  const padEnd = compact ? 28 : 24;
  const mirror = (x: number) => (rtl ? W - x : x);
  const X = (t: number) => mirror(padStart + (n <= 1 ? 0.5 : t / (n - 1)) * (W - padStart - padEnd));
  const top = 26;
  const ground = H - (compact ? 56 : 66);
  const stepY = (ground - top - 40) / 4;
  const Y = (mood: number) => ground - 40 - (mood - 1) * stepY;
  const filled = fillMoods(days.map((day) => day.mood));

  const SAMPLES = n > 1 ? 60 : 2;
  const samples: Point[] = Array.from({ length: SAMPLES }, (_, k) => {
    const t = n <= 1 ? 0 : (k / (SAMPLES - 1)) * (n - 1);
    const i0 = Math.floor(t);
    const i1 = Math.min(n - 1, i0 + 1);
    const f0 = t - i0;
    const f = f0 * f0 * (3 - 2 * f0);
    const mood = (filled[i0] ?? 3) * (1 - f) + (filled[i1] ?? 3) * f;
    const x = n <= 1 ? mirror(padStart + (k / (SAMPLES - 1)) * (W - padStart - padEnd)) : X(t);
    return [x, Y(mood)];
  });
  const edge = compact ? 0 : padStart - 14;
  const left = rtl ? W - edge : edge;
  const right = rtl ? 0 : W;
  const ext: Point[] = [[left, samples[0]![1] + 6], ...samples, [right, samples[SAMPLES - 1]![1] + 6]];
  const surface = smoothPath(ext);
  const land = `${surface} L${right} ${H} L${left} ${H} Z`;
  const xs = days.map((_, i) => X(i));

  const strata = ([1, 2, 3] as const).map((k) => {
    const upper = ext.map(([x, y]) => [x, y + 9 + (k - 1) * STRATUM] as const);
    const lower = ext.map(([x, y]) => [x, y + 9 + k * STRATUM - 3] as const);
    const stops = days.map((day, i) => ({
      offset: Math.max(0, Math.min(1, xs[i]! / W)),
      opacity: day.energy && ENERGY_RANK[day.energy] >= k ? STRATA_OPACITY[k - 1] : OFF_OPACITY,
    }));
    return { k, d: band(upper, lower), stops: rtl ? stops.reverse() : stops };
  });

  return {
    width: W,
    height: H,
    xs,
    ys: filled.map(Y),
    ground,
    surface,
    land,
    strata,
    levels: ([5, 4, 3, 2, 1] as const).map((mood) => ({ mood, y: Y(mood) })),
    horizonY: Y(3),
    labelX: rtl ? W - 8 : 8,
    labelAnchor: rtl ? "end" : "start",
    step: n > 1 ? (W - padStart - padEnd) / (n - 1) : W - padStart - padEnd,
    dotsY: H - 38,
    labelY: H - 14,
  };
}

export interface MoodTerrainProps extends TerrainOptions {
  days: readonly TerrainDay[];
  /** Accessible name: one sentence about the chart. */
  label: string;
  /** "Great", "Good"… for a level (guides and tooltip). */
  moodLabel(mood: MoodLevel): string;
  /** "Low", "Medium", "High". */
  energyLabel(energy: EnergyLevel): string;
  /** Tooltip lines: (mood word) → "Mood · Good", (energy word) → "Energy · Medium". */
  moodLine?(word: string): string;
  energyLine?(word: string): string;
  /** The selected day index; defaults to the last day with a check-in. */
  selected?: number;
  onSelect?(index: number): void;
  className?: string;
}

export function MoodTerrain({
  days,
  label,
  moodLabel,
  energyLabel,
  moodLine = (word) => word,
  energyLine = (word) => word,
  selected: controlled,
  onSelect,
  direction = "ltr",
  compact = false,
  className,
}: MoodTerrainProps) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const rtl = direction === "rtl";
  const geometry = terrainGeometry(days, { direction, compact });
  const lastKnown = days.reduce((last, day, index) => (day.mood !== null ? index : last), -1);
  const [own, setOwn] = useState<number | null>(null);
  const active = Math.min(days.length - 1, Math.max(0, controlled ?? own ?? lastKnown));
  const select = (index: number) => {
    const next = Math.min(days.length - 1, Math.max(0, index));
    setOwn(next);
    onSelect?.(next);
  };
  const current = days[active];
  const sx = geometry.xs[active] ?? 0;
  const colW = Math.min(36, geometry.step - 4);
  const morph = reduce ? { duration: 0 } : { duration: 0.2, ease: "easeOut" as const };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    const move = (to: number) => {
      event.preventDefault();
      select(to);
    };
    if (event.key === forward) move(active + 1);
    else if (event.key === back) move(active - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(days.length - 1);
  };

  if (!days.length) return null;
  const tipPct = Math.min(86, Math.max(14, (sx / geometry.width) * 100));

  return (
    <div
      data-slot="mood-terrain"
      role="group"
      aria-label={label}
      aria-roledescription="chart"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={cn("relative min-w-0 rounded-tile focus-visible:focus-ring", className)}
    >
      <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} className="block h-auto w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--viz-mood)" stopOpacity={0.34} />
            <stop offset="0.55" stopColor="var(--viz-mood)" stopOpacity={0.12} />
            <stop offset="1" stopColor="var(--viz-mood)" stopOpacity={0.02} />
          </linearGradient>
          {geometry.strata.map((stratum) => (
            <linearGradient key={stratum.k} id={`${uid}-st${stratum.k}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={geometry.width} y2="0">
              {stratum.stops.map((stop, i) => (
                <stop key={i} offset={stop.offset} stopColor="var(--viz-energy)" stopOpacity={stop.opacity} />
              ))}
            </linearGradient>
          ))}
          <clipPath id={`${uid}-land`}>
            <path d={geometry.land} />
          </clipPath>
        </defs>
        {compact
          ? null
          : geometry.levels.map((level) => (
              <text key={level.mood} x={geometry.labelX} y={level.y} dy={4} textAnchor={geometry.labelAnchor} className="fill-fg-muted text-[11px] font-semibold">
                {moodLabel(level.mood)}
              </text>
            ))}
        <motion.path initial={false} animate={{ d: geometry.land }} transition={morph} fill={`url(#${uid}-sky)`} />
        <g clipPath={`url(#${uid}-land)`}>
          {geometry.levels.map((level) => (
            <line key={level.mood} x1={0} x2={geometry.width} y1={level.y} y2={level.y} stroke="var(--surface)" strokeOpacity={0.55} />
          ))}
          <rect data-terrain-column x={sx - colW / 2} y={0} width={colW} height={geometry.height} rx={12} fill="var(--surface)" fillOpacity={0.55} />
        </g>
        {geometry.strata.map((stratum) => (
          <motion.path key={stratum.k} initial={false} animate={{ d: stratum.d }} transition={morph} fill={`url(#${uid}-st${stratum.k})`} />
        ))}
        <line x1={0} x2={geometry.width} y1={geometry.horizonY} y2={geometry.horizonY} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="1 5" strokeLinecap="round" />
        <motion.path initial={false} animate={{ d: geometry.surface }} transition={morph} fill="none" stroke="var(--viz-mood)" strokeWidth={2.2} strokeLinecap="round" />
        {days.map((day, i) => {
          const x = geometry.xs[i]!;
          const isActive = i === active;
          const rank = day.energy ? ENERGY_RANK[day.energy] : 0;
          return (
            <g key={day.day} data-terrain-day={day.day} data-x={x.toFixed(1)}>
              {day.mood !== null ? (
                <motion.circle
                  cx={x}
                  initial={reduce || !isActive ? false : { cy: geometry.ground }}
                  animate={{ cy: geometry.ys[i]! }}
                  transition={morph}
                  r={isActive ? 6 : 4.5}
                  fill={isActive ? "var(--color-scope-deep, var(--viz-mood))" : "var(--surface)"}
                  stroke={isActive ? "var(--surface)" : "var(--viz-mood)"}
                  strokeWidth={2}
                />
              ) : null}
              {[1, 2, 3].map((k) => (
                <circle key={k} cx={x + (k - 2) * 6} cy={geometry.dotsY} r={2.4} fill={rank >= k ? "var(--viz-energy)" : "currentColor"} fillOpacity={rank >= k ? 1 : 0.15} />
              ))}
              <text
                x={x}
                y={geometry.labelY}
                textAnchor="middle"
                className={cn("text-[11px]", isActive ? "fill-scope-deep font-bold" : day.weekend ? "fill-danger font-semibold" : "fill-fg-muted font-semibold")}
              >
                {day.label}
              </text>
              <rect
                x={x - geometry.step / 2}
                y={0}
                width={geometry.step}
                height={geometry.height}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => select(i)}
                onClick={() => select(i)}
              />
            </g>
          );
        })}
      </svg>
      {current ? (
        <div
          role="status"
          data-slot="terrain-tooltip"
          className="pointer-events-none absolute top-0 z-10 flex flex-col gap-0.5 rounded-field bg-elevated px-3 py-2 text-xs shadow-island"
          style={{ insetInlineStart: `clamp(0%, ${rtl ? 100 - tipPct : tipPct}% - 4.5rem, calc(100% - 10rem))` }}
        >
          <span className="font-semibold text-fg-muted">{current.tipLabel}</span>
          {current.mood !== null && current.energy !== null ? (
            <>
              <strong className="text-sm font-bold text-fg">{moodLine(moodLabel(current.mood))}</strong>
              <span className="font-semibold text-warning-text">{energyLine(energyLabel(current.energy))}</span>
            </>
          ) : (
            <span className="text-fg-secondary">—</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
