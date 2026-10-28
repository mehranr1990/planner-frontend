"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { SignatureCard, SignatureCardHeader } from "@/design-system/surfaces/signature-card";
import { cn } from "@/lib/cn";

/*
 * Weekly Story (DataVizPersonal 05, frozen): "What kind of week did I have?"
 * The signature summary at the top of the Weekly review — a quiet landscape,
 * a headline, four metrics and one line. Never punishes: a difficult week
 * gets calm colours and kind copy, never red or a score. The landscape is
 * decoration, not data, so RTL mirrors the layout only. Entrance (once):
 * hills rise in three layers, the headline fades, numbers count up (900ms);
 * static under reduced motion. Metrics can jump to the matching step.
 */

export type WeeklyStoryTone = "good" | "mixed" | "hard";

/** Board palettes per week type (light and dark alike: the card is its own deep surface). */
export const STORY_PALETTES: Record<WeeklyStoryTone, { bg: string; sun: string; sunX: number; hills: [string, string, string] }> = {
  good: { bg: "linear-gradient(180deg, #1D5C4C 0%, #0E3F34 100%)", sun: "#E8F5C8", sunX: 690, hills: ["#2C6E5B", "#235E4E", "#184A3E"] },
  mixed: { bg: "linear-gradient(180deg, #4C5F66 0%, #33454C 100%)", sun: "#F3DDB0", sunX: 520, hills: ["#5D7279", "#4E6268", "#3E5056"] },
  hard: { bg: "linear-gradient(180deg, #34405E 0%, #252F48 100%)", sun: "#D9DDF2", sunX: 210, hills: ["#424F70", "#38445F", "#2D3750"] },
};

const HILLS = [
  "M0 230 C140 170 260 210 380 180 S640 130 900 170 L900 420 L0 420 Z",
  "M0 290 C180 250 300 290 470 260 S760 250 900 270 L900 420 L0 420 Z",
  "M0 350 C200 330 360 360 560 335 S820 340 900 350 L900 420 L0 420 Z",
];

const ENTRANCE_MS = 900;

export interface WeeklyStoryMetric {
  id: string;
  /** Counted up on entrance; `format` prints it ("22h", "4 / 5", "Good"). */
  value: number;
  format(value: number): string;
  label: string;
  /** Small kind note under the label ("↑ 18% vs usual", "steady"). */
  note?: string;
  /** Jump to the matching review step. */
  onSelect?(): void;
  /** Accessible name of the jump, e.g. "Tasks done: open Carry over". */
  selectLabel?: string;
}

export interface WeeklyStoryProps {
  tone: WeeklyStoryTone;
  /** "Your week at a glance · 18 – 24 Mehr". */
  kicker: ReactNode;
  headline: string;
  /** One quoted line under the metrics. */
  line?: string;
  metrics: readonly WeeklyStoryMetric[];
  /** The notch's one circular action (e.g. Share summary). */
  action: ReactElement;
  /** Play the entrance (once per review). */
  animate?: boolean;
  headingId?: string;
  className?: string;
}

/** Counts 0 → value over `ms` once (ease-out); the value itself when disabled. */
function useCountUp(value: number, enabled: boolean, ms = ENTRANCE_MS): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setProgress(t);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled, ms]);
  return enabled ? value * (1 - (1 - progress) ** 3) : value;
}

function Metric({ metric, animate }: { metric: WeeklyStoryMetric; animate: boolean }) {
  const shown = useCountUp(metric.value, animate);
  const body = (
    <>
      <span className="type-h2 tabular" aria-hidden={animate || undefined}>
        {metric.format(animate ? Math.round(shown * 10) / 10 : metric.value)}
      </span>
      {animate ? <span className="sr-only">{metric.format(metric.value)}</span> : null}
      <span className="text-xs font-semibold opacity-85">{metric.label}</span>
      {metric.note ? <span className="text-[11px] font-semibold opacity-75">{metric.note}</span> : null}
    </>
  );
  const tile = "flex min-w-0 flex-col items-start gap-0.5 rounded-[20px] bg-white/14 p-3.5 text-start backdrop-blur-sm";
  return (
    <li className="min-w-0">
      {metric.onSelect ? (
        <button
          type="button"
          onClick={metric.onSelect}
          aria-label={metric.selectLabel}
          className={cn(tile, "w-full transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white")}
        >
          {body}
        </button>
      ) : (
        <div className={tile}>{body}</div>
      )}
    </li>
  );
}

export function WeeklyStory({ tone, kicker, headline, line, metrics, action, animate = true, headingId, className }: WeeklyStoryProps) {
  const reduce = useReducedMotion();
  const play = animate && !reduce;
  const palette = STORY_PALETTES[tone];
  return (
    <SignatureCard
      as="section"
      aria-labelledby={headingId}
      data-tone={tone}
      tone="deep"
      action={action}
      className={className}
      contentClassName="flex min-h-80 flex-col gap-4 overflow-hidden text-white lg:min-h-[19rem]"
    >
      <div aria-hidden className="absolute inset-0" style={{ background: palette.bg }}>
        <svg viewBox="0 0 900 420" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 size-full">
          <circle cx={palette.sunX} cy={110} r={40} fill={palette.sun} opacity={0.9} />
          {HILLS.map((d, index) => (
            <motion.path
              key={d}
              d={d}
              fill={palette.hills[index]}
              initial={play ? { y: 60, opacity: 0 } : false}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: index * 0.15, ease: "easeOut" }}
            />
          ))}
        </svg>
      </div>
      <SignatureCardHeader className="relative">
        <p className="text-[13px] font-bold opacity-85">{kicker}</p>
      </SignatureCardHeader>
      <motion.h2
        id={headingId}
        className="relative max-w-xl text-[clamp(1.75rem,4vw,2.375rem)] leading-[1.1] font-medium line-clamp-3 rtl:font-bold rtl:leading-[1.25]"
        initial={play ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        {headline}
      </motion.h2>
      <ul className="relative mt-auto grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Metric key={metric.id} metric={metric} animate={play} />
        ))}
      </ul>
      {line ? (
        <p className="relative rounded-[20px] bg-white/14 px-4 py-3.5 text-[15px] leading-[1.45] font-semibold" dir="auto">
          “{line}”
        </p>
      ) : null}
    </SignatureCard>
  );
}
