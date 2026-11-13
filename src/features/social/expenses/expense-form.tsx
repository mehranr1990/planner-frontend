"use client";

import { Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { getPlannerToday } from "@/data/clock";
import { useAddTransaction } from "@/data/queries";
import { ALBUM_MAX_BYTES, type ExpenseScope, type SharedExpense, type SocialCurrency, type SocialPerson } from "@/data/social-domain";
import { useScopeParticipants, useSocialMutation } from "@/data/social-queries";
import { DayField } from "@/features/goals/goal-sheet";
import { minorToInput, parseMinor, useSocialFormat } from "../format";
import { newClientOpId, useSocialErrorText } from "../use-social";
import { draftToSpec, initialDraft, previewSplit, SplitEditor, type SplitDraft } from "./split-editor";

/*
 * Expense form (SO-08 ?sheet=expense-propose, Edit & approve, Propose an
 * edit). Amount is typed in the scope currency and stored as exact minor
 * units; the split must match before Save is enabled. A proposal never
 * counts until approved; a revision of an approved item becomes "Edit
 * pending" and the approved version keeps counting.
 */

export type ExpenseFormMode = { kind: "propose"; scope: ExpenseScope; activities: { id: string; title: string }[]; defaultActivityId: string | null } | { kind: "edit-approve" | "revise"; expense: SharedExpense };

export function ExpenseForm({ mode, currency, onDone }: { mode: ExpenseFormMode; currency: SocialCurrency; onDone: (id?: string) => void }) {
  const t = useTranslations("Social.propose");
  const tCommon = useTranslations("Social.common");
  const errorText = useSocialErrorText();
  const format = useSocialFormat();
  const existing = mode.kind === "propose" ? null : mode.expense;
  const [activityId, setActivityId] = useState<string | null>(mode.kind === "propose" ? mode.defaultActivityId : (existing?.activityId ?? null));
  const participantScope: ExpenseScope = mode.kind === "propose" ? (activityId ? { kind: "activity", id: activityId } : mode.scope) : existing!.activityId ? { kind: "activity", id: existing!.activityId } : existing!.scope;
  const participants = useScopeParticipants(participantScope);
  const people: SocialPerson[] = participants.data ?? [];
  const version = existing ? (existing.pendingEdit ?? existing.current) : null;
  const [title, setTitle] = useState(version?.title ?? "");
  const [amountText, setAmountText] = useState(version ? minorToInput(version.amount, currency) : "");
  const [payerId, setPayerId] = useState(version?.payerId ?? "me");
  const [day, setDay] = useState<string | null>(version?.day ?? getPlannerToday());
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState<{ name: string; bytes: number } | null>(null);
  const [receiptError, setReceiptError] = useState(false);
  const [draft, setDraft] = useState<SplitDraft | null>(null);
  const [touched, setTouched] = useState(false);
  const opId = useRef(newClientOpId("expense"));
  const effectiveDraft = draft ?? (people.length > 0 ? initialDraft(people, version?.split, currency) : null);
  const amount = parseMinor(amountText, currency);
  const validAmount = amount !== null && amount > 0;
  const result = effectiveDraft && validAmount ? previewSplit(amount, effectiveDraft, people, currency, payerId) : null;
  const splitOk = result !== null && result.error === null;

  const submit = useSocialMutation(async (repo) => {
    const split = draftToSpec(effectiveDraft!, people, currency)!;
    const fields = { title: title.trim(), amount: amount!, payerId, day: day!, split };
    if (mode.kind === "propose") return repo.expenses.propose({ ...fields, scope: mode.scope, activityId, receipt, clientOpId: opId.current });
    if (mode.kind === "edit-approve") await repo.expenses.editAndApprove(existing!.id, fields);
    else await repo.expenses.revise(existing!.id, fields, note);
    return existing!.id;
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!title.trim() || !validAmount || !day || !splitOk) return;
        submit.mutate(undefined, {
          onSuccess: (id) => {
            toast({ title: mode.kind === "propose" ? t("proposed") : mode.kind === "revise" ? t("submitRevise") : t("submitEdit"), tone: "success" });
            onDone(id);
          },
        });
      }}
    >
      <Field invalid={touched && !title.trim()}>
        <FieldLabel>{t("what")}</FieldLabel>
        <Input dir="auto" value={title} onChange={(event) => setTitle(event.target.value)} />
        {touched && !title.trim() ? <FieldError>{t("whatRequired")}</FieldError> : null}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field invalid={touched && !validAmount}>
          <FieldLabel>{t("amount", { unit: format.unit(currency) })}</FieldLabel>
          <Input dir="ltr" inputMode="decimal" className="tabular" value={amountText} onChange={(event) => setAmountText(event.target.value)} />
          {touched && !validAmount ? <FieldError>{t("amountInvalid")}</FieldError> : null}
        </Field>
        <Field>
          <FieldLabel>{t("paidBy")}</FieldLabel>
          <Select value={payerId} onValueChange={setPayerId}>
            {people.map((person) => (
              <SelectItem key={person.id} value={person.id}>
                {person.id === "me" ? tCommon("you") : person.name}
              </SelectItem>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <DayField label={t("date")} emptyLabel={t("date")} value={day} onChange={setDay} />
        {mode.kind === "propose" && mode.scope.kind === "group" && mode.activities.length > 0 ? (
          <Field>
            <FieldLabel>{t("activity")}</FieldLabel>
            <Select
              value={activityId ?? "none"}
              onValueChange={(value) => {
                setActivityId(value === "none" ? null : value);
                setDraft(null);
              }}
            >
              <SelectItem value="none">{t("noActivity")}</SelectItem>
              {mode.activities.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.title}
                </SelectItem>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>
      {mode.kind === "propose" ? (
        <Field invalid={receiptError}>
          <FieldLabel>{t("receipt")}</FieldLabel>
          <label className="flex min-h-touch cursor-pointer items-center gap-2 rounded-pill px-4 text-sm font-semibold text-fg inset-ring inset-ring-outline hover:bg-subtle">
            <Icon icon={Paperclip} size={16} />
            <span className="min-w-0 flex-1 truncate">{receipt?.name ?? t("addReceipt")}</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const tooLarge = file.size > ALBUM_MAX_BYTES;
                setReceiptError(tooLarge);
                setReceipt(tooLarge ? null : { name: file.name, bytes: file.size });
              }}
            />
          </label>
          {receiptError ? <FieldError>{t("receiptTooLarge")}</FieldError> : <FieldDescription>{t("receiptHint")}</FieldDescription>}
        </Field>
      ) : null}
      {effectiveDraft ? <SplitEditor amount={validAmount ? amount : null} currency={currency} people={people} draft={effectiveDraft} onChange={setDraft} result={result} /> : null}
      {mode.kind === "revise" ? (
        <Field>
          <FieldLabel>{t("reviseTitle")}</FieldLabel>
          <Textarea dir="auto" value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      ) : null}
      {touched && validAmount && !splitOk ? <InlineAlert tone="warning" title={t("splitInvalid")} /> : null}
      {submit.isError ? <InlineAlert tone="danger" title={errorText(submit.error)} /> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => onDone()}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={submit.isPending || (validAmount && !splitOk)}>
          {mode.kind === "propose" ? t("submit") : mode.kind === "revise" ? t("submitRevise") : t("submitEdit")}
        </Button>
      </div>
    </form>
  );
}

/**
 * Personal Finance opt-in (SO-08 / SO-09 / SO-17): explicit, once per key.
 * The Social server claims the key first (idempotent); only a first claim
 * adds the Personal expense, and a failed add releases the claim. Toman only
 * (Personal Finance has no other currency).
 */
export function usePostToPersonalFinance() {
  const add = useAddTransaction();
  return useSocialMutation(async (repo, input: { key: string; amount: number; currency: SocialCurrency; title: string; day: string; kind?: "expense" | "income" }) => {
    if (input.currency !== "toman") return false;
    const first = await repo.expenses.claimFinancePosting(input.key);
    if (!first) return false;
    try {
      const kind = input.kind ?? "expense";
      await add.mutateAsync({ kind, amountToman: input.amount, category: kind === "expense" ? "other" : null, title: input.title, day: input.day, time: null });
    } catch (error) {
      await repo.expenses.releaseFinancePosting(input.key);
      throw error;
    }
    return true;
  });
}
