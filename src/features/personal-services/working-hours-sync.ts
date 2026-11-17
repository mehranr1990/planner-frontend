"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/components/ui/toast";
import type { WorkingHours } from "@/data/personal-services";
import { useSaveWorkingHours, useWorkingHours } from "@/data/personal-services-queries";
import type { PlannerSettings } from "@/features/planner-settings/planner-settings";
import { usePlannerSettings, usePlannerSettingsActions } from "@/features/planner-settings/use-planner-settings";
import { formatClockTime, parseClockTime } from "@/lib/dates/clock-time";
import { useServiceError } from "./service-error";

/*
 * Settings › Work hours ⇄ the server's working hours. The approved UI edits
 * one daily range plus the week's day kinds; the server stores seven
 * interval arrays (Sunday = 0) and date exceptions. Full work days get the
 * range, half days its first half, other days none. Exceptions (no UI here)
 * are always preserved: the write is read-modify-write on the latest hours.
 */

export function weekToIntervals(settings: Pick<PlannerSettings, "workHours" | "week">): WorkingHours["intervalsByWeekday"] {
  const { start, end } = settings.workHours;
  const from = parseClockTime(start) ?? 540;
  const to = parseClockTime(end) ?? 1020;
  const half = formatClockTime(from + Math.round((to - from) / 2));
  return Array.from({ length: 7 }, (_, day) =>
    settings.week.workDays.includes(day as never) ? [{ start, end }] : settings.week.halfDays.includes(day as never) ? [{ start, end: half }] : [],
  );
}

/** The saved range of the first full work day, when it is a single interval. */
export function rangeFromServer(hours: WorkingHours, week: PlannerSettings["week"]): { start: string; end: string } | null {
  const day = week.workDays[0];
  const intervals = day === undefined ? undefined : hours.intervalsByWeekday[day];
  return intervals?.length === 1 ? intervals[0]! : null;
}

/** Writes the current settings' hours to the server (exceptions kept). */
export function useWorkingHoursSync() {
  const save = useSaveWorkingHours();
  const message = useServiceError();
  return (settings: Pick<PlannerSettings, "workHours" | "week">) =>
    save.mutate((current) => ({ intervalsByWeekday: weekToIntervals(settings), exceptions: current?.exceptions ?? [] }), {
      onError: (error) => toast({ tone: "danger", title: message(error) }),
    });
}

/** Once per mount: a range saved on the server (another device) wins over this browser's copy. */
export function useReconcileWorkHours() {
  const server = useWorkingHours();
  const { workHours, week } = usePlannerSettings();
  const { update } = usePlannerSettingsActions();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !server.data) return;
    done.current = true;
    const range = server.data.workingHours ? rangeFromServer(server.data.workingHours, week) : null;
    if (range && (range.start !== workHours.start || range.end !== workHours.end)) update({ workHours: range as PlannerSettings["workHours"] });
  }, [server.data, week, workHours, update]);
}
