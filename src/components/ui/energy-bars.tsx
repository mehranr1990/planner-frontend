"use client";

import { useTranslations } from "next-intl";
import type { EnergyLevel } from "@/data/domain";
import { cn } from "@/lib/cn";

/*
 * The 3-bar energy glyph (board: 3px bars, 6 / 9 / 12px tall): low lights
 * one bar, medium two, high three. Never colour alone: it carries an
 * accessible name ("Energy high"), or is hidden when a visible label already
 * says the same (`decorative`). Bars grow from the bottom in both directions;
 * they are a glyph, not a chart, so they do not mirror.
 */

const LIT_BARS: Record<EnergyLevel, number> = { low: 1, medium: 2, high: 3 };
const BAR_HEIGHTS = ["h-1.5", "h-[9px]", "h-3"] as const;

export interface EnergyBarsProps {
  /** Null renders nothing (a task with no energy set). */
  level: EnergyLevel | null;
  /** Hide from assistive tech: a nearby visible label already names the level. */
  decorative?: boolean;
  className?: string;
}

export function EnergyBars({ level, decorative = false, className }: EnergyBarsProps) {
  const t = useTranslations("UI");
  if (!level) return null;
  const lit = LIT_BARS[level];
  return (
    <span
      data-slot="energy-bars"
      data-level={level}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": t("energyLevel", { level }) })}
      className={cn("inline-flex shrink-0 items-end gap-0.5", className)}
    >
      {BAR_HEIGHTS.map((height, index) => (
        <span
          key={height}
          className={cn("w-[3px] rounded-full", height, index < lit ? "bg-fg-secondary" : "bg-outline")}
        />
      ))}
    </span>
  );
}
