"use client";

import { Bell, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { IconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { Transaction, UpcomingBill } from "@/data/domain";
import { diffDays } from "@/lib/dates/clock-time";
import { cn } from "@/lib/cn";
import { signedAmount } from "./domain/finance";
import { categoryColor, categoryKey, useFinanceFormat } from "./use-finance-format";

/*
 * Finance rows (P13 · TxRow, PaymentRow): one clean geometry for the whole
 * family, never notched. The category is named in text beside its colour
 * dot, so colour is never alone.
 */

/** "Today 12:10" for today, else "Mon 20". */
export function useTransactionWhen(today: string) {
  const t = useTranslations("Finance.when");
  const format = useFinanceFormat();
  return (tx: Pick<Transaction, "day" | "time">) =>
    tx.day === today && tx.time
      ? t("today", { time: format.digits(tx.time) })
      : t("day", { weekday: format.weekdayShort(tx.day), date: format.dayMonth(tx.day).split(" ")[0]! });
}

export function TransactionRow({
  tx,
  today,
  onEdit,
  onDelete,
}: {
  tx: Transaction;
  today: string;
  onEdit?: (tx: Transaction) => void;
  onDelete?: (tx: Transaction) => void;
}) {
  const t = useTranslations("Finance");
  const format = useFinanceFormat();
  const when = useTransactionWhen(today);
  const key = categoryKey(tx);
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-field px-2 py-2.5 hover:bg-subtle" data-transaction={tx.id}>
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: categoryColor(key) }} />
      <div className="flex min-w-0 flex-1 flex-col">
        <bdi dir="auto" className="truncate text-sm font-bold text-fg">
          {tx.title}
        </bdi>
        <span className="truncate text-[0.6875rem] font-semibold text-fg-muted">{t(`categories.${key}`)}</span>
      </div>
      <span dir="ltr" className={cn("tabular shrink-0 text-sm font-bold", tx.kind === "income" ? "text-scope-deep" : "text-fg")}>
        {format.signed(signedAmount(tx))}
      </span>
      <span className="w-20 shrink-0 text-end text-[0.6875rem] font-semibold text-fg-muted">{when(tx)}</span>
      {onEdit || onDelete ? (
        <span className="flex shrink-0 items-center">
          {onEdit && tx.kind === "expense" ? (
            <IconButton size="sm" variant="ghost" icon={Pencil} label={t("transactions.edit", { title: tx.title })} onClick={() => onEdit(tx)} />
          ) : null}
          {onDelete ? (
            <IconButton size="sm" variant="ghost" icon={Trash2} label={t("transactions.delete", { title: tx.title })} onClick={() => onDelete(tx)} />
          ) : null}
        </span>
      ) : null}
    </li>
  );
}

export function BillRow({ bill, today }: { bill: UpcomingBill; today: string }) {
  const t = useTranslations("Finance.bills");
  const format = useFinanceFormat();
  const days = diffDays(today, bill.dueDay);
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-field bg-subtle px-3 py-2.5">
      <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-warning-soft text-warning-text">
        <Icon icon={Bell} size={13} />
      </span>
      <bdi dir="auto" className="min-w-0 flex-1 truncate text-sm font-bold text-fg">
        {bill.title}
      </bdi>
      <span className="tabular shrink-0 text-sm font-bold text-fg">{format.amount(bill.amountToman)}</span>
      <span className="w-16 shrink-0 text-end text-[0.6875rem] font-semibold text-fg-muted">
        {days <= 2 ? t("in", { days, daysText: format.number(days) }) : format.dayMonth(bill.dueDay)}
      </span>
    </li>
  );
}
