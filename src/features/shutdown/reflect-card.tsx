"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { EnergySwitch, MoodPicker } from "@/features/journal/ui/mood-picker";
import { moodKey } from "@/features/overview/ui/mood";
import { useTasksFormat } from "@/features/tasks/ui/use-tasks-format";
import type { Reflection } from "./use-shutdown";

/*
 * Step 3 · Reflect (P10): mood (five levels, a dot and a word, never an
 * emoji), energy (three, segmented), what went well and an optional note.
 * Saved as today's Journal entry when the day is finished.
 */

export function ReflectCard({
  today,
  value,
  onChange,
}: {
  today: string;
  value: Reflection;
  onChange(next: Reflection): void;
}) {
  const t = useTranslations("Shutdown.reflect");
  const format = useTasksFormat();

  return (
    <ProductCard as="section" id="shutdown-reflect" aria-labelledby="shutdown-reflect-title" className="gap-4 p-5 lg:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="shutdown-reflect-title" className="type-title text-fg">
          {t("title")}
        </h2>
        <p className="text-xs text-fg-muted">{t("savedTo", { date: format.dayMonth(today) })}</p>
      </div>

      <div className="flex flex-col gap-2">
        <p id="shutdown-mood-label" className="text-xs font-bold text-fg">
          {t("mood")}
        </p>
        <MoodPicker
          labelledBy="shutdown-mood-label"
          value={value.mood}
          onChange={(mood) => onChange({ ...value, mood })}
          levelLabel={(level) => t(`moodLevel.${moodKey(level)}`)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-bold text-fg">{t("energy")}</span>
        <EnergySwitch label={t("energy")} value={value.energy} onChange={(energy) => onChange({ ...value, energy })} levelLabel={(energy) => t(`energyLevel.${energy}`)} />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-fg">{t("wentWell")}</span>
        <Input
          dir="auto"
          value={value.wentWell}
          placeholder={t("wentWellPlaceholder")}
          onChange={(event) => onChange({ ...value, wentWell: event.target.value })}
        />
      </label>
      <Textarea
        dir="auto"
        rows={2}
        aria-label={t("note")}
        placeholder={t("note")}
        value={value.note}
        onChange={(event) => onChange({ ...value, note: event.target.value })}
      />
    </ProductCard>
  );
}
