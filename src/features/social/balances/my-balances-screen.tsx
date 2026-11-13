"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { totalsByCurrency } from "@/data/social-money";
import { useMyBalances, useSettlements } from "@/data/social-queries";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { cn } from "@/lib/cn";
import { SettlementRow } from "../expenses/settle-screen";
import { useSocialFormat } from "../format";
import { socialHref } from "../paths";
import { isUnsupported, SocialPageHeader, SocialUnsupported } from "../social-ui";

/*
 * SO-17 · My balances (/social/balances). One row per scope (group or
 * independent activity) in its own currency — no conversion and never a
 * cross-currency total. Totals signature card = net per currency (notch
 * Settle up → the scope with the most open transfers). Waiting for you =
 * payments others recorded that I must confirm. Settled payments can be
 * recorded once in Personal Finance (explicit, idempotent).
 */
export function MyBalancesScreen() {
  const t = useTranslations("Social");
  const format = useSocialFormat();
  const router = useRouter();
  const balances = useMyBalances();
  const settlements = useSettlements(null);
  const header = <SocialPageHeader trail={[{ label: t("balances.title") }]} title={t("balances.title")} subtitle={t("balances.noConversion")} />;
  if (balances.isError) return <>{header}{isUnsupported(balances.error) ? <SocialUnsupported /> : <ErrorState onRetry={() => void balances.refetch()} />}</>;
  if (!balances.data || !settlements.data) return <>{header}<AccessLoading /></>;
  const rows = balances.data;
  if (rows.length === 0) return <>{header}<EmptyState title={t("balances.empty")} /></>;
  const totals = totalsByCurrency(rows.map((b) => ({ currency: b.currency, net: b.mine.net })));
  const open = (b: (typeof rows)[number]) => b.transfers.filter((x) => x.fromId === "me" || x.toId === "me").length;
  const busiest = [...rows].filter((b) => !b.left).sort((a, b) => open(b) - open(a))[0] ?? rows[0]!;
  const waiting = settlements.data.filter((s) => s.awaitingMe);
  const settled = settlements.data.filter((s) => s.status === "confirmed");
  return (
    <>
      {header}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="flex min-w-0 flex-col gap-4">
          <ProductCard as="section" aria-label={t("balances.title")} className="flex flex-col gap-2">
            <ul className="flex flex-col gap-2">
              {rows.map((b) => {
                return (
                  <li key={`${b.scope.kind}:${b.scope.id}`}>
                    <BalanceRowLink href={b.left ? null : socialHref.expenses(b.scope)}>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <bdi className="truncate text-sm font-bold text-fg">{b.name}</bdi>
                        <span className="text-xs text-fg-secondary">
                          {[b.scope.kind === "activity" ? t("balances.independent") : null, b.left ? t("balances.left") : null, t(`currencyName.${b.currency}`), t("balances.rowLine", { counted: format.number(b.counted), pending: format.number(b.proposedCount + b.pendingEditCount) })].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="flex flex-col items-end">
                        <span className={cn("text-base font-bold tabular", b.mine.net > 0 ? "text-success-text" : b.mine.net < 0 ? "text-danger-text" : "text-fg")}>{format.signed(b.mine.net, b.currency)}</span>
                        <span className="text-xs text-fg-muted">{b.mine.net > 0 ? t("balance.owed") : b.mine.net < 0 ? t("balance.owe") : t("balance.even")}</span>
                      </span>
                    </BalanceRowLink>
                  </li>
                );
              })}
            </ul>
          </ProductCard>
          {settled.length > 0 ? (
            <ProductCard as="section" aria-labelledby="settled-payments" className="flex flex-col gap-3">
              <h2 id="settled-payments" className="type-title text-fg">{t("balances.settled")}</h2>
              <ul className="flex flex-col gap-2">
                {settled.map((s) => <SettlementRow key={s.id} settlement={s} />)}
              </ul>
            </ProductCard>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <SignatureCard as="section" aria-labelledby="totals" contentClassName="flex flex-col gap-3" action={<SignatureCardAction label={t("common.settleUp")} icon={Check} onClick={() => router.push(socialHref.settle(busiest.scope))} />}>
            <h2 id="totals" className="pe-16 text-xs font-bold tracking-wide text-scope-deep uppercase">{t("balances.totals")}</h2>
            <ul className="flex flex-col gap-2">
              {totals.map((row) => (
                <li key={row.currency} className="flex flex-col">
                  <span className={cn("type-h2 tabular", row.net > 0 ? "text-success-text" : row.net < 0 ? "text-danger-text" : "text-fg")}>{format.signed(row.net, row.currency)}</span>
                  <span className="text-xs text-fg-secondary">{t(`currencyName.${row.currency}`)} · {row.net > 0 ? t("balance.owed") : row.net < 0 ? t("balance.owe") : t("balance.even")}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-fg-muted">{t("balances.noConversion")} {t("balances.settleHint")}</p>
          </SignatureCard>
          <ProductCard as="section" aria-labelledby="waiting" className="flex flex-col gap-3">
            <h2 id="waiting" className="type-title text-fg">{t("balances.waiting")}</h2>
            {waiting.length === 0 ? <p className="rounded-row bg-subtle p-3 text-sm text-fg-secondary">{t("home.noNeeds")}</p> : (
              <ul className="flex flex-col gap-2">
                {waiting.map((s) => <SettlementRow key={s.id} settlement={s} />)}
              </ul>
            )}
          </ProductCard>
        </div>
      </div>
    </>
  );
}

const rowClass = "flex flex-wrap items-center gap-3 rounded-row bg-subtle px-3 py-3";

/** A left group's row is not a link: its pages are no longer accessible. */
function BalanceRowLink({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) return <div className={rowClass}>{children}</div>;
  return (
    <Link href={href} className={cn(rowClass, "hover:bg-raised")}>
      {children}
    </Link>
  );
}
