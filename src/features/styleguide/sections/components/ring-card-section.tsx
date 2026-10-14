"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { RingCard } from "@/design-system/surfaces/ring-card";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatTime } from "@/lib/dates/format";
import { formatNumber, formatPercent } from "@/lib/locale/digits";
import { ringBestStreak, ringPages, ringPeriods, ringReminder, type RingPeriodId } from "../../component-samples";
import { StyleguideSection } from "../../styleguide-section";

const DETAIL_ROWS = ["frequency", "target", "reminder", "bestStreak"] as const;

/**
 * D′ · RingCard (P00CardsTabs "Ring card with bottom tabs"): the Habit ring
 * card, FolderTabsCard `bottom-even` underneath. Static sample history; the
 * arrows and the month selector step through it.
 */
export function RingCardSection() {
  const t = useTranslations("Styleguide.components.ringCard");
  const preferences = usePreferences();
  const { digits } = preferences;
  const [periodId, setPeriodId] = useState<RingPeriodId>("mehr");
  const index = ringPeriods.findIndex((period) => period.id === periodId);
  const period = ringPeriods[index] ?? ringPeriods[ringPeriods.length - 1];
  const percent = (value: number) => formatPercent(value / 100, digits);

  const step = (delta: number) => {
    const next = ringPeriods[index + delta];
    if (next) setPeriodId(next.id);
  };

  const details: Record<(typeof DETAIL_ROWS)[number], string> = {
    frequency: t("detailRows.daily"),
    target: t("detailRows.pages", { count: formatNumber(ringPages, digits) }),
    reminder: formatTime(ringReminder, preferences),
    bestStreak: t("detailRows.days", { count: formatNumber(ringBestStreak, digits) }),
  };

  return (
    <StyleguideSection id="ring-card" tier="specialized" span="narrow" title={t("title")} description={t("description")}>
      {/* The ring needs ~320px; below that the frame scrolls instead of the page. */}
      <div className="overflow-x-auto rounded-card bg-canvas p-2 sm:p-4">
        <RingCard
          title={t("cardTitle", { count: formatNumber(ringPages, digits) })}
          subtitle={t("subtitle", { month: t(`months.${period.id}`) })}
          value={period.completion}
          max={100}
          displayValue={percent(period.completion)}
          unit={t("unit")}
          ringLabel={t("ringLabel")}
          ringValueText={t("valueText", { value: percent(period.completion) })}
          onPrevious={() => step(-1)}
          onNext={() => step(1)}
          previousDisabled={index <= 0}
          nextDisabled={index >= ringPeriods.length - 1}
          periods={ringPeriods.map((item) => ({
            id: item.id,
            value: percent(item.completion),
            label: t(`months.${item.id}`),
          }))}
          selectedPeriod={period.id}
          onPeriodChange={(id) => {
            const match = ringPeriods.find((item) => item.id === id);
            if (match) setPeriodId(match.id);
          }}
          periodsLabel={t("periodsLabel")}
          historyLabel={t("history")}
          detailsLabel={t("details")}
          tabsLabel={t("tabsLabel")}
          details={
            <dl className="flex flex-col gap-2 text-xs">
              {DETAIL_ROWS.map((row) => (
                <div key={row} className="flex items-baseline gap-2.5">
                  <dt className="w-24 shrink-0 font-semibold text-fg-secondary">{t(`detailRows.${row}`)}</dt>
                  <dd className="font-bold tabular">{details[row]}</dd>
                </div>
              ))}
            </dl>
          }
          className="min-w-fit"
        />
      </div>
    </StyleguideSection>
  );
}
