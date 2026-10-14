"use client";

import { useTranslations } from "next-intl";
import { MetricGroup, MetricTile } from "@/design-system/surfaces/metric-tile";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatDuration } from "@/lib/dates/format";
import { formatNumber, formatPercent } from "@/lib/locale/digits";
import { StyleguideSection } from "../../styleguide-section";

/**
 * MetricTile family (P00 "Related family"): one shared geometry, never a
 * notch per tile. The board's weekly KPIs, in the preferred digits.
 */
export function MetricTilesSection() {
  const t = useTranslations("Styleguide.components.metricTiles");
  const preferences = usePreferences();
  const { digits } = preferences;
  const hours = (value: number) => formatDuration(value * 60, preferences);

  return (
    <StyleguideSection id="metric-tiles" tier="utility" title={t("title")} description={t("description")}>
      <figure className="flex min-w-0 flex-col gap-2">
        <div className="rounded-tile border border-line bg-surface p-4">
          <MetricGroup aria-label={t("label")}>
            <MetricTile label={t("focusHours")} value={hours(21)} hint={t("focusHint", { hours: hours(3) })} />
            <MetricTile
              label={t("tasksCompleted")}
              value={formatNumber(31, digits)}
              hint={t("tasksHint", { total: formatNumber(40, digits) })}
            />
            <MetricTile
              label={t("onTime")}
              value={formatPercent(0.82, digits)}
              hint={t("onTimeHint", { points: formatNumber(6, digits) })}
            />
            <MetricTile label={t("mood")} value={t("moodValue")} hint={t("moodHint")} />
          </MetricGroup>
        </div>
        <figcaption className="type-caption text-fg-muted">{t("caption")}</figcaption>
      </figure>
    </StyleguideSection>
  );
}
