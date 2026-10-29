"use client";

import { Check, ChevronRight, Flame, Moon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { Direction } from "@/lib/locale/direction";

/*
 * Habit Streak Ribbon (HabitStreakRibbon board, frozen): one habit, the
 * current week. Summary tile (flame + streak), seven nodes joined by soft
 * wave connectors — a kept run is a thick mint ribbon, upcoming or missed
 * stretches a thin dotted line — and an optional CTA capsule (hidden on
 * phones). Not a ring, progress bar, timeline or heatmap; no red states.
 *
 * RTL (DataViz rule A): time runs right → left. The nodes are a grid in the
 * ribbon's own `dir`, and the connector x coordinates are mirrored
 * (W − x) — never a CSS flip. Motion: connectors draw node → node once
 * (900ms), today settles last; reduced motion draws nothing.
 */

export type StreakRibbonState = "done" | "today-done" | "today-open" | "missed" | "rest" | "upcoming";

export interface StreakRibbonNode {
  key: string;
  state: StreakRibbonState;
  /** Short weekday ("Sat", "ش"). */
  weekday: string;
  /** Day of month, already localised. */
  date: string;
  /** Weekend day: label in the weekend colour (Friday red). */
  weekend?: boolean;
  /** Day, date and state ("Sat 18 Mehr: done"). */
  ariaLabel: string;
}

export interface HabitStreakRibbonProps {
  /** The week, oldest first (Saturday first for Iran). */
  nodes: readonly StreakRibbonNode[];
  streak: number;
  /** The streak number, localised. */
  streakText: string;
  /** "day streak". */
  streakLabel: string;
  /** Group summary ("Read: 11-day streak, today not done yet"). */
  label: string;
  direction?: Direction;
  /** Phone size: 32px nodes and no CTA capsule. */
  compact?: boolean;
  /** Adaptive CTA ("Keep going") that opens the habit. Hidden on phones. */
  cta?: { label: string; href: string };
  /** Tap a node (Habits: shows that day). Without it nodes are read-only. */
  onNodeClick?: (key: string) => void;
  className?: string;
}

const W = 700;
const CY = 26;

const isKept = (state: StreakRibbonState | undefined) => state === "done" || state === "today-done";

export interface RibbonConnector {
  d: string;
  /** A kept run (thick mint) or a gap / the future (thin dotted). */
  strong: boolean;
}

/** Wave connectors between node centres; x mirrors for RTL (W − x). */
export function ribbonConnectors(states: readonly StreakRibbonState[], direction: Direction = "ltr", width = W): RibbonConnector[] {
  const n = states.length;
  const x = (index: number) => {
    const value = ((index + 0.5) / n) * width;
    return direction === "rtl" ? width - value : value;
  };
  const connectors: RibbonConnector[] = [];
  for (let index = 0; index < n - 1; index += 1) {
    const a = states[index]!;
    const b = states[index + 1]!;
    const x1 = x(index);
    const x2 = x(index + 1);
    const dx = (x2 - x1) / 3;
    const wave = index % 2 ? 7 : -7;
    const d = `M${x1.toFixed(1)} ${CY} C${(x1 + dx).toFixed(1)} ${CY + wave} ${(x2 - dx).toFixed(1)} ${CY - wave} ${x2.toFixed(1)} ${CY}`;
    // Board rule: kept or rest → kept, today or rest; a rest only carries a run that reached it.
    const strong =
      (isKept(a) || a === "rest") &&
      (isKept(b) || b === "today-open" || b === "rest") &&
      !(a === "rest" && index > 0 && !isKept(states[index - 1]));
    connectors.push({ d, strong });
  }
  return connectors;
}

function Node({ node, compact }: { node: StreakRibbonNode; compact: boolean }) {
  const today = node.state === "today-done" || node.state === "today-open";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid place-items-center rounded-full",
        today ? "size-11.5" : compact ? "size-8" : "size-9.5",
        isKept(node.state) && "bg-scope-deep text-on-accent",
        node.state === "today-done" && "ring-[3px] ring-scope-dot/60 ring-offset-4 ring-offset-surface",
        node.state === "today-open" && "border-[3px] border-scope-deep bg-surface ring-[5px] ring-scope-soft",
        node.state === "missed" && "border-2 border-outline bg-subtle",
        node.state === "rest" && "border-2 border-dotted border-fg-muted bg-surface text-fg-muted",
        node.state === "upcoming" && "border-2 border-dashed border-outline bg-surface",
      )}
    >
      {isKept(node.state) ? <Icon icon={Check} size={today ? 18 : 15} /> : null}
      {node.state === "today-open" ? <span className="size-3 rounded-full bg-scope-deep" /> : null}
      {node.state === "missed" ? <span className="h-0.5 w-3 rounded-full bg-fg-muted" /> : null}
      {node.state === "rest" ? <Icon icon={Moon} size={14} /> : null}
    </span>
  );
}

export function HabitStreakRibbon({
  nodes,
  streak,
  streakText,
  streakLabel,
  label,
  direction = "ltr",
  compact = false,
  cta,
  onNodeClick,
  className,
}: HabitStreakRibbonProps) {
  const reduce = useReducedMotion();
  const connectors = ribbonConnectors(
    nodes.map((node) => node.state),
    direction,
  );
  const step = nodes.length > 1 ? 0.9 / (nodes.length - 1) : 0;

  return (
    <div
      role="group"
      aria-label={label}
      data-slot="streak-ribbon"
      dir={direction}
      className={cn("@container flex min-w-0 items-center gap-2.5 rounded-[1.875rem] bg-surface p-2.5 shadow-island lg:gap-3 lg:p-3", className)}
    >
      <div className="flex w-18 shrink-0 flex-col items-center gap-0.5 rounded-[1.375rem] bg-subtle px-2 py-2.5 lg:w-21">
        <span
          aria-hidden="true"
          className={cn(
            "grid size-8 place-items-center rounded-full lg:size-10.5",
            streak > 0 ? "bg-warning-soft text-warning-text" : "bg-raised text-fg-muted",
          )}
        >
          <Icon icon={Flame} size={16} />
        </span>
        <span className="tabular text-xl font-semibold leading-none lg:text-[1.75rem]">{streakText}</span>
        <span className="text-center text-[0.625rem] font-semibold leading-tight text-fg-muted">{streakLabel}</span>
      </div>

      <div className="relative min-w-0 flex-1">
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${W} 52`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 top-0 h-13 w-full overflow-visible"
        >
          {connectors.map((connector, index) => (
            <motion.path
              key={index}
              d={connector.d}
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              className={connector.strong ? "stroke-scope-dot opacity-45" : "stroke-outline"}
              strokeWidth={connector.strong ? 9 : 2}
              strokeDasharray={connector.strong ? undefined : "1 7"}
              initial={reduce || !connector.strong ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: step, delay: index * step, ease: "easeOut" }}
            />
          ))}
        </svg>
        <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${nodes.length}, minmax(0, 1fr))` }}>
          {nodes.map((node) => {
            const today = node.state === "today-done" || node.state === "today-open";
            const body = (
              <>
                <span className="grid h-13 place-items-center">
                  <Node node={node} compact={compact} />
                </span>
                <span
                  className={cn(
                    "text-xs leading-tight",
                    today ? "font-extrabold text-scope-deep" : node.weekend ? "font-bold text-weekend-text" : "font-bold text-fg-secondary",
                  )}
                >
                  {node.weekday}
                </span>
                <span className="tabular text-[0.6875rem] font-semibold text-fg-muted">{node.date}</span>
              </>
            );
            return (
              <li key={node.key} data-state={node.state} className="flex min-w-0 flex-col items-center">
                {onNodeClick ? (
                  <button
                    type="button"
                    aria-label={node.ariaLabel}
                    onClick={() => onNodeClick(node.key)}
                    className="flex flex-col items-center rounded-field focus-visible:focus-ring"
                  >
                    {body}
                  </button>
                ) : (
                  <span role="img" aria-label={node.ariaLabel} className="flex flex-col items-center">
                    {body}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {cta && !compact ? (
        <Link
          href={cta.href}
          className="hidden h-13 shrink-0 items-center gap-2 rounded-pill bg-subtle ps-4 pe-1.5 text-sm font-bold text-fg hover:bg-raised focus-visible:focus-ring @2xl:flex"
        >
          {cta.label}
          <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-surface">
            <Icon icon={ChevronRight} mirror size={16} />
          </span>
        </Link>
      ) : null}
    </div>
  );
}
