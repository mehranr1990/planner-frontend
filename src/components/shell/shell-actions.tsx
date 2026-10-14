"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { NotificationsPopover } from "./notifications-popover";
import { ProfileMenu } from "./profile-menu";
import { QuickCreateMenu } from "./quick-create";
import { useShell } from "./shell-provider";
import { shellIslandClassName } from "./shell-island";
import { useIsApplePlatform } from "./use-shell-ui";

/*
 * Top-bar actions island (CommandBar direction A): Search ⌘K · quick create ·
 * notifications · account. The search label shows from xl; at lg the
 * button keeps its icon, shortcut hint and accessible name.
 */

export function ShellSearchButton({ className }: { className?: string }) {
  const t = useTranslations("Shell.search");
  const { openPalette, paletteOpen } = useShell();
  const apple = useIsApplePlatform();
  return (
    <button
      type="button"
      onClick={openPalette}
      aria-label={t("label")}
      aria-haspopup="dialog"
      aria-expanded={paletteOpen}
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        "inline-flex h-12 shrink-0 items-center gap-2 rounded-pill bg-secondary ps-3.5 pe-2 text-sm font-semibold text-fg-secondary",
        "transition-colors hover:bg-secondary-hover hover:text-fg",
        className,
      )}
    >
      <Icon icon={Search} size={18} className="text-fg" />
      <span className="hidden xl:inline">{t("button")}</span>
      <kbd aria-hidden="true" className="rounded-pill bg-surface px-2 py-0.5 text-[0.6875rem] font-bold text-fg-secondary">
        {apple ? t("shortcutMac") : t("shortcutOther")}
      </kbd>
    </button>
  );
}

export function ShellActions({ className }: { className?: string }) {
  const t = useTranslations("Shell");
  return (
    <div role="group" aria-label={t("actions")} className={cn(shellIslandClassName, className)}>
      <ShellSearchButton />
      <QuickCreateMenu />
      <NotificationsPopover />
      <ProfileMenu />
    </div>
  );
}
