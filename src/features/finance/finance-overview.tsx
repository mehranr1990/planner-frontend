"use client";

import { Check, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FinanceMonth, Transaction, UpcomingBill } from "@/data/domain";
import { MetricGroup, MetricTile } from "@/design-system/surfaces/metric-tile";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { cn } from "@/lib/cn";
import { budgetPace } from "./domain/finance";
import { BillRow, TransactionRow } from "./finance-rows";
import { categoryColor, useFinanceFormat } from "./use-finance-format";

/*
 * Finance · Overview tab (P13): fast answers. The balance summary is the
 * signature card (its notch = Add expense); the KPI family below shares one
 * quiet geometry; budget vs actual is number + linear bar per category (an
 * over-budget bar gets a rose end marker and says so in text); then the
 * upcoming payments and the latest transactions. The pace note is neutral.
 */

export function FinanceOverview({
  month,
  today,
  bills,
  recent,
  transactionsHref,
  onAdd,
}: {
  month: FinanceMonth;
  today: string;
  bills: readonly UpcomingBill[];
  recent: readonly Transaction[];
  transactionsHref: string;
  onAdd(): void;
}) {
  const t = useTranslations("Finance");
  const format = useFinanceFormat();
  const pace = budgetPace(month, today);
  const budget = month.budgetToman;
  const daysLeft = pace && !pace.closed ? month.daysInMonth - pace.day : null;
  const left = budget !== null ? budget - month.spentToman : null;
  const goal = month.savingsGoalToman;

  return (
    <div className="flex flex-col gap-5">
      <SignatureCard
        as="section"
        tone="scope-soft"
        aria-labelledby="finance-balance-title"
        action={<SignatureCardAction icon={Plus} label={t("add")} onClick={onAdd} />}
        contentClassName="flex flex-col gap-3"
      >
        <h2 id="finance-balance-title" className="text-[0.6875rem] font-bold uppercase tracking-wide text-scope-deep">
          {t("balance.eyebrow")}
        </h2>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="tabular text-[2.25rem] font-semibold leading-none text-fg lg:text-[3rem]">{format.amount(month.balanceToman)}</span>
          <span className="text-sm font-semibold text-scope-deep">{format.unit}</span>
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs font-bold">
          <span className="text-fg">
            {budget !== null
              ? t("balance.spent", { spent: format.compact(month.spentToman), budget: format.compact(budget) })
              : t("balance.noBudget", { spent: format.compact(month.spentToman) })}
          </span>
          {pace ? (
            <span className="font-semibold text-fg-secondary">
              {pace.closed
                ? t("balance.closed")
                : t("balance.position", { day: format.number(pace.day), days: format.number(month.daysInMonth), expected: format.compact(pace.expected) })}
            </span>
          ) : null}
        </div>
        {pace ? (
          <>
            <div
              role="progressbar"
              aria-label={t("balance.barLabel")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.min(1, pace.ratio) * 100)}
              aria-valuetext={t("balance.barText", { percent: format.percent(pace.ratio), expected: format.percent(pace.expectedRatio) })}
              className="relative h-2.5 rounded-pill bg-surface/70"
            >
              <span className="absolute inset-y-0 start-0 rounded-pill bg-scope-deep transition-[width] duration-(--motion-standard)" style={{ width: `${Math.min(1, pace.ratio) * 100}%` }} />
              {pace.closed ? null : (
                <span aria-hidden="true" data-slot="expected-marker" className="absolute -inset-y-1 w-0.5 rounded-pill bg-fg" style={{ insetInlineStart: `${pace.expectedRatio * 100}%` }} />
              )}
            </div>
            {pace.closed ? null : (
              <p className="text-[0.6875rem] font-semibold text-scope-deep">
                {Math.abs(pace.diff) < 1_000
                  ? t("balance.onPace")
                  : pace.diff < 0
                    ? t("balance.under", { amount: format.compact(-pace.diff) })
                    : t("balance.over", { amount: format.compact(pace.diff) })}
              </p>
            )}
          </>
        ) : null}
      </SignatureCard>

      <MetricGroup aria-label={t("kpi.label")} columns={4}>
        <MetricTile label={t("kpi.income")} value={format.compact(month.incomeToman)} hint={format.monthName(month.start)} />
        <MetricTile
          label={t("kpi.spent")}
          value={format.compact(month.spentToman)}
          hint={budget ? t("kpi.spentHint", { percent: format.percent(month.spentToman / budget) }) : t("kpi.noBudget")}
        />
        <MetricTile
          label={t("kpi.saved")}
          value={format.compact(month.savedToman)}
          hint={
            goal ? (
              month.savedToman >= goal ? (
                <span className="inline-flex items-center gap-1">
                  {t("kpi.goalReached", { amount: format.compact(goal) })}
                  <Check aria-hidden="true" size={12} />
                </span>
              ) : (
                t("kpi.savedGoal", { amount: format.compact(goal) })
              )
            ) : undefined
          }
        />
        <MetricTile
          label={t("kpi.left")}
          value={left !== null ? format.compact(Math.max(0, left)) : "—"}
          hint={left === null ? t("kpi.noBudget") : daysLeft !== null ? t("kpi.leftDays", { days: daysLeft, daysText: format.number(daysLeft) }) : undefined}
        />
      </MetricGroup>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="finance-budgets-title" className="flex min-w-0 flex-col gap-3">
          <h2 id="finance-budgets-title" className="text-sm font-bold text-fg">
            {t("budgets.title")}
          </h2>
          <ul className="flex flex-col gap-2.5">
            {month.categories.map((item) => {
              const over = item.budgetToman !== null && item.spentToman > item.budgetToman;
              const ratio = item.budgetToman ? Math.min(1, item.spentToman / item.budgetToman) : 0;
              const value =
                item.budgetToman !== null
                  ? t("budgets.value", { spent: format.compact(item.spentToman), budget: format.compact(item.budgetToman) })
                  : t("budgets.noBudget", { spent: format.compact(item.spentToman) });
              return (
                <li key={item.category} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 text-xs font-semibold" data-budget={item.category} data-over={over || undefined}>
                  <span className="truncate text-fg">{t(`categories.${item.category}`)}</span>
                  <span aria-hidden="true" className="relative h-2 rounded-pill bg-raised">
                    <span className="absolute inset-y-0 start-0 rounded-pill" style={{ width: `${ratio * 100}%`, background: categoryColor(item.category) }} />
                    {over ? <span className="absolute -inset-y-1 end-0 w-1 rounded-pill bg-danger" /> : null}
                  </span>
                  <span className={cn("tabular text-end", over ? "font-bold text-danger-text" : "text-fg-secondary")}>
                    {value}
                    {over ? <span className="sr-only"> · {t("budgets.over")}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="finance-bills-title" className="flex flex-col gap-3">
            <h2 id="finance-bills-title" className="text-sm font-bold text-fg">
              {t("bills.title")}
            </h2>
            {bills.length ? (
              <ul className="flex flex-col gap-2">
                {bills.slice(0, 3).map((bill) => (
                  <BillRow key={`${bill.title}-${bill.dueDay}`} bill={bill} today={today} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-secondary">{t("bills.empty")}</p>
            )}
          </section>
          <section aria-labelledby="finance-recent-title" className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h2 id="finance-recent-title" className="text-sm font-bold text-fg">
                {t("recent.title")}
              </h2>
              <Link href={transactionsHref} scroll={false} className="text-xs font-bold text-fg underline underline-offset-4 hover:text-scope-deep focus-visible:focus-ring">
                {t("recent.all")}
              </Link>
            </div>
            {recent.length ? (
              <ul className="flex flex-col">
                {recent.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} today={today} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-secondary">{t("recent.empty")}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
