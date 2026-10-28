"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import type { MinuteSpan } from "../domain/day-blocks";
import { useMyDayFormat } from "../ui/use-my-day-format";
import { minuteToY } from "./geometry";

/*
 * The now line: 2px in the scope's deep colour with the one volt mark on the
 * timeline (the 12px now-dot, ringed in the deep colour so it reads on both
 * themes). Only drawn on the planner's today and only while now is inside the
 * visible window. It starts at the inline-start side, so it mirrors in rtl.
 */

export interface NowLineProps {
  nowMinutes: number;
  window: MinuteSpan;
  pxPerMinute: number;
  /** Distance from the inline-start edge to where the line (and its dot) begins. */
  insetStart: number;
  className?: string;
}

export function NowLine({ nowMinutes, window, pxPerMinute, insetStart, className }: NowLineProps) {
  const t = useTranslations("MyDay.timeline");
  const format = useMyDayFormat();
  if (nowMinutes < window.startMinutes || nowMinutes > window.endMinutes) return null;
  return (
    <div
      role="img"
      aria-label={t("nowLine", { time: format.clock(nowMinutes) })}
      data-slot="now-line"
      className={cn("pointer-events-none absolute z-3 h-0.5 bg-scope-deep", className)}
      style={{ top: minuteToY(nowMinutes, window.startMinutes, pxPerMinute), insetInlineStart: insetStart, insetInlineEnd: 0 }}
    >
      <span
        aria-hidden
        data-slot="now-dot"
        className="absolute start-0 -top-[5px] -ms-1.5 size-3 rounded-full bg-volt ring-2 ring-scope-deep"
      />
    </div>
  );
}
