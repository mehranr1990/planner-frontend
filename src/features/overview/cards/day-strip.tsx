"use client";

import { useTranslations } from "next-intl";
import type { DayBlock } from "@/features/my-day/domain/day-blocks";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { cn } from "@/lib/cn";

/*
 * The hero's day strip: today's blocks from 07:00 to 22:00 as segments, the
 * live one in the scope deep colour and a 12px volt now-dot (P01: the only
 * volt outside the Now card). A timeline, so it mirrors in RTL through
 * logical insets. Decorative for assistive tech — Up next lists the same
 * blocks as text.
 */

export const STRIP_START = 7 * 60;
export const STRIP_END = 22 * 60;
const SPAN = STRIP_END - STRIP_START;
const LABELS = [7, 10, 13, 16, 19, 22].map((hour) => hour * 60);

const pct = (minutes: number) => `${((Math.min(STRIP_END, Math.max(STRIP_START, minutes)) - STRIP_START) / SPAN) * 100}%`;

export function DayStrip({ blocks, nowMinutes }: { blocks: readonly DayBlock[]; nowMinutes: number }) {
  const t = useTranslations("Overview.hero");
  const format = useMyDayFormat();
  const visible = blocks.filter((block) => block.endMinutes > STRIP_START && block.startMinutes < STRIP_END && block.kind !== "break");
  const showNow = nowMinutes >= STRIP_START && nowMinutes <= STRIP_END;

  return (
    <div data-slot="day-strip" aria-hidden className="flex flex-col gap-2 pt-1">
      <div className="relative h-3 rounded-pill bg-subtle">
        {visible.map((block) => {
          const live = !block.done && block.startMinutes <= nowMinutes && nowMinutes < block.endMinutes;
          const past = block.done || block.endMinutes <= nowMinutes;
          return (
            <span
              key={block.id}
              title={block.title}
              className={cn(
                "absolute inset-y-0 rounded-pill border-x-2 border-surface",
                live
                  ? "bg-scope-deep"
                  : block.scope === "project"
                    ? "bg-project-soft"
                    : block.scope !== "personal"
                      ? "bg-team-soft"
                      : past
                        ? "bg-scope-dot"
                        : "bg-scope-soft",
              )}
              style={{ insetInlineStart: pct(block.startMinutes), insetInlineEnd: `calc(100% - ${pct(block.endMinutes)})` }}
            />
          );
        })}
        {showNow ? (
          <span
            data-slot="now-dot"
            className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full bg-volt ring-2 ring-scope-deep ltr:-translate-x-1/2 rtl:translate-x-1/2"
            style={{ insetInlineStart: pct(nowMinutes) }}
            title={t("now")}
          />
        ) : null}
      </div>
      <div className="relative h-4 text-[0.6875rem] font-semibold text-fg-muted">
        {LABELS.map((minutes, index) => (
          <span
            key={minutes}
            className={cn(
              "tabular absolute",
              index === 0 ? "" : index === LABELS.length - 1 ? "ltr:-translate-x-full rtl:translate-x-full" : "ltr:-translate-x-1/2 rtl:translate-x-1/2",
            )}
            style={{ insetInlineStart: pct(minutes) }}
          >
            <span dir="ltr">{format.clock(minutes)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
