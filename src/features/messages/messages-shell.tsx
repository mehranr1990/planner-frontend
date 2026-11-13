"use client";

import { ArrowLeft, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AccessState } from "@/components/feedback/access-state";
import { Icon } from "@/components/ui/icon";
import { useMessagingAvailable } from "@/data/messaging-provider";
import { useActiveContext } from "@/features/navigation/use-active-navigation";
import { normalizePathname } from "@/features/navigation/paths";
import { cn } from "@/lib/cn";
import { ConversationList } from "./conversation-list";
import { MESSAGES_BASE } from "./paths";

/*
 * /messages frame (MS-01): outside the four contexts, no context rail — the
 * conversation list takes its place on desktop. Phones: /messages is the
 * full-screen list; every other /messages route is full screen without it.
 */
export function MessagesShell({ children }: { children: ReactNode }) {
  const tNav = useTranslations("Navigation");
  const pathname = normalizePathname(usePathname());
  const available = useMessagingAvailable();
  const context = useActiveContext();
  const atRoot = pathname === MESSAGES_BASE;
  if (!available) return <AccessState kind="msg-not-available" />;
  return (
    <div data-scope="messages" className="lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-5">
      <div className={cn("lg:sticky lg:top-4 lg:max-h-[calc(100dvh-7.5rem)] lg:min-h-0", !atRoot && "max-lg:hidden")}>
        <ConversationList contextLabel={context ? tNav(context.labelKey) : undefined} contextHref={context?.basePath} className="lg:max-h-[calc(100dvh-7.5rem)]" />
      </div>
      <div className={cn("min-w-0", atRoot && "max-lg:hidden")}>
        <MobileBack pathname={pathname} />
        {children}
      </div>
    </div>
  );
}

/** Phones: back bar on Messages sub-pages (the context header is hidden here). Conversations have their own. */
function MobileBack({ pathname }: { pathname: string }) {
  const t = useTranslations("Msg.shell");
  const parts = pathname.split("/").filter(Boolean);
  const section = parts[1];
  if (!section || !["meetings", "search", "settings"].includes(section)) return null;
  const href = section === "meetings" && parts.length > 2 ? `/${parts.slice(0, parts.length - 1).join("/")}` : MESSAGES_BASE;
  return (
    <Link href={href} className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-pill bg-surface px-4 text-sm font-bold shadow-island lg:hidden">
      <Icon icon={ArrowLeft} size={16} mirror />
      {t("back")}
    </Link>
  );
}

/** /messages on desktop before a conversation is picked. */
export function MessagesHome() {
  const t = useTranslations("Msg.home");
  return (
    <div className="grid min-h-[60dvh] place-items-center rounded-[28px] bg-surface p-8 text-center shadow-island">
      <div className="flex max-w-sm flex-col items-center gap-2">
        <Icon icon={MessageSquare} size={24} className="text-fg-muted" />
        <h2 className="type-title">{t("title")}</h2>
        <p className="text-sm text-fg-secondary">{t("description")}</p>
      </div>
    </div>
  );
}
