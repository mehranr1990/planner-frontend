"use client";

import { ArrowLeft, Info, MessageSquareText, Pin, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { Button, IconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { toast } from "@/components/ui/toast";
import type { ConversationDetail, Message } from "@/data/messaging-domain";
import { useMessagingAvailable, useMessagingRepository } from "@/data/messaging-provider";
import { useConversation, useMessagePage, useMessagingMutation, usePinnedMessages } from "@/data/messaging-queries";
import { plainText } from "@/data/mock/mock-messaging";
import { cn } from "@/lib/cn";
import { Composer } from "./composer";
import { useMsgFormat } from "./format";
import { DeleteMessageDialog, ForwardDialog, ModerateDialog, ReportDialog, errorText } from "./message-dialogs";
import { MessageBubble, type MessageActions } from "./message-bubble";
import { setForcedOffline, useOutbox, useOutboxFlush, useSendMessage } from "./outbox";
import { messagesHref, sourceScope } from "./paths";
import { ConversationAvatar, ConversationTitle, SourceChip } from "./visuals";

/*
 * One conversation (MS-02 direct / group, MS-03 work channel — same
 * component in /messages and in workspace Channels). Server order, day
 * separators in the user's calendar, unread line at the first unread,
 * "joined later" note, pinned bar, receipts as the server reports them, no
 * call buttons (owner rule). Thread and info open as a right panel on
 * desktop and full screen on phones.
 */

export interface ConversationHrefs {
  conversation: (cid: string) => string;
  thread: (cid: string, mid: string) => string;
  info: (cid: string) => string;
  back: string;
}

export const globalHrefs: ConversationHrefs = {
  conversation: messagesHref.conversation,
  thread: messagesHref.thread,
  info: messagesHref.info,
  back: messagesHref.root,
};

export type ConversationPanel = { kind: "thread"; messageId: string } | { kind: "info" } | null;

export function ConversationView({
  conversationId,
  hrefs = globalHrefs,
  panel = null,
  renderPanel,
  className,
}: {
  conversationId: string;
  hrefs?: ConversationHrefs;
  panel?: ConversationPanel;
  renderPanel?: (conversation: ConversationDetail, panel: NonNullable<ConversationPanel>) => ReactNode;
  className?: string;
}) {
  const t = useTranslations("Msg.conv");
  const available = useMessagingAvailable();
  const params = useSearchParams();
  const demo = params.get("state");
  const conversation = useConversation(available ? conversationId : undefined);

  useEffect(() => {
    // ?state=offline is a Mock Mode demo of the offline queue.
    setForcedOffline(demo === "offline");
    return () => setForcedOffline(false);
  }, [demo]);

  if (!available) return <AccessState kind="msg-not-available" className={className} />;
  if (demo === "loading" || conversation.isPending) return <AccessLoading className={className} />;
  if (demo === "error" || conversation.isError) return <AccessState kind="error" primaryAction={<Button onClick={() => void conversation.refetch()}>{t("retry")}</Button>} className={className} />;
  const c = conversation.data;
  if (c.access !== "member")
    return (
      <AccessState
        kind={c.access === "removed" ? "msg-removed" : "msg-not-found"}
        primaryAction={
          <Button asChild>
            <Link href={hrefs.back}>{t("back")}</Link>
          </Button>
        }
        className={className}
      />
    );

  return (
    <div data-scope={sourceScope(c.source)} className={cn("min-w-0", panel && "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-4", className)}>
      <ConversationBody conversation={c} hrefs={hrefs} highlightId={params.get("m")} reconnecting={demo === "reconnecting"} />
      {panel && renderPanel ? (
        <aside className="fixed inset-0 z-(--z-overlay) overflow-y-auto bg-canvas p-gutter pt-[calc(var(--safe-top)+1rem)] lg:static lg:z-auto lg:bg-transparent lg:p-0">
          {renderPanel(c, panel)}
        </aside>
      ) : null}
    </div>
  );
}

function ConversationBody({ conversation: c, hrefs, highlightId, reconnecting }: { conversation: ConversationDetail; hrefs: ConversationHrefs; highlightId: string | null; reconnecting: boolean }) {
  const t = useTranslations("Msg.conv");
  const tMsg = useTranslations("Msg");
  const f = useMsgFormat();
  const router = useRouter();
  const meId = useMessagingRepository().me.id;
  const page = useMessagePage(c.id);
  const pinned = usePinnedMessages(c.id, c.pinnedCount > 0);
  const outbox = useOutbox(c.id);
  const sender = useSendMessage();
  useOutboxFlush();
  const scroller = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ cid: string; id: string | null; count: number } | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [dialog, setDialog] = useState<{ kind: "delete" | "forward" | "report" | "moderate"; message: Message } | null>(null);
  const [pinIndex, setPinIndex] = useState(0);
  const markRead = useMessagingMutation((repo, id: string) => repo.conversations.markRead(id));
  const react = useMessagingMutation((repo, vars: { id: string; emoji: string }) => repo.messages.react(vars.id, vars.emoji));
  const pin = useMessagingMutation((repo, m: Message) => repo.messages.pin(m.id, !m.pinned));
  const unblock = useMessagingMutation((repo, id: string) => repo.settings.unblock(id));

  // The unread line stays where it was when the conversation opened (state adjusted while rendering).
  if (page.data && anchor?.cid !== c.id) setAnchor({ cid: c.id, id: page.data.firstUnreadId, count: page.data.unreadCount });

  const unread = page.data?.unreadCount ?? 0;
  const { mutate: markReadNow } = markRead;
  useEffect(() => {
    if (unread > 0) markReadNow(c.id);
  }, [unread, c.id, markReadNow]);

  const count = page.data?.items.length ?? 0;
  useEffect(() => {
    const el = scroller.current;
    if (!el || !count) return;
    const target = highlightId ? document.getElementById(`msg-${highlightId}`) : null;
    if (target) target.scrollIntoView({ block: "center" });
    else el.scrollTop = el.scrollHeight;
  }, [count, outbox.length, highlightId]);

  const actions: MessageActions = {
    onReact: (m, emoji) => react.mutate({ id: m.id, emoji }, { onError: (e) => toast({ title: errorText(tMsg as never, e), tone: "danger" }) }),
    onReply: (m) => {
      setEditing(null);
      setReplyTo(m);
    },
    onThread: (m) => router.push(hrefs.thread(c.id, m.id)),
    onForward: (m) => setDialog({ kind: "forward", message: m }),
    onEdit: (m) => {
      setReplyTo(null);
      setEditing(m);
    },
    onPin: (m) => pin.mutate(m, { onSuccess: () => toast({ title: m.pinned ? t("unpinned") : t("pinnedDone") }) }),
    onCopy: (m) => {
      void navigator.clipboard?.writeText(plainText(m.body));
      toast({ title: t("copied") });
    },
    onDelete: (m) => setDialog({ kind: "delete", message: m }),
    onReport: (m) => setDialog({ kind: "report", message: m }),
    onModerate: (m) => setDialog({ kind: "moderate", message: m }),
  };

  const items = page.data?.items ?? [];
  const pins = pinned.data ?? [];
  const currentPin = pins[pinIndex % Math.max(1, pins.length)];
  const subtitle =
    c.kind === "direct"
      ? c.other?.deleted
        ? t("deletedAccount")
        : c.other?.presence.kind === "online"
          ? t("online")
          : c.other?.presence.kind === "last-seen"
            ? `${t("lastSeen", { time: f.relative(c.other.presence.at) })} · ${t("direct")}`
            : t("direct")
      : c.kind === "group"
        ? t("group", { count: c.memberCount })
        : t("channel", { workspace: c.source.name, count: c.memberCount });

  return (
    <section aria-labelledby="conv-title" className="flex min-h-[calc(100dvh-8rem)] min-w-0 flex-col gap-3 lg:min-h-[calc(100dvh-7.5rem)]">
      <header className="flex items-center gap-3 rounded-[28px] bg-surface p-3 shadow-island">
        <IconButton icon={ArrowLeft} mirror size="sm" variant="ghost" label={t("back")} onClick={() => router.push(hrefs.back)} className="lg:hidden" />
        <ConversationAvatar kind={c.kind} initials={c.initials} source={c.source} size={c.kind === "channel" ? 48 : 40} />
        <div className="min-w-0 flex-1">
          <h2 id="conv-title" className="flex min-w-0 items-center gap-2 text-base font-bold text-fg">
            <ConversationTitle kind={c.kind} title={c.title || tMsg("bubble.deletedUser")} />
          </h2>
          <p className="truncate text-xs text-fg-secondary">{subtitle}</p>
        </div>
        {c.kind === "channel" ? <SourceChip source={c.source} className="max-sm:hidden" /> : null}
        {c.threadUnread > 0 ? (
          <Button size="sm" variant="secondary" onClick={() => {
            const first = items.find((m) => m.thread?.unread);
            if (first) router.push(hrefs.thread(c.id, first.id));
          }}>
            <Icon icon={MessageSquareText} size={16} />
            {t("threads", { count: c.threadUnread })}
          </Button>
        ) : null}
        <IconButton icon={Search} size="sm" variant="secondary" label={t("search")} onClick={() => router.push(`${messagesHref.search}?in=${encodeURIComponent(c.id)}`)} />
        <IconButton icon={Info} size="sm" variant="secondary" label={t("info")} onClick={() => router.push(hrefs.info(c.id))} />
      </header>

      {reconnecting ? <AccessState kind="msg-reconnecting" titleAs="p" /> : null}
      {c.kind !== "direct" && currentPin ? (
        <button
          type="button"
          onClick={() => {
            document.getElementById(`msg-${currentPin.id}`)?.scrollIntoView({ block: "center" });
            setPinIndex((i) => i + 1);
          }}
          className="flex items-center gap-2 rounded-2xl bg-scope-soft px-4 py-2 text-start text-sm text-scope-deep dark:muted-on-tint"
        >
          <Icon icon={Pin} size={14} />
          <span className="font-bold">{t("pinned")}</span>
          <span dir="auto" className="min-w-0 flex-1 truncate">
            · {plainText(currentPin.body) || tMsg(`list.preview.${currentPin.attachments[0]?.kind ?? "file"}` as never)}
          </span>
          <span className="shrink-0 text-xs font-bold">{t("pinnedOf", { index: f.number((pinIndex % pins.length) + 1), count: f.number(pins.length) })}</span>
        </button>
      ) : null}

      <div ref={scroller} role="log" aria-label={t("history")} aria-live="polite" className="flex min-h-64 flex-1 flex-col gap-2.5 overflow-y-auto rounded-[28px] bg-subtle/60 p-3 sm:p-4 lg:max-h-[calc(100dvh-20rem)]">
        {page.isPending ? (
          <AccessLoading />
        ) : page.isError ? (
          <AccessState kind="error" titleAs="h3" />
        ) : (
          <>
            {page.data.joinedLater ? (
              <p className="self-center rounded-pill bg-surface px-3 py-1 text-xs font-bold text-fg-secondary">
                {t("joinedNote", { date: f.date(page.data.joinedAt), rule: c.kind === "channel" ? t("ruleChannel") : t("ruleGroup") })}
              </p>
            ) : null}
            {items.length === 0 && outbox.length === 0 ? (
              <div className="m-auto flex max-w-sm flex-col items-center gap-2 py-10 text-center">
                <Icon icon={MessageSquareText} size={22} className="text-fg-muted" />
                <h3 className="type-title">{c.kind === "direct" ? t("emptyDirectTitle", { name: c.title.split(" ")[0]! }) : t("emptyTitle")}</h3>
                <p className="text-sm text-fg-secondary">{c.kind === "direct" ? t("emptyDirect") : t("emptyGroup")}</p>
              </div>
            ) : null}
            {items.map((m, i) => {
              const prev = items[i - 1];
              const newDay = !prev || !f.sameDay(prev.createdAt, m.createdAt);
              const showAuthor = c.kind !== "direct" ? !prev || newDay || prev.author.id !== m.author.id || prev.state !== "visible" : true;
              return (
                <Fragment key={m.id}>
                  {newDay ? (
                    <div className="flex items-center gap-3 py-1 text-xs font-bold text-fg-secondary" role="separator" aria-label={f.dayLabel(m.createdAt)}>
                      <span className="h-px flex-1 bg-hairline" />
                      {f.dayLabel(m.createdAt)}
                      <span className="h-px flex-1 bg-hairline" />
                    </div>
                  ) : null}
                  {anchor?.id === m.id ? (
                    <div className="flex items-center gap-3 text-xs font-bold text-danger-text" role="separator" aria-label={t("newLine", { count: anchor.count })}>
                      <span className="h-px flex-1 bg-danger-text" />
                      {t("newLine", { count: anchor.count })}
                      <span className="h-px flex-1 bg-danger-text" />
                    </div>
                  ) : null}
                  <MessageBubble
                    message={m}
                    meId={meId}
                    showAuthor={showAuthor}
                    canPost={c.canPost}
                    actions={actions}
                    threadHref={hrefs.thread(c.id, m.id)}
                    highlighted={highlightId === m.id}
                    collapseBlocked={c.collapseBlocked}
                  />
                </Fragment>
              );
            })}
            {outbox.map((entry) => (
              <MessageBubble
                key={entry.clientOpId}
                meId={meId}
                showAuthor={false}
                canPost={false}
                actions={actions}
                pending={{ status: entry.status, onRetry: () => void sender.retry(entry.clientOpId), onDiscard: () => sender.discard(entry.clientOpId) }}
                message={pendingMessage(entry, c.id)}
              />
            ))}
          </>
        )}
      </div>

      <Composer
        key={editing?.id ?? "new"}
        conversation={c}
        meId={meId}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        editing={editing}
        onDoneEdit={() => setEditing(null)}
        onUnblock={c.other ? () => unblock.mutate(c.other!.id) : undefined}
        className="z-10 max-lg:sticky max-lg:bottom-[max(var(--safe-bottom),0.5rem)]"
      />

      {dialog?.kind === "delete" ? <DeleteMessageDialog message={dialog.message} conversation={c} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "forward" ? <ForwardDialog message={dialog.message} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "report" ? <ReportDialog target={{ messageId: dialog.message.id }} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "moderate" ? <ModerateDialog message={dialog.message} onClose={() => setDialog(null)} /> : null}
    </section>
  );
}

/** A local, not-yet-committed message (outbox) rendered as a bubble without server actions. */
export function pendingMessage(entry: { clientOpId: string; body: string; attachments?: Message["attachments"]; createdAt: string }, cid: string): Message {
  return {
    id: entry.clientOpId,
    conversationId: cid,
    author: { id: "me", name: "", initials: "" },
    mine: true,
    createdAt: entry.createdAt,
    editedAt: null,
    state: "visible",
    body: entry.body,
    replyTo: null,
    attachments: entry.attachments ?? [],
    reactions: [],
    forwarded: false,
    pinned: false,
    mentionsMe: false,
    taskLink: null,
    thread: null,
    parentId: null,
    alsoInConversation: false,
    receipt: null,
    clientOpId: entry.clientOpId,
    fromBlocked: false,
    can: { editHoursLeft: null, deleteForEveryone: { allowed: false, reason: "not-author" }, pin: false, moderate: false },
  };
}
