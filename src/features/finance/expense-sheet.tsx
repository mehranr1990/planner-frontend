"use client";

import { Delete } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PillGroup } from "@/components/ui/pills";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { getPlannerToday } from "@/data/clock";
import { FINANCE_CATEGORIES, type FinanceCategory, type Transaction } from "@/data/domain";
import { useAddTransaction, useRemoveTransaction, useTransaction, useUpdateTransaction } from "@/data/queries";
import { DayField } from "@/features/goals/goal-sheet";
import { toLatinDigits } from "@/lib/locale/digits";
import { rialToToman, tomanToRial } from "@/lib/locale/money";
import { parseExpenseLine } from "./domain/finance";
import { categoryColor, useFinanceFormat } from "./use-finance-format";

/*
 * Add expense (P18 · A, centred sheet on desktop / bottom sheet on mobile):
 * the amount keypad first, then category chips, the date (today) and an
 * optional note. Opened from the Finance header, the balance card's notch
 * and Quick Add ("250k lunch #food" arrives as ?text= and is parsed here).
 * The amount is typed in the display currency (Rial = ×10) and stored in
 * Toman. With ?tx=<id> the same sheet edits that expense.
 */

export const EXPENSE_SHEET_TX_PARAM = "tx";
export const EXPENSE_SHEET_TEXT_PARAM = "text";

const MAX_DIGITS = 13;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "back"] as const;

export function ExpenseSheet({ onClose, initialText, transactionId = null }: { onClose(): void; initialText?: string; transactionId?: string | null }) {
  const query = useTransaction(transactionId);
  if (transactionId) {
    if (query.isPending) return <Skeleton className="h-96 rounded-card" />;
    if (query.isError || !query.data || query.data.kind !== "expense") return <MissingTransaction />;
    return <ExpenseForm key={query.data.id} onClose={onClose} editing={query.data} />;
  }
  return <ExpenseForm onClose={onClose} initialText={initialText} />;
}

function MissingTransaction() {
  const t = useTranslations("Finance.sheet");
  return (
    <p role="alert" className="text-sm text-fg-secondary">
      {t("notFound")}
    </p>
  );
}

function ExpenseForm({ onClose, initialText, editing }: { onClose(): void; initialText?: string; editing?: Transaction }) {
  const t = useTranslations("Finance");
  const format = useFinanceFormat();
  const add = useAddTransaction();
  const update = useUpdateTransaction();
  const remove = useRemoveTransaction();
  const amountId = useId();
  const errorId = useId();
  const names = useMemo(
    () => Object.fromEntries(FINANCE_CATEGORIES.map((id) => [id, t(`categories.${id}`)])) as Record<FinanceCategory, string>,
    [t],
  );
  // Quick Add's line: the amount was typed in the display currency.
  const parsed = useMemo(() => (initialText ? parseExpenseLine(initialText, names) : null), [initialText, names]);
  const fromToman = (toman: number) => String(Math.round(format.currency === "rial" ? tomanToRial(toman) : toman));

  const [digits, setDigits] = useState(editing ? fromToman(editing.amountToman) : parsed?.amount ? String(parsed.amount) : "");
  const [category, setCategory] = useState<FinanceCategory | null>(editing?.category ?? parsed?.category ?? null);
  const [day, setDay] = useState(editing?.day ?? getPlannerToday());
  const [note, setNote] = useState(editing ? (editing.note ?? (editing.title !== names[editing.category!] ? editing.title : "")) : (parsed?.title ?? ""));
  const [noteOpen, setNoteOpen] = useState(Boolean(note));
  const [error, setError] = useState<"needAmount" | "needCategory" | "failed" | null>(null);

  const typed = Number(digits || "0");
  const toman = format.currency === "rial" ? rialToToman(typed) : typed;
  const busy = add.isPending || update.isPending;

  const press = (key: (typeof KEYS)[number]) => {
    setError(null);
    setDigits((current) => {
      if (key === "back") return current.slice(0, -1);
      const next = (current + key).replace(/^0+/, "");
      return next.length > MAX_DIGITS ? current : next;
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!(toman > 0)) return setError("needAmount");
    if (!category) return setError("needCategory");
    const text = note.trim();
    const fields = { amountToman: toman, category, day, title: text || names[category] };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: fields });
        toast({ tone: "success", title: t("sheet.updated") });
      } else {
        const saved = await add.mutateAsync({ ...fields, kind: "expense", time: null });
        toast({
          id: `expense-${saved.id}`,
          tone: "success",
          title: t("sheet.saved", { amount: `${format.amount(saved.amountToman)} ${format.unit}` }),
          action: { label: t("transactions.undo"), altText: t("transactions.undoAlt"), onClick: () => remove.mutate(saved.id) },
        });
      }
      onClose();
    } catch {
      setError("failed");
    }
  };

  return (
    <form className="flex flex-col gap-4" data-expense-sheet={editing ? "edit" : "new"} onSubmit={(event) => void submit(event)} noValidate>
      <div className="flex flex-col items-center gap-1 rounded-card bg-subtle px-4 py-5 text-center">
        <label htmlFor={amountId} className="sr-only">
          {t("sheet.amount")} ({format.unit})
        </label>
        <div className="flex items-baseline justify-center gap-2" dir="ltr">
          <input
            id={amountId}
            // The keypad is the input on touch; a physical keyboard still types.
            inputMode="none"
            autoComplete="off"
            autoFocus
            value={digits ? format.number(typed) : ""}
            placeholder={format.digits("0")}
            onChange={(event) => {
              setError(null);
              setDigits(toLatinDigits(event.target.value).replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_DIGITS));
            }}
            aria-invalid={error === "needAmount" || undefined}
            aria-describedby={error ? errorId : undefined}
            className="tabular w-full min-w-0 bg-transparent text-center text-[2.5rem] font-semibold leading-none text-fg outline-none placeholder:text-fg-muted focus-visible:focus-ring"
          />
        </div>
        <p className="text-xs font-semibold text-fg-muted">
          {format.unit}
          {toman > 0 ? ` · ${t("sheet.other", { amount: format.other(toman) })}` : null}
        </p>
      </div>

      <div role="group" aria-label={t("sheet.keypad")} className="grid grid-cols-3 gap-2" dir="ltr">
        {KEYS.map((key) =>
          key === "back" ? (
            <Button key={key} type="button" variant="secondary" aria-label={t("sheet.backspace")} onClick={() => press(key)}>
              <Delete aria-hidden="true" size={20} />
            </Button>
          ) : (
            <Button key={key} type="button" variant="secondary" className="tabular text-lg" aria-label={key === "000" ? t("sheet.thousand") : undefined} onClick={() => press(key)}>
              {format.digits(key)}
            </Button>
          ),
        )}
      </div>

      <PillGroup
        label={t("sheet.category")}
        value={category ?? ("" as FinanceCategory)}
        onValueChange={(next) => {
          setError(null);
          setCategory(next);
        }}
        options={FINANCE_CATEGORIES.map((id) => ({
          value: id,
          label: (
            <>
              <span aria-hidden="true" className="size-2 rounded-full" style={{ background: categoryColor(id) }} />
              {names[id]}
            </>
          ),
        }))}
      />

      <div className="flex flex-wrap items-center gap-2">
        <DayField compact label={t("sheet.date")} emptyLabel={t("sheet.date")} value={day} onChange={(next) => next && setDay(next)} />
        {noteOpen ? null : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setNoteOpen(true)}>
            {t("sheet.addNote")}
          </Button>
        )}
      </div>
      {noteOpen ? (
        <Input aria-label={t("sheet.note")} placeholder={t("sheet.notePlaceholder")} value={note} dir="auto" onChange={(event) => setNote(event.target.value)} autoFocus={!note} />
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-sm font-semibold text-danger-text">
          {t(`sheet.${error}`)}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={busy}>
        {editing ? t("sheet.saveEdit") : t("sheet.save")}
      </Button>
    </form>
  );
}
