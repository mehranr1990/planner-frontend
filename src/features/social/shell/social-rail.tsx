"use client";

import { CalendarPlus, ChevronLeft, Plus, UserPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { NavLink } from "@/components/navigation/nav-link";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { useNeedsYou, useSocialDirectory } from "@/data/social-queries";
import type { AppContext, NavItem, NavItemId } from "@/features/navigation/types";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatNumber } from "@/lib/locale/digits";
import { cn } from "@/lib/cn";
import { socialHref } from "../paths";
import { useOpenSocialSheet } from "../sheets/social-sheet-params";

/*
 * Social rails (SO-01). Home rail: Home · Connections | Groups · Activities |
 * My balances · Lending | New (+) — the (+) menu offers New activity, New
 * group and Connect. Group rail (/social/groups/[id]): Back · Overview ·
 * Activities · Calendar · Chat | Expenses · Lending & found · Album ·
 * Challenges | Members | Settings. Badges: Connections = incoming requests;
 * Chat = the group's unread count; Expenses = items waiting for my approval.
 */

export function SocialRail({ context, ariaLabel, tooltipSide, activeItemId, className }: { context: AppContext; ariaLabel: string; tooltipSide: "left" | "right"; activeItemId?: NavItemId; className?: string }) {
  const t = useTranslations("Social.shell.rail");
  const badgeFor = useSocialBadges(context.workspaceId);
  const openSheet = useOpenSocialSheet();
  const byId = new Map(context.nav.map((item) => [item.id, item]));
  const resolve = (ids: readonly NavItemId[]) => ids.map((id) => byId.get(id)).filter((item): item is NavItem => item !== undefined);
  const groups = (context.rail?.groups ?? []).map(resolve).filter((group) => group.length > 0);
  const footer = resolve(context.rail?.footer ?? []);
  const inGroup = context.workspaceId !== undefined;
  const link = (item: NavItem) => (
    <li key={item.id}>
      <NavLink item={item} iconOnly tooltipSide={tooltipSide} badge={badgeFor(item.id)} active={activeItemId === undefined ? undefined : item.id === activeItemId} />
    </li>
  );

  return (
    <nav aria-label={ariaLabel} data-scope="social" data-rail={inGroup ? "social-group" : "social"} className={cn("flex max-h-full w-16 shrink-0 flex-col rounded-card bg-surface p-1 text-fg shadow-island", className)}>
      <div className="flex min-h-0 flex-col overflow-y-auto overscroll-contain p-1 [scrollbar-width:thin]">
        {inGroup ? (
          <>
            <Tooltip side={tooltipSide} content={t("back")}>
              <Link href={socialHref.home} className="flex h-12 w-full items-center justify-center rounded-pill text-fg-secondary transition-colors hover:bg-subtle">
                <Icon icon={ChevronLeft} mirror />
                <span className="sr-only">{t("back")}</span>
              </Link>
            </Tooltip>
            <span aria-hidden="true" data-slot="rail-separator" className="mx-2 my-1.5 h-px bg-line" />
          </>
        ) : null}
        {groups.map((group, index) => (
          <div key={group[0]!.id} className="flex flex-col">
            {index > 0 ? <span aria-hidden="true" data-slot="rail-separator" className="mx-2 my-1.5 h-px bg-line" /> : null}
            <ul className="flex flex-col gap-1">{group.map(link)}</ul>
          </div>
        ))}
      </div>
      {footer.length > 0 ? <ul className="mt-auto flex shrink-0 flex-col gap-1 px-1 pt-3 pb-1">{footer.map(link)}</ul> : null}
      {inGroup ? null : (
        <div className="mt-auto flex shrink-0 flex-col gap-1 px-1 pt-3 pb-1">
          <DropdownMenu>
            <Tooltip side={tooltipSide} content={t("new")}>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex h-12 w-full items-center justify-center rounded-pill bg-primary text-on-accent transition-colors hover:bg-primary-hover">
                  <Icon icon={Plus} />
                  <span className="sr-only">{t("new")}</span>
                </button>
              </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent side={tooltipSide} align="end" data-scope="social">
              <DropdownMenuItem icon={CalendarPlus} onSelect={() => openSheet("activity-new")}>
                {t("newActivity")}
              </DropdownMenuItem>
              <DropdownMenuItem icon={UsersRound} onSelect={() => openSheet("group-new")}>
                {t("newGroup")}
              </DropdownMenuItem>
              <DropdownMenuItem icon={UserPlus} onSelect={() => openSheet("connect")}>
                {t("connect")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </nav>
  );
}

/** Live counts for Social rail / More items (hidden when zero). */
export function useSocialBadges(groupId: string | undefined) {
  const t = useTranslations("Navigation.badges");
  const tHome = useTranslations("Social.home");
  const { digits } = usePreferences();
  const directory = useSocialDirectory();
  const needs = useNeedsYou();
  return (id: NavItemId): { count: string; label: string } | undefined => {
    let count = 0;
    let label = "";
    if (!groupId && id === "connections") {
      count = directory.data?.incomingRequests ?? 0;
      label = t("approvals", { count: formatNumber(count, digits) });
    } else if (groupId && id === "chat") {
      count = directory.data?.groups.find((g) => g.id === groupId)?.unread ?? 0;
      label = tHome("unread", { n: formatNumber(count, digits) });
    } else if (groupId && id === "expenses") {
      count = (needs.data ?? []).filter((item) => item.kind === "approve-expense" && item.href.startsWith(socialHref.group(groupId))).length;
      label = t("approvals", { count: formatNumber(count, digits) });
    }
    if (count <= 0) return undefined;
    return { count: formatNumber(count, digits), label };
  };
}
