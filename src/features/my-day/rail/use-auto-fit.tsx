"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import { toast } from "@/components/ui/toast";
import type { Task } from "@/data/domain";
import { useBlocks, useScheduleTask, useUnscheduleBlock } from "@/data/queries";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { formatClockTime } from "@/lib/dates/clock-time";
import { workWindow } from "../domain/capacity";
import { toDayBlocks } from "../domain/day-blocks";
import { autoFit } from "../domain/placement";
import { visibleWindow } from "../domain/window";
import { useMyDay, usePlannerNow } from "../my-day-context";
import { useMyDayFormat } from "../ui/use-my-day-format";

/*
 * The S shortcut: put a task in the next free gap of the day on screen.
 * The slot comes from the pure domain (autoFit, over the hours the timeline
 * draws), the write goes through useScheduleTask, and Undo takes the block
 * off again. On another day than today the search starts at the top of the
 * window, since there is no "now" to start after.
 */

type AutoFitTask = Pick<Task, "id" | "title" | "durationMinutes">;

export function useAutoFit(): (task: AutoFitTask) => Promise<void> {
  const t = useTranslations("MyDay.unscheduled");
  const format = useMyDayFormat();
  const { day } = useMyDay();
  const now = usePlannerNow();
  const { workHours, planning } = usePlannerSettings();
  const blocks = useBlocks(day);
  const { mutateAsync: schedule } = useScheduleTask();
  const { mutateAsync: unschedule } = useUnscheduleBlock();
  const blocksData = blocks.data;

  return useCallback(
    async (task) => {
      // Nothing to fit against until the day's blocks have loaded.
      if (!blocksData) return;
      const dayBlocks = toDayBlocks(blocksData, day);
      const hours = visibleWindow(dayBlocks, workWindow(workHours));
      const durationMinutes = task.durationMinutes ?? planning.defaultDurationMinutes;
      const slot = autoFit(dayBlocks, { durationMinutes }, day === now.day ? now.minutes : 0, hours, planning.defaultDurationMinutes);

      if (slot === null) {
        toast({ tone: "warning", title: t("noRoom"), description: t("noRoomDescription") });
        return;
      }
      try {
        const block = await schedule({ taskId: task.id, day, start: formatClockTime(slot), durationMinutes });
        toast({
          tone: "success",
          title: t("scheduled", { time: format.clock(slot) }),
          description: <bdi dir="auto">{task.title}</bdi>,
          action: {
            label: t("undo"),
            altText: t("undoAlt", { title: task.title }),
            onClick: () => void unschedule({ blockId: block.id }).catch(() => undefined),
          },
        });
      } catch {
        toast({ tone: "danger", title: t("scheduleFailed") });
      }
    },
    [blocksData, day, now.day, now.minutes, workHours, planning.defaultDurationMinutes, schedule, unschedule, format, t],
  );
}

/** Typing somewhere: letters belong to the field, not to a shortcut. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Binds the bare S key to auto-fit `task` (the selected or focused row; null
 * turns the shortcut off). It listens on the document but only acts when the
 * key was pressed inside `container` (a focused row) or with nothing focused
 * (a row that was clicked and then lost focus), so it never fires from
 * another control, a dialog or a text field. `code` is checked as well as
 * `key` so it works on a Persian keyboard layout.
 */
export function useAutoFitShortcut(task: Task | null, container: RefObject<HTMLElement | null>): void {
  const run = useAutoFit();
  // The listener reads the latest function without being re-attached on every render.
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });

  useEffect(() => {
    if (!task) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const isS = event.code === "KeyS" || event.key.toLowerCase() === "s";
      if (!isS || event.repeat || event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (isEditable(event.target)) return;
      const target = event.target as Node | null;
      const nothingFocused = target === document.body || target === document.documentElement;
      if (!nothingFocused && !(target && container.current?.contains(target))) return;
      event.preventDefault();
      void latest.current(task);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [task, container]);
}
