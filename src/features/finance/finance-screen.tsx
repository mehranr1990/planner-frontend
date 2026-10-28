"use client";

import { ChevronLeft, ChevronRight, Lock, Plus, Wallet } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useIsDesktop } from "@/components/ui/use-is-desktop";
import type { FinanceMonth } from "@/data/domain";
import { useFinanceMonthDetail, useSetBudget, useTransactions, useUpcomingBills } from "@/data/queries";
import { FolderTabsCard } from "@/design-system/surfaces/folder-tabs-card";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { usePlannerNow } from "@/features/my-day/my-day-context";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { usePreferenceActions, usePreferences } from "@/features/preferences/use-preferences";
import { useOpenSheet } from "@/features/sheets/sheet-params";
import { parseLocalizedNumber } from "@/lib/locale/digits";
import { rialToToman, tomanToRial, type Currency } from "@/lib/locale/money";
import { budgetMonthOf, FINANCE_TABS, isFinanceTab, parseMonthParam, shiftMonth, type BudgetMonthRef, type FinanceTab } from "./domain/finance";
import { BreakdownPanel, TrendsPanel } from "./finance-charts";
import { FinanceOverview } from "./finance-overview";
import { TransactionsPanel } from "./finance-transactions";
import { useFinanceFormat } from "./use-finance-format";

/*
 * P13 · Finance (/personal/finance, ?tab=overview|trends|breakdown|transactions,
 * ?month=1405-07). One Finance object with FolderTabs; the header holds the
 * Toman / Rial switch (display only, saved in preferences), the month
 * switch and Add expense (?sheet=expense). States: empty month, sparse
 * month (inside Trends / Breakdown), Rial, locked (Settings › Privacy:
 * a placeholder lock — Unlock reveals for this visit).
 */

const FINANCE_HREF = "/personal/finance";
export const TAB_PARAM = "tab";
export const MONTH_PARAM = "month";

export function FinanceScreen() {
  const t = useTranslations("Finance");
  const format = useFinanceFormat();
  const router = useRouter();
  const params = useSearchParams();
  const openSheet = useOpenSheet();
  const desktop = useIsDesktop();
  const reduce = useReducedMotion();
  const { day: today } = usePlannerNow();
  const { currency } = usePreferences();
  const { update } = usePreferenceActions();
  const settings = usePlannerSettings();
  const [unlocked, setUnlocked] = useState(false);

  const current = budgetMonthOf(today);
  const requested = parseMonthParam(params.get(MONTH_PARAM));
  // No future months: the month switch stops at the current one.
  const monthRef = requested && requested.start <= current.start ? requested : current;
  const tabParam = params.get(TAB_PARAM);
  const tab: FinanceTab = isFinanceTab(tabParam) ? tabParam : "overview";

  const query = useFinanceMonthDetail(monthRef.start);
  const recent = useTransactions(monthRef.start, monthRef.end);
  const bills = useUpcomingBills(today);
  // While switching months the previous one stays on screen (keepPreviousData).
  const month = query.data;
  const locked = settings.privacy.financeLock && !unlocked;

  const hrefWith = (patch: { tab?: FinanceTab; month?: BudgetMonthRef }) => {
    const search = new URLSearchParams(params.toString());
    const nextTab = patch.tab ?? tab;
    const nextMonth = patch.month ?? monthRef;
    if (nextTab === "overview") search.delete(TAB_PARAM);
    else search.set(TAB_PARAM, nextTab);
    if (nextMonth.start === current.start) search.delete(MONTH_PARAM);
    else search.set(MONTH_PARAM, nextMonth.key);
    const text = search.toString();
    return text ? `${FINANCE_HREF}?${text}` : FINANCE_HREF;
  };
  const go = (patch: { tab?: FinanceTab; month?: BudgetMonthRef }) => router.replace(hrefWith(patch), { scroll: false });
  const addExpense = () => openSheet("expense");

  const header = (
    <PageHeader
      title={t("title")}
      subtitle={t("kicker", { month: format.monthYear(monthRef.start) })}
      subtitlePlacement="above"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<Currency>
            label={t("currency.label")}
            value={currency}
            onValueChange={(next) => update({ currency: next })}
            options={[
              { value: "toman", label: t("currency.toman") },
              { value: "rial", label: t("currency.rial") },
            ]}
          />
          <div role="group" aria-label={t("month.label")} className="flex items-center gap-1 rounded-pill bg-surface p-1 shadow-island">
            <IconButton size="sm" variant="ghost" icon={ChevronLeft} mirror label={t("month.prev")} onClick={() => go({ month: shiftMonth(monthRef, -1) })} />
            <span aria-live="polite" className="min-w-20 px-1 text-center text-xs font-bold text-fg">
              {format.monthYear(monthRef.start)}
            </span>
            <IconButton
              size="sm"
              variant="ghost"
              icon={ChevronRight}
              mirror
              label={t("month.next")}
              disabled={monthRef.start >= current.start}
              onClick={() => go({ month: shiftMonth(monthRef, 1) })}
            />
          </div>
          <Button onClick={addExpense}>
            <Plus aria-hidden="true" size={18} />
            {t("add")}
          </Button>
        </div>
      }
    />
  );

  return (
    <div className="flex flex-col gap-5" data-screen="finance" data-currency={currency}>
      {header}
      {locked ? (
        <LockedFinance onUnlock={() => setUnlocked(true)} />
      ) : query.isPending ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-14 w-96 max-w-full rounded-pill" />
          <Skeleton className="h-56 rounded-card" />
          <Skeleton className="h-40 rounded-card" />
        </div>
      ) : query.isError || !month ? (
        <UtilityCard role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-fg-secondary">{t("error")}</p>
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            {t("retry")}
          </Button>
        </UtilityCard>
      ) : month.transactionCount === 0 ? (
        <EmptyFinance month={month} onAdd={addExpense} />
      ) : (
        <FolderTabsCard
          label={t("tabs.label")}
          value={tab}
          onValueChange={(next) => go({ tab: next as FinanceTab })}
          tabs={FINANCE_TABS.map((value) => ({
            value,
            label:
              value === "trends" || value === "breakdown" ? (
                <>
                  {t(`tabs.${value}`)} <span className="text-[0.6875rem] font-semibold text-fg-muted">{t(`tabs.${value}Hint`)}</span>
                </>
              ) : (
                t(`tabs.${value}`)
              ),
            count: value === "transactions" ? format.number(month.transactionCount) : undefined,
            content: (
              <motion.div key={`${value}-${monthRef.start}`} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, ease: "easeOut" }}>
                {value === "overview" ? (
                  <FinanceOverview
                    month={month}
                    today={today}
                    bills={bills.data ?? []}
                    recent={(recent.data ?? []).slice(0, 4)}
                    transactionsHref={hrefWith({ tab: "transactions" })}
                    onAdd={addExpense}
                  />
                ) : value === "trends" ? (
                  <TrendsPanel month={month} monthRef={monthRef} today={today} compact={!desktop} />
                ) : value === "breakdown" ? (
                  <BreakdownPanel month={month} monthRef={monthRef} compact={!desktop} />
                ) : (
                  <TransactionsPanel monthRef={monthRef} today={today} />
                )}
              </motion.div>
            ),
          }))}
        />
      )}
    </div>
  );
}

function EmptyFinance({ month, onAdd }: { month: FinanceMonth; onAdd(): void }) {
  const t = useTranslations("Finance.empty");
  const format = useFinanceFormat();
  const setBudget = useSetBudget();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const initial = month.budgetToman ? String(format.currency === "rial" ? tomanToRial(month.budgetToman) : month.budgetToman) : "";
  const [value, setValue] = useState(initial);
  const amount = parseLocalizedNumber(value);
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!amount || amount <= 0) return;
    const toman = format.currency === "rial" ? rialToToman(amount) : amount;
    setBudget.mutate(
      { start: month.start, budgetToman: toman },
      {
        onSuccess: () => {
          setOpen(false);
          toast({ tone: "success", title: t("saved") });
        },
      },
    );
  };
  return (
    <UtilityCard as="section" aria-labelledby="finance-empty-title" className="flex flex-col items-center gap-3 py-12 text-center" data-finance-empty>
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-surface text-fg">
        <Wallet size={24} />
      </span>
      <h2 id="finance-empty-title" className="text-lg font-bold text-fg">
        {t("title")}
      </h2>
      <p className="max-w-sm text-sm text-fg-secondary">{t("body")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={onAdd}>{t("add")}</Button>
        <Button variant="secondary" aria-expanded={open} onClick={() => setOpen((next) => !next)}>
          {t("budget")}
        </Button>
      </div>
      {open ? (
        <form onSubmit={save} className="flex w-full max-w-sm flex-col items-stretch gap-2 text-start">
          <label htmlFor={inputId} className="text-sm font-bold text-fg">
            {t("budgetLabel", { unit: format.unit })}
          </label>
          <div className="flex gap-2">
            <Input id={inputId} inputMode="numeric" dir="ltr" value={value} onChange={(event) => setValue(event.target.value)} className="flex-1" autoFocus />
            <Button type="submit" loading={setBudget.isPending} disabled={!amount || amount <= 0}>
              {t("save")}
            </Button>
          </div>
        </form>
      ) : null}
    </UtilityCard>
  );
}

function LockedFinance({ onUnlock }: { onUnlock(): void }) {
  const t = useTranslations("Finance.locked");
  return (
    <UtilityCard as="section" aria-labelledby="finance-locked-title" className="flex flex-col items-center gap-3 py-12 text-center" data-finance-locked>
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-surface text-fg">
        <Lock size={22} />
      </span>
      <h2 id="finance-locked-title" className="text-lg font-bold text-fg">
        {t("title")}
      </h2>
      <p className="max-w-sm text-sm text-fg-secondary">{t("body")}</p>
      <Button onClick={onUnlock}>{t("unlock")}</Button>
    </UtilityCard>
  );
}
