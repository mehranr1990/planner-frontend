"use client";

import { useTranslations } from "next-intl";
import { UtilityCard, UtilityField } from "@/design-system/surfaces/utility-card";
import { PreviewFrame } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

/**
 * UTILITY card (P00 "Card geometry · C"): filters, form groups, settings
 * groups. Quiet subtle surface, 20px radius, 48px field rows, no notch.
 * The rows are illustrative (no real filter behind them).
 */
export function UtilityCardSection() {
  const t = useTranslations("Styleguide.components.utilityCard");

  return (
    <StyleguideSection id="utility-card" span="half" tier="utility" title={t("title")} description={t("description")}>
      <PreviewFrame label={t("caption")} contentClassName="bg-surface p-4 sm:p-6">
        <UtilityCard as="section" aria-label={t("label")} className="min-h-48">
          <span className="type-label text-fg-muted">{t("kicker")}</span>
          <UtilityField>{t("filter")}</UtilityField>
          <UtilityField>{t("groupBy")}</UtilityField>
        </UtilityCard>
      </PreviewFrame>
    </StyleguideSection>
  );
}
