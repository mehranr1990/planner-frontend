"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { PillGroup } from "@/components/ui/pills";
import { SearchField } from "@/components/ui/search-field";
import { Select, SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { FINANCE_CATEGORIES, type FinanceCategory, type Transaction } from "@/data/domain";
import { useRemoveTransaction, useRestoreTransaction, useTransactions } from "@/data/queries";
import { useOpenSheet } from "@/features/sheets/sheet-params";
import { filterTransactions, signedAmount, type BudgetMonthRef, type TransactionFilter } from "./domain/finance";
import { EXPENSE_SHEET_TX_PARAM } from "./expense-sheet";
import { TransactionRow } from "./finance-rows";
import { categoryColor, useFinanceFormat } from "./use-finance-format";

/*
 * Finance · Transactions tab (P13): search, a category filter and the
 * Expenses / Income pills, then Today (with its total) and Earlier. Edit
 * opens Add expense with ?tx=; delete is instant with Undo.
 */

export function TransactionsPanel({ monthRef, today }: { monthRef: BudgetMonthRef; today: string }) {
  const t = useTranslations("Finance");
  const format = useFinanceFormat();
  const openSheet = useOpenSheet();
  const remove = useRemoveTransaction();
  const restore = useRestoreTransaction();
  const query = useTransactions(monthRef.start, monthRef.end);
  const [filter, setFilter] = useState<TransactionFilter>({ query: "", category: "all", kind: "all" });
  const list = filterTransactions(query.data ?? [], filter, (category) => t(`categories.${category}`));
  const todays = list.filter((tx) => tx.day === today);
  const earlier = list.filter((tx) => tx.day !== today);

  const failed = () => toast({ tone: "danger", title: t("transactions.failed") });
  const onDelete = (tx: Transaction) =>
    remove.mutate(tx.id, {
      onError: failed,
      onSuccess: (removed) =>
        toast({
          id: `tx-${tx.id}`,
          tone: "neutral",
          title: t("transactions.deleted", { title: tx.title }),
          action: { label: t("transactions.undo"), altText: t("transactions.undoAlt"), onClick: () => restore.mutate(removed, { onError: failed }) },
        }),
    });
  const onEdit = (tx: Transaction) => openSheet("expense", { [EXPENSE_SHEET_TX_PARAM]: tx.id });

  const group = (title: string, items: Transaction[]) =>
    items.length ? (
      <section aria-label={title} className="flex flex-col">
        <h3 className="px-2 pb-1 text-xs font-bold text-fg-secondary">{title}</h3>
        <ul className="flex flex-col">
          {items.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} today={today} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <section aria-label={t("tabs.transactions")} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          aria-label={t("transactions.search")}
          placeholder={t("transactions.search")}
          value={filter.query}
          onValueChange={(value) => setFilter((current) => ({ ...current, query: value }))}
          className="min-w-48 flex-1"
        />
        <Select
          aria-label={t("transactions.category")}
          value={filter.category}
          onValueChange={(value) => setFilter((current) => ({ ...current, category: value as FinanceCategory | "all" }))}
          className="w-auto min-w-40"
        >
          <SelectItem value="all">{t("transactions.allCategories")}</SelectItem>
          {FINANCE_CATEGORIES.map((id) => (
            <SelectItem key={id} value={id}>
              <span className="inline-flex items-center gap-2">
                <span aria-hidden="true" className="size-2 rounded-full" style={{ background: categoryColor(id) }} />
                {t(`categories.${id}`)}
              </span>
            </SelectItem>
          ))}
        </Select>
        <PillGroup
          label={t("transactions.kind")}
          value={filter.kind}
          onValueChange={(kind) => setFilter((current) => ({ ...current, kind }))}
          options={[
            { value: "all", label: t("transactions.kindAll") },
            { value: "expense", label: t("transactions.kindExpense") },
            { value: "income", label: t("transactions.kindIncome") },
          ]}
        />
      </div>
      {query.isPending ? (
        <Skeleton className="h-64 rounded-card" />
      ) : list.length === 0 ? (
        <p role="status" className="rounded-field bg-subtle p-4 text-sm text-fg-secondary">
          {t("transactions.none")}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {group(t("transactions.today", { total: format.signed(todays.reduce((sum, tx) => sum + signedAmount(tx), 0)) }), todays)}
          {group(t("transactions.earlier"), earlier)}
        </div>
      )}
    </section>
  );
}
