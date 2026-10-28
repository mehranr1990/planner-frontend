"use client";

import { Archive, ArrowRight, Bell, CalendarDays, Check, CheckSquare, ChevronDown, Clock, FileText, Inbox, Mic, PenLine, RefreshCw, Trash2, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { InboxItem } from "@/data/domain";
import { Progress } from "@/design-system/feedback/progress";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { isModuleVisible } from "@/features/planner-settings/planner-settings";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { ParsedChips } from "@/features/tasks/create/parsed-chips";
import { Kbd } from "@/features/tasks/list/task-parts";
import { useTasksFormat } from "@/features/tasks/ui/use-tasks-format";
import { cn } from "@/lib/cn";
import { minutesOfInstant } from "@/lib/dates/clock-time";
import { INBOX_TARGETS, TARGET_KEYS, type InboxSuggestion, type InboxTarget, type ProcessSummary } from "./domain/inbox";
import { rowIcon, useCapturedText } from "./inbox-row";
import { SnoozeMenu } from "./snooze-menu";

/*
 * The Process card (P07): the signature card of the page — the one object
 * you act on. Its notch holds the one contextual action, Skip (→). Walks
 * the triage list one by one (1 of N): source, the capture as a quote, what
 * parsing understood, six destinations (the suggestion pre-selected, keys
 * T E N J R B), then Snooze / Archive / Drop. Items cross-fade in (260ms;
 * MotionConfig swaps for reduced motion).
 */

const TARGET_ICON: Record<InboxTarget, LucideIcon> = {
  task: CheckSquare,
  event: CalendarDays,
  note: FileText,
  journal: FileText,
  reminder: Bell,
  "brain-dump": PenLine,
};

export interface ProcessCardProps {
  item: InboxItem;
  index: number;
  total: number;
  today: string;
  suggestion: InboxSuggestion;
  snoozeOpen: boolean;
  onSnoozeOpenChange(open: boolean): void;
  onSend(target: InboxTarget): void;
  onSnooze(until: string): void;
  onArchive(): void;
  onDrop(): void;
  onSkip(): void;
  onRetry(): void;
  busy?: boolean;
}

export function ProcessCard({
  item,
  index,
  total,
  today,
  suggestion,
  snoozeOpen,
  onSnoozeOpenChange,
  onSend,
  onSnooze,
  onArchive,
  onDrop,
  onSkip,
  onRetry,
  busy,
}: ProcessCardProps) {
  const t = useTranslations("Inbox");
  // Brain Dump is a hideable module: a hidden one is not a destination either.
  const brainDumpVisible = isModuleVisible(usePlannerSettings(), "braindump");
  const format = useTasksFormat();
  const captured = useCapturedText()(item, today);
  const { icon: SourceIcon, tile } = rowIcon(item, suggestion.target);
  const target = suggestion.target;

  return (
    <SignatureCard
      as="section"
      aria-labelledby="inbox-process-kicker"
      data-slot="inbox-process"
      action={<SignatureCardAction icon={ArrowRight} mirror label={t("process.skip")} onClick={onSkip} variant="neutral" />}
      contentClassName="flex flex-col gap-4"
    >
      <div className="flex min-w-0 flex-col gap-2 pe-16">
        <p id="inbox-process-kicker" className="type-label text-fg-muted">
          {t("process.kicker", { index: format.number(index + 1), total: format.number(total) })}
        </p>
        <Progress size="sm" value={total ? ((index + 1) / total) * 100 : 0} label={t("process.progress")} className="max-w-64" />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={item.id}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.26, ease: "easeOut" }}
          className="flex min-w-0 flex-col gap-4"
        >
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full", tile)}>
              <SourceIcon size={16} />
            </span>
            <div className="min-w-0 text-xs">
              <p className="font-bold text-fg">{t("process.capturedAt", { source: captured.source, when: captured.when })}</p>
              <p className="text-fg-muted">
                {[captured.detail, item.source === "voice" && !item.transcriptFailed ? t("process.audioNotKept") : null].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>

          <h2 className="type-h1 text-fg" dir="auto">
            “{item.text}”
          </h2>

          {item.transcriptFailed ? (
            <UtilityCard role="alert" className="flex flex-col gap-2">
              <p className="text-sm font-bold text-fg">{t("transcript.failed")}</p>
              <div className="flex items-center justify-between gap-3 rounded-pill bg-surface px-3 py-2">
                <span className="inline-flex items-center gap-2 text-xs font-semibold">
                  <Mic aria-hidden="true" size={14} className="text-danger-text" />
                  {t("transcript.recording", {
                    time: format.clock(minutesOfInstant(item.capturedAt)),
                    seconds: item.audioSeconds ? `${format.number(item.audioSeconds)}s` : "—",
                  })}
                </span>
                <Button variant="secondary" size="sm" onClick={onRetry} className="gap-1.5">
                  <RefreshCw aria-hidden="true" size={14} />
                  {t("transcript.retry")}
                </Button>
              </div>
              <p className="text-xs text-fg-muted">{t("transcript.kept")}</p>
            </UtilityCard>
          ) : (
            <UtilityCard className="flex flex-col gap-2">
              <p className="type-label text-fg-muted">{target ? t("process.looksLike", { target }) : t("process.noSuggestion")}</p>
              {target === "task" ? <ParsedChips parsed={suggestion.parsed} today={today} /> : null}
            </UtilityCard>
          )}
        </motion.div>
      </AnimatePresence>

      <div role="group" aria-label={t("process.destinations")} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {INBOX_TARGETS.filter((key) => key !== "brain-dump" || brainDumpVisible).map((key) => {
          const Icon = TARGET_ICON[key];
          const suggested = key === target;
          return (
            <button
              key={key}
              type="button"
              disabled={busy || item.transcriptFailed}
              onClick={() => onSend(key)}
              aria-keyshortcuts={TARGET_KEYS[key].toUpperCase()}
              data-suggested={suggested || undefined}
              className={cn(
                "flex min-h-16 flex-col justify-between gap-2 rounded-[20px] p-3 text-start text-[13px] font-bold transition-colors focus-visible:focus-ring disabled:opacity-45",
                suggested ? "bg-primary text-on-accent hover:bg-primary-hover" : "text-fg inset-ring inset-ring-outline hover:bg-subtle",
              )}
            >
              <span className="flex items-center justify-between">
                <Icon aria-hidden="true" size={16} />
                <Kbd className={cn(suggested && "bg-on-accent/20 text-on-accent")}>{TARGET_KEYS[key].toUpperCase()}</Kbd>
              </span>
              {t(`target.${key}`)}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SnoozeMenu
          open={snoozeOpen}
          onOpenChange={onSnoozeOpenChange}
          onSnooze={onSnooze}
          trigger={
            <Button variant="outline" size="sm" className="gap-1.5" aria-keyshortcuts="S" disabled={busy}>
              <Clock aria-hidden="true" size={14} />
              {t("process.snooze")}
              <ChevronDown aria-hidden="true" size={14} />
            </Button>
          }
        />
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onArchive} aria-keyshortcuts="A" disabled={busy}>
          <Archive aria-hidden="true" size={14} />
          {t("process.archive")}
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onDrop} aria-keyshortcuts="Backspace" disabled={busy}>
          <Trash2 aria-hidden="true" size={14} />
          {t("process.drop")}
        </Button>
        <p className="ms-auto text-xs text-fg-muted max-lg:hidden">{t("process.hint")}</p>
      </div>
    </SignatureCard>
  );
}

/** Inbox zero, and "Processed N items" after a processing session (P07 states). */
export function InboxDone({ summary, showBrainDump }: { summary: ProcessSummary | null; showBrainDump: boolean }) {
  const t = useTranslations("Inbox");
  const format = useTasksFormat();
  const n = (count: number) => ({ count, countText: format.number(count) });

  if (summary && summary.total > 0) {
    const parts = [
      summary.tasks ? t("finished.tasks", n(summary.tasks)) : null,
      summary.events ? t("finished.events", n(summary.events)) : null,
      summary.archived ? t("finished.archived", n(summary.archived)) : null,
      summary.other ? t("finished.other", n(summary.other)) : null,
    ].filter(Boolean);
    return (
      <ProductCard as="section" aria-labelledby="inbox-done-title" data-slot="inbox-finished" className="flex flex-col items-center gap-3 py-10 text-center">
        <span aria-hidden="true" className="inline-flex size-14 items-center justify-center rounded-full bg-subtle text-fg">
          <Check size={22} />
        </span>
        <h2 id="inbox-done-title" className="type-h2 text-fg">
          {t("finished.title", n(summary.total))}
        </h2>
        <p className="text-sm text-fg-secondary">
          {parts.join(" · ")}. {t("finished.light")}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/personal/my-day">{t("finished.backToMyDay")}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/personal/tasks">{t("finished.reviewTasks")}</Link>
          </Button>
        </div>
      </ProductCard>
    );
  }

  return (
    <ProductCard as="section" aria-labelledby="inbox-done-title" data-slot="inbox-zero" className="flex flex-col items-center gap-3 py-10 text-center">
      <span aria-hidden="true" className="inline-flex size-14 items-center justify-center rounded-full bg-subtle text-fg">
        <Inbox size={22} />
      </span>
      <h2 id="inbox-done-title" className="type-h2 text-fg">
        {t("zero.title")}
      </h2>
      <p className="max-w-sm text-sm text-fg-secondary">{t("zero.body")}</p>
      {showBrainDump ? (
        <Button asChild variant="secondary">
          <Link href="/personal/brain-dump">{t("zero.openBrainDump")}</Link>
        </Button>
      ) : null}
    </ProductCard>
  );
}
