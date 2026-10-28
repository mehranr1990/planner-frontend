"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { FINANCE_CATEGORIES, type FinanceCategory, type FinanceMonth, type Transaction } from "@/data/domain";
import { useFinanceMonthDetail, useTransactions } from "@/data/queries";
import { BudgetFlow } from "@/design-system/data-display/budget-flow";
import { BudgetRiver } from "@/design-system/data-display/budget-river";
import { usePreferences } from "@/features/preferences/use-preferences";
import { overBudget, riverData, riverPeak, shiftMonth, SPARSE_BELOW, withForecast, type BudgetMonthRef, type RiverPeriod } from "./domain/finance";
import { categoryColor, useFinanceFormat } from "./use-finance-format";

/*
 * Finance · Trends (Budget River) and Breakdown (Budget Flow) tabs (P13).
 * Each chart answers one written question and ends in an observation. They
 * never share a screen. A sparse month (< 5 transactions) shows the numbers
 * instead of a shape — no fake data.
 */

function ChartHead({ title, caption, control }: { title: string; caption: string; control?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="text-base font-bold text-fg">{title}</h2>
        <p className="text-xs font-semibold text-fg-muted">{caption}</p>
      </div>
      {control}
    </div>
  );
}

/** Sparse month: the numbers per category, and a plain note. */
function SparseNumbers({ month }: { month: FinanceMonth }) {
  const t = useTranslations("Finance");
  const format = useFinanceFormat();
  return (
    <div className="flex flex-col gap-3" data-finance-sparse>
      <div role="note" className="rounded-field bg-subtle px-4 py-3">
        <p className="text-sm font-bold text-fg">{t("sparse.title")}</p>
        <p className="text-xs text-fg-secondary">{t("sparse.body")}</p>
      </div>
      <ul className="flex flex-col">
        {month.categories
          .filter((item) => item.spentToman > 0)
          .map((item) => (
            <li key={item.category} className="flex items-center gap-3 px-2 py-2 text-sm">
              <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: categoryColor(item.category) }} />
              <span className="flex-1 font-semibold text-fg">{t(`categories.${item.category}`)}</span>
              <span className="tabular font-bold text-fg">{format.amount(item.spentToman)}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}

export function TrendsPanel({ month, monthRef, today, compact }: { month: FinanceMonth; monthRef: BudgetMonthRef; today: string; compact: boolean }) {
  const t = useTranslations("Finance");
  const format = useFinanceFormat();
  const { direction } = usePreferences();
  const [period, setPeriod] = useState<RiverPeriod>("month");
  const from = period === "month" ? monthRef.start : shiftMonth(monthRef, -2).start;
  const query = useTransactions(from, monthRef.end);
  const sparse = month.transactionCount < SPARSE_BELOW;

  const control = sparse ? undefined : (
    <Segmented
      label={t("trends.period")}
      value={period}
      onValueChange={setPeriod}
      options={[
        { value: "month", label: t("trends.month") },
        { value: "quarter", label: t("trends.quarter") },
      ]}
    />
  );
  return (
    <section aria-label={t("tabs.trends")} className="flex flex-col gap-4">
      <ChartHead
        title={period === "month" ? t("trends.question", { month: format.monthName(month.start) }) : t("trends.questionRange")}
        caption={t("trends.caption", { unit: period === "month" ? "daily" : "weekly" })}
        control={control}
      />
      {sparse ? (
        <SparseNumbers month={month} />
      ) : query.isPending ? (
        <Skeleton className="h-64 rounded-card" />
      ) : (
        <River transactions={query.data ?? []} month={month} monthRef={monthRef} period={period} today={today} compact={compact} direction={direction} />
      )}
    </section>
  );
}

function River({
  transactions,
  month,
  monthRef,
  period,
  today,
  compact,
  direction,
}: {
  transactions: readonly Transaction[];
  month: FinanceMonth;
  monthRef: BudgetMonthRef;
  period: RiverPeriod;
  today: string;
  compact: boolean;
  direction: "ltr" | "rtl";
}) {
  const t = useTranslations("Finance");
  const format = useFinanceFormat();
  const raw = riverData(transactions, monthRef, period, today);
  const data = period === "month" ? withForecast(raw) : raw;
  const peak = riverPeak(raw);
  const over = overBudget(month);
  const name = (category: FinanceCategory) => t(`categories.${category}`);
  const total = FINANCE_CATEGORIES.reduce((sum, category) => sum + raw.values[category].slice(0, raw.todayIndex + 1).reduce((a, b) => a + b, 0), 0);
  const largest = [...FINANCE_CATEGORIES].sort((a, b) => raw.values[b].reduce((x, y) => x + y, 0) - raw.values[a].reduce((x, y) => x + y, 0))[0]!;
  const { locale } = usePreferences();
  const pointLabel = (day: string) => (period === "month" ? `${format.weekdayShort(day)}${locale === "fa" ? "،" : ","} ${format.dayMonth(day)}` : format.dayMonth(day));
  const pace = over.length === 0 ? t("trends.paceNone") : over.length === 1 ? t("trends.paceOne", { category: name(over[0]!) }) : t("trends.paceMany", { count: format.number(over.length) });

  return (
    <>
      <BudgetRiver
        key={period}
        series={FINANCE_CATEGORIES.map((category) => ({ id: category, label: name(category), color: categoryColor(category), values: data.values[category] }))}
        points={data.points.map(pointLabel)}
        todayIndex={data.todayIndex}
        label={t("trends.summary", { total: format.compact(total), category: name(largest) })}
        legendLabel={t("trends.legend")}
        formatValue={format.compact}
        topText={(category, amount) => t("trends.top", { category, amount })}
        forecastLabel={data.todayIndex < data.points.length - 1 ? t("trends.forecast") : undefined}
        direction={direction}
        compact={compact}
        smoothing={period === "month" ? 2 : 0}
      />
      {peak ? (
        <p className="flex items-start gap-2 rounded-field bg-subtle px-4 py-3 text-xs font-semibold text-fg" data-finance-observation>
          <Sparkles aria-hidden="true" size={14} className="mt-0.5 shrink-0 text-scope-deep" />
          {t("trends.observation", { day: format.dayMonth(raw.points[peak.index]!), category: name(peak.category), pace })}
        </p>
      ) : null}
    </>
  );
}

export function BreakdownPanel({ month, monthRef, compact }: { month: FinanceMonth; monthRef: BudgetMonthRef; compact: boolean }) {
  const t = useTranslations("Finance");
  const format = useFinanceFormat();
  const { direction } = usePreferences();
  const previous = shiftMonth(monthRef, -1);
  const [which, setWhich] = useState<"current" | "previous">("current");
  const other = useFinanceMonthDetail(previous.start);
  const shown = which === "current" ? month : other.data;

  return (
    <section aria-label={t("tabs.breakdown")} className="flex flex-col gap-4">
      <ChartHead
        title={t("breakdown.question")}
        caption={t("breakdown.caption")}
        control={
          <Segmented
            label={t("breakdown.compare")}
            value={which}
            onValueChange={setWhich}
            options={[
              { value: "current", label: format.monthName(monthRef.start) },
              { value: "previous", label: format.monthName(previous.start) },
            ]}
          />
        }
      />
      {!shown ? (
        <Skeleton className="h-80 rounded-card" />
      ) : shown.transactionCount < SPARSE_BELOW ? (
        <SparseNumbers month={shown} />
      ) : (
        (() => {
          const rows = shown.categories
            .filter((item) => item.spentToman > 0)
            .sort((a, b) => b.spentToman - a.spentToman)
            .map((item) => ({ id: item.category, label: t(`categories.${item.category}`), color: categoryColor(item.category), value: item.spentToman }));
          const income = Math.max(shown.incomeToman, shown.spentToman);
          return (
            <BudgetFlow
              key={shown.start}
              income={income}
              rows={rows}
              label={t("breakdown.summary", {
                spent: format.compact(shown.spentToman),
                income: format.compact(shown.incomeToman),
                remaining: format.compact(Math.max(0, shown.incomeToman - shown.spentToman)),
              })}
              remainingLabel={t("breakdown.remaining")}
              formatValue={format.compact}
              formatShare={format.percent}
              remainingShare={(ratio) => t("breakdown.remainingShare", { percent: format.percent(ratio) })}
              direction={direction}
              compact={compact}
            />
          );
        })()
      )}
    </section>
  );
}
