"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SearchField } from "@/components/ui/search-field";
import { toast } from "@/components/ui/toast";
import type { ConversationDetail, Message, ReportReason } from "@/data/messaging-domain";
import { newClientOpId, useForwardTargets, useMessagingMutation } from "@/data/messaging-queries";
import { MessagingError } from "@/data/messaging-repositories";
import { cn } from "@/lib/cn";
import { ConversationTitle, SourceChip } from "./visuals";

/*
 * MS-04 dialogs, following 13_MESSAGING_DELETE_POLICY_FINAL: the options come
 * from the server's decision on the message (`can.deleteForEveryone`), and the
 * server re-checks on the command (a refusal falls back to "for me").
 */

export function errorText(t: (key: string) => string, error: unknown): string {
  if (error instanceof MessagingError) {
    if (error.code === "window-expired") return t("errors.window");
    if (error.code === "policy") return t("errors.policy");
    if (error.code === "removed") return t("errors.removed");
    if (error.code === "blocked") return t("errors.blocked");
    if (error.code === "too-large" || error.code === "too-long") return t("errors.tooLarge");
    if (error.code === "unavailable") return error.message === "rate-limited" ? t("errors.rateLimited") : t("errors.notAvailable");
    if (error.code === "invalid" && error.message === "reason-required") return t("errors.reasonRequired");
    if (error.code === "invalid" && error.message === "one-reviewer") return t("errors.oneReviewer");
  }
  return t("errors.generic");
}

export function DeleteMessageDialog({
  message,
  conversation,
  onClose,
}: {
  message: Message;
  conversation: ConversationDetail;
  onClose: () => void;
}) {
  const t = useTranslations("Msg.delete");
  const tErr = useTranslations("Msg");
  const [choice, setChoice] = useState<"everyone" | "me">("everyone");
  const [error, setError] = useState<string | null>(null);
  const forEveryone = useMessagingMutation((repo, id: string) => repo.messages.deleteForEveryone(id));
  const forMe = useMessagingMutation((repo, id: string) => repo.messages.deleteForMe(id));
  const allowed = message.can.deleteForEveryone;
  const other = conversation.kind === "direct" ? conversation.title : null;

  const run = async (mode: "everyone" | "me") => {
    setError(null);
    try {
      if (mode === "everyone") await forEveryone.mutateAsync(message.id);
      else await forMe.mutateAsync(message.id);
      toast({ title: mode === "everyone" ? t("doneEveryone") : t("doneMe") });
      onClose();
    } catch (e) {
      setError(errorText(tErr as never, e));
    }
  };

  const body = allowed.allowed ? (
    <div role="radiogroup" aria-label={t("choose")} className="flex flex-col gap-2">
      {(["everyone", "me"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={choice === mode}
          onClick={() => setChoice(mode)}
          className={cn(
            "flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-start text-sm",
            choice === mode ? "inset-ring-[1.5px] inset-ring-fg" : "bg-subtle",
          )}
        >
          <span className="font-bold">{mode === "everyone" ? t("forEveryone") : t("forMe")}</span>
          <span className="text-xs text-fg-secondary">
            {mode === "everyone" ? (other ? t("everyoneHintDirect", { name: other }) : t("everyoneHint")) : t("meHint")}
          </span>
        </button>
      ))}
    </div>
  ) : null;

  const description = allowed.allowed
    ? null
    : allowed.reason === "window"
      ? other
        ? t("afterDirect", { name: other })
        : t("afterGroup")
      : allowed.reason === "policy"
        ? t("policy", { channel: conversation.title })
        : t("notAuthor");

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent
        title={allowed.allowed ? t("titleWithin") : allowed.reason === "window" ? t("titleAfter") : allowed.reason === "policy" ? t("titlePolicy") : t("titleMe")}
        description={description}
        tone="destructive"
      >
        {body}
        {error ? (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <Button variant="destructive" loading={forEveryone.isPending || forMe.isPending} onClick={() => void run(allowed.allowed ? choice : "me")}>
            {allowed.allowed ? t("confirm") : t("forMe")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ModerateDialog({ message, onClose }: { message: Message; onClose: () => void }) {
  const t = useTranslations("Msg.moderate");
  const moderate = useMessagingMutation((repo, id: string) => repo.messages.moderate(id));
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      tone="destructive"
      onConfirm={async () => {
        await moderate.mutateAsync(message.id);
        toast({ title: t("done") });
        onClose();
      }}
    />
  );
}

export function ForwardDialog({ message, onClose }: { message: Message; onClose: () => void }) {
  const t = useTranslations("Msg.forward");
  const tErr = useTranslations("Msg");
  const [query, setQuery] = useState("");
  const [opId] = useState(newClientOpId);
  const targets = useForwardTargets(message.id);
  const forward = useMessagingMutation((repo, targetId: string) => repo.messages.forward(message.id, targetId, `${opId}:${targetId}`));
  const rows = (targets.data ?? []).filter((row) => row.title.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={t("title")} description={t("note")}>
        <SearchField value={query} onValueChange={setQuery} placeholder={t("search")} aria-label={t("search")} />
        <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {rows.map((row) => (
            <li key={row.conversationId}>
              <button
                type="button"
                disabled={!row.canPost || forward.isPending}
                onClick={async () => {
                  try {
                    await forward.mutateAsync(row.conversationId);
                    toast({ title: t("done", { name: row.title }) });
                    onClose();
                  } catch (e) {
                    toast({ title: errorText(tErr as never, e), tone: "danger" });
                  }
                }}
                className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-start text-sm hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-55"
              >
                <ConversationTitle kind={row.kind} title={row.title} className="font-bold" />
                <span className="shrink-0 text-xs text-fg-secondary">
                  {!row.canPost ? t("cantPost") : row.kind === "channel" ? <SourceChip source={row.source} /> : t(row.kind)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function ReportDialog({ target, onClose }: { target: { messageId: string } | { conversationId: string }; onClose: () => void }) {
  const t = useTranslations("Msg.report");
  const report = useMessagingMutation((repo, reason: ReportReason) =>
    "messageId" in target ? repo.messages.report(target.messageId, reason) : repo.conversations.report(target.conversationId, reason),
  );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={"messageId" in target ? t("title") : t("conversationTitle")} description={t("note")} size="sm">
        <div className="flex flex-col items-start gap-2">
          {(["spam", "harassment", "other"] as const).map((reason) => (
            <Button
              key={reason}
              variant="outline"
              size="sm"
              disabled={report.isPending}
              onClick={async () => {
                await report.mutateAsync(reason);
                toast({ title: t("done") });
                onClose();
              }}
            >
              {t(`reasons.${reason}`)}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { AlertDialogCancel };
