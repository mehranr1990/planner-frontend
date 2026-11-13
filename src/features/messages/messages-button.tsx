"use client";

import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useIsApplePlatform } from "@/components/shell/use-shell-ui";
import { useMessagingAvailable } from "@/data/messaging-provider";
import { useMessagingEvents, useUnreadConversations } from "@/data/messaging-queries";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/locale/digits";
import { isMessagesPath, messagesHref } from "./paths";

/*
 * Header Messages button (MS-01): left of notifications in every context.
 * Badge = unread, unmuted conversations; opens /messages; ⌘/Ctrl+Shift+M
 * (M10) works anywhere outside text fields. Active on /messages = slate fill.
 * Also hosts the simulated live stream (mock) for the shell.
 */
export function MessagesButton({ className }: { className?: string }) {
  const t = useTranslations("Msg.shell");
  const pathname = usePathname();
  const router = useRouter();
  const apple = useIsApplePlatform();
  const { digits } = usePreferences();
  const available = useMessagingAvailable();
  const unread = useUnreadConversations();
  const badgeId = useId();
  const active = isMessagesPath(pathname);
  useMessagingEvents();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.shiftKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "m") return;
      event.preventDefault();
      router.push(messagesHref.root);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const count = available ? (unread.data ?? 0) : 0;
  return (
    <Link
      href={messagesHref.root}
      data-scope="messages"
      aria-current={active ? "page" : undefined}
      aria-keyshortcuts="Meta+Shift+M Control+Shift+M"
      aria-label={count > 0 ? t("buttonWithCount", { count: formatNumber(count, digits) }) : t("button")}
      title={`${t("button")} (${apple ? "⌘⇧M" : "Ctrl+Shift+M"})`}
      className={cn(
        buttonVariants({ variant: active ? "primary" : "secondary" }),
        "relative size-touch shrink-0 p-0",
        className,
      )}
    >
      <Icon icon={MessageSquare} size={20} />
      {count > 0 ? <Badge id={badgeId} label={t("unread", { count })} count={count} tone="primary" placement="corner" className={cn(active && "bg-surface text-fg")} /> : null}
    </Link>
  );
}
