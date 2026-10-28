"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { toast } from "@/components/ui/toast";
import { normalizeJournalTags, type ReviewPriority, type ReviewRoute, type ReviewStep, type ReviewWin } from "@/data/domain";
import {
  useAppendJournal,
  useBulkUpdateTasks,
  useCaptureInbox,
  useFocusForDays,
  useGoals,
  useHabits,
  useMoods,
  useRemoveTasks,
  useSaveJournalEntry,
  useSaveWeeklyReview,
  useTasks,
  useWeeklyReview,
} from "@/data/queries";
import { workWindow } from "@/features/my-day/domain/capacity";
import { usePlannerNow } from "@/features/my-day/my-day-context";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { isModuleVisible } from "@/features/planner-settings/planner-settings";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import {
  initialDraft,
  ROUTE_DESTINATIONS,
  routeDays,
  routeWrites,
  type Route,
  type RouteDestination,
  type RouteDraft,
} from "@/features/shutdown/domain/shutdown";
import { ROUTE_UNDO_MS } from "@/features/shutdown/use-shutdown";
import { addDaysToDay } from "@/lib/dates/clock-time";
import {
  averageMood,
  carryCounts,
  focusMinutes,
  goalsWeek,
  habitsWeek,
  nextWeekPlan,
  REVIEW_STEPS,
  reviewAvailability,
  storyTone,
  suggestWins,
  weekTasks,
} from "./domain/weekly";

/*
 * The weekly review session over one week (`days`, Sat → Fri): reads Tasks,
 * Focus, Habits, Goals and Journal, keeps the person's choices as a draft
 * over the saved review (so Save & exit resumes where they left off), and
 * Finish writes it all: carry-over routes to Tasks / Inbox (Daily Shutdown's
 * writes), the reflection to today's Journal entry tagged #weekly, and the
 * review itself.
 */

export interface ReviewDraft {
  step?: ReviewStep;
  wins?: ReviewWin[];
  priorities?: ReviewPriority[];
  routes?: Record<string, Route | null>;
  wentWell?: string;
  slipped?: string;
  change?: string;
  reopened?: boolean;
}

function toRoute(route: ReviewRoute): Route | null {
  return ROUTE_DESTINATIONS.includes(route.to as RouteDestination) ? { to: route.to as RouteDestination, day: route.day } : null;
}

export function useWeeklyReviewSession(days: readonly string[]) {
  const t = useTranslations("Review");
  const tShutdown = useTranslations("Shutdown");
  const format = useMyDayFormat();
  const now = usePlannerNow();
  const today = now.day;
  const settings = usePlannerSettings();
  const week = days[0]!;
  const previous = useMemo(() => days.map((day) => addDaysToDay(day, -7)), [days]);
  const routing = useMemo(() => routeDays(today, settings.week), [today, settings.week]);
  const availability = reviewAvailability(days, today, settings.weeklyReview.weekday);

  const visible = {
    goals: isModuleVisible(settings, "goals"),
    habits: isModuleVisible(settings, "habits"),
    journal: isModuleVisible(settings, "journal"),
  };
  const steps = useMemo(() => REVIEW_STEPS.filter((step) => step !== "goals" || visible.goals), [visible.goals]);

  const tasksQuery = useTasks({ view: "all" });
  const reviewQuery = useWeeklyReview(week);
  const habitsQuery = useHabits();
  const goalsQuery = useGoals();
  const moodsQuery = useMoods(previous[0]!, days[6]!);
  const focusQuery = useFocusForDays(useMemo(() => [...previous, ...days], [previous, days]));

  const stored = reviewQuery.data ?? null;
  const [draft, setDraft] = useState<ReviewDraft>({});
  const update = useCallback((patch: ReviewDraft) => setDraft((current) => ({ ...current, ...patch })), []);

  // ── Facts ──
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const { completed, unfinished } = useMemo(() => weekTasks(tasks, days, today), [tasks, days, today]);
  const lastWeekDone = useMemo(() => weekTasks(tasks, previous, today).completed.length, [tasks, previous, today]);
  const habits = useMemo(() => habitsWeek(habitsQuery.data ?? [], days, today), [habitsQuery.data, days, today]);
  const lastHabits = useMemo(() => habitsWeek(habitsQuery.data ?? [], previous, today), [habitsQuery.data, previous, today]);
  const mood = averageMood(moodsQuery.data ?? [], days);
  const lastMood = averageMood(moodsQuery.data ?? [], previous);
  const focus = focusMinutes(focusQuery.data.slice(7), settings.focus.focusMinutes);
  const lastFocus = focusMinutes(focusQuery.data.slice(0, 7), settings.focus.focusMinutes);
  const goals = useMemo(() => goalsWeek(goalsQuery.data ?? [], days, today), [goalsQuery.data, days, today]);
  const suggestions = useMemo(
    () => suggestWins(completed, goalsQuery.data ?? [], habitsQuery.data ?? [], days, today),
    [completed, goalsQuery.data, habitsQuery.data, days, today],
  );
  const planned = completed.length + unfinished.length;
  const tone = storyTone({ doneRatio: planned ? completed.length / planned : null, mood: visible.journal ? mood : null });

  // ── Draft over the saved review ──
  const wins = draft.wins ?? stored?.wins ?? suggestions.slice(0, 3);
  const priorities = draft.priorities ?? stored?.priorities ?? [];
  const routes: RouteDraft = useMemo(() => {
    const base: Record<string, Route> = stored
      ? Object.fromEntries(Object.entries(stored.routes).flatMap(([id, route]) => (toRoute(route) ? [[id, toRoute(route)!]] : [])))
      : { ...initialDraft(unfinished, settings.planning.rollover) };
    for (const [id, route] of Object.entries(draft.routes ?? {})) {
      if (route) base[id] = route;
      else delete base[id];
    }
    return base;
  }, [stored, unfinished, settings.planning.rollover, draft.routes]);
  const reflection = {
    wentWell: draft.wentWell ?? stored?.wentWell ?? "",
    slipped: draft.slipped ?? stored?.slipped ?? "",
    change: draft.change ?? stored?.change ?? "",
  };
  const counts = useMemo(() => carryCounts(completed.length, unfinished, routes), [completed.length, unfinished, routes]);

  const setRoutes = useCallback(
    (ids: readonly string[], route: Route) => {
      if (ids.length === 0) return;
      const before = Object.fromEntries(ids.map((id) => [id, routes[id] ?? null]));
      setDraft((current) => ({ ...current, routes: { ...current.routes, ...Object.fromEntries(ids.map((id) => [id, route])) } }));
      toast({
        tone: "neutral",
        title: tShutdown("toast.moved", { count: ids.length, countText: format.number(ids.length), destination: tShutdown(`destination.${route.to}`) }),
        duration: ROUTE_UNDO_MS,
        action: {
          label: tShutdown("toast.undo"),
          altText: tShutdown("toast.undoAlt"),
          onClick: () => setDraft((current) => ({ ...current, routes: { ...current.routes, ...before } })),
        },
      });
    },
    [routes, format, tShutdown],
  );

  // ── Plan: carry-over tasks placed on next week's days ──
  const carried = useMemo(
    () => unfinished.filter((task) => routes[task.id] && routes[task.id]!.to !== "inbox" && routes[task.id]!.to !== "drop"),
    [unfinished, routes],
  );
  const plan = useMemo(() => {
    const placements = Object.fromEntries(
      carried.flatMap((task) => (routes[task.id]?.to === "pick" && routes[task.id]?.day ? [[task.id, routes[task.id]!.day!]] : [])),
    );
    return nextWeekPlan(days, tasks, placements, {
      workMinutes: workWindow(settings.workHours).totalMinutes,
      defaultDuration: settings.planning.defaultDurationMinutes,
      week: settings.week,
    });
  }, [carried, routes, days, tasks, settings.workHours, settings.planning.defaultDurationMinutes, settings.week]);
  const placeOn = useCallback(
    (taskId: string, day: string | null) =>
      setDraft((current) => ({ ...current, routes: { ...current.routes, [taskId]: day ? { to: "pick", day } : { to: "this-week" } } })),
    [],
  );

  // ── Save & exit / Finish ──
  const save = useSaveWeeklyReview();
  const bulkUpdate = useBulkUpdateTasks();
  const capture = useCaptureInbox();
  const removeTasks = useRemoveTasks();
  const append = useAppendJournal();
  const saveEntry = useSaveJournalEntry();
  const [finishing, setFinishing] = useState(false);

  const snapshot = (step: ReviewStep) => ({
    step,
    wins,
    priorities,
    routes: Object.fromEntries(Object.entries(routes).map(([id, route]) => [id, { to: route.to, ...(route.day ? { day: route.day } : {}) }])),
    ...reflection,
  });

  const saveProgress = async (step: ReviewStep): Promise<boolean> => {
    try {
      await save.mutateAsync({ week, patch: snapshot(step) });
      return true;
    } catch {
      toast({ tone: "danger", title: t("toast.saveFailed") });
      return false;
    }
  };

  const finish = async (): Promise<boolean> => {
    setFinishing(true);
    try {
      const { groups, toInbox, toDrop } = routeWrites(unfinished, routes, routing);
      for (const { ids, patch } of groups) await bulkUpdate.mutateAsync({ ids, patch });
      for (const task of toInbox) await capture.mutateAsync({ text: task.title, source: "quick-add" });
      const gone = [...toInbox.map((task) => task.id), ...toDrop];
      if (gone.length > 0) await removeTasks.mutateAsync({ ids: gone });
      const lines = (["wentWell", "slipped", "change"] as const)
        .filter((key) => reflection[key].trim())
        .map((key) => `${t(`reflect.${key}.label`)}: ${reflection[key].trim()}`);
      if (lines.length > 0) {
        const { entry } = await append.mutateAsync({ day: today, text: lines.join("\n") });
        await saveEntry.mutateAsync({ day: today, patch: { tags: normalizeJournalTags([...entry.tags, "weekly"]) } });
      }
      await save.mutateAsync({ week, patch: { ...snapshot("reflect"), routes: {}, completedAt: now.instant } });
      setDraft({});
      return true;
    } catch {
      toast({ tone: "danger", title: t("toast.finishFailed") });
      return false;
    } finally {
      setFinishing(false);
    }
  };

  const loading = tasksQuery.isPending || reviewQuery.isPending;
  const failed = tasksQuery.isError || reviewQuery.isError;

  return {
    week,
    today,
    days,
    routing,
    availability,
    visible,
    steps,
    status: failed ? ("error" as const) : loading ? ("loading" as const) : ("ready" as const),
    retry: () => {
      void tasksQuery.refetch();
      void reviewQuery.refetch();
    },
    storedStep: stored?.step ?? null,
    done: Boolean(stored?.completedAt) && !draft.reopened,
    reopen: () => update({ reopened: true }),
    facts: {
      tone,
      completed: completed.length,
      lastWeekDone,
      planned,
      focus,
      lastFocus,
      habits,
      lastHabits,
      mood,
      lastMood,
      moodLoading: moodsQuery.isPending,
      habitsLoading: habitsQuery.isPending,
    },
    completedTasks: completed,
    unfinished,
    counts,
    routes,
    setRoutes,
    suggestions,
    wins,
    setWins: (next: ReviewWin[]) => update({ wins: next }),
    goals,
    goalsLoading: goalsQuery.isPending,
    carried,
    plan,
    placeOn,
    tasks,
    priorities,
    setPriorities: (next: ReviewPriority[]) => update({ priorities: next }),
    reflection,
    setReflection: (patch: Partial<typeof reflection>) => update(patch),
    saveProgress,
    saving: save.isPending,
    finish,
    finishing,
  };
}

export type WeeklyReviewSession = ReturnType<typeof useWeeklyReviewSession>;
