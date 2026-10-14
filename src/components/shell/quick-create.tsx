"use client";

import { CalendarPlus, NotebookPen, Plus, RefreshCw, Smile, SquareCheck, Wallet, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { ComingSoonBadge } from "@/components/navigation/coming-soon-badge";
import { IconButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useRouteScopedOpen, useShellScope } from "./use-shell-ui";

/*
 * Quick create (Shell board "Quick capture", Utility board "Quick add").
 * Capture flows arrive in Step 3, so every entry is disabled "Coming soon".
 * Desktop: a menu off the top-bar "+"; mobile: a bottom sheet of tiles
 * opened by the bottom bar's notched FAB.
 */

export type QuickCreateId = "task" | "event" | "expense" | "mood" | "habit" | "note";

interface QuickCreateSpec {
  id: QuickCreateId;
  icon: LucideIcon;
  /** Tile fill and dot, after the Utility board's Quick add sheet. */
  tile: string;
  dot: string;
}

export const quickCreateItems: readonly QuickCreateSpec[] = [
  { id: "task", icon: SquareCheck, tile: "bg-raised", dot: "bg-scope-deep" },
  { id: "event", icon: CalendarPlus, tile: "bg-project-soft", dot: "bg-project-dot" },
  { id: "expense", icon: Wallet, tile: "bg-raised", dot: "bg-fg-secondary" },
  { id: "mood", icon: Smile, tile: "bg-personal-soft", dot: "bg-personal-dot" },
  { id: "habit", icon: RefreshCw, tile: "bg-personal-soft", dot: "bg-personal-dot" },
  { id: "note", icon: NotebookPen, tile: "bg-company-soft", dot: "bg-company-dot" },
];

/**
 * Top-bar "+" with the quick create menu (all entries coming soon). Non-modal,
 * like the account menu: a modal menu would aria-hide the shell wrapper that
 * still holds tabbable content.
 */
export function QuickCreateMenu() {
  const t = useTranslations("Shell.quickCreate");
  const scope = useShellScope();
  const [open, setOpen] = useRouteScopedOpen();
  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <IconButton icon={Plus} label={t("label")} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-scope={scope} className="w-64">
        <DropdownMenuLabel>{t("title")}</DropdownMenuLabel>
        {quickCreateItems.map((item) => (
          <DropdownMenuItem key={item.id} icon={item.icon} comingSoon>
            {t(`items.${item.id}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface QuickAddSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

/** Mobile "Quick add" bottom sheet: six disabled tiles marked Coming soon. */
export function QuickAddSheet({ open, onOpenChange, onCloseAutoFocus }: QuickAddSheetProps) {
  const t = useTranslations("Shell");
  const tCommon = useTranslations("Common");
  const scope = useShellScope();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        title={t("quickAdd.title")}
        description={t("quickAdd.description")}
        data-scope={scope}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <ul className="grid grid-cols-3 gap-2">
          {quickCreateItems.map((item) => {
            const hintId = `quick-add-${item.id}-hint`;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-disabled="true"
                  aria-describedby={hintId}
                  className={cn(
                    "flex min-h-22 w-full cursor-not-allowed flex-col items-center justify-center gap-1.5 rounded-tile px-2 py-3 text-center",
                    item.tile,
                  )}
                >
                  <span aria-hidden="true" className={cn("size-2 rounded-full", item.dot)} />
                  <span className="flex items-center gap-1.5 text-sm font-bold text-fg">
                    <Icon icon={item.icon} size={16} className="text-fg-secondary" />
                    {t(`quickCreate.items.${item.id}`)}
                  </span>
                  {/* Read once, as the description ("Task, Coming soon"), not as part of the name. */}
                  <ComingSoonBadge id={hintId} aria-hidden="true" className="bg-surface/70">
                    {tCommon("comingSoon")}
                  </ComingSoonBadge>
                </button>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
