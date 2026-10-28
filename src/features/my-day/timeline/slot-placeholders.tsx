"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import type { Gap } from "../domain/gaps";
import { SLOT_PLACEHOLDER_STYLE } from "../ui/scope-style";
import { useMyDayFormat } from "../ui/use-my-day-format";
import { ClockText } from "./clock-text";
import { blockHeight, minuteToY, SLOT_PLACEHOLDER_PX } from "./geometry";

/*
 * The two dashed placeholders of a day that has room. On a normal day, one
 * "Drop a task here · 18:30" at the next free half hour after the last block;
 * on a partly planned day, one "2h free · 3 tasks fit" per gap of an hour or
 * more. Both are cues, not targets: the whole column accepts the drop.
 */

const placeholder = cn(
  SLOT_PLACEHOLDER_STYLE,
  "pointer-events-none absolute inset-x-0 flex items-center justify-center gap-1.5 px-3 text-center text-xs font-semibold",
);

export function FreeSlot({
  startMinutes,
  windowStartMinutes,
  pxPerMinute,
}: {
  startMinutes: number;
  windowStartMinutes: number;
  pxPerMinute: number;
}) {
  const t = useTranslations("MyDay.timeline");
  const format = useMyDayFormat();
  return (
    <div
      data-slot="free-slot"
      className={placeholder}
      style={{ top: minuteToY(startMinutes, windowStartMinutes, pxPerMinute), height: SLOT_PLACEHOLDER_PX }}
    >
      <span>{t("freeSlot")}</span>
      <span aria-hidden>·</span>
      <ClockText>{format.clock(startMinutes)}</ClockText>
    </div>
  );
}

export function GapHint({
  gap,
  fit,
  windowStartMinutes,
  pxPerMinute,
}: {
  gap: Gap;
  /** Unscheduled tasks that fit it. */
  fit: number;
  windowStartMinutes: number;
  pxPerMinute: number;
}) {
  const t = useTranslations("MyDay.timeline");
  const format = useMyDayFormat();
  return (
    <div
      data-slot="gap-hint"
      className={placeholder}
      style={{
        top: minuteToY(gap.startMinutes, windowStartMinutes, pxPerMinute),
        height: blockHeight(gap.minutes, pxPerMinute),
      }}
    >
      <span>{t("gapFree", { duration: format.duration(gap.minutes) })}</span>
      {fit > 0 ? (
        <>
          <span aria-hidden>·</span>
          <span>{t("gapFit", { count: fit, formatted: format.number(fit) })}</span>
        </>
      ) : null}
    </div>
  );
}
