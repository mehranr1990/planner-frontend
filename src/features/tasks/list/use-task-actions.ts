"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";
import { toast } from "@/components/ui/toast";
import type { Task } from "@/data/domain";
import {
  useBulkUpdateTasks,
  useRemoveTasks,
  useRestoreTasks,
  useSetTaskDone,
  useUpdateTask,
} from "@/data/queries";
import type { TaskPatch } from "@/data/repositories";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { addDaysToDay, dayToLocalDate, localDateToDay } from "@/lib/dates/clock-time";
import { nextWorkingDay } from "@/lib/dates/week";
import { useTasksState } from "../tasks-context";
import { useCompletionLifecycle, type CompletionLifecycle } from "../use-completion";
import { useTasksFormat } from "../ui/use-tasks-format";

/*
 * Every mutation the list makes, each with its toast and Undo: complete /
 * reopen (5s), delete (10s, restores the snapshot), bulk patches (Undo puts
 * each task's previous values back). The completion lifecycle (1.2s hold,
 * then collapse into "· N done") lives here too so rows, bulk bar and
 * keyboard share one.
 */

export const COMPLETE_TOAST_MS = 5000;
export const DELETE_TOAST_MS = 10000;

export type ScheduleOptionId = "today" | "tomorrow" | "nextWorkingDay" | "nextWeek" | "noDate";

export interface ScheduleOption {
  id: ScheduleOptionId;
  /** The new day; null clears the date. */
  date: string | null;
}

/** Today · Tomorrow · Next working day (Thu → Sat) · Next week · No date. */
export function useScheduleOptions(): ScheduleOption[] {
  const { today } = useTasksState();
  return useScheduleOptionsFor(today);
}

/** The same options for a given today, for screens outside the Tasks provider (the task drawer). */
export function useScheduleOptionsFor(today: string): ScheduleOption[] {
  const { week } = usePlannerSettings();
  return useMemo(() => {
    const next = nextWorkingDay(dayToLocalDate(today), { config: week });
    return [
      { id: "today", date: today },
      { id: "tomorrow", date: addDaysToDay(today, 1) },
      { id: "nextWorkingDay", date: next ? localDateToDay(next) : addDaysToDay(today, 1) },
      { id: "nextWeek", date: addDaysToDay(today, 7) },
      { id: "noDate", date: null },
    ];
  }, [today, week]);
}

/** The fields of `task` a patch would change, as a patch that puts them back. */
export function revertPatch(task: Task, patch: TaskPatch): TaskPatch {
  const back: TaskPatch = {};
  for (const key of Object.keys(patch) as (keyof TaskPatch)[]) {
    switch (key) {
      case "area":
        back.area = task.area ?? null;
        break;
      case "project":
        back.project = task.project ?? null;
        break;
      case "deadline":
        back.deadline = task.deadline ?? null;
        break;
      case "labels":
        back.labels = task.labels ?? [];
        break;
      case "recurring":
        back.recurring = task.recurring ?? false;
        break;
      default:
        (back as Record<string, unknown>)[key] = task[key];
    }
  }
  // Clearing the date also clears the time: put both back.
  if ("date" in patch) back.time = task.time;
  return back;
}

export interface TaskActions {
  lifecycle: CompletionLifecycle;
  setDone(task: Task, done: boolean): void;
  completeMany(tasks: readonly Task[]): void;
  update(task: Task, patch: TaskPatch, options?: { silent?: boolean }): void;
  updateMany(tasks: readonly Task[], patch: TaskPatch): void;
  remove(tasks: readonly Task[]): void;
}

export function useTaskActions(): TaskActions {
  const t = useTranslations("Tasks.undo");
  const format = useTasksFormat();
  const lifecycle = useCompletionLifecycle();
  const setDoneMutation = useSetTaskDone();
  const updateMutation = useUpdateTask();
  const bulkMutation = useBulkUpdateTasks();
  const removeMutation = useRemoveTasks();
  const restoreMutation = useRestoreTasks();
  const { mutateAsync: setDoneAsync } = setDoneMutation;
  const { mutateAsync: updateAsync } = updateMutation;
  const { mutateAsync: bulkAsync } = bulkMutation;
  const { mutateAsync: removeAsync } = removeMutation;
  const { mutateAsync: restoreAsync } = restoreMutation;
  const { reopen, complete } = lifecycle;

  const failed = useCallback(() => toast({ tone: "danger", title: t("failed") }), [t]);
  const undoAction = useCallback(
    (onClick: () => void) => ({ label: t("action"), altText: t("action"), onClick }),
    [t],
  );
  const count = useCallback((n: number) => ({ count: n, n: format.number(n) }), [format]);

  const setDone = useCallback(
    (task: Task, done: boolean) => {
      if (done) complete(task.id);
      else reopen(task.id);
      setDoneAsync({ id: task.id, done }).then(
        () =>
          toast({
            tone: "neutral",
            title: t(done ? "completed" : "reopened", { title: task.title }),
            duration: COMPLETE_TOAST_MS,
            action: undoAction(() => {
              if (done) reopen(task.id);
              void setDoneAsync({ id: task.id, done: !done }).catch(failed);
            }),
          }),
        () => {
          reopen(task.id);
          failed();
        },
      );
    },
    [complete, reopen, setDoneAsync, t, undoAction, failed],
  );

  const completeMany = useCallback(
    (tasks: readonly Task[]) => {
      const open = tasks.filter((task) => task.status === "open");
      if (open.length === 0) return;
      if (open.length === 1) return setDone(open[0]!, true);
      open.forEach((task) => complete(task.id));
      Promise.all(open.map((task) => setDoneAsync({ id: task.id, done: true }))).then(
        () =>
          toast({
            tone: "neutral",
            title: t("completedMany", count(open.length)),
            duration: COMPLETE_TOAST_MS,
            action: undoAction(() => {
              open.forEach((task) => reopen(task.id));
              void Promise.all(open.map((task) => setDoneAsync({ id: task.id, done: false }))).catch(failed);
            }),
          }),
        failed,
      );
    },
    [setDone, complete, reopen, setDoneAsync, t, count, undoAction, failed],
  );

  const update = useCallback(
    (task: Task, patch: TaskPatch, { silent = false }: { silent?: boolean } = {}) => {
      const back = revertPatch(task, patch);
      updateAsync({ id: task.id, patch }).then(() => {
        if (silent) return;
        toast({
          tone: "neutral",
          title: t("updated", count(1)),
          duration: COMPLETE_TOAST_MS,
          action: undoAction(() => void updateAsync({ id: task.id, patch: back }).catch(failed)),
        });
      }, failed);
    },
    [updateAsync, t, count, undoAction, failed],
  );

  const updateMany = useCallback(
    (tasks: readonly Task[], patch: TaskPatch) => {
      if (tasks.length === 0) return;
      const backs = tasks.map((task) => ({ id: task.id, patch: revertPatch(task, patch) }));
      bulkAsync({ ids: tasks.map((task) => task.id), patch }).then(
        () =>
          toast({
            tone: "neutral",
            title: t("updated", count(tasks.length)),
            duration: COMPLETE_TOAST_MS,
            action: undoAction(() => void Promise.all(backs.map((item) => updateAsync(item))).catch(failed)),
          }),
        failed,
      );
    },
    [bulkAsync, updateAsync, t, count, undoAction, failed],
  );

  const remove = useCallback(
    (tasks: readonly Task[]) => {
      if (tasks.length === 0) return;
      removeAsync({ ids: tasks.map((task) => task.id) }).then(
        ({ restore }) =>
          toast({
            tone: "neutral",
            title: t("deleted", count(tasks.length)),
            duration: DELETE_TOAST_MS,
            action: undoAction(() => void restoreAsync(restore).catch(failed)),
          }),
        failed,
      );
    },
    [removeAsync, restoreAsync, t, count, undoAction, failed],
  );

  return { lifecycle, setDone, completeMany, update, updateMany, remove };
}
