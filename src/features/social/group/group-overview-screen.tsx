"use client";

import { Plus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { GroupDetail } from "@/data/social-domain";
import { useActivities, useGroupEvents, useLoans, useScopeBalance } from "@/data/social-queries";
import { FolderTabsCard } from "@/design-system/surfaces/folder-tabs-card";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { cn } from "@/lib/cn";
import { ActivityRow, NextActivityCard, PlanSomethingCard } from "../activity/activity-parts";
import { useSocialFormat } from "../format";
import { InviteDialog } from "../members/invite-dialog";
import { socialHref } from "../paths";
import { useOpenSocialSheet } from "../sheets/social-sheet-params";
import { useSocialGroup } from "../social-gate";
import { GlyphTile, isUnsupported, PersonAvatar, SocialPageHeader, SocialUnsupported } from "../social-ui";

/*
 * SO-04 · Group overview (/social/groups/[id]). Job: what's next with these
 * people, what do I owe / am I owed, what's lent — no feed, likes or
 * ranking. Signature card = next activity (notch Open activity). Balance:
 * net of approved shares only; proposed and pending edits shown as text;
 * Settle up → SO-09. Folder tabs Upcoming · Activity · Lending. People: the
 * optional per-group status dot only (PEOPLE_FLOW, status only).
 */
export function GroupOverviewScreen() {
  const t = useTranslations("Social");
  const group = useSocialGroup();
  const format = useSocialFormat();
  const openSheet = useOpenSocialSheet();
  const activities = useActivities("all", group.id);
  const [inviting, setInviting] = useState(false);
  const planned = (activities.data ?? []).filter((a) => a.status === "planned");
  const next = planned.find((a) => a.myRsvp === "going" || a.myRsvp === "maybe") ?? planned[0];
  const others = planned.filter((a) => a.id !== next?.id);

  return (
    <>
      <SocialPageHeader
        title={<bdi>{group.name}</bdi>}
        titleAddon={
          <span className="flex flex-wrap gap-3 text-sm font-semibold text-fg-secondary">
            <span>{t("people", { count: group.memberCount ?? 0, n: group.memberCount === null ? t("common.notShown") : format.number(group.memberCount) })}</span>
            <span>{t(`visibility.${group.visibility}`)}</span>
          </span>
        }
        actions={
          <>
            {group.capabilities.invite ? (
              <Button variant="secondary" className="gap-2" aria-haspopup="dialog" onClick={() => setInviting(true)}>
                <Icon icon={UserPlus} size={16} />
                {t("common.invite")}
              </Button>
            ) : null}
            <Button className="gap-2" aria-haspopup="dialog" onClick={() => openSheet("activity-new", { group: group.id })}>
              <Icon icon={Plus} size={16} />
              {t("common.newActivity")}
            </Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {activities.isError && isUnsupported(activities.error) ? <SocialUnsupported compact /> : next ? <NextActivityCard activity={next} /> : activities.data ? <PlanSomethingCard groupId={group.id} /> : null}
          <FolderTabsCard
            label={t("group.tabs.label")}
            defaultValue="upcoming"
            tabs={[
              {
                value: "upcoming",
                label: t("group.tabs.upcoming"),
                count: format.number(others.length),
                content: activities.isError ? (
                  <SocialUnsupported compact />
                ) : others.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {others.map((a) => (
                      <ActivityRow key={a.id} activity={a} showGroup={false} action="respond" />
                    ))}
                  </ul>
                ) : (
                  <p className="p-2 text-sm text-fg-secondary">{t("group.noUpcoming")}</p>
                ),
              },
              { value: "activity", label: t("group.tabs.activity"), content: <EventsTab groupId={group.id} /> },
              { value: "lending", label: t("group.tabs.lending"), content: <LendingTab groupId={group.id} /> },
            ]}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <BalanceCard group={group} />
          <PeopleCard group={group} />
        </div>
      </div>
      {inviting ? <InviteDialog group={group} onClose={() => setInviting(false)} /> : null}
    </>
  );
}

function BalanceCard({ group }: { group: GroupDetail }) {
  const t = useTranslations("Social");
  const format = useSocialFormat();
  const balance = useScopeBalance({ kind: "group", id: group.id });
  const b = balance.data;
  if (balance.isError) return <SocialUnsupported compact />;
  if (!b || !group.currency) return <ProductCard className="min-h-40" aria-busy="true" />;
  const net = b.mine.net;
  return (
    <ProductCard as="section" aria-labelledby="group-balance" className="flex flex-col gap-2">
      <h2 id="group-balance" className="type-title text-fg">
        {t("group.balanceTitle")}
      </h2>
      <p className="flex flex-wrap items-baseline gap-x-3">
        <span className={cn("type-display tabular", net > 0 ? "text-success-text" : net < 0 ? "text-danger-text" : "text-fg")}>{format.signed(net, b.currency)}</span>
        <span className="text-sm font-semibold text-fg-secondary">{net > 0 ? t("balance.owed") : net < 0 ? t("balance.owe") : t("balance.even")}</span>
      </p>
      <p className="text-xs text-fg-muted">
        {t("group.fromApproved", { approved: format.number(b.counted), proposed: format.number(b.proposedCount), edits: format.number(b.pendingEditCount) })}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button asChild size="sm" variant="secondary">
          <Link href={socialHref.group(group.id, "expenses")}>{t("common.details")}</Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href={socialHref.settle({ kind: "group", id: group.id })}>{t("common.settleUp")}</Link>
        </Button>
      </div>
    </ProductCard>
  );
}

function PeopleCard({ group }: { group: GroupDetail }) {
  const t = useTranslations("Social");
  const format = useSocialFormat();
  const shown = group.members.slice(0, 8);
  const more = group.members.length - shown.length;
  return (
    <ProductCard as="section" aria-labelledby="group-people" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 id="group-people" className="type-title text-fg">
          <Link href={socialHref.group(group.id, "members")} className="hover:underline">
            {t("group.people")}
          </Link>
        </h2>
        <span className="text-xs font-bold text-fg-muted tabular">{group.memberCount === null ? t("common.notShown") : format.number(group.memberCount)}</span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {shown.map((m) => (
          <li key={m.person.id}>
            <PersonAvatar person={m.person} status={m.status} />
          </li>
        ))}
        {more > 0 ? (
          <li>
            <Link href={socialHref.group(group.id, "members")} className="inline-flex size-8 items-center justify-center rounded-full bg-raised text-xs font-bold text-fg-secondary">
              +{format.number(more)}
            </Link>
          </li>
        ) : null}
      </ul>
      <p className="text-xs text-fg-muted">{t("group.statusNote")}</p>
    </ProductCard>
  );
}

function EventsTab({ groupId }: { groupId: string }) {
  const t = useTranslations("Social.group");
  const format = useSocialFormat();
  const events = useGroupEvents(groupId);
  const list = events.data ?? [];
  if (events.isError) return <SocialUnsupported compact />;
  if (list.length === 0) return <p className="p-2 text-sm text-fg-secondary">{t("noEvents")}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {list.map((e) => (
        <li key={e.id} className="flex items-center gap-3 rounded-row bg-subtle px-3 py-2">
          <PersonAvatar person={e.actor} />
          <bdi className="min-w-0 flex-1 text-sm text-fg">{t(`events.${e.kind}`, { name: e.actor.name, subject: e.subject })}</bdi>
          <span className="shrink-0 text-xs text-fg-muted">{format.relative(e.at)}</span>
        </li>
      ))}
    </ul>
  );
}

function LendingTab({ groupId }: { groupId: string }) {
  const t = useTranslations("Social");
  const format = useSocialFormat();
  const loans = useLoans(groupId);
  const out = (loans.data ?? []).filter((l) => l.status === "out" || l.status === "accepted" || l.status === "requested");
  if (loans.isError) return <SocialUnsupported compact />;
  return (
    <div className="flex flex-col gap-2">
      {out.length === 0 ? <p className="p-2 text-sm text-fg-secondary">{t("group.noLending")}</p> : null}
      <ul className="flex flex-col gap-2">
        {out.map((l) => (
          <li key={l.id} className="flex items-center gap-3 rounded-row bg-subtle px-3 py-2">
            <GlyphTile kind={l.thing.category} />
            <span className="flex min-w-0 flex-1 flex-col">
              <bdi className="truncate text-sm font-bold text-fg">{l.thing.name}</bdi>
              <span className="truncate text-xs text-fg-secondary">
                {l.lender.name} → {l.borrower.name} · {t("lending.dueOn", { date: format.day(l.due) })}
              </span>
            </span>
            {l.overdue ? <span className="shrink-0 rounded-pill bg-danger-soft px-2.5 py-0.5 text-xs font-bold text-danger-text">{t("lending.state.overdue")}</span> : null}
          </li>
        ))}
      </ul>
      <Link href={socialHref.group(groupId, "lending")} className="self-start text-sm font-semibold text-scope-deep hover:underline">
        {t("group.openLending")}
      </Link>
    </div>
  );
}
