"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "@/components/ui/toast";
import { useMoveBlock, useScheduleTask, useUnscheduleBlock } from "@/data/queries";
import { usePreferences } from "@/features/preferences/use-preferences";
import { addDaysToDay, formatClockTime } from "@/lib/dates/clock-time";
import type { DayBlock } from "@/features/my-day/domain/day-blocks";
import { usePlannerNow } from "@/features/my-day/my-day-context";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { firstOverlap, planPlacements, type ResolvedTarget } from "./plan-reschedule";

/*
 * Applying a Reschedule choice: the repository calls, one toast with a single
 * Undo that puts everything back where it was, and the overlap warning when a
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

/** What puts one change back. */
type Inverse =
  | { type: "move"; blockId: string; day: string; start: string; durationMinutes: number }
  | { type: "unschedule"; blockId: string }
  | { type: "schedule"; taskId: string; day: string; start: string; durationMinutes: number };

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
    async (inverses: readonly Inverse[]) => {
      try {
        for (const inverse of [...inverses].reverse()) {
          if (inverse.type === "move") {
            await move.mutateAsync({
              blockId: inverse.blockId,
              day: inverse.day,
              start: inverse.start,
              durationMinutes: inverse.durationMinutes,
            });
          } else if (inverse.type === "unschedule") {
            await unschedule.mutateAsync({ blockId: inverse.blockId });
          } else {
            await schedule.mutateAsync({
              taskId: inverse.taskId,
              day: inverse.day,
              start: inverse.start,
              durationMinutes: inverse.durationMinutes,
            });
          }
        }
        toast({ tone: "info", title: t("toast.undone") });
      } catch {
        toast({ tone: "danger", title: t("toast.undoFailed") });
      }
    },
    [move, schedule, unschedule, t],
  );

  /** Applies the choice; resolves true when everything moved. */
  const apply = useCallback(
    async ({ resolved, blocksByDay }: RescheduleSessionData, choice: RescheduleChoice): Promise<boolean> => {
      const inverses: Inverse[] = [];
      const undoAction = () => ({
        label: t("toast.undo"),
        altText: t("toast.undoAlt"),
        onClick: () => void undo(inverses),
      });

      try {
        if (choice.type === "unschedule") {
          for (const item of resolved.items) {
            if (!item.blockId || !item.taskId || item.startMinutes === null) continue;
            await unschedule.mutateAsync({ blockId: item.blockId });
            inverses.push({
              type: "schedule",
              taskId: item.taskId,
              day: item.day,
              start: formatClockTime(item.startMinutes),
              durationMinutes: item.durationMinutes,
            });
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
          if (item.type === "block" && item.blockId) {
            await move.mutateAsync({
              blockId: item.blockId,
              day: planned.day,
              start: planned.start,
              durationMinutes: planned.durationMinutes,
            });
            inverses.push({
              type: "move",
              blockId: item.blockId,
              day: item.day,
              start: formatClockTime(item.startMinutes ?? 0),
              durationMinutes: item.durationMinutes,
            });
          } else if (item.taskId) {
            const block = await schedule.mutateAsync({
              taskId: item.taskId,
              day: planned.day,
              start: planned.start,
              durationMinutes: planned.durationMinutes,
            });
            inverses.push({ type: "unschedule", blockId: block.id });
          }
        }

        const first = moves[0];
        const when = whenLabel(choice.day, first ? first.start : formatClockTime(choice.startMinutes));
        toast({
          tone: overlap ? "warning" : "success",
          title:
            resolved.items.length === 1
              ? t("toast.moved", { title: isolate(resolved.title), when })
              : t("toast.movedMany", { countText: format.number(resolved.items.length), when }),
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
          action: inverses.length > 0 ? undoAction() : undefined,
        });
        return false;
      }
    },
    [format, move, schedule, unschedule, t, undo, whenLabel],
  );

  return { apply };
}
