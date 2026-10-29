"use client";

import { Bell, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { useFinanceMonth } from "@/data/queries";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { usePreferences } from "@/features/preferences/use-preferences";
import { dayToLocalDate, diffDays } from "@/lib/dates/clock-time";
import { formatDate } from "@/lib/dates/format";
import { formatNumber } from "@/lib/locale/digits";
import { currencyLabel, formatCompactMoney, tomanToRial } from "@/lib/locale/money";
import { cn } from "@/lib/cn";
import { CardError, CardHead, CardLoading } from "../ui/card-parts";

/*
 * Finance (P01 → Finance): spent this month against the budget, as number +
 * linear bar with an "expected by today" marker (day N of the month) — no
 * Budget River here. Amounts are held in Toman and shown in the chosen
 * currency (Rial = ×10). The next bill sits underneath.
 */

export function FinanceCard({ today, className }: { today: string; className?: string }) {
  const t = useTranslations("Overview.finance");
  const format = useMyDayFormat();
  const { locale, digits, calendar, currency } = usePreferences();
  const query = useFinanceMonth(today);
  // Settings › Privacy: a locked Finance never shows amounts here.
  const locked = usePlannerSettings().privacy.financeLock;
  const month = query.data;

  const amount = (toman: number) => formatNumber(currency === "rial" ? tomanToRial(toman) : toman, digits, { maximumFractionDigits: 0 });

  return (
    <ProductCard as="section" aria-labelledby="overview-finance-title" className={cn("flex flex-col gap-2", className)}>
      <CardHead id="overview-finance-title" title={t("title")} aside={currencyLabel(currency, locale)} />
      {locked ? (
        <p role="status" data-finance-locked className="flex items-center gap-2 rounded-field bg-subtle p-4 text-sm font-semibold text-fg-secondary">
          <Icon icon={Lock} size={14} />
          {t("locked")}
        </p>
      ) : query.isPending ? (
        <CardLoading rows={2} />
      ) : query.isError ? (
        <CardError onRetry={() => void query.refetch()} />
      ) : !month ? (
        <p role="status" className="rounded-field bg-subtle p-4 text-sm text-fg-secondary">
          {t("empty")}
        </p>
      ) : (
        (() => {
          const ratio = month.budgetToman > 0 ? month.spentToman / month.budgetToman : 0;
          const expected = month.dayOfMonth / month.daysInMonth;
          const over = ratio > 1;
          const ahead = !over && ratio > expected;
          const monthName = formatDate(dayToLocalDate(month.monthStart), "monthYear", { locale, digits, calendar }).split(" ")[0]!;
          const bill = month.nextBill;
          const billIn = bill ? diffDays(today, bill.dueDay) : 0;
          return (
            <>
              <p className="text-sm text-fg-muted">{t("spentIn", { month: monthName })}</p>
              <p className="tabular text-[1.875rem] font-semibold leading-none">{amount(month.spentToman)}</p>
              <div className="flex items-baseline justify-between gap-2 text-[0.6875rem] font-semibold text-fg-muted">
                <span>{t("budget", { amount: formatCompactMoney(month.budgetToman, { currency, digits, locale }) })}</span>
                <span className={cn(over && "text-danger-text", ahead && "text-warning-text")}>
                  {over ? t("over") : null}
                  {over ? " · " : null}
                  {t("position", {
                    percent: format.percent(ratio),
                    day: format.number(month.dayOfMonth),
                    days: format.number(month.daysInMonth),
                  })}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={t("barLabel")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(Math.min(1, ratio) * 100)}
                aria-valuetext={t("barText", { percent: format.percent(ratio), expected: format.percent(expected) })}
                className="relative my-1 h-2 rounded-pill bg-hairline"
              >
                <span
                  className={cn("absolute inset-y-0 start-0 rounded-pill", over ? "bg-danger" : "bg-scope-deep")}
                  style={{ width: `${Math.min(1, ratio) * 100}%` }}
                />
                <span
                  aria-hidden
                  data-slot="expected-marker"
                  className="absolute -inset-y-[3px] w-0.5 -ms-px rounded-pill bg-fg"
                  style={{ insetInlineStart: `${Math.min(1, expected) * 100}%` }}
                />
              </div>
              {bill ? (
                <div className="mt-1 flex items-center gap-2 rounded-field bg-subtle px-3 py-2.5 text-sm">
                  <span className="grid size-7.5 shrink-0 place-items-center rounded-full bg-warning-soft text-warning-text">
                    <Icon icon={Bell} size={14} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <bdi dir="auto">{bill.title}</bdi> · <span className="tabular">{amount(bill.amountToman)}</span>
                  </span>
                  <span className="shrink-0 text-xs text-fg-muted">{t("billIn", { days: billIn, daysText: format.number(billIn) })}</span>
                </div>
              ) : null}
            </>
          );
        })()
      )}
    </ProductCard>
  );
}
