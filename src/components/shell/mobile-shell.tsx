"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { ContextChips } from "@/components/navigation/context-chips";
import { ContextNavList } from "@/components/navigation/context-nav-list";
import { MobileBottomNav } from "@/components/navigation/mobile-bottom-nav";
import { Icon } from "@/components/ui/icon";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { getAppContext } from "@/features/navigation/contexts";
import { usePreferenceActions, usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { AssistantSheet } from "./assistant-panel";
import { NotificationsPopover } from "./notifications-popover";
import { ProfileMenu } from "./profile-menu";
import { QuickAddSheet } from "./quick-create";
import { useActiveWorkspace } from "./shell-provider";
import { useReturnFocus, useRouteScopedOpen, useShellScope } from "./use-shell-ui";

/*
 * Mobile chrome below lg (MobileHome / MobileFaHome): the header row
 * (account at inline-start, context + workspace, the ۱۲۳ digits toggle and
 * the bell at inline-end), the
 * context chips, and the bottom bar with its Quick add and More sheets.
 * Every sheet closes when the route changes.
 */

/**
 * The compact digits switch next to the bell (MobileFaHome): pressed while
 * numbers show in Persian digits. Changes preferences.digits only.
 */
export function DigitsToggle({ className }: { className?: string }) {
  const t = useTranslations("Shell.mobile");
  const { digits } = usePreferences();
  const { update } = usePreferenceActions();
  const persian = digits === "fa";
  return (
    <button
      type="button"
      aria-pressed={persian}
      aria-label={t("digitsToggle")}
      onClick={() => update({ digits: persian ? "latn" : "fa" })}
      className={cn(
        "inline-flex size-touch shrink-0 items-center justify-center rounded-pill bg-surface text-xs font-bold text-fg-secondary shadow-island",
        "transition-colors hover:bg-subtle aria-pressed:bg-scope-soft aria-pressed:text-scope-deep",
        className,
      )}
    >
      <span aria-hidden="true" lang="fa" className="tabular">
        ۱۲۳
      </span>
    </button>
  );
}

export function MobileHeader() {
  const t = useTranslations("Navigation");
  const scope = useShellScope();
  const context = getAppContext(scope);
  const workspace = useActiveWorkspace(scope);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <ProfileMenu align="start" />
        <p data-slot="mobile-context" className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-xs font-semibold text-fg-secondary">{t(context.labelKey)}</span>
          <bdi className="truncate type-title text-fg">{workspace?.name ?? t(context.labelKey)}</bdi>
        </p>
        <DigitsToggle />
        <NotificationsPopover triggerClassName="bg-surface shadow-island hover:bg-subtle" />
      </div>
      <ContextChips className="-mx-1" />
    </div>
  );
}

export function MobileShellNav() {
  const t = useTranslations("Shell");
  const tNav = useTranslations("Navigation");
  const scope = useShellScope();
  const [moreOpen, setMoreOpen] = useRouteScopedOpen();
  const [quickAddOpen, setQuickAddOpen] = useRouteScopedOpen();
  const [assistantOpen, setAssistantOpen] = useRouteScopedOpen();
  // One return target: the bottom-bar button that opened the current sheet.
  const { capture, onCloseAutoFocus } = useReturnFocus();

  return (
    <>
      <MobileBottomNav
        // The shell's fixed slot already pads for the gutter and home indicator;
        // on tablets the bar keeps the phone width (MobileHome), centred.
        className="mx-auto max-w-md p-0"
        fabLabel={t("quickAdd.title")}
        fab={
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={quickAddOpen}
            onClick={() => {
              capture();
              setQuickAddOpen(true);
            }}
          />
        }
        onMoreClick={() => {
          capture();
          setMoreOpen(true);
        }}
        moreExpanded={moreOpen}
      />

      <QuickAddSheet open={quickAddOpen} onOpenChange={setQuickAddOpen} onCloseAutoFocus={onCloseAutoFocus} />

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          title={t("mobile.moreTitle", { context: tNav(getAppContext(scope).labelKey) })}
          data-scope={scope}
          onCloseAutoFocus={(event) => {
            // Moving on to the assistant sheet: let that sheet take focus.
            if (assistantOpen) event.preventDefault();
            else onCloseAutoFocus(event);
          }}
        >
          <div className="flex flex-col gap-2">
            <ContextNavList onNavigate={() => setMoreOpen(false)} />
            <span aria-hidden="true" className="mx-2 h-px bg-line" />
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => {
                setMoreOpen(false);
                setAssistantOpen(true);
              }}
              className="flex h-12 w-full items-center gap-3 rounded-pill px-3.5 text-start text-sm font-medium text-fg transition-colors hover:bg-subtle"
            >
              <Icon icon={Sparkles} className="text-fg-secondary" />
              <span className="min-w-0 flex-1 truncate">{t("assistant")}</span>
              <span className="shrink-0 text-xs font-medium text-fg-muted">{t("mobile.assistantHint")}</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <AssistantSheet open={assistantOpen} onOpenChange={setAssistantOpen} onCloseAutoFocus={onCloseAutoFocus} />
    </>
  );
}
