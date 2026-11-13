"use client";

import { ArrowRight, Plus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AccessLoading } from "@/components/feedback/access-state";
import { ErrorState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { NeedsYouItem } from "@/data/social-domain";
import { totalsByCurrency } from "@/data/social-money";
import { useActivities, useConnections, useMyBalances, useNeedsYou, useSocialDirectory } from "@/data/social-queries";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { cn } from "@/lib/cn";
import { ActivityRow, NextActivityCard, PlanSomethingCard } from "../activity/activity-parts";
import { useSocialFormat } from "../format";
import { socialHref } from "../paths";
import { useOpenSocialSheet } from "../sheets/social-sheet-params";
import { isUnsupported, PersonAvatar, SectionHead, SocialPageHeader, SocialUnsupported } from "../social-ui";

/*
 * SO-15 · Social home (/social). What's next with friends and what needs
 * me — not a feed (no posts, likes or follower counts). Signature card =
 * the next activity I'm going to (notch Open activity), else "Plan
 * something" (notch New activity). Needs you: each item with one action.
 * Balances: net per currency across groups and independent activities,
 * approved records only, never summed across currencies → SO-17. Groups
 * with unread chat. States: first use · nothing in 30 days · guest-only.
 */
export function SocialHomeScreen() {
  const t = useTranslations("Social");
  const openSheet = useOpenSocialSheet();
  const upcoming = useActivities("all");
  const needs = useNeedsYou();
  const balances = useMyBalances();
  const directory = useSocialDirectory();
  const connections = useConnections();
  const format = useSocialFormat();

  const header = (
    <SocialPageHeader
      title={t("home.title")}
      subtitle={t("home.subtitle")}
      actions={
        <>
          <Button variant="secondary" className="gap-2" aria-haspopup="dialog" onClick={() => openSheet("connect")}>
            <Icon icon={UserPlus} size={16} />
            {t("common.connect")}
          </Button>
          <Button className="gap-2" aria-haspopup="dialog" onClick={() => openSheet("activity-new")}>
            <Icon icon={Plus} size={16} />
            {t("common.newActivity")}
          </Button>
        </>
      }
    />
  );

  // Parts the server does not offer (live API) show "not available yet"; real failures offer a retry.
  const queries = [upcoming, needs, directory, balances, connections];
  const off = (q: (typeof queries)[number]) => q.isError && isUnsupported(q.error);
  const failed = queries.find((q) => q.isError && !off(q));
  if (failed) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => void Promise.all(queries.map((q) => q.refetch()))} />
      </>
    );
  }
  if (queries.some((q) => q.data === undefined && !off(q))) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  const activitiesOff = off(upcoming);
  const balancesOff = off(balances);
  const firstUse = !activitiesOff && directory.data!.groups.length === 0 && connections.data!.length === 0 && upcoming.data!.length === 0;
  if (firstUse) {
    return (
      <>
        {header}
        <ProductCard className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 py-12 text-center">
          <h2 className="type-h2 text-fg">{t("home.firstUse.title")}</h2>
          <p className="text-sm text-fg-secondary">{t("home.firstUse.body")}</p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button variant="secondary" onClick={() => openSheet("connect")}>
              {t("common.connect")}
            </Button>
            <Button onClick={() => openSheet("activity-new")}>{t("common.newActivity")}</Button>
          </div>
        </ProductCard>
      </>
    );
  }

  const planned = (upcoming.data ?? []).filter((a) => a.status === "planned");
  const next = planned.find((a) => a.myRsvp === "going");
  const within30 = planned.filter((a) => format.daysFromToday(a.startDay) <= 30);
  const comingUp = within30.filter((a) => a.id !== next?.id);
  const totals = totalsByCurrency((balances.data ?? []).map((b) => ({ currency: b.currency, net: b.mine.net })));

  return (
    <>
      {header}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="flex min-w-0 flex-col gap-4">
          {activitiesOff ? <SocialUnsupported compact /> : next ? <NextActivityCard activity={next} /> : <PlanSomethingCard />}
          <ProductCard as="section" aria-labelledby="coming-up" className="flex flex-col gap-3">
            <SectionHead
              id="coming-up"
              title={t("home.comingUp")}
              end={
                <Link href={socialHref.activities} className="text-sm font-semibold text-scope-deep hover:underline">
                  {t("common.seeAll")}
                </Link>
              }
            />
            {activitiesOff ? (
              <SocialUnsupported compact />
            ) : comingUp.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {comingUp.map((activity) => (
                  <ActivityRow key={activity.id} activity={activity} action="respond" />
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-start gap-3 rounded-row bg-subtle p-4">
                <p className="text-sm text-fg-secondary">{t("home.nothingSoon")}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => openSheet("activity-new")}>
                    {t("common.newActivity")}
                  </Button>
                  <Button size="sm" variant="secondary" asChild>
                    <Link href={socialHref.groups("discover")}>{t("home.findGroups")}</Link>
                  </Button>
                </div>
              </div>
            )}
          </ProductCard>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <ProductCard as="section" aria-labelledby="needs-you" className="flex flex-col gap-3">
            <SectionHead id="needs-you" title={t("home.needsYou")} end={needs.data!.length > 0 ? <span className="text-sm font-bold text-fg-muted tabular">{format.number(needs.data!.length)}</span> : null} />
            {needs.data!.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {needs.data!.map((item) => (
                  <NeedsYouRow key={item.id} item={item} />
                ))}
              </ul>
            ) : (
              <p className="rounded-row bg-subtle p-4 text-sm text-fg-secondary">{t("home.noNeeds")}</p>
            )}
          </ProductCard>
          <ProductCard as="section" aria-labelledby="home-balances" className="flex flex-col gap-3">
            <SectionHead
              id="home-balances"
              title={t("home.balances")}
              end={
                <Link href={socialHref.balances} className="text-sm font-semibold text-scope-deep hover:underline">
                  {t("common.details")}
                </Link>
              }
            />
            <ul className="flex flex-col gap-1.5">
              {balancesOff ? <li><SocialUnsupported compact /></li> : null}
              {totals.map((row) => (
                <li key={row.currency} className="flex items-baseline justify-between gap-3 rounded-row bg-subtle px-3 py-2.5">
                  <span className="text-sm font-semibold text-fg-secondary">{t(`currencyName.${row.currency}`)}</span>
                  <span className="flex flex-col items-end">
                    <span className={cn("text-lg font-bold tabular", row.net > 0 ? "text-success-text" : row.net < 0 ? "text-danger-text" : "text-fg")}>{format.signed(row.net, row.currency)}</span>
                    <span className="text-xs text-fg-muted">{row.net > 0 ? t("balance.owed") : row.net < 0 ? t("balance.owe") : t("balance.even")}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-fg-muted">{t("home.balancesNote")}</p>
          </ProductCard>
          <ProductCard as="section" aria-labelledby="home-groups" className="flex flex-col gap-3">
            <SectionHead id="home-groups" title={t("home.groups")} />
            <ul className="flex flex-col gap-1.5">
              {directory.data!.groups.map((group) => (
                <li key={group.id}>
                  <Link href={socialHref.group(group.id)} className="flex min-h-touch items-center gap-3 rounded-row px-2 py-1.5 transition-colors hover:bg-subtle">
                    <span aria-hidden="true" className="inline-flex size-9 shrink-0 items-center justify-center rounded-tile bg-scope-soft text-xs font-bold text-scope-deep">
                      <bdi>{group.initials}</bdi>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <bdi className="truncate text-sm font-bold text-fg">{group.name}</bdi>
                      <span className="text-xs text-fg-secondary">{t("people", { count: group.memberCount ?? 0, n: group.memberCount === null ? t("common.notShown") : format.number(group.memberCount) })}</span>
                    </span>
                    {group.unread > 0 ? <span className="shrink-0 rounded-pill bg-scope-soft px-2.5 py-0.5 text-xs font-bold text-scope-deep">{t("home.unread", { n: format.number(group.unread) })}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </ProductCard>
        </div>
      </div>
    </>
  );
}

function NeedsYouRow({ item }: { item: NeedsYouItem }) {
  const t = useTranslations("Social.home");
  const format = useSocialFormat();
  const text = t(`needs.${item.kind}`, { name: item.person?.name ?? "", thing: item.subject, title: item.subject });
  return (
    <li className="flex min-h-14 items-center gap-3 rounded-row bg-subtle px-3 py-2">
      {item.person ? <PersonAvatar person={item.person} /> : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <bdi className="text-sm font-semibold text-fg">{text}</bdi>
        <span className="truncate text-xs text-fg-secondary">
          {[item.money ? format.money(item.money.amount, item.money.currency) : null, item.scopeName || null, item.kind === "connection" || item.kind === "join-request" ? item.subject || null : null].filter(Boolean).join(" · ")}
        </span>
      </span>
      <Link href={item.href} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-pill bg-surface px-3.5 text-xs font-bold text-fg shadow-island hover:bg-raised">
        {t(`actions.${item.kind}`)}
        <Icon icon={ArrowRight} size={14} mirror />
      </Link>
    </li>
  );
}
