"use client";

import { Archive, Bell, CalendarDays, CheckSquare, Clock, FileText, Inbox, Link2, Mic, PenLine, RotateCcw, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { Direction } from "radix-ui";
import { forwardRef } from "react";
import { Button, IconButton } from "@/components/ui/button";
import type { InboxItem } from "@/data/domain";
import { relativeDay } from "@/features/tasks/domain/group";
import { TaskCheck } from "@/features/tasks/list/task-parts";
import { useTasksFormat } from "@/features/tasks/ui/use-tasks-format";
import { cn } from "@/lib/cn";
import { dayOfInstant, minutesOfInstant } from "@/lib/dates/clock-time";
import type { InboxTarget } from "./domain/inbox";
import { SnoozeMenu } from "./snooze-menu";

/*
 * One Inbox row (P07): lighter than a task row — one line + source, no
 * priority or duration. Icon tile by kind, the suggestion as a quiet chip
 * ("Task?") that accepts it, hover / focus actions on desktop. Never
 * notched. The current item (shown in the Process card) is outlined.
 * Leaving: archive collapses the height (200ms), a triage slides toward the
 * inline start (260ms); reduced motion swaps instantly.
 */

const ICON: Record<string, { icon: LucideIcon; tile: string }> = {
  voice: { icon: Mic, tile: "bg-(--viz-blue)/15 text-(--viz-blue)" },
  share: { icon: Link2, tile: "bg-subtle text-fg-secondary" },
  "brain-dump": { icon: PenLine, tile: "bg-subtle text-fg-secondary" },
  task: { icon: CheckSquare, tile: "bg-scope-soft text-scope-deep" },
  event: { icon: CalendarDays, tile: "bg-scope-soft text-scope-deep" },
  note: { icon: FileText, tile: "bg-warning-soft text-warning-text" },
  journal: { icon: FileText, tile: "bg-subtle text-fg-secondary" },
  reminder: { icon: Bell, tile: "bg-danger-soft text-danger-text" },
  default: { icon: Inbox, tile: "bg-subtle text-fg-secondary" },
};

export function rowIcon(item: InboxItem, target: InboxTarget | null) {
  if (item.source === "voice" || item.source === "share" || item.source === "brain-dump") return ICON[item.source]!;
  return (target && ICON[target]) || ICON.default!;
}

export function useCapturedText() {
  const t = useTranslations("Inbox");
  const format = useTasksFormat();
  return (item: InboxItem, today: string): { source: string; when: string; detail: string | null } => {
    const day = dayOfInstant(item.capturedAt);
    const clock = format.clock(minutesOfInstant(item.capturedAt));
    const relative = relativeDay(day, today);
    const when =
      relative === "today" ? clock : relative === "yesterday" ? `${format.relative("yesterday")} ${clock}` : format.weekdayShort(day);
    const detail =
      item.source === "voice"
        ? item.transcriptFailed
          ? t("transcript.rowMeta")
          : t("sourceDetail.voice", { seconds: item.audioSeconds ? `${format.number(item.audioSeconds)}s` : "—" })
        : item.source === "share" || item.source === "brain-dump"
          ? t(`sourceDetail.${item.source}`)
          : null;
    return { source: t(`source.${item.source}`), when, detail };
  };
}

export interface InboxRowProps {
  item: InboxItem;
  today: string;
  target: InboxTarget | null;
  current: boolean;
  selecting: boolean;
  selected: boolean;
  /** "triage" rows decide; "snoozed" / "archived" rows only restore. */
  mode: "triage" | "snoozed" | "archived";
  onOpen(): void;
  onToggleSelect(): void;
  onSend(target: InboxTarget): void;
  onSnooze(until: string): void;
  onArchive(): void;
  onRestore(): void;
  /** How this row leaves (set just before the mutation). */
  exit?: "collapse" | "fly";
}

export const InboxRow = forwardRef<HTMLLIElement, InboxRowProps>(function InboxRow(
  { item, today, target, current, selecting, selected, mode, onOpen, onToggleSelect, onSend, onSnooze, onArchive, onRestore, exit = "collapse" },
  ref,
) {
  const t = useTranslations("Inbox");
  const format = useTasksFormat();
  const reduce = useReducedMotion();
  const captured = useCapturedText()(item, today);
  const { icon: Icon, tile } = rowIcon(item, target);
  const isRtl = Direction.useDirection() === "rtl";

  const meta = [captured.source, captured.when, captured.detail].filter(Boolean).join(" · ");
  const until = item.snoozedUntil
    ? `${format.weekdayShort(dayOfInstant(item.snoozedUntil))} ${format.clock(minutesOfInstant(item.snoozedUntil))}`
    : null;

  return (
    <motion.li
      ref={ref}
      layout={reduce ? false : "position"}
      initial={false}
      exit={
        reduce
          ? { opacity: 0, transition: { duration: 0 } }
          : exit === "fly"
            ? { opacity: 0, x: isRtl ? 48 : -48, transition: { duration: 0.26 } }
            : { opacity: 0, height: 0, marginBlock: 0, transition: { duration: 0.2 } }
      }
      data-inbox-item={item.id}
      data-current={current || undefined}
      className={cn(
        "group relative flex min-h-16 items-center gap-3 overflow-hidden rounded-[22px] px-3.5 py-2.5 transition-colors",
        current ? "bg-scope-soft/50 ring-[1.5px] ring-primary" : "hover:bg-subtle focus-within:bg-subtle",
      )}
    >
      {selecting ? (
        <TaskCheck
          look={selected ? "selected" : "unselected"}
          role="checkbox"
          aria-checked={selected}
          aria-label={t("list.selectItem", { text: item.text })}
          onClick={onToggleSelect}
        />
      ) : (
        <span aria-hidden="true" className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full", tile)}>
          <Icon size={16} />
        </span>
      )}

      <button
        type="button"
        onClick={mode === "triage" ? (selecting ? onToggleSelect : onOpen) : undefined}
        disabled={mode !== "triage"}
        aria-current={current || undefined}
        aria-label={mode === "triage" && !selecting ? t("list.openItem", { text: item.text }) : undefined}
        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-start focus-visible:focus-ring rounded-lg disabled:cursor-default"
      >
        <span className="w-full truncate text-sm font-semibold text-fg" dir="auto">
          {item.text}
        </span>
        <span className="flex w-full flex-wrap items-center gap-x-2 text-xs text-fg-muted">
          {item.backFromSnooze ? (
            <span className="inline-flex items-center gap-1 rounded-pill bg-scope-soft px-2 py-0.5 font-bold text-scope-deep">
              <Clock aria-hidden="true" size={11} />
              {t("list.backFromSnooze")}
            </span>
          ) : null}
          <span className={cn(item.transcriptFailed && "text-danger-text")}>{meta}</span>
          {mode === "snoozed" && until ? <span>· {t("list.until", { when: until })}</span> : null}
        </span>
      </button>

      {mode === "triage" && !selecting ? (
        <>
          <div
            role="group"
            aria-label={t("list.quickActions")}
            className="hidden items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none lg:flex"
          >
            {(["task", "event", "note"] as const).map((key) => (
              <IconButton
                key={key}
                icon={key === "task" ? CheckSquare : key === "event" ? CalendarDays : FileText}
                label={t(`target.${key}`)}
                variant="ghost"
                size="sm"
                onClick={() => onSend(key)}
              />
            ))}
            <SnoozeMenu trigger={<IconButton icon={Clock} label={t("process.snooze")} variant="ghost" size="sm" />} onSnooze={onSnooze} />
            <IconButton icon={Archive} label={t("process.archive")} variant="ghost" size="sm" onClick={onArchive} />
          </div>
          {target ? (
            <button
              type="button"
              onClick={() => onSend(target)}
              aria-label={t("acceptSuggestion", { text: item.text, target: t(`target.${target}`) })}
              className="shrink-0 rounded-pill px-3 py-1 text-xs font-bold text-fg-secondary inset-ring inset-ring-outline hover:bg-subtle focus-visible:focus-ring lg:group-hover:hidden lg:group-focus-within:hidden"
            >
              {t("suggestionChip", { target })}
            </button>
          ) : null}
        </>
      ) : null}

      {mode !== "triage" ? (
        <Button variant="secondary" size="sm" onClick={onRestore} className="shrink-0 gap-1.5">
          <RotateCcw aria-hidden="true" size={14} className="rtl:-scale-x-100" />
          {mode === "snoozed" ? t("list.unsnooze") : t("list.restore")}
        </Button>
      ) : null}
    </motion.li>
  );
});
