"use client";

import { Check, Plus, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { getPlannerToday } from "@/data/clock";
import type { PaymentRun, Reimbursement } from "@/data/company-domain";
import { useCompanyMutation, usePaymentRuns, useReimbursements } from "@/data/company-queries";
import { useAddTransaction } from "@/data/queries";
import { StatusChip } from "@/design-system/feedback/status-chip";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { companyHref } from "@/features/navigation/contexts";
import { rialToToman } from "@/lib/locale/money";
import { Icon } from "@/components/ui/icon";
import { useCompany, useCompanyWritable } from "../company-gate";
import { CompanyPageHeader } from "../company-page-header";
import { useCompanyFormat } from "../format";
import { ReasonDialog } from "../resources/resources-screen";

/*
 * CO-11 · Reimbursements (/companies/[id]/expenses/reimbursements). Flow:
 * an "I paid" expense is approved → To settle → Finance adds it to a
 * payment run → pays outside the app → Confirm payment (notch) with a
 * reference → each item is Settled (acknowledged). Request ≠ paid,
 * approval ≠ paid; no money moves here, no bank integration. The recipient
 * may mark "not received" within 14 days (back to To settle with a note).
 * After settlement the recipient may choose "Record in my finance": an
 * explicit, idempotent write to Personal Finance — nothing automatic.
 */

type Tab = "settle" | "mine" | "settled";
const DISPUTE_DAYS = 14;

export function ReimbursementsScreen() {
  const t = useTranslations("Company.reimbursements");
  const { company, capabilities, me, departmentId } = useCompany();
  const items = useReimbursements(company.id);
  const runs = usePaymentRuns(company.id);
  const [tab, setTab] = useState<Tab>(capabilities.settleReimbursements ? "settle" : "mine");
  const format = useCompanyFormat(company.currency);

  const all = (items.data ?? []).filter((item) => departmentId === null || capabilities.settleReimbursements || item.recipientId === me.id);
  const toSettle = all.filter((item) => item.status === "to-settle" || item.status === "in-run");
  const mine = all.filter((item) => item.recipientId === me.id);
  const settled = all.filter((item) => item.status === "settled");

  const header = (
    <CompanyPageHeader
      module="expenses"
      title={t("title")}
      resource={t("title")}
      actions={
        <Segmented<Tab>
          label={t("tabs.label")}
          value={tab}
          onValueChange={setTab}
          options={[
            ...(capabilities.settleReimbursements ? [{ value: "settle" as const, label: t("tabs.settle", { n: format.number(toSettle.length) }) }] : []),
            { value: "mine", label: t("tabs.mine", { n: format.number(mine.length) }) },
            ...(capabilities.settleReimbursements ? [{ value: "settled" as const, label: t("tabs.settled") }] : []),
          ]}
        />
      }
    />
  );

  if (items.isError || runs.isError) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => void items.refetch()} />
      </>
    );
  }
  if (!items.data || !runs.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  return (
    <>
      {header}
      {tab === "settle" ? <ToSettle items={toSettle} runs={runs.data} /> : null}
      {tab === "mine" ? <Mine items={mine} /> : null}
      {tab === "settled" ? <SettledList items={settled} runs={runs.data} /> : null}
    </>
  );
}

function ItemRow({ item, select, extra }: { item: Reimbursement; select?: ReactNode; extra?: ReactNode }) {
  const t = useTranslations("Company.reimbursements");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const tone = item.status === "settled" ? "info" : item.status === "in-run" ? "warning" : "success";
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-row px-3 py-2.5 inset-ring inset-ring-line">
      {select}
      <Avatar name={item.recipientName} size={32} tone="company" decorative />
      <div className="flex min-w-0 flex-1 flex-col">
        <bdi className="truncate text-sm font-bold text-fg">{item.title}</bdi>
        <span className="text-xs text-fg-secondary">
          <bdi>{item.recipientName}</bdi> ·{" "}
          {item.status === "settled" && item.settledAt
            ? t("settledOn", { date: format.day(item.settledAt.slice(0, 10)) })
            : t("approvedOn", { date: format.day(item.approvedAt.slice(0, 10)) })}
        </span>
        {item.disputeNote ? <span className="text-xs font-semibold text-warning-text">{t("disputed", { note: item.disputeNote })}</span> : null}
      </div>
      <span className="text-sm font-bold tabular text-fg">{format.money(item.amount)}</span>
      <StatusChip tone={tone}>{t(`status.${item.status}`)}</StatusChip>
      {extra}
    </li>
  );
}

function ToSettle({ items, runs }: { items: Reimbursement[]; runs: PaymentRun[] }) {
  const t = useTranslations("Company.reimbursements");
  const writable = useCompanyWritable();
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const open = runs.find((run) => run.status === "open");
  const waiting = items.filter((item) => item.status === "to-settle");
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <ProductCard as="section" aria-label={t("toSettleLabel")} className="gap-3">
        {items.length === 0 ? (
          <EmptyState icon={Check} title={t("empty.settle")} size="compact" />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                select={
                  item.status === "to-settle" && writable ? (
                    <Checkbox
                      aria-label={t("select", { title: item.title })}
                      checked={checked.has(item.id)}
                      onCheckedChange={(value) =>
                        setChecked((current) => {
                          const next = new Set(current);
                          if (value === true) next.add(item.id);
                          else next.delete(item.id);
                          return next;
                        })
                      }
                    />
                  ) : null
                }
              />
            ))}
          </ul>
        )}
        <p className="text-xs text-fg-muted">{t("note")}</p>
      </ProductCard>
      <RunCard run={open} selection={waiting.filter((item) => checked.has(item.id))} items={items} onCreated={() => setChecked(new Set())} />
    </div>
  );
}

function RunCard({ run, selection, items, onCreated }: { run: PaymentRun | undefined; selection: Reimbursement[]; items: Reimbursement[]; onCreated: () => void }) {
  const t = useTranslations("Company.reimbursements.run");
  const { company } = useCompany();
  const writable = useCompanyWritable();
  const format = useCompanyFormat(company.currency);
  const [reference, setReference] = useState("");
  const [touched, setTouched] = useState(false);
  const create = useCompanyMutation(company.id, (repo, id, itemIds: string[]) => repo.createRun(id, itemIds));
  const confirm = useCompanyMutation(company.id, (repo, id, vars: { runId: string; reference: string }) => repo.confirmRun(id, vars.runId, vars.reference));
  const runItems = run ? items.filter((item) => run.itemIds.includes(item.id)) : selection;
  const total = run ? run.total : selection.reduce((sum, item) => sum + item.amount, 0);
  const people = new Set(runItems.map((item) => item.recipientId)).size;

  const action = run ? (
    <SignatureCardAction
      icon={Check}
      label={t("confirm")}
      disabled={!writable || confirm.isPending}
      onClick={() => {
        setTouched(true);
        if (!reference.trim()) return;
        confirm.mutate({ runId: run.id, reference }, { onSuccess: () => toast({ title: t("confirmed"), description: t("confirmedBody") }) });
      }}
    />
  ) : (
    <SignatureCardAction
      icon={Plus}
      label={t("create")}
      disabled={!writable || selection.length === 0 || create.isPending}
      onClick={() =>
        create.mutate(
          selection.map((item) => item.id),
          {
            onSuccess: () => {
              onCreated();
              toast({ title: t("created") });
            },
          },
        )
      }
    />
  );

  return (
    <SignatureCard as="section" aria-labelledby="run-title" action={action} contentClassName="gap-3" className="self-start">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-bold tracking-wide text-scope-deep uppercase">{run ? t("kicker", { label: run.label }) : t("kickerNew")}</p>
        <h2 id="run-title" className="text-3xl font-semibold tabular text-fg">
          {format.money(total)}
        </h2>
        <p className="text-xs font-semibold text-fg-secondary">{t("meta", { n: format.number(runItems.length), people: format.number(people) })}</p>
      </div>
      <p className="text-sm text-fg">{t("outside")}</p>
      {run ? (
        <Field invalid={touched && !reference.trim()}>
          <FieldLabel>{t("reference")}</FieldLabel>
          <Input dir="auto" value={reference} placeholder={t("referencePlaceholder")} onChange={(event) => setReference(event.target.value)} />
          {touched && !reference.trim() ? <FieldError>{t("referenceRequired")}</FieldError> : null}
        </Field>
      ) : selection.length === 0 ? (
        <p className="text-xs text-fg-secondary">{t("pick")}</p>
      ) : null}
      <p className="flex items-start gap-2 rounded-row bg-warning-soft px-3 py-2 text-xs font-semibold text-warning-text">
        <Icon icon={Zap} size={14} className="mt-0.5 shrink-0" />
        {t("settledNote", { days: DISPUTE_DAYS })}
      </p>
    </SignatureCard>
  );
}

function Mine({ items }: { items: Reimbursement[] }) {
  const t = useTranslations("Company.reimbursements");
  const { company } = useCompany();
  const writable = useCompanyWritable();
  const format = useCompanyFormat(company.currency);
  const [disputing, setDisputing] = useState<Reimbursement | null>(null);
  const [recording, setRecording] = useState<Reimbursement | null>(null);
  const dispute = useCompanyMutation(company.id, (repo, id, vars: { itemId: string; note: string }) => repo.markNotReceived(id, vars.itemId, vars.note));
  const mark = useCompanyMutation(company.id, (repo, id, itemId: string) => repo.markRecordedInPersonal(id, itemId));
  const addTransaction = useAddTransaction();
  const today = getPlannerToday();
  const recordable = company.currency === "toman" || company.currency === "rial";

  return (
    <ProductCard as="section" aria-label={t("mineLabel")} className="gap-3">
      {items.length === 0 ? (
        <EmptyState title={t("empty.mine")} description={t("empty.mineBody")} size="compact" />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const withinWindow = item.status === "settled" && item.settledAt !== null && -format.daysFromToday(item.settledAt.slice(0, 10)) <= DISPUTE_DAYS;
            return (
              <ItemRow
                key={item.id}
                item={item}
                extra={
                  item.status === "settled" && writable ? (
                    <span className="flex flex-wrap gap-1.5">
                      {withinWindow ? (
                        <Button size="sm" variant="ghost" onClick={() => setDisputing(item)}>
                          {t("notReceived")}
                        </Button>
                      ) : null}
                      {item.recordedInPersonal ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-success-text">
                          <Icon icon={Check} size={13} />
                          {t("recorded")}
                        </span>
                      ) : recordable ? (
                        <Button size="sm" variant="secondary" onClick={() => setRecording(item)}>
                          {t("record")}
                        </Button>
                      ) : null}
                    </span>
                  ) : null
                }
              />
            );
          })}
        </ul>
      )}
      <InlineAlert tone="info" title={t("personalTitle")} description={t("personalBody")} />
      {disputing ? (
        <ReasonDialog
          title={t("disputeTitle", { title: disputing.title })}
          label={t("disputeNote")}
          submit={t("disputeSubmit")}
          pending={dispute.isPending}
          onClose={() => setDisputing(null)}
          onSubmit={(note) =>
            dispute.mutate(
              { itemId: disputing.id, note },
              {
                onSuccess: () => {
                  toast({ title: t("disputed", { note }) });
                  setDisputing(null);
                },
              },
            )
          }
        />
      ) : null}
      {recording ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => (open ? undefined : setRecording(null))}
          title={t("recordTitle")}
          description={t("recordBody", { amount: format.money(recording.amount), company: company.name })}
          confirmLabel={t("record")}
          onConfirm={async () => {
            // Idempotent: the company side records the choice first; only a first-time record writes to Personal.
            const result = await mark.mutateAsync(recording.id);
            if (!result.alreadyRecorded) {
              await addTransaction.mutateAsync({
                kind: "income",
                amountToman: company.currency === "rial" ? rialToToman(recording.amount) : recording.amount,
                category: null,
                title: t("recordTransaction", { title: recording.title }),
                day: recording.settledAt?.slice(0, 10) ?? today,
                time: null,
                note: company.name,
              });
            }
            toast({ title: result.alreadyRecorded ? t("alreadyRecorded") : t("recordedToast") });
            setRecording(null);
          }}
        />
      ) : null}
    </ProductCard>
  );
}

function SettledList({ items, runs }: { items: Reimbursement[]; runs: PaymentRun[] }) {
  const t = useTranslations("Company.reimbursements");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const confirmed = runs.filter((run) => run.status === "confirmed");
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <ProductCard as="section" aria-label={t("settledLabel")} className="gap-3">
        {items.length === 0 ? (
          <EmptyState title={t("empty.settled")} size="compact" />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </ProductCard>
      <ProductCard as="section" aria-labelledby="runs-title" className="gap-2 self-start">
        <h2 id="runs-title" className="type-title text-fg">
          {t("runs")}
        </h2>
        <ul className="flex flex-col gap-1.5">
          {confirmed.map((run) => (
            <li key={run.id} className="flex flex-col rounded-row bg-subtle px-3 py-2 text-xs">
              <span className="font-bold text-fg">
                <bdi>{run.label}</bdi> · <span className="tabular">{format.money(run.total)}</span>
              </span>
              <span className="text-fg-secondary">
                {t("runMeta", { reference: run.reference ?? "", by: run.confirmedBy ?? "", date: run.confirmedAt ? format.day(run.confirmedAt.slice(0, 10)) : "" })}
              </span>
            </li>
          ))}
        </ul>
        <Link href={companyHref(company.id, "expenses")} className="text-xs font-bold text-scope-deep hover:underline">
          {t("backToExpenses")}
        </Link>
      </ProductCard>
    </div>
  );
}
