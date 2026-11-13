"use client";

import { Check, CircleCheck, Paperclip } from "lucide-react";
import { useParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { ErrorState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { ExpenseScope, SharedExpense, SocialCurrency } from "@/data/social-domain";
import { useActivity, useGroupAccess, useScopeParticipants, useSharedExpense, useSocialMutation } from "@/data/social-queries";
import { SocialError } from "@/data/social-repositories";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { cn } from "@/lib/cn";
import { useSocialFormat } from "../format";
import { socialHref } from "../paths";
import { ExpenseStatusTag, isUnsupported, PersonAvatar, SocialPageHeader, SocialUnsupported } from "../social-ui";
import { useSocialErrorText } from "../use-social";
import { ExpenseForm, usePostToPersonalFinance } from "./expense-form";

/*
 * SO-08 · Expense detail & split (…/expenses/[eid]). Amount, payer, date,
 * receipt; the split with each share and the remainder (payer first, then
 * member order). Approver signature card: notch Approve expense; Edit &
 * approve keeps a revision; Reject needs a reason. Edit pending: the
 * approved version keeps counting until the edit is approved. Settled items
 * are corrected only through a revision + adjustment line. After approval
 * each participant may record their share once in Personal Finance.
 */
export function ExpenseDetailScreen() {
  const { id, eid } = useParams<{ id: string; eid: string }>();
  const pathname = usePathname() ?? "";
  const routeScope: ExpenseScope = pathname.startsWith("/social/groups/") ? { kind: "group", id } : { kind: "activity", id };
  const t = useTranslations("Social");
  const expense = useSharedExpense(eid);
  const group = useGroupAccess(routeScope.kind === "group" ? id : undefined);
  const activity = useActivity(routeScope.kind === "activity" ? id : undefined);
  if (expense.isError) return isUnsupported(expense.error) ? <SocialUnsupported /> : expense.error instanceof SocialError ? <AccessState kind="social-not-available" /> : <ErrorState onRetry={() => void expense.refetch()} />;
  if (!expense.data) return <AccessLoading />;
  const e = expense.data;
  const currency: SocialCurrency | null | undefined = routeScope.kind === "group" ? (group.data?.kind === "member" ? group.data.group.currency : undefined) : activity.data?.currency;
  if (currency === null) return <SocialUnsupported />;
  if (!currency) return <AccessLoading />;
  const groupCrumb = routeScope.kind === "group" && group.data?.kind === "member" ? { id: group.data.group.id, name: group.data.group.name } : activity.data?.group && !activity.data.isGuest ? activity.data.group : null;
  const trail = [
    ...(routeScope.kind === "activity" && activity.data ? [{ label: activity.data.title, href: socialHref.activity(activity.data.id) }] : []),
    { label: t("expenses.title"), href: socialHref.expenses(routeScope) },
    { label: e.current.title },
  ];
  return (
    <>
      <SocialPageHeader group={groupCrumb} trail={trail} title={<bdi>{e.current.title}</bdi>} titleAddon={<ExpenseStatusTag status={e.status} />} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="flex min-w-0 flex-col gap-4">
          {e.status === "rejected" && e.rejectReason ? <InlineAlert tone="danger" title={t("expense.rejectedWith", { reason: e.rejectReason })} /> : null}
          {e.status === "proposed" ? <AccessState kind="social-not-counted" titleAs="p" /> : null}
          {e.pendingEdit ? <EditPending expense={e} currency={currency} /> : null}
          {e.settled ? <InlineAlert tone="info" title={t("expense.settledNote")} /> : null}
          <SplitCard expense={e} currency={currency} />
          <History expense={e} currency={currency} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {e.canApprove && e.status === "proposed" ? <ApprovalCard expense={e} currency={currency} /> : null}
          <MyShareCard expense={e} currency={currency} />
        </div>
      </div>
    </>
  );
}

function SplitCard({ expense: e, currency }: { expense: SharedExpense; currency: SocialCurrency }) {
  const t = useTranslations("Social");
  const format = useSocialFormat();
  const people = useScopeParticipants(e.activityId ? { kind: "activity", id: e.activityId } : e.scope);
  const name = (id: string) => (id === "me" ? t("common.you") : (people.data?.find((p) => p.id === id)?.name ?? id));
  const v = e.current;
  const weights = v.split.values ?? {};
  return (
    <ProductCard as="section" aria-labelledby="split-title" className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <dt className="text-xs font-semibold text-fg-muted">{t("expense.amount")}</dt>
          <dd className="text-lg font-bold text-fg tabular">{format.money(v.amount, currency)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-fg-muted">{t("expense.payer")}</dt>
          <dd className="text-sm font-semibold text-fg">
            <bdi>{name(v.payerId)}</bdi>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-fg-muted">{t("expense.date")}</dt>
          <dd className="text-sm font-semibold text-fg">{format.day(v.day, "full")}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-fg-muted">{t("expense.receipt")}</dt>
          <dd className="flex items-center gap-1 text-sm font-semibold text-fg">
            {e.receipt ? (
              <>
                <Icon icon={Paperclip} size={14} />
                <bdi className="truncate">{e.receipt.name}</bdi>
              </>
            ) : (
              t("expense.noReceipt")
            )}
          </dd>
        </div>
      </dl>
      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <h2 id="split-title" className="type-title text-fg">
          {t("expense.participants")}
        </h2>
        <span className="rounded-pill bg-scope-soft px-2.5 py-0.5 text-xs font-bold text-scope-deep">{t(`split.${v.split.method}`)}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {v.shares.map((s) => (
          <li key={s.personId} className={cn("flex items-center gap-3 rounded-row px-3 py-2", s.personId === "me" ? "bg-scope-soft" : "bg-subtle")}>
            <bdi className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{name(s.personId)}</bdi>
            {v.split.method === "weighted" ? <span className="text-xs text-fg-secondary tabular">{t("split.weight", { w: format.number(weights[s.personId] ?? 1) })}</span> : null}
            {v.split.method === "percent" ? <span className="text-xs text-fg-secondary tabular">{format.number((weights[s.personId] ?? 0) / 100)}{t("split.percentSuffix")}</span> : null}
            <span className="w-36 text-end text-sm font-bold text-fg tabular">
              {format.money(s.amount, currency)}
              {s.extra > 0 ? <span className="ms-1 text-xs text-scope-deep">+{format.plain(s.extra, currency)}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="flex items-center gap-1.5 text-xs font-bold text-success-text">
        <Icon icon={CircleCheck} size={14} />
        {format.money(v.amount, currency)} · {v.remainder > 0 ? t("split.remainderTo", { n: format.plain(v.remainder, currency), names: v.shares.filter((s) => s.extra > 0).map((s) => name(s.personId)).join(", ") }) : t("split.remainder", { n: format.plain(0, currency) })}
      </p>
      <p className="text-xs text-fg-muted">{t("split.remainderRule")}</p>
      <p className="text-xs text-fg-muted">{t("expense.proposedBy", { name: e.proposer.id === "me" ? t("common.you") : e.proposer.name })}</p>
    </ProductCard>
  );
}

function EditPending({ expense: e, currency }: { expense: SharedExpense; currency: SocialCurrency }) {
  const t = useTranslations("Social.expense");
  const format = useSocialFormat();
  const errorText = useSocialErrorText();
  const decide = useSocialMutation((repo, approve: boolean) => repo.expenses.decideEdit(e.id, approve));
  const edit = e.pendingEdit!;
  return (
    <section aria-labelledby="edit-pending" className="flex flex-col gap-2 rounded-product bg-warning-soft p-5">
      <h2 id="edit-pending" className="text-sm font-bold text-warning-text">
        {t("editTitle")}
      </h2>
      <p className="text-sm text-warning-text">{t("editBody", { name: edit.by.name, from: format.money(e.current.amount, currency), to: format.money(edit.amount, currency) })}</p>
      {edit.note ? <p className="text-xs text-warning-text">{t("editNote", { note: edit.note })}</p> : null}
      {e.canApprove ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="secondary" disabled={decide.isPending} onClick={() => decide.mutate(false, { onError: (err) => toast({ title: errorText(err), tone: "danger" }) })}>
            {t("rejectEdit")}
          </Button>
          <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate(true, { onSuccess: () => toast({ title: t("approved"), tone: "success" }), onError: (err) => toast({ title: errorText(err), tone: "danger" }) })}>
            {t("approveEdit")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function ApprovalCard({ expense: e, currency }: { expense: SharedExpense; currency: SocialCurrency }) {
  const t = useTranslations("Social");
  const errorText = useSocialErrorText();
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const approve = useSocialMutation((repo) => repo.expenses.approve(e.id));
  const reject = useSocialMutation((repo) => repo.expenses.reject(e.id, reason));
  return (
    <SignatureCard
      as="section"
      aria-labelledby="approval-title"
      contentClassName="flex flex-col gap-3"
      action={<SignatureCardAction label={t("expense.approve")} icon={Check} disabled={approve.isPending} onClick={() => approve.mutate(undefined, { onSuccess: () => toast({ title: t("expense.approved"), tone: "success" }), onError: (err) => toast({ title: errorText(err), tone: "danger" }) })} />}
    >
      <p className="pe-16 text-xs font-bold tracking-wide text-scope-deep uppercase">{t("expense.approvalTitle")}</p>
      <h2 id="approval-title" className="pe-16 type-h2 text-fg">
        <bdi>{e.current.title}</bdi>
      </h2>
      <p className="text-sm text-fg-secondary">{t("expense.approvalBody")}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" aria-haspopup="dialog" onClick={() => setEditing(true)}>
          {t("expense.editApprove")}
        </Button>
        <Button variant="ghost" className="text-danger-text" aria-haspopup="dialog" onClick={() => setRejecting(true)}>
          {t("expense.reject")}
        </Button>
      </div>
      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent side="end" size="detail" title={t("propose.editTitle")} data-scope="social">
          {editing ? <ExpenseForm mode={{ kind: "edit-approve", expense: e }} currency={currency} onDone={() => setEditing(false)} /> : null}
        </SheetContent>
      </Sheet>
      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent title={t("expense.rejectTitle", { title: e.current.title })}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!reason.trim()) return;
              reject.mutate(undefined, {
                onSuccess: () => {
                  toast({ title: t("expense.rejectedToast") });
                  setRejecting(false);
                },
              });
            }}
          >
            <Field>
              <FieldLabel>{t("expense.rejectReason")}</FieldLabel>
              <Textarea dir="auto" required value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
            {reject.isError ? <p className="text-sm font-semibold text-danger-text">{errorText(reject.error)}</p> : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setRejecting(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant="destructive" disabled={!reason.trim() || reject.isPending}>
                {t("expense.reject")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SignatureCard>
  );
}

function MyShareCard({ expense: e, currency }: { expense: SharedExpense; currency: SocialCurrency }) {
  const t = useTranslations("Social");
  const format = useSocialFormat();
  const errorText = useSocialErrorText();
  const [revising, setRevising] = useState(false);
  const post = usePostToPersonalFinance();
  const counted = e.status === "approved" || e.status === "edit-pending";
  return (
    <UtilityCard as="section" aria-labelledby="my-share" className="flex flex-col gap-3">
      <h2 id="my-share" className="text-sm font-bold text-fg">
        {t("expense.yourShare")}
      </h2>
      <p className="text-2xl font-bold text-fg tabular">{format.money(e.myShare, currency)}</p>
      {counted && e.myShare > 0 ? (
        <div className="flex flex-col gap-2 rounded-row bg-surface p-3">
          <p className="text-sm font-semibold text-fg">{t("expense.finance.title")}</p>
          {currency !== "toman" ? (
            <p className="text-xs text-fg-secondary">{t("expense.finance.onlyToman", { currency: t(`currencyName.${currency}`) })}</p>
          ) : e.postedToFinance || post.data === true ? (
            <p className="flex items-center gap-1.5 text-xs font-bold text-success-text">
              <Icon icon={CircleCheck} size={14} />
              {t("expense.finance.done")}
            </p>
          ) : (
            <>
              <p className="text-xs text-fg-secondary">{t("expense.finance.body", { amount: format.money(e.myShare, currency) })}</p>
              <Button
                size="sm"
                variant="secondary"
                className="self-start"
                disabled={post.isPending}
                onClick={() =>
                  post.mutate(
                    { key: `share:${e.id}:me`, amount: e.myShare, currency, title: e.current.title, day: e.current.day },
                    { onSuccess: () => toast({ title: t("expense.finance.done"), tone: "success" }), onError: (err) => toast({ title: errorText(err), tone: "danger" }) },
                  )
                }
              >
                {t("expense.finance.action")}
              </Button>
            </>
          )}
        </div>
      ) : null}
      {e.canEdit ? (
        <Button variant="secondary" className="self-start" aria-haspopup="dialog" onClick={() => setRevising(true)}>
          {t("expense.revise")}
        </Button>
      ) : null}
      <Sheet open={revising} onOpenChange={setRevising}>
        <SheetContent side="end" size="detail" title={t("propose.reviseTitle")} data-scope="social">
          {revising ? (
            <ExpenseForm
              mode={{ kind: "revise", expense: e }}
              currency={currency}
              onDone={(id) => {
                setRevising(false);
                if (id) toast({ title: t("expense.reviseSent") });
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </UtilityCard>
  );
}

function History({ expense: e, currency }: { expense: SharedExpense; currency: SocialCurrency }) {
  const t = useTranslations("Social.expense");
  const format = useSocialFormat();
  return (
    <ProductCard as="section" aria-labelledby="history" className="flex flex-col gap-2">
      <h2 id="history" className="type-title text-fg">
        {t("history")}
      </h2>
      <ol className="flex flex-col gap-2">
        {e.revisions.map((r, i) => (
          <li key={i} className="flex items-center gap-3">
            <PersonAvatar person={r.by} />
            <span className="flex min-w-0 flex-1 flex-col">
              <bdi className="text-sm text-fg">{t(`rev.${r.kind}`, { name: r.by.name, amount: r.kind === "adjustment" ? format.signed(r.amount, currency) : format.money(r.amount, currency) })}</bdi>
              {r.note ? <bdi className="text-xs text-fg-muted">{r.note}</bdi> : null}
            </span>
            <span className="shrink-0 text-xs text-fg-muted">{format.relative(r.at)}</span>
          </li>
        ))}
      </ol>
    </ProductCard>
  );
}
