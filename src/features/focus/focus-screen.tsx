"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PillGroup } from "@/components/ui/pills";
import { useSetTaskDone, useTask } from "@/data/queries";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import type { PlannerSettings } from "@/features/planner-settings/planner-settings";
import { useIsClient } from "@/hooks/use-is-client";
import { cn } from "@/lib/cn";
import * as timer from "./domain/timer";
import type { FocusConfig, FocusPhase, FocusSession } from "./domain/timer";
import { FocusBreakCard } from "./focus-break-card";
import { FocusCapsule } from "./focus-capsule";
import { FocusComplete } from "./focus-complete";
import { FocusPick } from "./focus-pick";
import { focusRouteFor } from "./focus-running";
import { FocusSettingsSheet } from "./focus-settings-sheet";
import { FocusParkPanel, FocusQuickNote } from "./focus-side-panels";
import { focusStore, useFocusTimer, type FocusClock } from "./focus-store";
import { FocusTimerCard } from "./focus-timer-card";
import { useFocusFormat } from "./use-focus-format";
import { useFocusSync } from "./use-focus-sync";

/*
 * Focus (P09), full-screen in the (focus) route group: the shell retreats to
 * Leave focus, the cycle capsule and settings. ?task=:id starts a session on
 * that task when none is live; the session lives in the focus store, so
 * Leave focus keeps it running (schedule island chip, My Day Focus card).
 * Reads useSearchParams(), so the page wraps it in <Suspense>.
 */

const systemClock: FocusClock = () => Date.now();

export function focusConfigFrom(settings: PlannerSettings["focus"]): FocusConfig {
  const { focusMinutes, shortBreakMinutes, longBreakMinutes, cyclesBeforeLongBreak, autoStartNext } = settings;
  return { focusMinutes, shortBreakMinutes, longBreakMinutes, cyclesBeforeLongBreak, autoStartNext };
}

/** What the polite live region says: phase and status changes only, never each second. */
function useAnnouncement(session: FocusSession | null): string {
  const t = useTranslations("Focus.announce");
  const format = useFocusFormat();
  if (!session) return "";
  if (session.status === "complete") return t("complete");
  if (session.status === "paused") return t("paused");
  if (session.status === "ready") return t("ready");
  if (session.phase === "focus") {
    return t("focus", { current: format.digits(session.cycle), total: format.digits(session.config.cyclesBeforeLongBreak) });
  }
  return t(session.phase, { minutes: format.digits(timer.phaseMinutes(session.config, session.phase)) });
}

export function FocusScreen({ clock = systemClock }: { clock?: FocusClock }) {
  const t = useTranslations("Focus");
  const router = useRouter();
  const params = useSearchParams();
  const paramTask = params.get("task");
  const settings = usePlannerSettings();
  const hydrated = useIsClient();
  const { session, now } = useFocusTimer(clock);
  const task = useTask(session?.taskId ?? null);
  const setDone = useSetTaskDone();
  const format = useFocusFormat();
  const announcement = useAnnouncement(session);
  useFocusSync(session);

  const config = focusConfigFrom(settings.focus);
  const start = (taskId: string | null) => focusStore.update(() => timer.startSession(config, taskId, clock()));
  const act = (transition: (current: FocusSession, at: number) => FocusSession) =>
    focusStore.update((latest) => (latest ? transition(latest, clock()) : latest));

  // ?task=:id starts a session when none is live (or the last one is finished and written).
  useEffect(() => {
    if (!paramTask) return;
    const live = focusStore.get();
    const replaceable = live?.status === "complete" && live.taskId !== paramTask && live.unrecorded === 0 && live.parked.length === 0;
    if (!live || replaceable) {
      focusStore.update(() => timer.startSession(config, paramTask, clock()));
    }
    // Start once per task in the URL; settings changes must not restart a session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTask]);

  const finishTask = () => {
    const taskId = session?.taskId;
    if (taskId) setDone.mutate({ id: taskId, done: true });
    act(timer.complete);
  };

  const live = session && session.status !== "complete" ? session : null;

  return (
    <main
      id="main-content"
      tabIndex={-1}
      aria-label={t("landmark")}
      className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-gutter pt-[calc(var(--safe-top)+1rem)] pb-[calc(var(--safe-bottom)+2rem)]"
    >
      <h1 className="sr-only">{t("landmark")}</h1>
      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/personal/my-day" className={cn(buttonVariants({ variant: "secondary" }), "bg-surface shadow-island")}>
          <Icon icon={ArrowLeft} mirror size={18} />
          {t("leave")}
          {live ? <span className="text-xs font-semibold text-fg-muted">{t("keepsRunning")}</span> : null}
        </Link>
        {session ? <FocusCapsule session={session} /> : null}
        {live ? (
          <FocusSettingsSheet config={live.config} onChange={(next) => act((current) => timer.reconfigure(current, next))} />
        ) : (
          <span aria-hidden="true" className="hidden size-12 sm:block" />
        )}
      </div>

      {!hydrated ? null : live ? (
        <>
          <PillGroup<FocusPhase>
            variant="filled"
            label={t("phases.label")}
            value={live.phase}
            onValueChange={(phase) => act((current, at) => timer.switchPhase(current, phase, at))}
            options={(["focus", "short", "long"] as const).map((phase) => ({ value: phase, label: t(`phases.${phase}`) }))}
            className="self-center"
          />
          {live.phase === "focus" ? (
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <FocusTimerCard
                session={live}
                now={now}
                task={task.data ?? undefined}
                actions={{
                  pause: () => act(timer.pause),
                  resume: () => act(timer.resume),
                  extend: (minutes) => act((current) => timer.extend(current, minutes)),
                  finishTask,
                  finishSession: () => act(timer.complete),
                }}
              />
              <div className="flex flex-col gap-4">
                <FocusQuickNote taskId={live.taskId} />
                <FocusParkPanel parked={live.parked} onPark={(text) => act((current) => timer.park(current, text))} />
              </div>
            </div>
          ) : (
            <FocusBreakCard
              session={live}
              now={now}
              taskTitle={task.data?.title ?? undefined}
              focusedToday={format.duration(live.focusedMs)}
              actions={{
                pause: () => act(timer.pause),
                resume: () => act(timer.resume),
                extend: (minutes) => act((current) => timer.extend(current, minutes)),
                skip: () => act(timer.skip),
                end: () => act(timer.complete),
              }}
            />
          )}
        </>
      ) : session ? (
        <FocusComplete
          session={session}
          task={task.data ?? undefined}
          marking={setDone.isPending}
          onMarkDone={() => session.taskId && setDone.mutate({ id: session.taskId, done: true })}
          onAnotherRound={() => {
            start(session.taskId);
            router.replace(focusRouteFor(session.taskId));
          }}
          onBack={() => focusStore.clear()}
        />
      ) : paramTask ? null : (
        <FocusPick
          onStart={(taskId) => {
            start(taskId);
            if (taskId) router.replace(focusRouteFor(taskId));
          }}
        />
      )}
    </main>
  );
}
