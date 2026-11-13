"use client";

import { Bold, Code, Italic, List, Mic, Paperclip, Send, Smile, Square, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { AccessState } from "@/components/feedback/access-state";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import type { Attachment, ConversationDetail, Message } from "@/data/messaging-domain";
import { useMessagingRepository } from "@/data/messaging-provider";
import { newClientOpId, useMessagingMutation, useParticipants } from "@/data/messaging-queries";
import { VOICE_MAX_BYTES, VOICE_MAX_SECONDS } from "@/data/mock/mock-messaging";
import { cn } from "@/lib/cn";
import { useMsgFormat } from "./format";
import { errorText } from "./message-dialogs";
import { MORE_REACTIONS, QUICK_REACTIONS } from "./message-bubble";
import { useOfflineState, useQueuedCount, useSendMessage } from "./outbox";
import { firstLink, wrapSelection } from "./rich-text";
import { useVoiceRecorder } from "./use-voice-recorder";

/*
 * Composer (MS-05): bounded rich text (bold, italic, code, lists, links),
 * Enter sends / Shift+Enter new line, emoji, @mentions of this
 * conversation's members only, attachments with progress (remove before
 * send, paste image = attachment), voice (MediaRecorder, hard stop 2:00 /
 * 10 MB, preview before send), offline queue (mock), link previews off by
 * default. Edit mode: "Editing message · n h left", Esc cancels.
 */

/** Stored body → editable text: mention tokens become "@Name" (kept in a side list). */
function fromBody(body: string): { text: string; mentions: { id: string; name: string }[] } {
  const mentions: { id: string; name: string }[] = [];
  const text = body.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, (_all, name: string, id: string) => {
    mentions.push({ id, name });
    return `@${name}`;
  });
  return { text, mentions };
}

interface Upload {
  key: string;
  name: string;
  bytes: number;
  kind: Attachment["kind"];
  progress: number;
  url?: string;
  result?: Attachment;
  error?: string;
}

export interface ComposerProps {
  conversation: ConversationDetail;
  meId: string;
  parentId?: string;
  replyTo?: Message | null;
  onCancelReply?: () => void;
  editing?: Message | null;
  onDoneEdit?: () => void;
  /** Thread composer: "Also send to channel" (M5). */
  allowAlsoSend?: boolean;
  onUnblock?: () => void;
  className?: string;
}

export function Composer({ conversation: c, meId, parentId, replyTo, onCancelReply, editing, onDoneEdit, allowAlsoSend, onUnblock, className }: ComposerProps) {
  const t = useTranslations("Msg.composer");
  const tMsg = useTranslations("Msg");
  const f = useMsgFormat();
  const repo = useMessagingRepository();
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [initial] = useState(() => fromBody(editing?.body ?? ""));
  const [draft, setDraft] = useState(initial.text);
  const [mentions, setMentions] = useState<{ id: string; name: string }[]>(initial.mentions);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [alsoSend, setAlsoSend] = useState(false);
  const [showFormat, setShowFormat] = useState(false);
  const [previewOnce, setPreviewOnce] = useState(false);
  const offline = useOfflineState();
  const queued = useQueuedCount();
  const outbox = useSendMessage();
  const recorder = useVoiceRecorder();
  const participants = useParticipants(c.id, mentionQuery !== null);
  const edit = useMessagingMutation((r, vars: { id: string; body: string }) => r.messages.edit(vars.id, vars.body));

  // The parent remounts the composer per edited message (key), so the draft starts from it.
  useEffect(() => {
    if (editing) area.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (replyTo) area.current?.focus();
  }, [replyTo]);

  if (!c.canPost) {
    if (c.blockedBy)
      return (
        <AccessState
          kind="msg-blocked"
          titleAs="p"
          primaryAction={
            c.blockedBy === "me" && onUnblock ? (
              <Button size="sm" variant="secondary" onClick={onUnblock}>
                {t("unblock")}
              </Button>
            ) : undefined
          }
          className={className}
        />
      );
    return <p className={cn("rounded-[28px] bg-subtle px-5 py-4 text-sm text-fg-secondary", className)}>{c.other?.deleted ? t("deletedUser") : t("cantPost")}</p>;
  }

  const placeholder = c.kind === "channel" ? t("placeholderChannel", { name: c.title }) : t("placeholder", { name: c.kind === "direct" ? c.title.split(" ")[0]! : c.title });
  const uploading = uploads.some((u) => !u.result && !u.error);
  const link = firstLink(draft);

  const toBody = (text: string) => mentions.reduce((body, m) => body.split(`@${m.name}`).join(`@[${m.name}](${m.id})`), text);

  const startUpload = async (file: { name: string; bytes: number; mime: string; kind: Attachment["kind"]; durationSec?: number; url?: string }) => {
    const key = newClientOpId();
    setUploads((list) => [...list, { key, name: file.name, bytes: file.bytes, kind: file.kind, progress: 0, url: file.url }]);
    try {
      const result = await repo.messages.upload(file, (p) => setUploads((list) => list.map((u) => (u.key === key ? { ...u, progress: p } : u))));
      setUploads((list) => list.map((u) => (u.key === key ? { ...u, progress: 1, result } : u)));
      return result;
    } catch (e) {
      const message = errorText(tMsg as never, e);
      setUploads((list) => list.map((u) => (u.key === key ? { ...u, error: message } : u)));
      return null;
    }
  };

  const addFiles = (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const image = file.type.startsWith("image/");
      void startUpload({ name: file.name, bytes: file.size, mime: file.type || "application/octet-stream", kind: image ? "image" : "file", url: URL.createObjectURL(file) });
    }
  };

  const reset = () => {
    setDraft("");
    setMentions([]);
    setUploads([]);
    setAlsoSend(false);
    setPreviewOnce(false);
    onCancelReply?.();
  };

  const submit = async () => {
    const text = draft.trim();
    if (editing) {
      if (!text) return;
      try {
        await edit.mutateAsync({ id: editing.id, body: toBody(text) });
        onDoneEdit?.();
        reset();
      } catch (e) {
        toast({ title: errorText(tMsg as never, e), tone: "danger" });
      }
      return;
    }
    const attachments = uploads.map((u) => u.result).filter((a): a is Attachment => Boolean(a));
    if ((!text && !attachments.length) || uploading) return;
    const entry = { clientOpId: newClientOpId(), conversationId: c.id, body: toBody(text), replyToId: replyTo?.id, parentId, alsoToConversation: alsoSend || undefined, attachments };
    reset();
    const ok = await outbox.send(entry);
    if (!ok && !offline) area.current?.focus();
  };

  const sendVoice = async () => {
    if (recorder.state.kind !== "preview") return;
    const { clip } = recorder.state;
    recorder.reset();
    const attachment = await startUpload({ name: `voice-${Date.now()}.${clip.extension}`, bytes: clip.bytes, mime: clip.mime, kind: "voice", durationSec: clip.durationSec, url: clip.url });
    if (!attachment) return;
    setUploads([]);
    await outbox.send({ clientOpId: newClientOpId(), conversationId: c.id, body: "", parentId, replyToId: replyTo?.id, attachments: [attachment] });
    onCancelReply?.();
  };

  const onChange = (value: string, caret: number) => {
    setDraft(value);
    const before = value.slice(0, caret);
    const match = /(?:^|\s)@([^\s@]{0,30})$/.exec(before);
    setMentionQuery(match ? match[1]! : null);
  };

  const pickMention = (person: { id: string; name: string }) => {
    const el = area.current;
    const caret = el?.selectionStart ?? draft.length;
    const before = draft.slice(0, caret).replace(/@([^\s@]{0,30})$/, `@${person.name} `);
    const next = before + draft.slice(caret);
    setDraft(next);
    setMentions((list) => [...list.filter((m) => m.id !== person.id), person]);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  const format = (marker: "**" | "_" | "`" | "- ") => {
    const el = area.current;
    if (!el) return;
    const next = wrapSelection(draft, el.selectionStart, el.selectionEnd, marker);
    setDraft(next.value);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  };

  const insert = (text: string) => {
    const el = area.current;
    const caret = el?.selectionStart ?? draft.length;
    const next = draft.slice(0, caret) + text + draft.slice(caret);
    setDraft(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret + text.length, caret + text.length);
    });
  };

  const mentionOptions = (participants.data ?? []).filter((p) => p.id !== meId && !p.deleted && p.name.toLowerCase().includes((mentionQuery ?? "").toLowerCase())).slice(0, 6);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape" && editing) {
      event.preventDefault();
      reset();
      onDoneEdit?.();
      return;
    }
    if (event.key === "Escape" && mentionQuery !== null) {
      setMentionQuery(null);
      return;
    }
    if (event.key === "Enter" && mentionQuery !== null && mentionOptions[0]) {
      event.preventDefault();
      pickMention(mentionOptions[0]);
      return;
    }
    const desktop = typeof window !== "undefined" && window.matchMedia?.("(min-width: 1024px)").matches;
    if (event.key === "Enter" && !event.shiftKey && desktop && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (images.length) {
      event.preventDefault();
      addFiles(images);
    }
  };

  const rec = recorder.state;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {offline ? <AccessState kind="msg-offline" titleAs="p" values={{ count: queued }} /> : null}
      <div className="flex flex-col gap-2 rounded-[28px] bg-surface p-2 shadow-island">
        {editing ? (
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-subtle px-3 py-2 text-xs">
            <span className="font-bold">{t("editing", { count: editing.can.editHoursLeft ?? 0 })}</span>
            <button
              type="button"
              className="text-fg-secondary hover:text-fg"
              onClick={() => {
                reset();
                onDoneEdit?.();
              }}
            >
              {t("escCancel")}
            </button>
          </div>
        ) : replyTo ? (
          <div className="flex items-center gap-2 rounded-2xl border-s-[3px] border-scope-deep bg-subtle px-3 py-2 text-xs">
            <span className="min-w-0 flex-1">
              <bdi className="block font-bold">{t("replyingTo", { name: replyTo.mine ? tMsg("bubble.you") : replyTo.author.name || tMsg("bubble.deletedUser") })}</bdi>
              <span dir="auto" className="line-clamp-1 text-fg-secondary">
                {replyTo.body.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1") || tMsg(`list.preview.${replyTo.attachments[0]?.kind ?? "text"}` as never)}
              </span>
            </span>
            <IconButton icon={X} size="sm" variant="ghost" label={t("cancelReply")} onClick={onCancelReply} />
          </div>
        ) : null}

        {uploads.length ? (
          <ul aria-label={t("attachments")} className="flex flex-wrap gap-2 px-1">
            {uploads.map((u) => (
              <li key={u.key} className="relative flex w-40 flex-col gap-1 rounded-2xl bg-subtle p-2 text-xs">
                <bdi className="truncate font-bold">{u.name}</bdi>
                <span className="text-fg-secondary">{u.error ?? (u.result ? f.bytes(u.bytes) : t("uploading", { percent: f.number(Math.round(u.progress * 100)) }))}</span>
                {!u.result && !u.error ? (
                  <span role="progressbar" aria-label={t("uploadingName", { name: u.name })} aria-valuenow={Math.round(u.progress * 100)} aria-valuemin={0} aria-valuemax={100} className="h-1 overflow-hidden rounded-pill bg-hairline">
                    <span className="block h-full bg-scope-deep transition-[width]" style={{ width: `${u.progress * 100}%` }} />
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label={t("remove", { name: u.name })}
                  onClick={() => setUploads((list) => list.filter((x) => x.key !== u.key))}
                  className="absolute -top-2 -end-2 grid size-6 place-items-center rounded-pill bg-elevated shadow-xs"
                >
                  <Icon icon={X} size={12} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {rec.kind === "recording" || rec.kind === "preview" ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-subtle px-3 py-2 text-sm">
            {rec.kind === "recording" ? (
              <>
                <span className="size-2.5 animate-pulse rounded-pill bg-danger" aria-hidden />
                <span className="font-bold">{t("voice.recording")}</span>
                <span dir="ltr" className="tabular">
                  {f.duration(rec.elapsed)} / {f.duration(VOICE_MAX_SECONDS)}
                </span>
                <span className="text-xs text-fg-secondary">{t("voice.size", { size: f.bytes(rec.bytes), max: f.bytes(VOICE_MAX_BYTES) })}</span>
                <span className="flex-1" />
                <Button size="sm" variant="ghost" onClick={recorder.discard}>
                  {t("voice.discard")}
                </Button>
                <IconButton icon={Square} size="sm" label={t("voice.stop")} onClick={recorder.stop} />
              </>
            ) : (
              <>
                {rec.stoppedBy !== "user" ? (
                  <span role="status" className="w-full text-xs font-bold text-danger-text">
                    {t("voice.limit", { reason: rec.stoppedBy === "time" ? f.duration(VOICE_MAX_SECONDS) : f.bytes(VOICE_MAX_BYTES) })}
                  </span>
                ) : null}
                <audio src={rec.clip.url} controls className="h-9 max-w-full" aria-label={t("voice.preview")} />
                <span className="text-xs text-fg-secondary">
                  {f.duration(rec.clip.durationSec)} · {f.bytes(rec.clip.bytes)}
                </span>
                <span className="flex-1" />
                <IconButton icon={Trash2} size="sm" variant="ghost" label={t("voice.discard")} onClick={recorder.discard} />
                <IconButton icon={Send} mirror size="sm" variant="primary" label={t("voice.send")} onClick={() => void sendVoice()} />
              </>
            )}
          </div>
        ) : null}
        {rec.kind === "error" ? (
          <p role="alert" className="px-2 text-xs text-danger-text">
            {t(`voice.${rec.reason}`)}
          </p>
        ) : null}

        {showFormat ? (
          <div role="toolbar" aria-label={t("formatting")} className="flex gap-1 px-1">
            <IconButton icon={Bold} size="sm" variant="ghost" label={t("format.bold")} onClick={() => format("**")} />
            <IconButton icon={Italic} size="sm" variant="ghost" label={t("format.italic")} onClick={() => format("_")} />
            <IconButton icon={Code} size="sm" variant="ghost" label={t("format.code")} onClick={() => format("`")} />
            <IconButton icon={List} size="sm" variant="ghost" label={t("format.list")} onClick={() => format("- ")} />
          </div>
        ) : null}

        <div className="relative flex items-end gap-1.5">
          {mentionQuery !== null ? (
            <ul role="listbox" aria-label={t("mentionList")} className="absolute bottom-full start-10 z-20 mb-2 flex w-64 flex-col gap-0.5 rounded-2xl bg-elevated p-1.5 shadow-elevated">
              {mentionOptions.length ? (
                mentionOptions.map((p, i) => (
                  <li key={p.id} role="option" aria-selected={i === 0}>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickMention(p)} className="w-full rounded-xl px-3 py-2 text-start text-sm hover:bg-subtle">
                      <bdi>{p.name}</bdi>
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-3 py-2 text-xs text-fg-secondary">{t("noMention")}</li>
              )}
            </ul>
          ) : null}
          {!editing ? <IconButton icon={Paperclip} size="sm" label={t("attach")} onClick={() => fileInput.current?.click()} /> : null}
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => (e.target.files && addFiles(e.target.files), (e.target.value = ""))} />
          <IconButton icon={showFormat ? X : Bold} size="sm" variant="ghost" label={t("formatting")} aria-pressed={showFormat} onClick={() => setShowFormat((v) => !v)} />
          <textarea
            ref={area}
            value={draft}
            rows={1}
            dir="auto"
            aria-label={placeholder}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-fg outline-none placeholder:text-fg-muted field-sizing-content"
          />
          <Popover>
            <PopoverTrigger asChild>
              <IconButton icon={Smile} size="sm" variant="secondary" label={t("emoji")} />
            </PopoverTrigger>
            <PopoverContent className="grid w-auto grid-cols-6 gap-1 p-2">
              {[...QUICK_REACTIONS, ...MORE_REACTIONS, "☕", "🌧️", "🙂"].map((emoji) => (
                <button key={emoji} type="button" aria-label={emoji} onClick={() => insert(emoji)} className="grid size-9 place-items-center rounded-pill text-lg hover:bg-subtle">
                  {emoji}
                </button>
              ))}
            </PopoverContent>
          </Popover>
          {draft.trim() || uploads.length || editing ? (
            <IconButton icon={Send} mirror size="sm" variant="primary" label={editing ? t("save") : t("send")} disabled={uploading} loading={edit.isPending} onClick={() => void submit()} />
          ) : (
            <IconButton
              icon={Mic}
              size="sm"
              variant="secondary"
              label={t("record")}
              disabled={rec.kind === "recording"}
              onClick={() => void recorder.start()}
            />
          )}
        </div>
        {link && !c.linkPreviews ? (
          <p className="flex items-center gap-2 px-3 pb-1 text-xs text-fg-secondary">
            {previewOnce ? t("preview.allowed") : t("preview.off")}
            {!previewOnce ? (
              <button type="button" className="font-bold text-fg underline" onClick={() => setPreviewOnce(true)}>
                {t("preview.allowOnce")}
              </button>
            ) : null}
          </p>
        ) : null}
        {allowAlsoSend ? (
          <label className="flex items-center gap-2 px-3 pb-1 text-xs text-fg-secondary">
            <Checkbox checked={alsoSend} onCheckedChange={(v) => setAlsoSend(v === true)} />
            {c.kind === "channel" ? t("alsoChannel") : t("alsoConversation")}
          </label>
        ) : null}
      </div>
    </div>
  );
}
