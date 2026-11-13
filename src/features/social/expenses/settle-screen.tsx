"use client";

import { CircleCheck, HandCoins } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { ErrorState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { getPlannerToday } from "@/data/clock";
import type { ExpenseScope, ScopeBalance, Settlement, SocialCurrency } from "@/data/social-domain";
import { useActivity, useScopeBalance, useSettlements, useSocialMutation } from "@/data/social-queries";
import { SocialError } from "@/data/social-repositories";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { cn } from "@/lib/cn";
import { minorToInput, parseMinor, useSocialFormat } from "../format";
import { socialHref } from "../paths";
import { useSocialGroup } from "../social-gate";
import { isUnsupported, PersonAvatar, SocialPageHeader, SocialUnsupported } from "../social-ui";
import { newClientOpId, useSocialErrorText } from "../use-social";
import { usePostToPersonalFinance } from "./expense-form";

/*
 * SO-09 · Settle up (…/expenses/settle). The app never moves money: a
 * settlement is an acknowledgement record. Either side records a payment
 * (amount, note); the other side confirms it (Confirm received) or marks
 * Not received with a note (S7). Suggested transfers are the minimum set
 * from approved balances; any partial amount can be recorded. Record payment
 * signature card (notch). On confirmation each side may record it once in
 * Personal Finance (explicit, idempotent; Toman only).
 */

export function GroupSettleScreen() {
  const group = useSocialGroup();
  if (group.currency === null) return <SocialUnsupported />;
  return <SettleView scope={{ kind: "group", id: group.id }} currency={group.currency} group={group} />;
}

export function ActivitySettleScreen() {
  const { id } = useParams<{ id: string }>();
  const activity = useActivity(id);
  if (activity.isError) return isUnsupported(activity.error) ? <SocialUnsupported /> : activity.error instanceof SocialError ? <AccessState kind="social-not-available" /> : <ErrorState onRetry={() => void activity.refetch()} />;
  if (!activity.data) return <AccessLoading />;
  const a = activity.data;
  return <SettleView scope={{ kind: "activity", id: a.id }} currency={a.currency} group={a.group && !a.isGuest ? a.group : null} activityCrumb={{ id: a.id, title: a.title }} />;
}

function SettleView({ scope, currency, group, activityCrumb }: { scope: ExpenseScope; currency: SocialCurrency; group: { id: string; name: string } | null; activityCrumb?: { id: string; title: string } }) {
  const t = useTranslations("Social");
  const format = useSocialFormat();
  const balance = useScopeBalance(scope);
  const settlements = useSettlements(scope);
  const [prefill, setPrefill] = useState<{ fromId: string; toId: string; amount: number } | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const trail = [
    ...(activityCrumb ? [{ label: activityCrumb.title, href: socialHref.activity(activityCrumb.id) }] : []),
    { label: t("expenses.title"), href: socialHref.expenses(scope) },
    { label: t("settle.title") },
  ];
  const header = <SocialPageHeader group={group} trail={trail} title={t("settle.title")} subtitle={t("settle.noMoney")} />;
  if (balance.isError) return <>{header}{isUnsupported(balance.error) ? <SocialUnsupported /> : <AccessState kind="social-not-available" />}</>;
  if (!balance.data || !settlements.data) return <>{header}<AccessLoading /></>;
  const b = balance.data;
  const name = (id: string) => (id === "me" ? t("common.you") : (b.members.find((m) => m.id === id)?.name ?? id));
  const mine = b.transfers.filter((tr) => tr.fromId === "me" || tr.toId === "me");
  const waiting = settlements.data.filter((s) => s.awaitingMe);
  const others = settlements.data.filter((s) => !s.awaitingMe);

  return (
    <>
      {header}
      <InlineAlert tone="info" title={t("settle.noMoney")} description={t("settle.noMoneyBody")} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="flex min-w-0 flex-col gap-4">
          {waiting.length > 0 ? (
            <ProductCard as="section" aria-labelledby="waiting-you" className="flex flex-col gap-3">
              <h2 id="waiting-you" className="type-title text-fg">{t("settle.waitingForYou")}</h2>
              <ul className="flex flex-col gap-2">
                {waiting.map((s) => (
                  <SettlementRow key={s.id} settlement={s} />
                ))}
              </ul>
            </ProductCard>
          ) : null}
          <ProductCard as="section" aria-labelledby="transfers" className="flex flex-col gap-3">
            <h2 id="transfers" className="type-title text-fg">{t("settle.transfers")}</h2>
            {mine.length === 0 ? (
              <p className="flex items-center gap-2 rounded-row bg-subtle p-4 text-sm font-semibold text-success-text">
                <Icon icon={CircleCheck} size={16} />
                {b.transfers.length === 0 ? t("settle.allSettled") : t("settle.mineSettled")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {mine.map((tr) => (
                  <li key={`${tr.fromId}-${tr.toId}`} className="flex flex-wrap items-center gap-3 rounded-row bg-subtle px-3 py-2.5">
                    <PersonAvatar person={b.members.find((m) => m.id === (tr.fromId === "me" ? tr.toId : tr.fromId)) ?? { id: "?", name: "?", initials: "?" }} />
                    <bdi className="min-w-0 flex-1 text-sm font-semibold text-fg">{tr.fromId === "me" ? t("settle.pay", { name: name(tr.toId) }) : t("settle.receive", { name: name(tr.fromId) })}</bdi>
                    <span className="text-sm font-bold tabular">{format.money(tr.amount, b.currency)}</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setPrefill({ fromId: tr.fromId, toId: tr.toId, amount: tr.amount });
                        formRef.current?.querySelector<HTMLInputElement>("input")?.focus();
                      }}
                    >
                      {t("settle.record")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-fg-muted">{t("settle.transfersNote")}</p>
          </ProductCard>
          <ProductCard as="section" aria-labelledby="payments" className="flex flex-col gap-3">
            <h2 id="payments" className="type-title text-fg">{t("settle.history")}</h2>
            {others.length === 0 ? (
              <p className="rounded-row bg-subtle p-4 text-sm text-fg-secondary">{t("settle.noHistory")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {others.map((s) => (
                  <SettlementRow key={s.id} settlement={s} />
                ))}
              </ul>
            )}
          </ProductCard>
        </div>
        <div ref={formRef}>
          <RecordCard key={prefill ? `${prefill.fromId}-${prefill.toId}-${prefill.amount}` : "blank"} scope={scope} balance={b} currency={currency} prefill={prefill} />
        </div>
      </div>
    </>
  );
}

function RecordCard({ scope, balance: b, currency, prefill }: { scope: ExpenseScope; balance: ScopeBalance; currency: SocialCurrency; prefill: { fromId: string; toId: string; amount: number } | null }) {
  const t = useTranslations("Social");
  const errorText = useSocialErrorText();
  const format = useSocialFormat();
  const firstOther = b.members.find((m) => m.id !== "me")?.id ?? "";
  const [fromId, setFromId] = useState(prefill?.fromId ?? "me");
  const [toId, setToId] = useState(prefill?.toId ?? firstOther);
  const [amountText, setAmountText] = useState(prefill ? minorToInput(prefill.amount, currency) : "");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const opId = useRef(newClientOpId("settlement"));
  const amount = parseMinor(amountText, currency);
  const amountOk = amount !== null && amount > 0;
  const partiesOk = fromId !== toId && (fromId === "me" || toId === "me");
  const record = useSocialMutation((repo) => repo.settlements.record({ scope, fromId, toId, amount: amount!, note, clientOpId: opId.current }));
  const other = fromId === "me" ? toId : fromId;
  const submit = () => {
    setTouched(true);
    if (!amountOk || !partiesOk) return;
    record.mutate(undefined, {
      onSuccess: () => {
        toast({ title: t("settle.recorded", { name: b.members.find((m) => m.id === other)?.name ?? "" }), tone: "success" });
        opId.current = newClientOpId("settlement");
        setAmountText("");
        setNote("");
        setTouched(false);
      },
    });
  };
  const person = (id: string) => (id === "me" ? t("common.you") : (b.members.find((m) => m.id === id)?.name ?? id));
  return (
    <SignatureCard as="section" aria-labelledby="record-title" contentClassName="flex flex-col gap-3" action={<SignatureCardAction label={t("settle.record")} icon={HandCoins} disabled={record.isPending} onClick={submit} />}>
      <h2 id="record-title" className="pe-16 type-h2 text-fg">{t("settle.recordTitle")}</h2>
      <p className="text-xs text-fg-secondary">{t("settle.noMoney")}</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <Field invalid={touched && !partiesOk}>
            <FieldLabel>{t("settle.from")}</FieldLabel>
            <Select value={fromId} onValueChange={setFromId}>
              {b.members.map((m) => (
                <SelectItem key={m.id} value={m.id}>{person(m.id)}</SelectItem>
              ))}
            </Select>
          </Field>
          <Field invalid={touched && !partiesOk}>
            <FieldLabel>{t("settle.to")}</FieldLabel>
            <Select value={toId} onValueChange={setToId}>
              {b.members.map((m) => (
                <SelectItem key={m.id} value={m.id}>{person(m.id)}</SelectItem>
              ))}
            </Select>
            {touched && !partiesOk ? <FieldError>{t("settle.partiesInvalid")}</FieldError> : null}
          </Field>
        </div>
        <Field invalid={touched && !amountOk}>
          <FieldLabel>{t("settle.amount", { unit: format.unit(currency) })}</FieldLabel>
          <Input dir="ltr" inputMode="decimal" className="tabular" value={amountText} onChange={(event) => setAmountText(event.target.value)} />
          {touched && !amountOk ? <FieldError>{t("settle.amountInvalid")}</FieldError> : null}
        </Field>
        <Field>
          <FieldLabel>{t("settle.note")}</FieldLabel>
          <Input dir="auto" value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        {record.isError ? <InlineAlert tone="danger" title={errorText(record.error)} /> : null}
        <Button type="submit" disabled={record.isPending}>{t("settle.record")}</Button>
      </form>
    </SignatureCard>
  );
}

export function SettlementRow({ settlement: s }: { settlement: Settlement }) {
  const t = useTranslations("Social");
  const format = useSocialFormat();
  const errorText = useSocialErrorText();
  const [disputing, setDisputing] = useState(false);
  const [note, setNote] = useState("");
  const confirm = useSocialMutation((repo) => repo.settlements.confirm(s.id));
  const dispute = useSocialMutation((repo) => repo.settlements.dispute(s.id, note));
  const post = usePostToPersonalFinance();
  const name = (p: { id: string; name: string }) => (p.id === "me" ? t("common.you") : p.name);
  const other = s.recordedBy.id === s.from.id ? s.to : s.from;
  const tone = s.status === "confirmed" ? "bg-success-soft text-success-text" : s.status === "disputed" ? "bg-danger-soft text-danger-text" : "bg-warning-soft text-warning-text";
  return (
    <li className="flex flex-col gap-2 rounded-row bg-subtle px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <PersonAvatar person={s.recordedBy} />
        <span className="flex min-w-0 flex-1 flex-col">
          <bdi className="text-sm font-semibold text-fg">{t("settle.line", { from: name(s.from), to: name(s.to) })}</bdi>
          <span className="text-xs text-fg-secondary">
            {[s.note, format.relative(s.at), s.status === "recorded" && !s.awaitingMe ? t("settle.waiting", { name: name(other) }) : null].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="text-sm font-bold tabular">{format.money(s.amount, s.currency)}</span>
        <span className={cn("rounded-pill px-2.5 py-0.5 text-xs font-bold", tone)}>{t(`settle.statusLabel.${s.status}`)}</span>
      </div>
      {s.status === "disputed" && s.disputeNote ? <p className="text-xs text-danger-text">{t("settle.disputed", { note: s.disputeNote })}</p> : null}
      {s.awaitingMe ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={confirm.isPending} onClick={() => confirm.mutate(undefined, { onSuccess: () => toast({ title: t("settle.confirmed"), tone: "success" }), onError: (e) => toast({ title: errorText(e), tone: "danger" }) })}>
            {t("settle.confirm")}
          </Button>
          <Button size="sm" variant="secondary" aria-haspopup="dialog" onClick={() => setDisputing(true)}>
            {t("settle.notReceived")}
          </Button>
        </div>
      ) : null}
      {s.status === "confirmed" && s.currency === "toman" ? (
        s.postedToFinance || post.data === true ? (
          <span className="flex items-center gap-1 text-xs font-bold text-success-text">
            <Icon icon={CircleCheck} size={14} />
            {t("settle.financeDone")}
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            disabled={post.isPending}
            onClick={() => post.mutate({ key: `settlement:${s.id}:me`, amount: s.amount, currency: s.currency, title: `${t("settle.title")} · ${s.scopeName}`, day: (s.confirmedAt ?? getPlannerToday()).slice(0, 10), kind: s.from.id === "me" ? "expense" : "income" })}
          >
            {t("settle.finance")}
          </Button>
        )
      ) : null}
      <Dialog open={disputing} onOpenChange={setDisputing}>
        <DialogContent title={t("settle.disputeTitle")}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!note.trim()) return;
              dispute.mutate(undefined, { onSuccess: () => setDisputing(false) });
            }}
          >
            <Field>
              <FieldLabel>{t("settle.disputeNote", { name: name(s.recordedBy) })}</FieldLabel>
              <Textarea dir="auto" value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
            {dispute.isError ? <p className="text-sm font-semibold text-danger-text">{errorText(dispute.error)}</p> : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setDisputing(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={!note.trim() || dispute.isPending}>{t("settle.notReceived")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </li>
  );
}
