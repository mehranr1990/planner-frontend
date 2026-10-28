"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";
import { toast } from "@/components/ui/toast";
import type { InboxItem, JournalEntry } from "@/data/domain";
import {
  useAddBrainDumpLine,
  useAppendJournal,
  useArchiveInbox,
  useCreateTask,
  useDropInbox,
  useProcessInbox,
  useRemoveBrainDumpLines,
  useRemoveTasks,
  useRestoreInbox,
  useRevertJournal,
  useSnoozeInbox,
} from "@/data/queries";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { dayLabel } from "@/features/tasks/create/parsed-chips";
import { useTasksFormat } from "@/features/tasks/ui/use-tasks-format";
import { dayOfInstant, minutesOfInstant } from "@/lib/dates/clock-time";
import { pageDayOf } from "@/features/brain-dump/domain/brain-dump";
import { usePlannerNow } from "@/features/my-day/my-day-context";
import { suggestFor, type InboxTarget, type ProcessOutcome } from "./domain/inbox";

/*
 * Every Inbox decision, each with an Undo toast. Task: created through the
 * Tasks seam (quick-parse date, time, duration, priority; "from Inbox" in
 * Activity), then the item is marked processed. Journal: the text is
 * appended to today's entry (P14), Undo restores the entry as it was. Event /
 * Note / Reminder have no data model yet: the item is marked processed with
 * its destination (kept for that module) and the toast says so. Brain Dump:
 * the text is appended to today's page (P08), Undo takes the line off again.
 */

export interface InboxActions {
  send(items: readonly InboxItem[], target: InboxTarget): Promise<void>;
  snooze(items: readonly InboxItem[], until: string): Promise<void>;
  archive(items: readonly InboxItem[]): Promise<void>;
  drop(item: InboxItem): Promise<void>;
  restore(items: readonly InboxItem[]): Promise<void>;
}

export function useInboxActions({
  today,
  onOutcome,
  onUndo,
}: {
  today: string;
  /** Records a decision (the processing summary). */
  onOutcome?: (ids: readonly string[], outcome: ProcessOutcome) => void;
  /** Forgets one after Undo. */
  onUndo?: (ids: readonly string[]) => void;
}): InboxActions {
  const t = useTranslations("Inbox");
  const format = useTasksFormat();
  const { planning } = usePlannerSettings();
  const createTask = useCreateTask();
  const removeTasks = useRemoveTasks();
  const processItem = useProcessInbox();
  const snoozeItems = useSnoozeInbox();
  const archiveItems = useArchiveInbox();
  const dropItem = useDropInbox();
  const restoreItems = useRestoreInbox();
  const addLine = useAddBrainDumpLine();
  const removeLines = useRemoveBrainDumpLines();
  const appendJournal = useAppendJournal();
  const revertJournal = useRevertJournal();
  const { instant } = usePlannerNow();

  const failed = useCallback(() => toast({ tone: "danger", title: t("toast.failed") }), [t]);
  const count = useCallback((n: number) => ({ count: n, countText: format.number(n) }), [format]);

  const undoable = useCallback(
    (ids: readonly string[], before?: () => Promise<unknown>) => ({
      label: t("toast.undo"),
      altText: t("toast.undoAlt"),
      onClick: () => {
        onUndo?.(ids);
        void (before ? before() : Promise.resolve())
          .then(() => restoreItems.mutateAsync({ ids }))
          .catch(failed);
      },
    }),
    [t, onUndo, restoreItems, failed],
  );

  const whenText = useCallback(
    (until: string) => {
      const day = dayOfInstant(until);
      return `${dayLabel(format, day, today)} · ${format.clock(minutesOfInstant(until))}`;
    },
    [format, today],
  );

  return useMemo<InboxActions>(
    () => ({
      async send(items, target) {
        if (items.length === 0) return;
        const ids = items.map((item) => item.id);
        try {
          if (target === "task") {
            const created: string[] = [];
            let last: { date: string; durationMinutes: number | null } | null = null;
            for (const item of items) {
              const { parsed } = suggestFor(item, today);
              const date = parsed.date ?? today;
              const durationMinutes = parsed.durationMinutes ?? planning.defaultDurationMinutes;
              const task = await createTask.mutateAsync({
                title: parsed.title || item.text,
                date,
                time: parsed.time ?? null,
                durationMinutes,
                priority: parsed.priority ?? null,
                source: item.source === "voice" ? "inbox-voice" : "inbox",
              });
              created.push(task.id);
              last = { date, durationMinutes };
              await processItem.mutateAsync({ id: item.id, to: "task", taskId: task.id });
            }
            onOutcome?.(ids, "task");
            const day = last ? dayLabel(format, last.date, today) : "";
            toast({
              tone: "neutral",
              title: items.length === 1 ? t("toast.converted") : t("toast.convertedMany", count(items.length)),
              description:
                items.length === 1 && last?.durationMinutes
                  ? t("toast.addedToDuration", { day, duration: format.durationShort(last.durationMinutes) })
                  : t("toast.addedTo", { day }),
              action: undoable(ids, () => removeTasks.mutateAsync({ ids: created })),
            });
            return;
          }
          if (target === "brain-dump") {
            const day = pageDayOf(instant);
            const lineIds: string[] = [];
            for (const item of items) {
              const line = await addLine.mutateAsync({ day, text: item.text });
              lineIds.push(line.id);
              await processItem.mutateAsync({ id: item.id, to: "brain-dump" });
            }
            onOutcome?.(ids, target);
            toast({
              tone: "neutral",
              title: t("toast.sentTo", { target: t(`target.${target}`) }),
              description: t("toast.addedToPage"),
              action: undoable(ids, () => removeLines.mutateAsync({ day, ids: lineIds })),
            });
            return;
          }
          if (target === "journal") {
            let before: JournalEntry | null | undefined;
            for (const item of items) {
              const { previous } = await appendJournal.mutateAsync({ day: today, text: item.text });
              if (before === undefined) before = previous;
              await processItem.mutateAsync({ id: item.id, to: "journal" });
            }
            onOutcome?.(ids, target);
            toast({
              tone: "neutral",
              title: t("toast.sentTo", { target: t("target.journal") }),
              description: t("toast.addedToJournal"),
              action: undoable(ids, () => revertJournal.mutateAsync({ day: today, previous: before ?? null })),
            });
            return;
          }
          for (const item of items) await processItem.mutateAsync({ id: item.id, to: target });
          onOutcome?.(ids, target);
          const name = t(`target.${target}`);
          toast({ tone: "neutral", title: t("toast.sentTo", { target: name }), description: t("toast.laterStep", { target: name }), action: undoable(ids) });
        } catch {
          failed();
        }
      },
      async snooze(items, until) {
        if (items.length === 0) return;
        const ids = items.map((item) => item.id);
        try {
          await snoozeItems.mutateAsync({ ids, until });
          onOutcome?.(ids, "snooze");
          toast({ tone: "neutral", title: t("toast.snoozed", { ...count(items.length), when: whenText(until) }), action: undoable(ids) });
        } catch {
          failed();
        }
      },
      async archive(items) {
        if (items.length === 0) return;
        const ids = items.map((item) => item.id);
        try {
          await archiveItems.mutateAsync({ ids });
          onOutcome?.(ids, "archive");
          toast({ tone: "neutral", title: t("toast.archived", count(items.length)), action: undoable(ids) });
        } catch {
          failed();
        }
      },
      async drop(item) {
        try {
          await dropItem.mutateAsync({ id: item.id });
          onOutcome?.([item.id], "drop");
          toast({ tone: "neutral", title: t("toast.dropped"), description: item.text, action: undoable([item.id]) });
        } catch {
          failed();
        }
      },
      async restore(items) {
        if (items.length === 0) return;
        try {
          await restoreItems.mutateAsync({ ids: items.map((item) => item.id) });
          toast({ tone: "neutral", title: t("toast.restored") });
        } catch {
          failed();
        }
      },
    }),
    [today, instant, planning.defaultDurationMinutes, createTask, processItem, addLine, removeLines, appendJournal, revertJournal, snoozeItems, archiveItems, dropItem, restoreItems, removeTasks, onOutcome, t, format, count, undoable, whenText, failed],
  );
}
