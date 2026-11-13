"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { Icon } from "@/components/ui/icon";
import { toast } from "@/components/ui/toast";
import type { ConversationDetail, Message } from "@/data/messaging-domain";
import { useMessagingRepository } from "@/data/messaging-provider";
import { useMessagingMutation, useThread } from "@/data/messaging-queries";
import { plainText } from "@/data/mock/mock-messaging";
import { Composer } from "../composer";
import { pendingMessage } from "../conversation-view";
import { DeleteMessageDialog, ForwardDialog, ModerateDialog, ReportDialog, errorText } from "../message-dialogs";
import { MessageBubble, type MessageActions } from "../message-bubble";
import { useOutbox, useSendMessage } from "../outbox";

/*
 * Thread (MS-06): replies to one parent inside the same conversation; right
 * panel on desktop, full screen on phones (/messages/[cid]/thread/[mid]).
 * "Also send to channel" posts a copy into the conversation. A deleted
 * parent shows its tombstone and replies stay readable. Same permissions as
 * the parent conversation: a removed member gets the removed state.
 */
export function ThreadPanel({ conversation: c, parentId, closeHref }: { conversation: ConversationDetail; parentId: string; closeHref: string }) {
  const t = useTranslations("Msg.thread");
  const tMsg = useTranslations("Msg");
  const meId = useMessagingRepository().me.id;
  const thread = useThread(c.id, parentId);
  const outbox = useOutbox(c.id, parentId);
  const sender = useSendMessage();
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [dialog, setDialog] = useState<{ kind: "delete" | "forward" | "report" | "moderate"; message: Message } | null>(null);
  const react = useMessagingMutation((repo, vars: { id: string; emoji: string }) => repo.messages.react(vars.id, vars.emoji));
  const pin = useMessagingMutation((repo, m: Message) => repo.messages.pin(m.id, !m.pinned));

  const actions: MessageActions = {
    onReact: (m, emoji) => react.mutate({ id: m.id, emoji }, { onError: (e) => toast({ title: errorText(tMsg as never, e), tone: "danger" }) }),
    onReply: setReplyTo,
    onForward: (m) => setDialog({ kind: "forward", message: m }),
    onEdit: setEditing,
    onPin: (m) => pin.mutate(m),
    onCopy: (m) => {
      void navigator.clipboard?.writeText(plainText(m.body));
      toast({ title: tMsg("conv.copied") });
    },
    onDelete: (m) => setDialog({ kind: "delete", message: m }),
    onReport: (m) => setDialog({ kind: "report", message: m }),
    onModerate: (m) => setDialog({ kind: "moderate", message: m }),
  };

  return (
    <section aria-labelledby="thread-title" className="flex min-h-full flex-col gap-3 rounded-[28px] bg-surface p-4 shadow-island lg:sticky lg:top-4">
      <header className="flex items-center gap-2">
        <h2 id="thread-title" className="flex-1 type-title">
          {t("title")}
        </h2>
        <Link href={closeHref} aria-label={t("close")} className="grid size-10 place-items-center rounded-pill bg-secondary hover:bg-secondary-hover">
          <Icon icon={X} size={18} />
        </Link>
      </header>
      {thread.isPending ? (
        <AccessLoading />
      ) : thread.isError ? (
        <AccessState kind="msg-not-found" titleAs="h3" />
      ) : (
        <>
          <MessageBubble message={thread.data.parent} meId={meId} showAuthor canPost={c.canPost} actions={actions} />
          <p className="flex items-center gap-3 text-xs font-bold text-fg-secondary">
            {t("replies", { count: thread.data.replies.length })}
            <span className="h-px flex-1 bg-hairline" />
          </p>
          <div role="log" aria-label={t("title")} className="flex flex-1 flex-col gap-2.5">
            {thread.data.replies.map((m) => (
              <MessageBubble key={m.id} message={m} meId={meId} showAuthor canPost={c.canPost} actions={actions} collapseBlocked={c.collapseBlocked} />
            ))}
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
          </div>
          <Composer
            key={editing?.id ?? "thread"}
            conversation={c}
            meId={meId}
            parentId={parentId}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            editing={editing}
            onDoneEdit={() => setEditing(null)}
            allowAlsoSend
          />
        </>
      )}
      {dialog?.kind === "delete" ? <DeleteMessageDialog message={dialog.message} conversation={c} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "forward" ? <ForwardDialog message={dialog.message} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "report" ? <ReportDialog target={{ messageId: dialog.message.id }} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "moderate" ? <ModerateDialog message={dialog.message} onClose={() => setDialog(null)} /> : null}
    </section>
  );
}
