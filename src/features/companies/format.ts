"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import type { CompanyCurrency } from "@/data/company-domain";
import { useProjectFormat } from "@/features/projects/format";
import { formatCompactNumber, formatNumber } from "@/lib/locale/digits";

/*
 * Company number formats (README rule 4): one currency per company, exact
 * integer amounts — never rounded — with tabular digits in tables; the short
 * form (B / M, میلیارد / میلیون) only in summary tiles. Persian digits use the
 * Persian thousands separator (٬) through Intl.
 */
export function useCompanyFormat(currency: CompanyCurrency | null) {
  const base = useProjectFormat();
  const t = useTranslations("Company.currency");
  const { digits, locale } = base;
  // Live mode has no company currency: amounts show without a unit.
  const unit = currency ? t(currency) : "";
  /** Exact: 180000000 → "180,000,000 T" / "۱۸۰٬۰۰۰٬۰۰۰ تومان". */
  const money = useCallback(
    (amount: number) => (unit ? `${formatNumber(amount, digits, { maximumFractionDigits: 0 })}\u00a0${unit}` : formatNumber(amount, digits, { maximumFractionDigits: 0 })),
    [digits, unit],
  );
  /** Exact number without the unit (table cells under a unit header). */
  const amount = useCallback((value: number) => formatNumber(value, digits, { maximumFractionDigits: 0 }), [digits]);
  /** Tiles only: 38_400_000_000 → "38.4B" / "۳۸٫۴ میلیارد". */
  const short = useCallback(
    (value: number) => formatCompactNumber(value, { locale, digits, maximumFractionDigits: 1 }),
    [locale, digits],
  );
  return { ...base, money, amount, short, unit };
}
