"use client";

import { Check, Plus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PillGroup } from "@/components/ui/pills";
import { Segmented } from "@/components/ui/segmented";
import type { ExpenseScope, ExpenseStatus, ScopeBalance, SharedExpense, SocialCurrency } from "@/data/social-domain";
import { useActivity, useExpenseScopes, useScopeBalance, useSharedExpenses } from "@/data/social-queries";
import { SocialError } from "@/data/social-repositories";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { cn } from "@/lib/cn";
import { useSocialFormat } from "../format";
import { socialHref } from "../paths";
import { useOpenSocialSheet } from "../sheets/social-sheet-params";
import { useSocialGroup } from "../social-gate";
import { ExpenseStatusTag, GlyphTile, isUnsupported, PersonAvatar, SocialPageHeader, SocialUnsupported } from "../social-ui";

/*
 * SO-07 · Shared expenses & balances. Expenses belong to a group or an
 * independent activity; one currency per scope. Statuses: Proposed (not
 * counted) → Approved (counted) / Rejected; editing an approved item shows
 * "Edit pending" while the approved version keeps counting. Scope switch
 * (group / each activity). Balance signature card: my net, paid, share and
 * simplified transfers (notch Settle up → SO-09). Everyone's balances only
 * with the narrow aggregate permission (S5); guests see only expenses they
 * take part in.
 */

type Filter = "all" | ExpenseStatus;
const FILTERS: Filter[] = ["all", "proposed", "approved", "edit-pending", "rejected"];

/** /social/groups/[id]/expenses (inside the group gate). */
export function GroupExpensesScreen() {
  const group = useSocialGroup();
  const scopes = useExpenseScopes(group.id);
  const [selected, setSelected] = useState("all");
  const t = useTranslations("Social.expenses");
  const options = scopes.data ?? [];
  // No group currency served (live API: shared expenses are not in the contract).
  if (group.currency === null) return <SocialUnsupported />;
  const scope: ExpenseScope = selected === "all" ? { kind: "group", id: group.id } : { kind: "activity", id: selected };
  const scopeName = selected === "all" ? group.name : (options.find((o) => o.scope.id === selected)?.name ?? group.name);
  return (
    <ExpensesView
      routeScope={{ kind: "group", id: group.id }}
      scope={scope}
      scopeName={scopeName}
      currency={group.currency}
      group={group}
      proposeExtra={selected === "all" ? {} : { activity: selected }}
      switcher={
        options.length > 1 ? (
          <Segmented
            label={t("scopeLabel")}
            value={selected}
            onValueChange={setSelected}
            options={options.map((o) => ({ value: o.scope.kind === "group" ? "all" : o.scope.id, label: o.scope.kind === "group" ? t("scopeAll") : o.name }))}
          />
        ) : null
      }
    />
  );
}

/** /social/activities/[id]/expenses: independent activity, or a group activity's share of the group's expenses. */
export function ActivityExpensesScreen() {
  const { id } = useParams<{ id: string }>();
  const activity = useActivity(id);
  if (activity.isError) return isUnsupported(activity.error) ? <SocialUnsupported /> : activity.error instanceof SocialError ? <AccessState kind="social-not-available" /> : <ErrorState onRetry={() => void activity.refetch()} />;
  if (!activity.data) return <AccessLoading />;
  const a = activity.data;
  return (
    <ExpensesView
      routeScope={{ kind: "activity", id: a.id }}
      scope={{ kind: "activity", id: a.id }}
      scopeName={a.title}
      currency={a.currency}
      group={a.group && !a.isGuest ? a.group : null}
      activityCrumb={{ id: a.id, title: a.title }}
      guest={a.isGuest}
      proposeExtra={a.group ? { activity: a.id } : {}}
      proposeScope={a.group ? { kind: "group", id: a.group.id } : { kind: "activity", id: a.id }}
    />
  );
}

function ExpensesView({
  routeScope,
  scope,
  scopeName,
  currency,
  group,
  activityCrumb,
  guest = false,
  switcher,
  proposeExtra,
  proposeScope,
}: {
  routeScope: ExpenseScope;
  scope: ExpenseScope;
  scopeName: string;
  currency: SocialCurrency;
  group: { id: string; name: string } | null;
  activityCrumb?: { id: string; title: string };
  guest?: boolean;
  switcher?: ReactNode;
  proposeExtra: Record<string, string>;
  proposeScope?: ExpenseScope;
}) {
  const t = useTranslations("Social");
  const format = useSocialFormat();
  const openSheet = useOpenSocialSheet();
  const expenses = useSharedExpenses(scope);
  const balance = useScopeBalance(scope);
  const [filter, setFilter] = useState<Filter>("all");
  // A group activity's expenses are proposed to the group (one currency per group) and tagged with the activity.
  const sheetScope = proposeScope ?? (scope.kind === "activity" && group ? { kind: "group" as const, id: group.id } : scope);
  const trail = activityCrumb ? [{ label: activityCrumb.title, href: socialHref.activity(activityCrumb.id) }, { label: t("expenses.title") }] : [{ label: t("expenses.title") }];

  const header = (
    <SocialPageHeader
      group={group}
      trail={trail}
      title={t("expenses.title")}
      titleAddon={<span className="text-sm font-semibold text-fg-secondary">{t("expenses.currencyNote", { currency: t(`currencyName.${currency}`), kind: routeScope.kind })}</span>}
      actions={
        <>
          {switcher}
          <Button className="gap-2" aria-haspopup="dialog" onClick={() => openSheet("expense-propose", { scope: `${sheetScope.kind}:${sheetScope.id}`, ...proposeExtra })}>
            <Icon icon={Plus} size={16} />
            {t("expenses.propose")}
          </Button>
        </>
      }
    />
  );
  if (expenses.isError) {
    return (
      <>
        {header}
        {isUnsupported(expenses.error) ? <SocialUnsupported /> : expenses.error instanceof SocialError ? <AccessState kind="social-not-available" /> : <ErrorState onRetry={() => void expenses.refetch()} />}
      </>
    );
  }
  if (!expenses.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }
  const list = expenses.data;
  const count = (f: Filter) => (f === "all" ? list.length : list.filter((e) => e.status === f).length);
  const shown = filter === "all" ? list : list.filter((e) => e.status === filter);
  return (
    <>
      {header}
      {guest ? <InlineAlert tone="info" title={t("expenses.guestNote")} /> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <ProductCard as="section" aria-label={t("expenses.title")} className="flex flex-col gap-3">
          {list.length === 0 ? (
            <EmptyState title={t("expenses.empty")} description={t("expenses.emptyBody")} />
          ) : (
            <>
              <PillGroup<Filter> label={t("expenses.filterLabel")} value={filter} onValueChange={setFilter} options={FILTERS.map((f) => ({ value: f, label: t(`expenses.filters.${f}`), count: format.number(count(f)) }))} />
              <ul className="flex flex-col gap-2">
                {shown.map((e) => (
                  <ExpenseRow key={e.id} expense={e} href={socialHref.expense(routeScope, e.id)} currency={currency} />
                ))}
              </ul>
              <p className="text-xs text-fg-muted">{t("expenses.countedNote", { total: balance.data ? format.money(balance.data.approvedTotal, currency) : "…" })}</p>
            </>
          )}
        </ProductCard>
        {balance.data ? <BalanceSignature balance={balance.data} scopeName={scopeName} settleHref={socialHref.settle(routeScope)} /> : null}
      </div>
    </>
  );
}

function ExpenseRow({ expense: e, href, currency }: { expense: SharedExpense; href: string; currency: SocialCurrency }) {
  const t = useTranslations("Social");
  const format = useSocialFormat();
  const v = e.current;
  const payer = v.payerId === "me" ? t("common.you") : e.payer.name;
  const method = t("expenses.methodCount", { method: t(`split.${v.split.method}`).toLocaleLowerCase(), n: format.number(v.split.participants.length) });
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "flex min-h-16 flex-wrap items-center gap-3 rounded-row px-3 py-2.5 transition-colors",
          e.status === "proposed" ? "bg-scope-soft/60 inset-ring-[1.5px] inset-ring-scope-deep" : "bg-subtle hover:bg-raised",
        )}
      >
        <GlyphTile kind="expense" />
        <span className="flex min-w-0 flex-1 flex-col">
          <bdi className="truncate text-sm font-bold text-fg">{v.title}</bdi>
          <span className="truncate text-xs text-fg-secondary">
            {t("expenses.paidBy", { name: payer, method })}
            {e.settled ? ` · ${t("expenses.settledTag")}` : ""}
          </span>
        </span>
        <span className={cn("text-sm font-bold tabular", e.status === "rejected" ? "text-fg-muted line-through" : "text-fg")}>{format.money(v.amount, currency)}</span>
        <ExpenseStatusTag status={e.status} />
      </Link>
    </li>
  );
}

/** The balance signature card (SO-07 / SO-09): notch = Settle up. */
export function BalanceSignature({ balance: b, scopeName, settleHref }: { balance: ScopeBalance; scopeName: string; settleHref: string }) {
  const t = useTranslations("Social");
  const format = useSocialFormat();
  const router = useRouter();
  const name = (id: string) => (id === "me" ? t("common.you") : (b.members.find((m) => m.id === id)?.name ?? id));
  const person = (id: string) => b.members.find((m) => m.id === id) ?? { id, name: id, initials: "?" };
  return (
    <SignatureCard
      as="section"
      aria-labelledby="balance-title"
      contentClassName="flex flex-col gap-3"
      action={<SignatureCardAction label={t("common.settleUp")} icon={Check} onClick={() => router.push(settleHref)} />}
    >
      <p id="balance-title" className="pe-16 text-xs font-bold tracking-wide text-scope-deep uppercase">
        {t("expenses.balanceTitle", { scope: scopeName })}
      </p>
      <p className={cn("type-display tabular", b.mine.net > 0 ? "text-success-text" : b.mine.net < 0 ? "text-danger-text" : "text-fg")}>{format.signed(b.mine.net, b.currency)}</p>
      <p className="text-xs text-fg-secondary">
        {t("expenses.paidShare", { paid: format.money(b.mine.paid, b.currency), share: format.money(b.mine.share, b.currency) })}
        {b.mine.settled !== 0 ? ` · ${t("expenses.settled", { amount: format.signed(b.mine.settled, b.currency) })}` : ""}
      </p>
      <h3 className="pt-1 text-xs font-bold tracking-wide text-fg-muted uppercase">{t("expenses.simplified")}</h3>
      {b.transfers.length === 0 ? (
        <p className="rounded-row bg-subtle p-3 text-sm text-fg-secondary">{t("expenses.settledUp")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {b.transfers.map((tr) => (
            <li key={`${tr.fromId}-${tr.toId}`} className="flex items-center gap-2.5 rounded-row bg-subtle px-3 py-2.5">
              <PersonAvatar person={person(tr.fromId === "me" ? tr.toId : tr.fromId)} />
              <bdi className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{t("settle.line", { from: name(tr.fromId), to: name(tr.toId) })}</bdi>
              <span className="text-sm font-bold text-fg tabular">{format.money(tr.amount, b.currency)}</span>
            </li>
          ))}
        </ul>
      )}
      {b.everyone ? (
        <details className="rounded-row bg-subtle p-3">
          <summary className="cursor-pointer text-xs font-bold text-fg-secondary">{t("expenses.everyone")}</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {b.everyone.map((row) => (
              <li key={row.person.id} className="flex justify-between gap-2 text-sm">
                <bdi>{name(row.person.id)}</bdi>
                <span className={cn("font-semibold tabular", row.net > 0 ? "text-success-text" : row.net < 0 ? "text-danger-text" : "text-fg-secondary")}>{format.signed(row.net, b.currency)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="text-xs text-fg-muted">{t("expenses.visibilityNote")}</p>
      )}
    </SignatureCard>
  );
}
