"use client";

import { ArrowLeft, AtSign, BellOff, PenLine, Search, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { AccessState } from "@/components/feedback/access-state";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PillGroup } from "@/components/ui/pills";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConversationSummary, ConversationTab } from "@/data/messaging-domain";
import { useConversations } from "@/data/messaging-queries";
import { normalizePathname } from "@/features/navigation/paths";
import { cn } from "@/lib/cn";
import { useMsgFormat } from "./format";
import { channelsHref, messagesHref } from "./paths";
import { useOpenMessagingSheet } from "./sheets/messaging-sheet-params";
import { ConversationAvatar, ConversationTitle, SourceChip } from "./visuals";

/*
 * Conversation list (MS-02): All · Direct · Groups · Channels · Meetings
 * (compact pills = local filter; Meetings opens /messages/meetings), source
 * chips on channels, unread counts (slate / source colour), mention marks.
 * On /messages it replaces the context rail; on phones it is the full-screen
 * list with its own top bar.
 */

type ListTab = ConversationTab | "meetings";

export function ConversationList({ contextLabel, contextHref, className }: { contextLabel?: string; contextHref?: string; className?: string }) {
  const t = useTranslations("Msg.list");
  const pathname = normalizePathname(usePathname());
  const router = useRouter();
  const openSheet = useOpenMessagingSheet();
  const onMeetings = pathname.startsWith(messagesHref.meetings);
  const [tab, setTab] = useState<ConversationTab>("all");
  const current: ListTab = onMeetings ? "meetings" : tab;
  const list = useConversations(tab);
  const activeId = /^\/messages\/([^/]+)/.exec(pathname)?.[1];

  return (
    <section aria-labelledby="msg-list-title" className={cn("flex min-h-0 flex-col gap-3 rounded-[28px] bg-surface p-4 shadow-island", className)}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {contextLabel ? (
            <Link href={contextHref ?? "/"} className="inline-flex items-center gap-1 text-xs font-semibold text-fg-secondary hover:text-fg lg:hidden">
              <Icon icon={ArrowLeft} size={12} mirror />
              {t("from", { context: contextLabel })}
            </Link>
          ) : null}
          <h1 id="msg-list-title" className="type-title text-fg">
            {t("title")}
          </h1>
        </div>
        <IconButton icon={Settings} size="sm" variant="ghost" label={t("settings")} onClick={() => router.push(messagesHref.settings)} />
        <IconButton icon={PenLine} size="sm" label={t("newMessage")} aria-haspopup="dialog" onClick={() => openSheet("conversation-new")} />
      </div>
      <Link
        href={messagesHref.search}
        className="flex min-h-11 items-center gap-2 rounded-pill bg-secondary px-4 text-sm text-fg-secondary transition-colors hover:bg-secondary-hover"
      >
        <Icon icon={Search} size={16} />
        {t("search")}
      </Link>
      <PillGroup<ListTab>
        label={t("tabsLabel")}
        value={current}
        onValueChange={(value) => {
          if (value === "meetings") {
            router.push(messagesHref.meetings);
            return;
          }
          setTab(value);
          if (onMeetings) router.push(messagesHref.root);
        }}
        options={(["all", "direct", "groups", "channels", "meetings"] as const).map((value) => ({ value, label: t(`tabs.${value}`) }))}
        className="flex-nowrap overflow-x-auto"
      />
      {list.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : list.isError ? (
        <AccessState kind="error" titleAs="h2" />
      ) : list.data.length === 0 ? (
        <p className="rounded-2xl bg-subtle p-4 text-sm text-fg-secondary">{t(`empty.${tab}`)}</p>
      ) : (
        <ul className="-mx-1 flex min-h-0 flex-col gap-1 overflow-y-auto px-1 pb-1">
          {list.data.map((c) => (
            <li key={c.id}>
              <ConversationRow conversation={c} active={c.id === activeId} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ConversationRow({ conversation: c, active, href }: { conversation: ConversationSummary; active: boolean; href?: string }) {
  const t = useTranslations("Msg.list");
  const f = useMsgFormat();
  const preview = c.lastMessage
    ? c.lastMessage.kind === "text"
      ? c.lastMessage.preview
      : t(`preview.${c.lastMessage.kind}`)
    : t("preview.none");
  const line = c.lastMessage && c.kind !== "direct" && !c.lastMessage.mine ? `${c.lastMessage.author || t("deletedUser")}: ${preview}` : c.lastMessage?.mine ? t("preview.you", { text: preview }) : preview;
  return (
    <Link
      href={href ?? messagesHref.conversation(c.id)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-start gap-3 rounded-2xl p-2.5 outline-offset-2 transition-colors hover:bg-subtle",
        active && "inset-ring-[1.5px] inset-ring-fg",
        c.blocked && "opacity-60",
      )}
    >
      <ConversationAvatar kind={c.kind} initials={c.initials} source={c.source} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <ConversationTitle kind={c.kind} title={c.title || t("deletedUser")} className="min-w-0 flex-1 text-sm font-bold text-fg" />
          {c.lastMessage ? <span className="shrink-0 text-xs text-fg-muted">{f.listTime(c.lastMessage.at)}</span> : null}
        </span>
        <span className="flex items-center gap-2">
          <span dir="auto" className="min-w-0 flex-1 truncate text-xs text-fg-secondary">
            {c.blocked ? t("blocked") : line}
          </span>
          {c.muted ? <Icon icon={BellOff} size={14} className="text-fg-muted" aria-label={t("muted")} /> : null}
          {c.mentions > 0 ? (
            <span className="grid size-5 place-items-center rounded-pill bg-danger-text text-on-accent" title={t("mentions", { count: c.mentions })}>
              <Icon icon={AtSign} size={12} />
              <span className="sr-only">{t("mentions", { count: c.mentions })}</span>
            </span>
          ) : null}
          {c.unread > 0 ? (
            <span data-scope={c.source.kind === "personal" ? "messages" : c.source.kind}>
              <Badge label={t("unread", { count: c.unread })} count={c.unread} tone={c.muted ? "neutral" : "primary"} />
            </span>
          ) : null}
        </span>
        {c.kind === "channel" ? <SourceChip source={c.source} className="mt-1 self-start" /> : null}
      </span>
    </Link>
  );
}

/** Same rows inside a workspace's Channels page (links stay in the workspace). */
export function channelRowHref(c: ConversationSummary): string {
  return channelsHref(c.source, c.id);
}
