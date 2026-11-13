"use client";

import {
  AlertCircle,
  Ban,
  Check,
  CheckCheck,
  Clock,
  Copy,
  FileText,
  Flag,
  Forward,
  MessageSquareText,
  MoreHorizontal,
  Pause,
  Pencil,
  Pin,
  PinOff,
  Play,
  Reply,
  ShieldX,
  SmilePlus,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLongPress } from "@/components/ui/use-long-press";
import type { Attachment, Message } from "@/data/messaging-domain";
import { cn } from "@/lib/cn";
import { useMsgFormat } from "./format";
import { RichText } from "./rich-text";
import { PersonAvatar } from "./visuals";

/*
 * One message (MS-02 / MS-04): bubble (mine = source colour, end side, so
 * left in RTL), reply quote, attachments, reactions, "edited", receipts per
 * the server, thread link, task card, tombstones. Actions: hover / focus
 * toolbar (3 quick reactions, more, reply, more…), context menu via the
 * button, Shift+F10 or long-press. Every allowed action comes from
 * `message.can` (server decision) — never a client clock.
 */

export const QUICK_REACTIONS = ["👍", "❤️", "😂"] as const;
export const MORE_REACTIONS = ["🎉", "👀", "🙏", "🔥", "✅", "😮", "😢", "👏"] as const;

export interface MessageActions {
  onReact: (message: Message, emoji: string) => void;
  onReply: (message: Message) => void;
  onThread?: (message: Message) => void;
  onForward: (message: Message) => void;
  onEdit: (message: Message) => void;
  onPin: (message: Message) => void;
  onCopy: (message: Message) => void;
  onDelete: (message: Message) => void;
  onReport: (message: Message) => void;
  onModerate: (message: Message) => void;
}

export interface MessageBubbleProps {
  message: Message;
  showAuthor: boolean;
  meId: string;
  canPost: boolean;
  actions: MessageActions;
  /** Thread link target (parent messages). */
  threadHref?: string;
  highlighted?: boolean;
  collapseBlocked?: boolean;
  /** Pending state from the outbox (sending / queued / failed). */
  pending?: { status: "sending" | "queued" | "failed"; onRetry: () => void; onDiscard: () => void };
}

export function MessageBubble({ message: m, showAuthor, meId, canPost, actions, threadHref, highlighted, collapseBlocked, pending }: MessageBubbleProps) {
  const t = useTranslations("Msg.bubble");
  const tA = useTranslations("Msg.actions");
  const f = useMsgFormat();
  const [menuOpen, setMenuOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const longPress = useLongPress(() => setMenuOpen(true));
  const rowRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const live = m.state === "visible" && !pending;
  const authorName = m.author.deleted ? t("deletedUser") : m.author.name;

  if (m.fromBlocked && collapseBlocked && !revealed) {
    return (
      <div className="flex justify-start">
        <button type="button" onClick={() => setRevealed(true)} className="rounded-pill bg-subtle px-3 py-1.5 text-xs text-fg-secondary hover:text-fg">
          {t("fromBlocked")} · {t("show")}
        </button>
      </div>
    );
  }

  if (m.state !== "visible") {
    return (
      <div id={`msg-${m.id}`} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
        <span className="inline-flex items-center gap-1.5 rounded-pill border border-hairline px-3 py-1 text-xs text-fg-secondary">
          <Icon icon={m.state === "removed" ? ShieldX : Ban} size={14} />
          {m.state === "removed" ? t("removedModerator") : m.mine ? t("deletedEveryone") : t("deletedOther")}
          <span className="text-fg-muted">· {f.time(m.createdAt)}</span>
        </span>
      </div>
    );
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu") {
      event.preventDefault();
      setMenuOpen(true);
    }
  };

  return (
    <div
      id={`msg-${m.id}`}
      ref={rowRef}
      tabIndex={live ? 0 : -1}
      onKeyDown={live ? onKeyDown : undefined}
      aria-label={t("aria", { author: m.mine ? t("you") : authorName, time: f.time(m.createdAt) })}
      {...(live ? longPress.handlers : {})}
      onPointerDownCapture={(e) => {
        if (e.pointerType !== "mouse") swipe.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUpCapture={(e) => {
        const start = swipe.current;
        swipe.current = null;
        if (!start || !live || !canPost) return;
        // Swipe toward inline-end ("right" in LTR, "left" in RTL) replies (MS mobile rule).
        const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
        const dx = (e.clientX - start.x) * (rtl ? -1 : 1);
        if (dx > 64 && Math.abs(e.clientY - start.y) < 32) actions.onReply(m);
      }}
      className={cn(
        "group/msg relative flex items-end gap-2 rounded-2xl outline-offset-4",
        m.mine ? "flex-row-reverse" : "flex-row",
        highlighted && "bg-warning-soft ring-2 ring-warning-text/40",
      )}
    >
      {!m.mine ? showAuthor ? <PersonAvatar person={m.author} /> : <span className="w-8 shrink-0" aria-hidden /> : null}
      <div className={cn("flex min-w-0 max-w-[min(32rem,80%)] flex-col gap-1", m.mine ? "items-end" : "items-start")}>
        <div
          className={cn(
            "flex min-w-0 flex-col gap-1.5 rounded-[22px] px-3.5 py-2.5 text-sm shadow-xs",
            m.mine ? "rounded-ee-md bg-scope-deep text-on-accent" : "rounded-es-md bg-surface text-fg",
          )}
        >
          {!m.mine && showAuthor ? <bdi className="text-xs font-bold text-scope-deep">{authorName}</bdi> : null}
          {m.forwarded ? (
            <span className="inline-flex items-center gap-1 text-xs italic opacity-80">
              <Icon icon={Forward} size={12} mirror />
              {t("forwarded")}
            </span>
          ) : null}
          {m.replyTo ? (
            <a
              href={`#msg-${m.replyTo.id}`}
              className={cn("rounded-xl border-s-[3px] px-2.5 py-1.5 text-xs", m.mine ? "border-on-accent/60 bg-on-accent/10" : "border-scope-deep bg-subtle")}
            >
              {m.replyTo.deleted ? (
                <span className="italic opacity-80">{t("replyDeleted")}</span>
              ) : (
                <>
                  <bdi className="block font-bold">{m.replyTo.author || t("deletedUser")}</bdi>
                  <span dir="auto" className="line-clamp-2">
                    {m.replyTo.excerpt}
                  </span>
                </>
              )}
            </a>
          ) : null}
          {m.attachments.map((a) => (
            <AttachmentView key={a.id} attachment={a} mine={m.mine} />
          ))}
          {m.body ? <RichText body={m.body} meId={meId} /> : null}
          {m.taskLink ? <TaskCard link={m.taskLink} mine={m.mine} /> : null}
          <span className={cn("flex items-center justify-end gap-1.5 text-[11px]", m.mine ? "text-on-accent/80" : "text-fg-muted")}>
            <span dir="ltr">{f.time(m.createdAt)}</span>
            {m.editedAt ? <span>{t("edited")}</span> : null}
            {pending ? <PendingMark pending={pending} /> : m.receipt ? <Receipt receipt={m.receipt} /> : null}
          </span>
        </div>
        {m.reactions.length ? (
          <div className="flex flex-wrap gap-1">
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                aria-pressed={r.mine}
                disabled={!canPost}
                onClick={() => actions.onReact(m, r.emoji)}
                aria-label={t("reaction", { emoji: r.emoji, count: r.count })}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-pill bg-surface px-2 text-xs font-bold shadow-xs inset-ring inset-ring-hairline",
                  r.mine && "inset-ring-scope-deep",
                )}
              >
                <span aria-hidden>{r.emoji}</span>
                <span aria-hidden>{f.number(r.count)}</span>
              </button>
            ))}
          </div>
        ) : null}
        {m.thread && threadHref ? (
          <Link href={threadHref} className="inline-flex items-center gap-1.5 text-xs font-bold text-scope-deep hover:underline">
            <Icon icon={MessageSquareText} size={14} />
            {t("replies", { count: m.thread.count, time: f.time(m.thread.lastAt) })}
            {m.thread.unread ? <span className="rounded-pill bg-scope-deep px-1.5 text-on-accent">{t("threadNew", { count: m.thread.unread })}</span> : null}
          </Link>
        ) : null}
        {pending?.status === "failed" ? (
          <span className="flex items-center gap-2 text-xs">
            <Button size="sm" variant="secondary" onClick={pending.onRetry}>
              {t("retry")}
            </Button>
            <Button size="sm" variant="ghost" onClick={pending.onDiscard}>
              {tA("discard")}
            </Button>
          </span>
        ) : null}
      </div>

      {live ? (
        <div
          role="toolbar"
          aria-label={tA("toolbar")}
          className={cn(
            "absolute -top-5 z-10 hidden items-center gap-0.5 rounded-pill bg-elevated p-1 shadow-elevated group-hover/msg:flex group-focus-within/msg:flex",
            m.mine ? "end-2" : "start-12",
            menuOpen && "flex",
          )}
        >
          {canPost
            ? QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => actions.onReact(m, emoji)}
                  aria-label={tA("reactWith", { emoji })}
                  className="grid size-8 place-items-center rounded-pill text-base hover:bg-subtle"
                >
                  <span aria-hidden>{emoji}</span>
                </button>
              ))
            : null}
          {canPost ? <MoreReactions onPick={(emoji) => actions.onReact(m, emoji)} /> : null}
          {canPost ? (
            <button type="button" onClick={() => actions.onReply(m)} aria-label={tA("reply")} className="grid size-8 place-items-center rounded-pill hover:bg-subtle">
              <Icon icon={Reply} size={16} mirror />
            </button>
          ) : null}
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={tA("more")} className="grid size-8 place-items-center rounded-pill hover:bg-subtle">
                <Icon icon={MoreHorizontal} size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={m.mine ? "end" : "start"} onCloseAutoFocus={(e) => (e.preventDefault(), rowRef.current?.focus())}>
              {canPost ? (
                <DropdownMenuItem icon={Reply} onSelect={() => actions.onReply(m)}>
                  {tA("reply")}
                </DropdownMenuItem>
              ) : null}
              {canPost && actions.onThread && !m.parentId ? (
                <DropdownMenuItem icon={MessageSquareText} onSelect={() => actions.onThread!(m)}>
                  {tA("replyThread")}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem icon={Forward} onSelect={() => actions.onForward(m)}>
                {tA("forward")}
              </DropdownMenuItem>
              {m.can.editHoursLeft !== null ? (
                <DropdownMenuItem icon={Pencil} hint={tA("hoursLeft", { count: m.can.editHoursLeft })} onSelect={() => actions.onEdit(m)}>
                  {tA("edit")}
                </DropdownMenuItem>
              ) : null}
              {m.can.pin ? (
                <DropdownMenuItem icon={m.pinned ? PinOff : Pin} onSelect={() => actions.onPin(m)}>
                  {m.pinned ? tA("unpin") : tA("pin")}
                </DropdownMenuItem>
              ) : null}
              {m.body ? (
                <DropdownMenuItem icon={Copy} onSelect={() => actions.onCopy(m)}>
                  {tA("copy")}
                </DropdownMenuItem>
              ) : null}
              {!m.mine ? (
                <DropdownMenuItem icon={Flag} onSelect={() => actions.onReport(m)}>
                  {tA("report")}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              {m.can.moderate ? (
                <DropdownMenuItem icon={ShieldX} tone="destructive" onSelect={() => actions.onModerate(m)}>
                  {tA("moderate")}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem icon={Trash2} tone="destructive" onSelect={() => actions.onDelete(m)}>
                {tA("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </div>
  );
}

function MoreReactions({ onPick }: { onPick: (emoji: string) => void }) {
  const t = useTranslations("Msg.actions");
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={t("moreReactions")} className="grid size-8 place-items-center rounded-pill hover:bg-subtle">
          <Icon icon={SmilePlus} size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="grid w-auto grid-cols-4 gap-1 p-2">
        {MORE_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={t("reactWith", { emoji })}
            onClick={() => {
              onPick(emoji);
              setOpen(false);
            }}
            className="grid size-9 place-items-center rounded-pill text-lg hover:bg-subtle"
          >
            <span aria-hidden>{emoji}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function Receipt({ receipt }: { receipt: NonNullable<Message["receipt"]> }) {
  const t = useTranslations("Msg.bubble");
  if (receipt === "seen")
    return (
      <span className="inline-flex items-center gap-0.5">
        <Icon icon={CheckCheck} size={13} />
        {t("seen")}
      </span>
    );
  if (receipt === "delivered")
    return (
      <span className="inline-flex items-center gap-0.5">
        <Icon icon={CheckCheck} size={13} />
        <span className="sr-only">{t("delivered")}</span>
        <span aria-hidden className="max-sm:hidden">
          {t("delivered")}
        </span>
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5">
      <Icon icon={Check} size={13} />
      <span className="sr-only">{t("sent")}</span>
    </span>
  );
}

function PendingMark({ pending }: { pending: NonNullable<MessageBubbleProps["pending"]> }) {
  const t = useTranslations("Msg.bubble");
  if (pending.status === "failed")
    return (
      <span role="alert" className="inline-flex items-center gap-0.5 font-bold">
        <Icon icon={AlertCircle} size={13} />
        {t("notSent")}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5">
      <Icon icon={Clock} size={13} />
      {pending.status === "queued" ? t("queued") : t("sending")}
    </span>
  );
}

function AttachmentView({ attachment: a, mine }: { attachment: Attachment; mine: boolean }) {
  const f = useMsgFormat();
  const t = useTranslations("Msg.bubble");
  if (a.kind === "voice") return <VoiceBubble attachment={a} mine={mine} />;
  if (a.kind === "image")
    return (
      <figure className="flex flex-col gap-1">
        {a.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL (mock upload)
          <img src={a.url} alt={a.name} className="max-h-72 w-full max-w-72 rounded-2xl object-cover" />
        ) : (
          <span aria-hidden className="block h-40 w-full min-w-56 max-w-72 rounded-2xl bg-gradient-to-br from-personal-soft to-subtle" />
        )}
        <figcaption className="text-xs font-semibold opacity-80">
          <bdi>{a.name}</bdi> · {f.bytes(a.bytes)}
        </figcaption>
      </figure>
    );
  return (
    <a
      href={a.url}
      download={a.url ? a.name : undefined}
      aria-disabled={!a.url || undefined}
      aria-label={t("openFile", { name: a.name })}
      className={cn("flex min-w-48 items-center gap-2.5 rounded-xl p-2", mine ? "bg-on-accent/10" : "bg-subtle")}
    >
      <Icon icon={FileText} size={20} />
      <span className="flex min-w-0 flex-col text-xs">
        <bdi className="truncate font-bold">{a.name}</bdi>
        <span className="opacity-80">{f.bytes(a.bytes)}</span>
      </span>
    </a>
  );
}

const BARS = 22;

export function VoiceBubble({ attachment: a, mine }: { attachment: Attachment; mine: boolean }) {
  const t = useTranslations("Msg.bubble");
  const f = useMsgFormat();
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const heights = Array.from({ length: BARS }, (_, i) => 30 + (((a.id.charCodeAt(i % a.id.length) * (i + 3)) % 70) | 0));
  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };
  return (
    <div className="flex items-center gap-2.5" aria-label={t("voice", { duration: f.duration(a.durationSec ?? 0) })} role="group">
      <button
        type="button"
        onClick={toggle}
        disabled={!a.url}
        aria-label={playing ? t("pause") : t("play")}
        className={cn("grid size-9 shrink-0 place-items-center rounded-pill disabled:opacity-60", mine ? "bg-on-accent/15" : "bg-subtle")}
      >
        {/* Play / pause never mirror (CLAUDE.md §3). */}
        <Icon icon={playing ? Pause : Play} size={16} />
      </button>
      {/* Progress fills from inline-start: right → left in RTL. */}
      <span aria-hidden className="flex h-7 items-center gap-[2px]">
        {heights.map((h, i) => (
          <span key={i} className={cn("w-[3px] rounded-pill", i / BARS < progress ? "bg-current" : "bg-current opacity-40")} style={{ height: `${h}%` }} />
        ))}
      </span>
      <span dir="ltr" className="text-xs font-bold tabular">
        {f.duration(a.durationSec ?? 0)}
      </span>
      {a.url ? (
        <audio
          ref={audio}
          src={a.url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => (setPlaying(false), setProgress(0))}
          onTimeUpdate={(e) => setProgress(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
        />
      ) : null}
    </div>
  );
}

function TaskCard({ link, mine }: { link: NonNullable<Message["taskLink"]>; mine: boolean }) {
  const t = useTranslations("Msg.bubble");
  const f = useMsgFormat();
  if (!link.readable) return <span className={cn("rounded-xl px-2.5 py-2 text-xs italic", mine ? "bg-on-accent/10" : "bg-subtle")}>{t("restricted")}</span>;
  return (
    <span className={cn("flex flex-wrap items-center gap-2 rounded-xl px-2.5 py-2 text-xs", mine ? "bg-on-accent/10" : "bg-subtle")}>
      {link.status ? <span className="rounded-pill bg-surface px-2 py-0.5 font-semibold text-fg">{link.status}</span> : null}
      <bdi className="font-bold">{link.title ?? t("task")}</bdi>
      {link.due ? <span className="opacity-80">{t("due", { date: f.date(`${link.due}T12:00:00+03:30`) })}</span> : null}
    </span>
  );
}
