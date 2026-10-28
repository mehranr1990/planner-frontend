"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";
import { toast } from "@/components/ui/toast";
import type { BrainDumpLine, BrainDumpPage, JournalEntry } from "@/data/domain";
import {
  useAppendJournal,
  useClearBrainDump,
  useCreateTask,
  useRemoveTasks,
  useRestoreBrainDump,
  useRevertJournal,
  useSendBrainDumpToInbox,
  useSortBrainDump,
  useStrikeBrainDump,
  useUnsortBrainDump,
} from "@/data/queries";
import type { BrainDumpClearMode, NewTaskInput } from "@/data/repositories";
import { dayLabel } from "@/features/tasks/create/parsed-chips";
import { useTasksFormat } from "@/features/tasks/ui/use-tasks-format";
import type { BrainDumpDraft } from "./use-brain-dump-draft";

/*
 * Every sorting decision on a page, each with an Undo toast (P08 Convert).
 * Task: created through the Tasks seam, then the line is tagged. Journal:
 * the text is appended to that day's entry (P14); Undo restores the entry
 * and untags. Note and Event have no data model yet: the line is tagged with
 * its destination and the toast says so. Inbox: each line becomes an Inbox item.
 */

export type SortTarget = "note" | "journal" | "event";

export interface BrainDumpActions {
  convert(line: BrainDumpLine, task: Omit<NewTaskInput, "source">): Promise<void>;
  /** `day`: what the tag points at (a journal entry's or an event's day). */
  sort(lines: readonly BrainDumpLine[], to: SortTarget, day?: string | null): Promise<void>;
  sendToInbox(lines: readonly BrainDumpLine[]): Promise<void>;
  strike(lines: readonly BrainDumpLine[], struck: boolean): Promise<void>;
  clear(mode: BrainDumpClearMode): Promise<void>;
}

export function useBrainDumpActions({ day, today, draft }: { day: string; today: string; draft: BrainDumpDraft }): BrainDumpActions {
  const t = useTranslations("BrainDump");
  const format = useTasksFormat();
  const createTask = useCreateTask();
  const removeTasks = useRemoveTasks();
  const sortLines = useSortBrainDump();
  const strikeLines = useStrikeBrainDump();
  const unsortLines = useUnsortBrainDump();
  const sendLines = useSendBrainDumpToInbox();
  const clearPage = useClearBrainDump();
  const restorePage = useRestoreBrainDump();
  const appendJournal = useAppendJournal();
  const revertJournal = useRevertJournal();
  const { flush, applyTags, replace } = draft;

  const failed = useCallback(() => toast({ tone: "danger", title: t("toast.failed") }), [t]);
  const count = useCallback((n: number) => ({ count: n, countText: format.number(n) }), [format]);

  const undo = useCallback(
    (run: () => Promise<BrainDumpPage>, after: (page: BrainDumpPage) => void = applyTags) => ({
      label: t("toast.undo"),
      altText: t("toast.undoAlt"),
      onClick: () => void run().then(after).catch(failed),
    }),
    [t, applyTags, failed],
  );

  const unsort = useCallback(
    (ids: readonly string[], before?: () => Promise<unknown>) =>
      undo(async () => {
        await before?.();
        return unsortLines.mutateAsync({ day, ids });
      }),
    [undo, unsortLines, day],
  );

  return useMemo<BrainDumpActions>(
    () => ({
      async convert(line, input) {
        try {
          await flush();
          const task = await createTask.mutateAsync({ ...input, source: "manual" });
          applyTags(await sortLines.mutateAsync({ day, ids: [line.id], outcome: { to: "task", day: task.date, taskId: task.id } }));
          toast({
            tone: "neutral",
            title: t("toast.converted"),
            description: task.date ? t("toast.addedTo", { day: dayLabel(format, task.date, today) }) : undefined,
            action: unsort([line.id], () => removeTasks.mutateAsync({ ids: [task.id] })),
          });
        } catch {
          failed();
        }
      },
      async sort(lines, to, target) {
        if (lines.length === 0) return;
        const ids = lines.map((line) => line.id);
        try {
          await flush();
          if (to === "journal") {
            const entryDay = target ?? day;
            let before: JournalEntry | null | undefined;
            for (const line of lines) {
              if (!line.text.trim()) continue;
              const { previous } = await appendJournal.mutateAsync({ day: entryDay, text: line.text });
              if (before === undefined) before = previous;
            }
            applyTags(await sortLines.mutateAsync({ day, ids, outcome: { to, day: entryDay } }));
            toast({
              tone: "neutral",
              title: t("toast.sentTo", { target: t("tag.journal") }),
              description: t("toast.addedToJournal"),
              action: unsort(ids, () => (before === undefined ? Promise.resolve() : revertJournal.mutateAsync({ day: entryDay, previous: before }))),
            });
            return;
          }
          applyTags(await sortLines.mutateAsync({ day, ids, outcome: { to, day: target } }));
          const name = t(`tag.${to}`);
          toast({ tone: "neutral", title: t("toast.sentTo", { target: name }), description: t("toast.laterStep", { target: name }), action: unsort(ids) });
        } catch {
          failed();
        }
      },
      async sendToInbox(lines) {
        if (lines.length === 0) return;
        const ids = lines.map((line) => line.id);
        try {
          await flush();
          applyTags(await sendLines.mutateAsync({ day, ids }));
          toast({ tone: "neutral", title: t("toast.sentInbox", count(ids.length)), action: unsort(ids) });
        } catch {
          failed();
        }
      },
      async strike(lines, struck) {
        if (lines.length === 0) return;
        const ids = lines.map((line) => line.id);
        try {
          await flush();
          applyTags(await strikeLines.mutateAsync({ day, ids, struck }));
          if (struck) {
            toast({
              tone: "neutral",
              title: t("toast.struck", count(ids.length)),
              action: undo(() => strikeLines.mutateAsync({ day, ids, struck: false })),
            });
          }
        } catch {
          failed();
        }
      },
      async clear(mode) {
        try {
          await flush();
          const { page, restore } = await clearPage.mutateAsync({ day, unsorted: mode });
          replace(page);
          toast({ tone: "neutral", title: t("toast.cleared"), action: undo(() => restorePage.mutateAsync({ snapshot: restore }), replace) });
        } catch {
          failed();
        }
      },
    }),
    [day, today, flush, applyTags, replace, createTask, removeTasks, sortLines, appendJournal, revertJournal, strikeLines, sendLines, clearPage, restorePage, t, format, count, undo, unsort, failed],
  );
}
