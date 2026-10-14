"use client";

import { useTranslations } from "next-intl";
import { Progress } from "@/design-system/feedback/progress";
import { usePreferences } from "@/features/preferences/use-preferences";
import { convertDigits, formatNumber, formatPercent } from "@/lib/locale/digits";
import { formatCompactMoney, formatMoney } from "@/lib/locale/money";
import { SAMPLE_AMOUNT_TOMAN, SAMPLE_COMPACT_TOMAN, SAMPLE_NUMBER, SAMPLE_PROGRESS } from "../samples";
import { StyleguideSection } from "../styleguide-section";

function Sample({ label, value, lang }: { label: string; value: string; lang?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-tile bg-subtle p-4">
      <span className="text-xs font-semibold text-fg-muted">{label}</span>
      <span lang={lang} className="tabular break-words text-lg font-semibold">
        {value}
      </span>
    </div>
  );
}

export function NumbersSection() {
  const t = useTranslations("Styleguide.numbers");
  const { locale, digits, currency } = usePreferences();

  const rows = [
    { key: "number", value: formatNumber(SAMPLE_NUMBER, digits) },
    { key: "decimal", value: formatNumber(3.5, digits) },
    { key: "percent", value: formatPercent(0.45, digits) },
    {
      key: "invoice",
      value: t("invoiceText", {
        id: convertDigits(214, digits),
        current: convertDigits(3, digits),
        total: convertDigits(12, digits),
      }),
    },
    { key: "selected", value: formatMoney(SAMPLE_AMOUNT_TOMAN, { currency, digits, locale }) },
    // Chart labels (DataViz boards): the word follows the language, the digits the setting.
    {
      key: "compactToman",
      value: formatCompactMoney(SAMPLE_COMPACT_TOMAN, { currency: "toman", digits, locale, unit: true }),
    },
    {
      key: "compactRial",
      value: formatCompactMoney(SAMPLE_COMPACT_TOMAN, { currency: "rial", digits, locale, unit: true }),
    },
  ] as const;

  return (
    <StyleguideSection id="numbers" span="narrow" title={t("title")} description={t("description")}>
      <div className="grid grid-cols-2 gap-3">
        <Sample label={t("persianDigits")} value={formatNumber(SAMPLE_NUMBER, "fa")} lang="fa" />
        <Sample label={t("englishDigits")} value={formatNumber(SAMPLE_NUMBER, "latn")} lang="en" />
        <Sample label={t("toman")} value={formatMoney(SAMPLE_AMOUNT_TOMAN, { currency: "toman", digits, locale })} />
        <Sample label={t("rial")} value={formatMoney(SAMPLE_AMOUNT_TOMAN, { currency: "rial", digits, locale })} />
      </div>
      <dl className="flex flex-col divide-y divide-line">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
            <dt className="text-xs font-semibold text-fg-muted">{t(row.key)}</dt>
            <dd className="tabular text-sm font-semibold">{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between text-xs font-semibold">
          <span className="text-fg-muted">{t("progress")}</span>
          <span className="tabular">{formatPercent(SAMPLE_PROGRESS / 100, digits)}</span>
        </div>
        <Progress
          value={SAMPLE_PROGRESS}
          label={t("progress")}
          valueText={formatPercent(SAMPLE_PROGRESS / 100, digits)}
        />
      </div>
    </StyleguideSection>
  );
}
