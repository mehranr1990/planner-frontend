"use client";

import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { EmptyState } from "@/components/feedback/state-views";
import { IconButton } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import { useRouteScopedOpen, useShellScope } from "./use-shell-ui";

/*
 * Bell + notifications popover (Shell board). Real notifications arrive in
 * Step 3, so it always shows the empty state and never an unread badge.
 */

export interface NotificationsPopoverProps {
  /** Classes for the bell button (the mobile header lifts it onto a white island). */
  triggerClassName?: string;
}

export function NotificationsPopover({ triggerClassName }: NotificationsPopoverProps) {
  const t = useTranslations("Shell.notifications");
  const scope = useShellScope();
  const titleId = useId();
  const [open, setOpen] = useRouteScopedOpen();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton icon={Bell} label={t("label")} className={cn(triggerClassName)} />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-labelledby={titleId}
        data-scope={scope}
        className="flex w-90 flex-col gap-2 rounded-card-sm p-3"
      >
        <h2 id={titleId} className="px-1.5 pt-1 text-body font-bold">
          {t("title")}
        </h2>
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} variant="bare" />
      </PopoverContent>
    </Popover>
  );
}
