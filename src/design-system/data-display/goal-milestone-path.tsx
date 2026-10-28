"use client";

import { Check, Plus } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Direction } from "@/lib/locale/direction";

/*
 * Goal Milestone Path (DataVizAdd · A, approved and frozen): a scenic
 * landscape with the journey drawn across it — done segments solid in the
 * scope colour, the rest dashed, a halo on the milestone in progress (amber
 * with a clock when it is behind), hollow nodes ahead, and the goal flag at
 * the end (filled once reached). Every node carries a label island; the
 * selected one is outlined and shows its due date + next action (the
 * tooltip). The label islands are the real buttons: click / Enter selects,
 * arrows move between milestones, Home / End jump.
 *
 * RTL (DataViz rule A): time flows right-to-left, so every x is mirrored in
 * the geometry — the chart is never CSS-flipped. `vertical` is the phone
 * form (PM03 "Goal detail · vertical Milestone Path"): a stepped list whose
 * layout is logical, so it mirrors by itself.
 *
 * Reduced motion: the done segment is drawn statically.
 */

export type MilestoneNodeState = "done" | "current" | "late" | "next";

export interface MilestonePathNode {
  id: string;
  label: string;
  /** Localised status line ("Done", "In progress · 64%", "Behind · 3 days"). */
  status: string;
  state: MilestoneNodeState;
  /** Shown on the selected node: due date + next action. */
  detail?: string;
}

export interface MilestonePathGoal {
  label: string;
  status: string;
  reached: boolean;
}

export interface GoalMilestonePathProps {
  nodes: readonly MilestonePathNode[];
  goal: MilestonePathGoal;
  /** Accessible name of the path. */
  label: string;
  direction?: Direction;
  orientation?: "horizontal" | "vertical";
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** "+ between nodes": inserts a milestone at `index` (0 = before the first). */
  onInsert?: (index: number) => void;
  insertLabel?: (index: number) => string;
  /** Shown instead of the path when there are no milestones. */
  empty?: ReactNode;
  className?: string;
}

const W = 820;
const H = 300;
/** The board's rising journey, sampled at six even stops; other counts interpolate it. */
const RISE = [250, 222, 190, 160, 120, 104];

type Point = readonly [number, number];

const f1 = (value: number) => Number(value.toFixed(1));

/** Smooth path through points (the board's Catmull-Rom → Bézier). */
export function smoothPath(points: readonly Point[]): string {
  if (!points.length) return "";
  let d = `M${f1(points[0]![0])} ${f1(points[0]![1])}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    d += ` C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d;
}

function riseAt(t: number): number {
  const scaled = t * (RISE.length - 1);
  const i = Math.min(RISE.length - 2, Math.floor(scaled));
  return RISE[i]! + (RISE[i + 1]! - RISE[i]!) * (scaled - i);
}

/** Node positions (milestones then the goal flag) in the 820×300 view box, mirrored for RTL. */
export function milestonePoints(count: number, direction: Direction = "ltr"): Point[] {
  const total = count + 1;
  const mirror = (x: number) => (direction === "rtl" ? W - x : x);
  return Array.from({ length: total }, (_, i) => {
    const t = total === 1 ? 1 : i / (total - 1);
    return [mirror(50 + 700 * t), riseAt(t)] as const;
  });
}

/** Index of the first node not done (the milestone in progress); `count` when all are done. */
export function currentIndex(nodes: readonly Pick<MilestonePathNode, "state">[]): number {
  const index = nodes.findIndex((node) => node.state !== "done");
  return index === -1 ? nodes.length : index;
}

function land(samples: readonly Point[], direction: Direction): string {
  const mirror = (x: number) => (direction === "rtl" ? W - x : x);
  return `${smoothPath(samples.map(([x, y]) => [mirror(x), y] as const))} L${mirror(W)} ${H} L${mirror(0)} ${H} Z`;
}

const FAR: Point[] = [[0, 150], [90, 96], [170, 128], [260, 70], [350, 120], [450, 84], [560, 130], [660, 60], [760, 104], [820, 88]];
const MID: Point[] = [[0, 196], [120, 160], [240, 190], [380, 150], [520, 178], [650, 140], [820, 160]];
const NEAR: Point[] = [[0, 262], [150, 236], [300, 258], [460, 226], [620, 246], [820, 220]];

/** Roving focus over the label buttons: arrows follow the time direction. */
function useRovingKeys(ids: readonly string[], direction: Direction, vertical: boolean, onSelect?: (id: string) => void) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const forward = vertical ? "ArrowDown" : direction === "rtl" ? "ArrowLeft" : "ArrowRight";
    const back = vertical ? "ArrowUp" : direction === "rtl" ? "ArrowRight" : "ArrowLeft";
    let next: number | null = null;
    if (event.key === forward) next = Math.min(ids.length - 1, index + 1);
    else if (event.key === back) next = Math.max(0, index - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ids.length - 1;
    if (next === null) return;
    event.preventDefault();
    const id = ids[next]!;
    refs.current.get(id)?.focus();
    onSelect?.(id);
  };
  const register = (id: string) => (element: HTMLButtonElement | null) => {
    if (element) refs.current.set(id, element);
    else refs.current.delete(id);
  };
  return { onKeyDown, register };
}

const STATUS_TEXT: Record<MilestoneNodeState | "goal" | "reached", string> = {
  done: "text-primary",
  current: "text-primary",
  late: "text-warning-text",
  next: "text-fg-muted",
  goal: "text-fg-secondary",
  reached: "text-primary",
};

export function GoalMilestonePath({
  nodes,
  goal,
  label,
  direction = "ltr",
  orientation = "horizontal",
  selectedId,
  onSelect,
  onInsert,
  insertLabel,
  empty,
  className,
}: GoalMilestonePathProps) {
  const vertical = orientation === "vertical";
  const goalId = "__goal";
  const ids = [...nodes.map((node) => node.id), goalId];
  const current = currentIndex(nodes);
  const focusId = selectedId && ids.includes(selectedId) ? selectedId : (ids[Math.min(current, ids.length - 1)] ?? goalId);
  const { onKeyDown, register } = useRovingKeys(ids, direction, vertical, onSelect);
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, "");

  if (nodes.length === 0) {
    const m = (x: number) => (direction === "rtl" ? 420 - x : x);
    return (
      <div
        data-slot="milestone-path-empty"
        className={cn(
          "flex min-h-56 flex-col items-center justify-center gap-3 rounded-[26px] bg-linear-to-b from-scope-soft/60 to-surface p-6 text-center",
          className,
        )}
      >
        <svg viewBox="0 0 420 80" className="w-full max-w-105" aria-hidden="true">
          <path d={`M${m(10)} 70 C${m(120)} 66 ${m(220)} 40 ${m(400)} 12`} fill="none" className="stroke-fg-muted" strokeWidth="2.5" strokeDasharray="2 8" strokeLinecap="round" />
          <circle cx={m(10)} cy="70" r="7" className="fill-surface stroke-fg-muted" strokeWidth="2.5" />
          <path d={`M${m(400)} 12 v-26 l${direction === "rtl" ? -16 : 16} 6 l${direction === "rtl" ? 16 : -16} 6`} className="fill-surface stroke-fg-muted" strokeWidth="2" />
        </svg>
        {empty}
      </div>
    );
  }

  const button = (id: string, index: number, children: ReactNode, extra?: string) => {
    const selected = id === selectedId;
    return (
      <button
        type="button"
        ref={register(id)}
        data-node={id}
        aria-pressed={selected}
        tabIndex={id === focusId ? 0 : -1}
        onClick={() => onSelect?.(id)}
        onKeyDown={(event) => onKeyDown(event, index)}
        className={cn(
          "flex min-w-0 flex-col gap-px rounded-2xl bg-surface px-3 py-2 text-start shadow-[0_8px_18px_rgb(14_14_12/0.07)] inset-ring inset-ring-line transition-shadow",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          selected && "inset-ring-2 inset-ring-primary shadow-[0_10px_24px_rgb(14_14_12/0.12)]",
          extra,
        )}
      >
        {children}
      </button>
    );
  };

  const labelBody = (name: string, status: string, tone: keyof typeof STATUS_TEXT, detail?: string, selected?: boolean) => (
    <>
      <span className="truncate text-xs font-bold text-fg">
        <bdi dir="auto">{name}</bdi>
      </span>
      <span className={cn("text-[0.6875rem] font-bold", STATUS_TEXT[tone])}>{status}</span>
      {selected && detail ? <span className="mt-1 text-[0.6875rem] font-semibold text-fg-secondary">{detail}</span> : null}
    </>
  );

  if (vertical) {
    return (
      <ol aria-label={label} data-slot="milestone-path" data-orientation="vertical" className={cn("flex flex-col", className)}>
        {[...nodes, null].map((node, index) => {
          const id = node?.id ?? goalId;
          const state = node?.state;
          const last = node === null;
          const selected = id === selectedId;
          const solid = index < current;
          return (
            <li key={id} className="relative flex gap-3 pb-3 last:pb-0">
              {!last ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute start-[0.6875rem] top-6 bottom-0 w-0 border-s-2",
                    solid ? "border-primary" : "border-dashed border-fg-muted/60",
                  )}
                />
              ) : null}
              <span aria-hidden="true" className="relative z-1 mt-1 grid size-6 shrink-0 place-items-center">
                {last ? (
                  <span className={cn("size-5 rounded-full border-2", goal.reached ? "border-primary bg-primary" : "border-fg-muted bg-surface")} />
                ) : state === "done" ? (
                  <span className="grid size-6 place-items-center rounded-full bg-primary text-on-accent">
                    <Check size={14} strokeWidth={3} />
                  </span>
                ) : state === "current" || state === "late" ? (
                  <span
                    className={cn(
                      "grid size-6 place-items-center rounded-full border-[3px]",
                      state === "late" ? "border-warning bg-warning-soft" : "border-primary bg-surface",
                    )}
                  >
                    <span className={cn("size-2 rounded-full", state === "late" ? "bg-warning-text" : "bg-primary")} />
                  </span>
                ) : (
                  <span className="size-5 rounded-full border-2 border-fg-muted bg-surface" />
                )}
              </span>
              {button(
                id,
                index,
                labelBody(node?.label ?? goal.label, node?.status ?? goal.status, last ? (goal.reached ? "reached" : "goal") : state!, node?.detail, selected),
                cn("flex-1", !selected && "bg-transparent shadow-none inset-ring-0"),
              )}
            </li>
          );
        })}
      </ol>
    );
  }

  const points = milestonePoints(nodes.length, direction);
  const donePoints = points.slice(0, Math.min(current, nodes.length) + 1);
  const full = smoothPath(points);
  const done = current > 0 ? smoothPath(donePoints) : "";
  const gradient = (name: string, from: string, to: string, toOpacity = 1) => (
    <linearGradient id={`${uid}-${name}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style={{ stopColor: from }} />
      <stop offset="1" style={{ stopColor: to, stopOpacity: toOpacity }} />
    </linearGradient>
  );

  const placement = (x: number, i: number, isGoal: boolean) => {
    const px = (x / W) * 100;
    const shiftX = px < 14 ? "-18%" : px > 86 ? "-82%" : "-50%";
    if (isGoal) return direction === "rtl" ? "translate(16px, calc(-100% - 6px))" : "translate(calc(-100% - 16px), calc(-100% - 6px))";
    return i % 2 === 0 ? `translate(${shiftX}, calc(-100% - 22px))` : `translate(${shiftX}, 24px)`;
  };

  return (
    <div
      role="group"
      aria-label={label}
      data-slot="milestone-path"
      data-orientation="horizontal"
      data-direction={direction}
      className={cn("group/path relative overflow-hidden rounded-[26px] bg-linear-to-b from-scope-soft/50 to-surface", className)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" aria-hidden="true">
        <defs>
          {gradient("far", "color-mix(in oklab, var(--color-scope-soft) 80%, var(--color-fg) 6%)", "var(--color-surface)", 0)}
          {gradient("mid", "var(--color-scope-soft)", "var(--color-surface)", 0.2)}
          {gradient("near", "color-mix(in oklab, var(--color-scope-soft) 85%, var(--color-scope-deep) 15%)", "var(--color-scope-soft)")}
        </defs>
        <path d={land(FAR, direction)} fill={`url(#${uid}-far)`} />
        <path d={land(MID, direction)} fill={`url(#${uid}-mid)`} />
        <path d={land(NEAR, direction)} fill={`url(#${uid}-near)`} fillOpacity={0.85} />
        <path d={full} fill="none" className="stroke-surface" strokeWidth="10" strokeLinecap="round" strokeOpacity={0.9} />
        <path d={full} fill="none" className="stroke-fg-muted" strokeWidth="2.5" strokeDasharray="2 8" strokeLinecap="round" />
        {done ? (
          <motion.path
            key={`done-${current}`}
            data-slot="done-path"
            d={done}
            fill="none"
            className="stroke-primary"
            strokeWidth="4"
            strokeLinecap="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        ) : null}
        {points.map(([x, y], i) => {
          const node = nodes[i];
          if (!node) {
            const flagDir = direction === "rtl" ? -1 : 1;
            return (
              <g key="goal" data-state={goal.reached ? "reached" : "goal"}>
                <path
                  d={`M${f1(x)} ${f1(y)} v-34 l${20 * flagDir} 7 l${-20 * flagDir} 7`}
                  className={goal.reached ? "fill-primary stroke-primary" : "fill-surface stroke-fg-muted"}
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <circle cx={f1(x)} cy={f1(y)} r="9" className={goal.reached ? "fill-primary stroke-primary" : "fill-surface stroke-fg-muted"} strokeWidth="2.5" />
              </g>
            );
          }
          return (
            <g key={node.id} data-state={node.state}>
              {node.state === "done" ? (
                <>
                  <circle cx={f1(x)} cy={f1(y)} r="11" className="fill-primary stroke-surface" strokeWidth="3" />
                  <path d={`M${f1(x - 4.5)} ${f1(y)} l3.5 3.5 l6 -7`} fill="none" className="stroke-on-accent" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </>
              ) : node.state === "current" ? (
                <>
                  <circle cx={f1(x)} cy={f1(y)} r="20" className="fill-primary" fillOpacity={0.12} />
                  <circle cx={f1(x)} cy={f1(y)} r="13" className="fill-surface stroke-primary" strokeWidth="3" />
                  <circle cx={f1(x)} cy={f1(y)} r="5.5" className="fill-primary" />
                </>
              ) : node.state === "late" ? (
                <>
                  <circle cx={f1(x)} cy={f1(y)} r="20" className="fill-warning" fillOpacity={0.14} />
                  <circle cx={f1(x)} cy={f1(y)} r="13" className="fill-warning-soft stroke-warning" strokeWidth="3" />
                  {/* Clock hands: never mirrored. */}
                  <path d={`M${f1(x)} ${f1(y - 6)} v5 l3 2`} fill="none" className="stroke-warning-text" strokeWidth="2" strokeLinecap="round" />
                </>
              ) : (
                <circle cx={f1(x)} cy={f1(y)} r="9" className="fill-surface stroke-fg-muted" strokeWidth="2.5" />
              )}
            </g>
          );
        })}
      </svg>
      {points.map(([x, y], i) => {
        const node = nodes[i];
        const id = node?.id ?? goalId;
        const selected = id === selectedId;
        return (
          <div
            key={id}
            className={cn("absolute w-max max-w-44 min-w-32", selected ? "z-4" : "z-2")}
            style={{ left: `${((x / W) * 100).toFixed(2)}%`, top: `${((y / H) * 100).toFixed(2)}%`, transform: placement(x, i, !node) }}
          >
            {button(
              id,
              i,
              labelBody(node?.label ?? goal.label, node?.status ?? goal.status, node ? node.state : goal.reached ? "reached" : "goal", node?.detail, selected),
              "w-full",
            )}
          </div>
        );
      })}
      {onInsert
        ? points.slice(0, -1).map(([x, y], i) => {
            const [x2, y2] = points[i + 1]!;
            return (
              <button
                key={`insert-${i}`}
                type="button"
                data-insert={i + 1}
                aria-label={insertLabel?.(i + 1) ?? "+"}
                onClick={() => onInsert(i + 1)}
                className={cn(
                  "absolute z-3 grid size-7 -translate-1/2 place-items-center rounded-full bg-surface text-primary shadow-sm inset-ring inset-ring-line",
                  "opacity-0 transition-opacity group-hover/path:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-focus-ring",
                )}
                style={{ left: `${(((x + x2) / 2 / W) * 100).toFixed(2)}%`, top: `${(((y + y2) / 2 / H) * 100).toFixed(2)}%` }}
              >
                <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
              </button>
            );
          })
        : null}
    </div>
  );
}
