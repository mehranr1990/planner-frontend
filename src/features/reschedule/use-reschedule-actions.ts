"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "@/components/ui/toast";
import { useRepositories } from "@/data/provider";
import { useMoveBlock, useRestoreSchedule, useScheduleTask, useUnscheduleBlock } from "@/data/queries";
import type { ScheduleSnapshot } from "@/data/repositories";
import { usePreferences } from "@/features/preferences/use-preferences";
import { addDaysToDay, formatClockTime } from "@/lib/dates/clock-time";
import type { DayBlock } from "@/features/my-day/domain/day-blocks";
import { usePlannerNow } from "@/features/my-day/my-day-context";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { firstOverlap, planPlacements, type ResolvedTarget } from "./plan-reschedule";

/*
 * Applying a Reschedule choice: the repository calls, one toast with a single
 * Undo that puts everything back where it was (a repository snapshot taken
 * just before the change — never the days on screen, which may not hold a
 * task's block), and the overlap warning when a
 * picked time double-books the day. The hook lives in the always-mounted host
 * so an Undo still works after the popover has closed.
 */

export type RescheduleChoice =
  | { type: "slot"; day: string; startMinutes: number }
  | { type: "unschedule" };

export interface RescheduleSessionData {
  resolved: ResolvedTarget;
  blocksByDay: Readonly<Record<string, readonly DayBlock[]>>;
}

/** Wraps user text so it keeps its own direction inside a translated sentence. */
const isolate = (text: string) => `⁨${text}⁩`;

export function useRescheduleActions() {
  const t = useTranslations("MyDay.reschedule");
  const format = useMyDayFormat();
  const { locale } = usePreferences();
  const now = usePlannerNow();
  const move = useMoveBlock();
  const schedule = useScheduleTask();
  const unschedule = useUnscheduleBlock();
  const restore = useRestoreSchedule();
  const { blocks } = useRepositories();

  const whenLabel = useCallback(
    (day: string, start: string) => {
      const time = format.clock(start);
      if (day === now.day) return t("when.today", { time });
      if (day === addDaysToDay(now.day, 1)) return t("when.tomorrow", { time });
      const weekday = format.weekday(day);
      const date = `${locale === "en" ? weekday.slice(0, 3) : weekday} ${format.dayMonth(day)}`;
      return t("when.on", { date, time });
    },
    [format, locale, now.day, t],
  );

  const undo = useCallback(
    async (snapshot: ScheduleSnapshot) => {
      try {
        await restore.mutateAsync(snapshot);
        toast({ tone: "info", title: t("toast.undone") });
      } catch {
        toast({ tone: "danger", title: t("toast.undoFailed") });
      }
    },
    [restore, t],
  );

  /** Applies the choice; resolves true when everything moved. */
  const apply = useCallback(
    async ({ resolved, blocksByDay }: RescheduleSessionData, choice: RescheduleChoice): Promise<boolean> => {
      let snapshot: ScheduleSnapshot | null = null;
      let changed = false;
      const undoAction = () => {
        const saved = snapshot;
        return saved
          ? { label: t("toast.undo"), altText: t("toast.undoAlt"), onClick: () => void undo(saved) }
          : undefined;
      };

      try {
        // Everything Undo puts back, read from the repository before anything changes.
        snapshot = await blocks.snapshot({
          taskIds: resolved.items.flatMap((item) => (item.taskId ? [item.taskId] : [])),
          blockIds: resolved.items.flatMap((item) => (item.blockId ? [item.blockId] : [])),
        });
        if (choice.type === "unschedule") {
          for (const item of resolved.items) {
            if (!item.blockId || !item.taskId || item.startMinutes === null) continue;
            changed = true;
            await unschedule.mutateAsync({ blockId: item.blockId });
          }
          toast({
            tone: "success",
            title: t("toast.unscheduled", { title: isolate(resolved.title) }),
            action: undoAction(),
          });
          return true;
        }

        const moves = planPlacements(resolved.items, choice.day, choice.startMinutes);
        if (!moves) {
          toast({ tone: "danger", title: t("toast.failed") });
          return false;
        }
        const movingIds = new Set(resolved.items.flatMap((item) => (item.blockId ? [item.blockId] : [])));
        const overlap = firstOverlap(
          moves,
          (blocksByDay[choice.day] ?? []).filter((block) => !movingIds.has(block.id)),
        );

        for (const planned of moves) {
          const { item } = planned;
          changed = true;
          if (item.type === "block" && item.blockId) {
            await move.mutateAsync({
              blockId: item.blockId,
              day: planned.day,
              start: planned.start,
              durationMinutes: planned.durationMinutes,
            });
          } else if (item.taskId) {
            await schedule.mutateAsync({
              taskId: item.taskId,
              day: planned.day,
              start: planned.start,
              durationMinutes: planned.durationMinutes,
            });
          }
        }

        const first = moves[0];
        const when = whenLabel(choice.day, first ? first.start : formatClockTime(choice.startMinutes));
        toast({
          tone: overlap ? "warning" : "success",
          title:
            resolved.items.length === 1
              ? t("toast.moved", { title: isolate(resolved.title), when })
              : t(resolved.noun === "task" ? "toast.movedManyTasks" : "toast.movedMany", {
                  count: resolved.items.length,
                  countText: format.number(resolved.items.length),
                  when,
                }),
          description: overlap
            ? t("toast.overlaps", { title: isolate(overlap.title), duration: format.duration(overlap.minutes) })
            : undefined,
          action: undoAction(),
        });
        return true;
      } catch {
        // Whatever moved before the failure can still be put back.
        toast({
          tone: "danger",
          title: t("toast.failed"),
          action: changed ? undoAction() : undefined,
        });
        return false;
      }
    },
    [blocks, format, move, schedule, unschedule, t, undo, whenLabel],
  );

  return { apply };
}
