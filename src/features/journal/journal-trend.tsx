"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsDesktop } from "@/components/ui/use-is-desktop";
import type { MoodEntry, MoodLevel } from "@/data/domain";
import { useMoods } from "@/data/queries";
import { MoodTerrain, type TerrainDay } from "@/design-system/data-display/mood-terrain";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { moodKey } from "@/features/overview/ui/mood";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useTasksFormat } from "@/features/tasks/ui/use-tasks-format";
import { addDaysToDay, dayToLocalDate } from "@/lib/dates/clock-time";
import { formatDate } from "@/lib/dates/format";
import { cn } from "@/lib/cn";
import { TERRAIN_DAYS, TERRAIN_MIN_CHECKINS } from "./domain/journal";
import { MOOD_DOT } from "./ui/mood-picker";

/*
 * One trend visual (P14): the compact Mood Terrain for the last seven days
 * ending on the shown day. Fewer than three check-ins: a row of mood dots
 * for the days there are, plus "appears after 3 check-ins" (no invented
 * terrain). Layered Area stays in Insights.
 */

export function JournalTrend({ day }: { day: string }) {
  const t = useTranslations("Journal.terrain");
  const tj = useTranslations("Journal");
  const format = useTasksFormat();
  const { direction, locale, digits, calendar } = usePreferences();
  const desktop = useIsDesktop();
  const from = addDaysToDay(day, -(TERRAIN_DAYS - 1));
  const query = useMoods(from, day);
  const moods: MoodEntry[] = query.data ?? [];
  const moodWord = (level: MoodLevel) => tj(`moodLevel.${moodKey(level)}`);

  const days: TerrainDay[] = Array.from({ length: TERRAIN_DAYS }, (_, index) => {
    const current = addDaysToDay(from, index);
    const entry = moods.find((item) => item.day === current);
    const date = dayToLocalDate(current);
    return {
      day: current,
      label: `${format.weekdayShort(current)} ${formatDate(date, "day", { calendar, locale, digits })}`,
      tipLabel: `${format.weekday(current)}, ${format.dayMonth(current)}`,
      mood: entry?.mood ?? null,
      energy: entry?.energy ?? null,
      weekend: date.getDay() === 5,
    };
  });
  const sparse = moods.length < TERRAIN_MIN_CHECKINS;

  return (
    <ProductCard as="section" aria-labelledby="journal-trend-title" className="flex flex-col gap-3" data-journal-trend={sparse ? "sparse" : "terrain"}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="journal-trend-title" className="type-title text-fg">
          {t("title")}
        </h2>
        <span className="text-xs font-semibold text-fg-muted">{t("range")}</span>
      </div>
      {query.isPending ? (
        <Skeleton className="h-48 rounded-tile" />
      ) : sparse ? (
        <div className="flex flex-col gap-3 py-2">
          <ol className="flex flex-wrap items-center gap-2" aria-label={t("title")}>
            {moods.map((entry) => (
              <li key={entry.day} className="flex items-center gap-1.5 rounded-pill bg-subtle px-2.5 py-1 text-xs font-semibold text-fg-secondary">
                <span aria-hidden className={cn("size-2.5 rounded-full", MOOD_DOT[entry.mood])} />
                {t("sparseDot", { day: format.weekdayShort(entry.day), mood: moodWord(entry.mood) })}
              </li>
            ))}
          </ol>
          <p className="text-sm text-fg-secondary">{t("sparse")}</p>
        </div>
      ) : (
        <MoodTerrain
          days={days}
          label={t("label")}
          direction={direction}
          compact={!desktop}
          moodLabel={moodWord}
          energyLabel={(energy) => tj(`energyLevel.${energy}`)}
          moodLine={(mood) => t("moodLine", { mood })}
          energyLine={(energy) => t("energyLine", { energy })}
        />
      )}
      <p className="text-[0.6875rem] text-fg-muted">{t("caption")}</p>
    </ProductCard>
  );
}
