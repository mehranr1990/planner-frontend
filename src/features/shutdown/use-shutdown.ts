"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { toast } from "@/components/ui/toast";
import type { EnergyLevel, MoodLevel, Task } from "@/data/domain";
import {
  useBlocks,
  useBulkUpdateTasks,
  useCaptureInbox,
  useRemoveTasks,
  useSaveReflection,
  useScheduleTask,
  useTasks,
} from "@/data/queries";
import { workWindow } from "@/features/my-day/domain/capacity";
import { toDayBlocks } from "@/features/my-day/domain/day-blocks";
import { protectedSpan } from "@/features/my-day/domain/placement";
import { usePlannerNow } from "@/features/my-day/my-day-context";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { useSlotDismissals } from "@/features/overview/domain/slot-dismissals";
import { planningDurationMinutes, planningTags } from "@/features/planner-settings/planner-settings";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { formatClockTime } from "@/lib/dates/clock-time";
import {
  autoArrange,
  initialDraft,
  outcome,
  overloadSuggestion,
  routeDays,
  routeWrites,
  tomorrowLoad,
  type PendingTask,
  type Placements,
  type Route,
  type RouteDestination,
  type RouteDraft,
} from "./domain/shutdown";

/*
 * The shutdown session: today's unfinished tasks and the routing draft,
 * tomorrow's blocks and placements, the reflection, and Finish day, which
 * commits all of it in one go (Tasks, Blocks, Inbox, Journal). Every routing
 * change toasts a 10s Undo that puts the previous draft back.
 */

export const ROUTE_UNDO_MS = 10_000;

export interface Reflection {
  mood: MoodLevel | null;
  energy: EnergyLevel;
  wentWell: string;
  note: string;
}

export interface FinishedSummary {
  done: number;
  tomorrow: number;
  dropped: number;
  mood: MoodLevel | null;
  /** Tomorrow's first block or placement, for "Tomorrow starts 09:00 · …". */
  first: { minutes: number; title: string } | null;
}

export function useShutdown() {
  const t = useTranslations("Shutdown");
  const format = useMyDayFormat();
  const now = usePlannerNow();
  const today = now.day;
  const settings = usePlannerSettings();
  const days = useMemo(() => routeDays(today, settings.week), [today, settings.week]);
  const work = useMemo(() => workWindow(settings.workHours), [settings.workHours]);
  // Suggestions (Auto-arrange, "Tomorrow is full") plan like My Day: buffered lengths, protected window avoided.
  const estimateBuffers = settings.insights.estimateBuffers;
  const guardStart = settings.insights.protectedFocus?.start;
  const guardEnd = settings.insights.protectedFocus?.end;
  const guarded = useMemo(
    () => protectedSpan(guardStart && guardEnd ? { start: guardStart, end: guardEnd } : null),
    [guardStart, guardEnd],
  );

  const todayQuery = useTasks({ view: "today", day: today });
  const allQuery = useTasks({ view: "all" });
  const blocksQuery = useBlocks(days.tomorrow);

  const unfinished = useMemo(() => (todayQuery.data ?? []).filter((task) => task.status === "open"), [todayQuery.data]);
  const doneCount = useMemo(() => (todayQuery.data ?? []).filter((task) => task.status === "done").length, [todayQuery.data]);

  // The draft starts from the rollover rule once the tasks arrive; ids the user never touched follow the rule.
  const [edits, setEdits] = useState<Record<string, Route | null>>({});
  const draft: RouteDraft = useMemo(() => {
    const base: Record<string, Route> = { ...initialDraft(unfinished, settings.planning.rollover) };
    for (const [id, route] of Object.entries(edits)) {
      if (route) base[id] = route;
      else delete base[id];
    }
    return base;
  }, [unfinished, settings.planning.rollover, edits]);

  const setRoutes = useCallback(
    (ids: readonly string[], route: Route) => {
      if (ids.length === 0) return;
      const previous = Object.fromEntries(ids.map((id) => [id, draft[id] ?? null]));
      setEdits((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, route])) }));
      toast({
        tone: "neutral",
        title: t("toast.moved", { count: ids.length, countText: format.number(ids.length), destination: t(`destination.${route.to}`) }),
        duration: ROUTE_UNDO_MS,
        action: {
          label: t("toast.undo"),
          altText: t("toast.undoAlt"),
          onClick: () => setEdits((current) => ({ ...current, ...previous })),
        },
      });
    },
    [draft, format, t],
  );

  // ── Tomorrow ──
  const tasks = allQuery.data;
  const tomorrowBlocks = useMemo(
    () => toDayBlocks(blocksQuery.data ?? [], days.tomorrow, tasks ?? []),
    [blocksQuery.data, days.tomorrow, tasks],
  );
  const pending: PendingTask[] = useMemo(() => {
    const scheduled = new Set(tomorrowBlocks.flatMap((block) => (block.taskId ? [block.taskId] : [])));
    const routed = unfinished.filter((task) => {
      const to = draft[task.id]?.to;
      return to === "tomorrow" || (to === "next-working-day" && days.nextWorkingDay === days.tomorrow);
    });
    const dated = (tasks ?? []).filter(
      (task) => task.status === "open" && task.date === days.tomorrow && !scheduled.has(task.id) && !routed.includes(task),
    );
    const toPending = (task: Task, isRouted: boolean): PendingTask => {
      const durationMinutes = task.durationMinutes ?? settings.planning.defaultDurationMinutes;
      return {
        id: task.id,
        title: task.title,
        durationMinutes,
        planMinutes: planningDurationMinutes(durationMinutes, planningTags(task), estimateBuffers),
        energy: task.energy,
        priority: task.priority,
        routed: isRouted,
      };
    };
    return [...dated.map((task) => toPending(task, false)), ...routed.map((task) => toPending(task, true))];
  }, [tomorrowBlocks, unfinished, draft, days, tasks, settings.planning.defaultDurationMinutes, estimateBuffers]);

  const [rawPlacements, setPlacements] = useState<Placements>({});
  // Placements of tasks no longer routed to tomorrow fall away.
  const placements = useMemo(() => {
    const ids = new Set(pending.map((task) => task.id));
    return Object.fromEntries(Object.entries(rawPlacements).filter(([id]) => ids.has(id))) as Placements;
  }, [rawPlacements, pending]);

  const place = useCallback((id: string, minutes: number | null) => {
    setPlacements((current) => {
      const next = { ...current };
      if (minutes === null) delete next[id];
      else next[id] = minutes;
      return next;
    });
  }, []);
  const arrange = useCallback(
    () => setPlacements(autoArrange(tomorrowBlocks, pending, placements, work, guarded)),
    [tomorrowBlocks, pending, placements, work, guarded],
  );

  const load = useMemo(() => tomorrowLoad(tomorrowBlocks, pending, work.totalMinutes), [tomorrowBlocks, pending, work.totalMinutes]);
  const [keepOverload, setKeepOverload] = useState(false);
  const suggestion = useMemo(() => (keepOverload ? [] : overloadSuggestion(load, pending)), [keepOverload, load, pending]);
  const applySuggestion = useCallback(
    () => setRoutes(suggestion.map((task) => task.id), { to: "this-week" }),
    [setRoutes, suggestion],
  );

  // ── Reflect ──
  const [reflection, setReflection] = useState<Reflection>({ mood: null, energy: "medium", wentWell: "", note: "" });

  // ── Finish ──
  const bulkUpdate = useBulkUpdateTasks();
  const removeTasks = useRemoveTasks();
  const capture = useCaptureInbox();
  const schedule = useScheduleTask();
  const saveReflection = useSaveReflection();
  const [, dismissSlot] = useSlotDismissals(today);
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState<FinishedSummary | null>(null);

  const counts = useMemo(() => outcome(doneCount, unfinished, draft), [doneCount, unfinished, draft]);

  const finish = useCallback(async () => {
    setFinishing(true);
    try {
      // Calendar routes, grouped by their patch so each group is one bulk write.
      const { groups, toInbox, toDrop } = routeWrites(unfinished, draft, days);
      for (const { ids, patch } of groups) await bulkUpdate.mutateAsync({ ids, patch });
      for (const task of pending) {
        const start = placements[task.id];
        if (start === undefined) continue;
        await schedule.mutateAsync({ taskId: task.id, day: days.tomorrow, start: formatClockTime(start), durationMinutes: task.durationMinutes });
      }
      for (const task of toInbox) await capture.mutateAsync({ text: task.title, source: "quick-add" });
      const gone = [...toInbox.map((task) => task.id), ...toDrop];
      if (gone.length > 0) await removeTasks.mutateAsync({ ids: gone });
      if (reflection.mood !== null) {
        await saveReflection.mutateAsync({
          day: today,
          mood: reflection.mood,
          energy: reflection.energy,
          wentWell: reflection.wentWell,
          note: reflection.note,
        });
      }
      dismissSlot("evening");
      const starts = [
        ...tomorrowBlocks.filter((block) => block.kind !== "break").map((block) => ({ minutes: block.startMinutes, title: block.title })),
        ...pending.flatMap((task) => (placements[task.id] === undefined ? [] : [{ minutes: placements[task.id]!, title: task.title }])),
      ].sort((a, b) => a.minutes - b.minutes);
      setFinished({ done: counts.completed, tomorrow: counts.tomorrow, dropped: counts.dropped, mood: reflection.mood, first: starts[0] ?? null });
    } catch {
      toast({ tone: "danger", title: t("finish.failed") });
    } finally {
      setFinishing(false);
    }
  }, [unfinished, draft, days, pending, placements, reflection, today, tomorrowBlocks, counts, bulkUpdate, schedule, capture, removeTasks, saveReflection, dismissSlot, t]);

  return {
    now,
    today,
    days,
    work,
    status: todayQuery.isError ? ("error" as const) : todayQuery.isPending ? ("loading" as const) : ("ready" as const),
    retry: () => void todayQuery.refetch(),
    unfinished,
    doneCount,
    draft,
    setRoutes,
    counts,
    tomorrowBlocks,
    tomorrowLoading: blocksQuery.isPending || allQuery.isPending,
    pending,
    placements,
    place,
    arrange,
    load,
    suggestion,
    applySuggestion,
    keepOverload: () => setKeepOverload(true),
    reflection,
    setReflection,
    finish,
    finishing,
    finished,
  };
}

export type ShutdownSession = ReturnType<typeof useShutdown>;
export type { RouteDestination };

