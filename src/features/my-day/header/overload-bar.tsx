"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";
import { blocksToMoveToTomorrow } from "../domain/capacity";
import { useMyDay } from "../my-day-context";
import { useMyDayFormat } from "../ui/use-my-day-format";
import { useDayPlan } from "./use-day-plan";

/*
 * The strip under an overloaded timeline: the rose "Overloaded · 9h 40m of 8h"
 * chip, an amber overlap count and "Move N to tomorrow". The button opens
 * Reschedule preselected on Tomorrow for the N lowest-priority task blocks
 * that bring the day back within its hours; the move itself (and its single
 * Undo) happens there. Renders nothing unless the day is over capacity.
 * `showSummary` false drops the rose chip (the phone header already shows it).
 */

export function OverloadBar({ className, showSummary = true }: { className?: string; showSummary?: boolean }) {
  const t = useTranslations("MyDay.capacity");
  const format = useMyDayFormat();
  const { day, openReschedule } = useMyDay();
  const plan = useDayPlan(day);

  if (plan.status !== "ready" || plan.capacity.state !== "over") return null;
  const { capacity, blocks, work } = plan;
  const movers = blocksToMoveToTomorrow(blocks, work.totalMinutes);

  return (
    <div role="status" className={cn("flex flex-wrap items-center gap-2", className)}>
      {showSummary ? (
        <Chip size="lg" className="bg-danger-soft text-danger-text">
          {t("overloadedDetail", {
            planned: format.duration(capacity.plannedMinutes),
            total: format.duration(capacity.totalMinutes),
          })}
        </Chip>
      ) : null}
      {capacity.overlapCount > 0 ? (
        <Chip size="lg" className="bg-warning-soft text-warning-text">
          {t("overlap", { count: capacity.overlapCount, countText: format.number(capacity.overlapCount) })}
        </Chip>
      ) : null}
      {movers.length > 0 ? (
        <Button
          variant="outline"
          size="sm"
          aria-haspopup="dialog"
          onClick={(event) =>
            openReschedule({ kind: "blocks", ids: movers.map((block) => block.id) }, event.currentTarget, {
              preselect: "tomorrow",
            })
          }
        >
          {t("moveToTomorrow", { countText: format.number(movers.length) })}
        </Button>
      ) : null}
    </div>
  );
}
