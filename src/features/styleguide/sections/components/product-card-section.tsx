"use client";

import { useTranslations } from "next-intl";
import { Progress } from "@/design-system/feedback/progress";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatNumber, formatPercent } from "@/lib/locale/digits";
import { PreviewFrame } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

const GOAL_PERCENT = 41;

/**
 * PRODUCT card (P00 "Card geometry · B"): the standard surface for repeated
 * or moderately dense content. Soft 28px rectangle, never a notch; the
 * board's goal sample with a linear progress bar.
 */
export function ProductCardSection() {
  const t = useTranslations("Styleguide.components.productCard");
  const { digits } = usePreferences();
  const km = (value: number) => t("distance", { value: formatNumber(value, digits) });
  const title = t("cardTitle", { target: km(100) });
  const percent = formatPercent(GOAL_PERCENT / 100, digits);

  return (
    <StyleguideSection id="product-card" span="half" tier="product" title={t("title")} description={t("description")}>
      <PreviewFrame label={t("caption")} contentClassName="p-4 sm:p-6">
        <ProductCard as="article" aria-label={title} className="min-h-48">
          <span className="type-label text-fg-muted">{t("kicker")}</span>
          <h3 className="text-[0.9375rem] font-bold">{title}</h3>
          <p className="text-xs font-semibold text-fg-muted">{t("meta", { percent, next: km(5) })}</p>
          <Progress value={GOAL_PERCENT} size="sm" label={t("progressLabel")} valueText={percent} className="mt-auto" />
        </ProductCard>
      </PreviewFrame>
    </StyleguideSection>
  );
}
