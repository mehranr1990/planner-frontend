"use client";

import { Download, FileBarChart } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import { PillGroup } from "@/components/ui/pills";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { FinanceExportFormat, FinanceReportTotals } from "@/data/personal-services";
import { saveBlob, useFinanceReport } from "@/data/personal-services-queries";
import { useRepositories } from "@/data/provider";
import { DayField } from "@/features/goals/goal-sheet";
import { diffDays } from "@/lib/dates/clock-time";
import { budgetMonthOf, shiftMonth } from "@/features/finance/domain/finance";
import { useServiceError } from "./service-error";
import { useServiceFormat, type ServiceFormat } from "./use-service-format";

/*
 * Finance · Reports: the server's totals for a date range (this month,
 * last 3 months, last 12 months or custom; ≤ 366 days), one block per
 * currency, never converted or summed across currencies. Expense includes
 * fees; transfers and adjustments are shown apart. Export downloads the
 * range's finance transactions (CSV / JSON) — not a full account export.
 */

type Range = "month" | "quarter" | "year" | "custom";
const MAX_DAYS = 366;

function rangeOf(range: Exclude<Range, "custom">, today: string): { from: string; to: string } {
  const month = budgetMonthOf(today);
  const back = range === "month" ? 0 : range === "quarter" ? 2 : 11;
  return { from: shiftMonth(month, -back).start, to: today };
}

export function ReportsPanel({ today }: { today: string }) {
  const t = useTranslations("Services.reports");
  const format = useServiceFormat();
  const message = useServiceError();
  const { financeReports } = useRepositories();
  const [range, setRange] = useState<Range>("month");
  const [custom, setCustom] = useState(() => rangeOf("month", today));
  const [exporting, setExporting] = useState<FinanceExportFormat | null>(null);
  const { from, to } = range === "custom" ? custom : rangeOf(range, today);
  const days = diffDays(from, to) + 1;
  const validRange = days >= 1 && days <= MAX_DAYS;
  const report = useFinanceReport(from, to, validRange);

  const download = async (kind: FinanceExportFormat) => {
    setExporting(kind);
    try {
      const file = await financeReports.exportFile(from, to, kind);
      saveBlob(file.blob, file.filename);
      toast({ tone: "success", title: t("exported") });
    } catch (error) {
      toast({ tone: "danger", title: message(error) });
    } finally {
      setExporting(null);
    }
  };

  const empty = report.data?.postingCount === 0;

  return (
    <div className="flex flex-col gap-4" data-finance-reports>
      <div className="flex flex-col gap-3">
        <PillGroup<Range>
          label={t("range")}
          value={range}
          onValueChange={setRange}
          options={(["month", "quarter", "year", "custom"] as const).map((value) => ({ value, label: t(`ranges.${value}`) }))}
        />
        {range === "custom" ? (
          <div className="flex flex-wrap gap-3">
            <DayField label={t("from")} emptyLabel={t("from")} value={custom.from} onChange={(day) => day && setCustom((current) => ({ ...current, from: day }))} />
            <DayField label={t("to")} emptyLabel={t("to")} value={custom.to} onChange={(day) => day && setCustom((current) => ({ ...current, to: day }))} />
          </div>
        ) : null}
        <p className="text-xs text-fg-muted" aria-live="polite">
          {t("window", { from: format.day(from), to: format.day(to) })}
        </p>
      </div>
      {!validRange ? (
        <p role="alert" className="text-sm font-semibold text-danger-text">
          {t("badRange", { max: format.number(MAX_DAYS) })}
        </p>
      ) : report.isPending ? (
        <LoadingState>
          <Skeleton className="h-32 rounded-card" />
        </LoadingState>
      ) : report.isError ? (
        <ErrorState variant="bare" title={t("loadError")} description={message(report.error)} onRetry={() => void report.refetch()} />
      ) : empty ? (
        <EmptyState variant="bare" icon={FileBarChart} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <>
          <p className="text-xs text-fg-muted">{t("postings", { count: report.data.postingCount, formatted: format.number(report.data.postingCount) })}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {report.data.currencies.map((totals) => (
              <CurrencyTotals key={totals.currency} totals={totals} format={format} />
            ))}
          </div>
          <p className="text-xs text-fg-muted">{t("definitions")}</p>
        </>
      )}
      <section aria-labelledby="finance-export-title" className="flex flex-col gap-2 rounded-tile bg-subtle p-3">
        <h3 id="finance-export-title" className="text-sm font-bold text-fg">
          {t("exportTitle")}
        </h3>
        <p className="text-xs text-fg-secondary">{t("exportHint")}</p>
        <div className="flex flex-wrap gap-2">
          {(["csv", "json"] as const).map((kind) => (
            <Button key={kind} size="sm" variant="secondary" disabled={!validRange || empty || exporting !== null} loading={exporting === kind} onClick={() => void download(kind)}>
              <Download aria-hidden="true" size={16} />
              {t(`export.${kind}`)}
            </Button>
          ))}
        </div>
        {empty ? <p className="text-xs text-fg-muted">{t("exportEmpty")}</p> : null}
      </section>
    </div>
  );
}

function CurrencyTotals({ totals, format }: { totals: FinanceReportTotals; format: ServiceFormat }) {
  const t = useTranslations("Services.reports");
  const income = Math.abs(Number(totals.income));
  const expense = Math.abs(Number(totals.expense));
  const max = Math.max(income, expense, 1);
  const rows: { key: Exclude<keyof FinanceReportTotals, "currency" | "net">; bar?: number }[] = [
    { key: "income", bar: income / max },
    { key: "expense", bar: expense / max },
    { key: "fees" },
    { key: "transferIn" },
    { key: "transferOut" },
    { key: "adjustments" },
  ];
  return (
    <section aria-label={t("currencyBlock", { currency: totals.currency })} className="flex flex-col gap-2 rounded-tile bg-surface p-3 inset-ring inset-ring-line">
      <dl className="flex flex-col gap-2">
        {rows.map(({ key, bar }) => (
          <div key={key} className="flex flex-col gap-1">
            <div className="flex justify-between gap-3 text-sm">
              <dt className="text-fg-secondary">{t(`totals.${key}`)}</dt>
              <dd className="font-semibold tabular">{format.money(totals[key], totals.currency)}</dd>
            </div>
            {bar !== undefined ? (
              <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-pill bg-subtle">
                <div className={key === "income" ? "h-full rounded-pill bg-scope-deep" : "h-full rounded-pill bg-fg-muted"} style={{ inlineSize: `${Math.round(bar * 100)}%` }} />
              </div>
            ) : null}
          </div>
        ))}
        <div className="flex justify-between gap-3 border-t border-line pt-2 text-sm">
          <dt className="font-bold">{t("totals.net")}</dt>
          <dd className="font-bold tabular">{format.money(totals.net, totals.currency)}</dd>
        </div>
      </dl>
    </section>
  );
}
