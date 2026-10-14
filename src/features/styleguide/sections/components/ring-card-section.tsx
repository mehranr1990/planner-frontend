"use client";

import { Code, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { RingCard } from "@/design-system/surfaces/ring-card";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatNumber } from "@/lib/locale/digits";
import {
  ringEarnedToman,
  ringGoalHours,
  ringPeriods,
  ringTotalHours,
  type RingPeriodId,
} from "../../component-samples";
import { StyleguideSection } from "../../styleguide-section";

/** RingCard "Monthly focus" with bottom tabs (Cards board), static sample history. */
export function RingCardSection() {
  const t = useTranslations("Styleguide.components.ringCard");
  const { digits } = usePreferences();
  const [periodId, setPeriodId] = useState<RingPeriodId>("oct");
  const index = ringPeriods.findIndex((period) => period.id === periodId);
  const period = ringPeriods[index] ?? ringPeriods[ringPeriods.length - 1];

  const step = (delta: number) => {
    const next = ringPeriods[index + delta];
    if (next) setPeriodId(next.id);
  };

  return (
    <StyleguideSection id="ring-card" tier="specialized" span="half" title={t("title")} description={t("description")}>
      {/* The ring needs ~320px; below that the frame scrolls instead of the page. */}
      <div className="overflow-x-auto rounded-card bg-canvas p-2 sm:p-4">
        <RingCard
          title={t("cardTitle")}
          subtitle={t("subtitle", { goal: formatNumber(ringGoalHours, digits), month: t(`months.${period.id}`) })}
          value={period.hours}
          max={ringGoalHours}
          unit={t("unit")}
          ringLabel={t("ringLabel")}
          ringValueText={t("valueText", {
            value: formatNumber(period.hours, digits),
            goal: formatNumber(ringGoalHours, digits),
          })}
          onPrevious={() => step(-1)}
          onNext={() => step(1)}
          previousDisabled={index <= 0}
          nextDisabled={index >= ringPeriods.length - 1}
          stats={[
            { id: "total", icon: Code, value: ringTotalHours, label: t("totalHours") },
            {
              id: "earned",
              icon: Wallet,
              value: formatNumber(ringEarnedToman, digits, { notation: "compact", maximumFractionDigits: 1 }),
              label: t("earned"),
            },
          ]}
          periods={ringPeriods.map((item) => ({
            id: item.id,
            value: item.hours,
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
          details={<p className="type-body text-fg-secondary">{t("detailsBody")}</p>}
          className="min-w-fit"
        />
      </div>
    </StyleguideSection>
  );
}
