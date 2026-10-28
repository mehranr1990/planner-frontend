"use client";

import { useTranslations } from "next-intl";
import { Segmented } from "@/components/ui/segmented";
import type { EnergyLevel } from "@/data/domain";
import { cn } from "@/lib/cn";
import { useMyDay } from "../my-day-context";

/*
 * "Energy today" (P02 header): a white capsule holding the caption and the
 * Low / Medium / High segmented control. It re-orders the Unscheduled
 * suggestions; the selected level lives in the My Day context.
 */

export function EnergySelector({ className }: { className?: string }) {
  const t = useTranslations("MyDay.header.energy");
  const { energy, setEnergy } = useMyDay();
  const levels: readonly EnergyLevel[] = ["low", "medium", "high"];

  return (
    <div className={cn("inline-flex h-14 items-center rounded-pill bg-surface ps-4", className)}>
      <span className="pe-1 text-xs font-semibold text-fg-muted" aria-hidden="true">
        {t("caption")}
      </span>
      <Segmented<EnergyLevel>
        label={t("group")}
        value={energy}
        onValueChange={setEnergy}
        options={levels.map((level) => ({ value: level, label: t(level) }))}
        className="bg-transparent"
      />
    </div>
  );
}
