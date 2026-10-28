"use client";

import { useTranslations } from "next-intl";
import { Chip } from "@/components/ui/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/design-system/feedback/progress";
import { cn } from "@/lib/cn";
import { useMyDay } from "../my-day-context";
import { useMyDayFormat } from "../ui/use-my-day-format";
import { useDayPlan } from "./use-day-plan";

/*
 * Capacity (P02 header): "6h 15m of 8h planned", a 120×8 bar that fills from
 * the inline start, and a chip. Over capacity the bar turns rose and the chip
 * says "Overloaded" instead of the free time; the chip fades in over 200ms
 * (reduced motion: it just swaps). The wrapper is a polite live region so the
 * change is announced, not only coloured.
 *
 * `compact` is the phone header: the chip is the whole read-out.
 */

export interface CapacityPillProps {
  compact?: boolean;
  className?: string;
}

const FREE_CHIP = "bg-scope-soft text-scope-deep";
const OVER_CHIP = "bg-danger-soft text-danger-text";

export function CapacityPill({ compact = false, className }: CapacityPillProps) {
  const t = useTranslations("MyDay.capacity");
  const format = useMyDayFormat();
  const { day } = useMyDay();
  const plan = useDayPlan(day);

  if (plan.status === "loading") {
    return (
      <div
        role="status"
        aria-label={t("loading")}
        className={cn(compact ? "flex h-9 items-center" : "flex h-14 items-center gap-2.5 rounded-pill bg-surface px-4.5", className)}
      >
        {compact ? (
          <Skeleton shape="pill" className="h-9 w-28" />
        ) : (
          <>
            <span className="flex flex-col gap-1.5">
              <Skeleton shape="text" className="w-14" />
              <Skeleton shape="text" className="w-32" />
            </span>
            <Skeleton shape="pill" className="h-2 w-30" />
            <Skeleton shape="pill" className="h-9 w-24" />
          </>
        )}
      </div>
    );
  }

  if (plan.status === "error") {
    return (
      <p
        role="status"
        className={cn(
          "inline-flex h-9 items-center rounded-pill bg-surface px-3.5 text-xs font-semibold text-fg-muted",
          className,
        )}
      >
        {t("unavailable")}
      </p>
    );
  }

  const { capacity } = plan;
  const over = capacity.state === "over";
  const planned = format.duration(capacity.plannedMinutes);
  const total = format.duration(capacity.totalMinutes);
  const summary = t("planned", { planned, total });
  const chipText = over
    ? compact
      ? t("overloadedDetail", { planned, total })
      : t("overloaded")
    : t("free", { free: format.duration(capacity.freeMinutes) });

  // Keyed so the chip remounts and fades in when the state flips.
  const chip = (
    <span aria-live="polite" className="inline-flex">
      <Chip
        key={over ? "over" : "free"}
        size="lg"
        className={cn(
          over ? OVER_CHIP : FREE_CHIP,
          "animate-overlay-in motion-reduce:animate-none",
          compact ? "min-h-9" : "min-h-10",
        )}
        data-state={over ? "over" : "free"}
      >
        {chipText}
      </Chip>
    </span>
  );

  if (compact) return <div className={className}>{chip}</div>;

  return (
    <div
      role="group"
      aria-label={t("caption")}
      className={cn("flex h-14 items-center gap-2.5 rounded-pill bg-surface ps-4.5 pe-1.5", className)}
    >
      <span className="flex flex-col leading-tight">
        <span className="text-xs font-semibold text-fg-muted" aria-hidden="true">
          {t("caption")}
        </span>
        <span className="text-sm font-bold text-fg">{summary}</span>
      </span>
      <Progress
        value={Math.min(100, capacity.ratio * 100)}
        label={t("bar")}
        valueText={summary}
        className="w-30 shrink-0"
        indicatorClassName={over ? "bg-danger" : undefined}
      />
      {chip}
    </div>
  );
}
