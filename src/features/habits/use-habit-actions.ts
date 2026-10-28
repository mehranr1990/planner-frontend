"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";
import { toast } from "@/components/ui/toast";
import type { Habit } from "@/data/domain";
import type { HabitDayMark } from "@/data/repositories";
import { useLogHabitAmount, useSetHabitArchived, useSetHabitDayMark, useSetHabitDone } from "@/data/queries";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { habitStreak, isDoneOn, isRestDay, isScheduledRest, isSkipped } from "./domain/habits";

/** What a day was before a change, so Undo can put it back. */
function previousMark(habit: Habit, day: string): { done: boolean; mark: HabitDayMark } {
  if (isDoneOn(habit, day)) return { done: true, mark: null };
  if (isSkipped(habit, day)) return { done: false, mark: "skip" };
  if (isRestDay(habit, day) && !isScheduledRest(habit, day)) return { done: false, mark: "rest" };
  return { done: false, mark: null };
}

/**
 * Habit writes with their toasts (P12 · Completion): checking today says
 * "Read · 8-day streak" with Undo; skip / rest / archive offer Undo too.
 */
export function useHabitActions(today: string) {
  const t = useTranslations("Habits.toast");
  const format = useMyDayFormat();
  const setDone = useSetHabitDone();
  const setMark = useSetHabitDayMark();
  const logAmount = useLogHabitAmount();
  const setArchived = useSetHabitArchived();

  const failed = useCallback(() => toast({ tone: "danger", title: t("failed") }), [t]);

  const restore = useCallback(
    (habit: Habit, day: string, before: { done: boolean; mark: HabitDayMark }) => {
      if (before.done) setDone.mutate({ id: habit.id, day, done: true }, { onError: failed });
      else setMark.mutate({ id: habit.id, day, mark: before.mark }, { onError: failed });
    },
    [setDone, setMark, failed],
  );

  const toggle = useCallback(
    (habit: Habit, day: string, done: boolean) => {
      const before = previousMark(habit, day);
      setDone.mutate(
        { id: habit.id, day, done },
        {
          onError: failed,
          onSuccess: (updated) => {
            const streak = habitStreak(updated, today);
            toast({
              id: `habit-${habit.id}`,
              tone: done ? "success" : "neutral",
              title: done && streak > 1 ? t("streak", { habit: habit.title, streak, streakText: format.number(streak) }) : done ? t("done", { habit: habit.title }) : t("undone", { habit: habit.title }),
              action: { label: t("undo"), altText: t("undoAlt"), onClick: () => restore(habit, day, before) },
            });
          },
        },
      );
    },
    [setDone, failed, today, t, format, restore],
  );

  const mark = useCallback(
    (habit: Habit, day: string, value: HabitDayMark) => {
      const before = previousMark(habit, day);
      setMark.mutate(
        { id: habit.id, day, mark: value },
        {
          onError: failed,
          onSuccess: () => {
            if (!value) return;
            toast({
              id: `habit-${habit.id}`,
              tone: "neutral",
              title: value === "skip" ? t("skipped", { habit: habit.title }) : t("rested", { habit: habit.title }),
              action: { label: t("undo"), altText: t("undoAlt"), onClick: () => restore(habit, day, before) },
            });
          },
        },
      );
    },
    [setMark, failed, t, restore],
  );

  const log = useCallback(
    (habit: Habit, day: string, amount: number) => logAmount.mutate({ id: habit.id, day, amount }, { onError: failed }),
    [logAmount, failed],
  );

  const archive = useCallback(
    (habit: Habit, onDone?: () => void) =>
      setArchived.mutate(
        { id: habit.id, archived: true },
        {
          onError: failed,
          onSuccess: () => {
            onDone?.();
            toast({
              tone: "neutral",
              title: t("archived", { habit: habit.title }),
              action: { label: t("undo"), altText: t("archiveUndoAlt"), onClick: () => setArchived.mutate({ id: habit.id, archived: false }, { onError: failed }) },
            });
          },
        },
      ),
    [setArchived, failed, t],
  );

  return useMemo(() => ({ toggle, mark, log, archive }), [toggle, mark, log, archive]);
}
