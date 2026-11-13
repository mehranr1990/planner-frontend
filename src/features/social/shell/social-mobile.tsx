"use client";

import { UserPlus, UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { MobileBottomNav } from "@/components/navigation/mobile-bottom-nav";
import { MoreTile } from "@/components/shell/personal-mobile";
import { useReturnFocus, useRouteScopedOpen } from "@/components/shell/use-shell-ui";
import { Icon } from "@/components/ui/icon";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { getAppContext } from "@/features/navigation/contexts";
import type { AppContext } from "@/features/navigation/types";
import { useActiveContext } from "@/features/navigation/use-active-navigation";
import { useOpenSocialSheet } from "../sheets/social-sheet-params";
import { useCurrentSocialGroup } from "../use-social";

/*
 * Social bottom bar (SO-01 Mobile, SOM01/SOM03): Home · Groups · (+) ·
 * Activities · More on the home rail; inside a group Overview · Activities ·
 * (+) · Chat · More (Calendar, Expenses, Lending, Album, Challenges, Members,
 * Settings). (+) = New activity (prefilled with the group inside one). More
 * on the home rail also holds Connections, My balances and My things, plus
 * New group and Connect. No Assistant.
 */
export function SocialMobileNav() {
  const t = useTranslations("Shell");
  const tNav = useTranslations("Navigation");
  const tSocial = useTranslations("Social.shell");
  const context = useActiveContext() ?? getAppContext("social");
  const openSheet = useOpenSocialSheet();
  const [moreOpen, setMoreOpen] = useRouteScopedOpen();
  const { capture, onCloseAutoFocus } = useReturnFocus();
  const groupId = context.workspaceId;

  return (
    <>
      <MobileBottomNav
        className="mx-auto max-w-md p-0"
        fabLabel={groupId ? tSocial("fabGroup") : tSocial("fabHome")}
        fab={<button type="button" aria-haspopup="dialog" onClick={() => openSheet("activity-new", groupId ? { group: groupId } : {})} />}
        onMoreClick={() => {
          capture();
          setMoreOpen(true);
        }}
        moreExpanded={moreOpen}
      />
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" title={t("mobile.moreTitle", { context: tNav(context.labelKey) })} data-scope="social" onCloseAutoFocus={onCloseAutoFocus}>
          <SocialMoreContent context={context} onNavigate={() => setMoreOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}

export function SocialMoreContent({ context, onNavigate }: { context: AppContext; onNavigate: () => void }) {
  const tNav = useTranslations("Navigation");
  const t = useTranslations("Social.shell");
  const { group } = useCurrentSocialGroup();
  const openSheet = useOpenSocialSheet();
  const items = context.nav.filter((item) => item.mobileOrder === undefined);
  const action = (label: string, icon: typeof UserPlus, onClick: () => void) => (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => {
        onNavigate();
        onClick();
      }}
      className="flex h-12 w-full items-center gap-3 rounded-pill px-3.5 text-start text-sm font-medium text-fg transition-colors hover:bg-subtle"
    >
      <Icon icon={icon} className="text-fg-secondary" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-2" data-scope="social">
      {group ? (
        <p className="px-3.5 pt-1 type-title text-fg">
          <bdi>{t("moreGroup", { group: group.name })}</bdi>
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul aria-label={tNav("moreLabel", { context: tNav(context.labelKey) })} className="grid grid-cols-3 gap-1">
          {items.map((item) => (
            <MoreTile key={item.id} item={item} onNavigate={onNavigate} />
          ))}
        </ul>
      ) : null}
      {context.workspaceId ? null : (
        <>
          {action(t("rail.newGroup"), UsersRound, () => openSheet("group-new"))}
          {action(t("rail.connect"), UserPlus, () => openSheet("connect"))}
        </>
      )}
    </div>
  );
}
