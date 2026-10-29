"use client";

import { ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useFocusToday } from "@/data/queries";
import { ProgressRing } from "@/design-system/data-display/progress-ring";
import { Progress } from "@/design-system/feedback/progress";
import { MetricGroup, MetricTile } from "@/design-system/surfaces/metric-tile";
import { SignatureCard, SignatureCardAction, SignatureCardHeader } from "@/design-system/surfaces/signature-card";
import { useDayPlan } from "@/features/my-day/header/use-day-plan";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { CardError, CardLoading } from "../ui/card-parts";
import { moodKey } from "../ui/mood";
import type { OverviewToday } from "../use-overview-today";
import { DayStrip } from "./day-strip";

/*
 * The Today hero (P01): the page's one notch, holding "Open My Day". Today
 * progress ring (the only ring on the page), a one-line status, four tiles
 * (Tasks, Habits, Focus, Mood · energy — hidden modules drop theirs) and the
 * day strip with the volt now-dot. Desktop only; the phone shows its
 * three numbers instead (OverviewNumbers).
 */

const MY_DAY_HREF = "/personal/my-day";

export function TodayHero({ today: day, data, nowMinutes }: { today: string; data: OverviewToday; nowMinutes: number }) {
  const t = useTranslations("Overview.hero");
  const tm = useTranslations("Overview");
  const format = useMyDayFormat();
  const router = useRouter();
  const plan = useDayPlan(day);
  const focus = useFocusToday(day);
  const settings = usePlannerSettings();
  const focusGoal = settings.focus.dailyGoalMinutes;
  // Settings › Privacy: a locked Journal shows nothing of its content, here as on the Mood card.
  const moodLocked = settings.privacy.journalLock;

  const action = <SignatureCardAction icon={ArrowUpRight} mirror label={t("open")} onClick={() => router.push(MY_DAY_HREF)} />;

  const percent = Math.round(data.ratio * 100);
  const ringValue = useRingSweep(data.status === "ready" ? percent : 0);
  const tasks = data.tasks;
  const habits = data.habits;
  const free = plan.status === "ready" ? plan.capacity.freeMinutes : 0;
  const state =
    tasks?.allDone && (!habits || habits.done === habits.total)
      ? "done"
      : plan.status === "ready" && plan.capacity.state === "over"
        ? "over"
        : tasks && tasks.total === 0
          ? "empty"
          : "normal";

  return (
    <SignatureCard as="section" aria-labelledby="overview-hero-title" action={action} contentClassName="flex flex-col gap-4">
      {data.status === "pending" ? (
        <>
          <SignatureCardHeader />
          <CardLoading rows={3} />
        </>
      ) : data.status === "error" ? (
        <>
          <SignatureCardHeader>
            <h2 id="overview-hero-title" className="type-title">
              {t("eyebrow")}
            </h2>
          </SignatureCardHeader>
          <CardError onRetry={data.refetch} />
        </>
      ) : (
        <>
          <div className="flex items-center gap-5">
            <ProgressRing
              value={ringValue}
              label={t("eyebrow")}
              valueText={format.percent(data.ratio)}
              size={128}
              strokeWidth={14}
              tone="personal"
              shade="base"
            >
              <span className="tabular text-[2rem] font-semibold leading-none">{format.percent(data.ratio)}</span>
              <span className="text-[0.6875rem] font-semibold text-fg-muted">{t("ofToday")}</span>
            </ProgressRing>
            <SignatureCardHeader className="flex-col items-start gap-1.5 self-center">
              <p className="text-xs font-bold tracking-wide text-scope-deep uppercase">{t("eyebrow")}</p>
              <h2 id="overview-hero-title" className="type-h2">
                {t("title", { state, weekday: format.weekday(day) })}
              </h2>
              <p className="text-sm text-fg-secondary">
                {data.showHabits
                  ? t("summary", {
                      tasks: tasks!.open,
                      tasksText: format.number(tasks!.open),
                      habits: habits!.total - habits!.done,
                      habitsText: format.number(habits!.total - habits!.done),
                      free: format.duration(free),
                    })
                  : t("summaryTasks", { tasks: tasks!.open, tasksText: format.number(tasks!.open), free: format.duration(free) })}
              </p>
            </SignatureCardHeader>
          </div>

          <MetricGroup aria-label={t("metrics")} columns={4}>
            <MetricTile label={t("tasks")} value={`${format.number(tasks!.done)}/${format.number(tasks!.total)}`}>
              <Progress
                size="sm"
                value={tasks!.total ? (tasks!.done / tasks!.total) * 100 : 0}
                label={t("tasks")}
                valueText={format.percent(tasks!.total ? tasks!.done / tasks!.total : 0)}
              />
            </MetricTile>
            {data.showHabits ? (
              <MetricTile label={t("habits")} value={`${format.number(habits!.done)}/${format.number(habits!.total)}`}>
                <Progress
                  size="sm"
                  value={habits!.total ? (habits!.done / habits!.total) * 100 : 0}
                  label={t("habits")}
                  valueText={format.percent(habits!.total ? habits!.done / habits!.total : 0)}
                />
              </MetricTile>
            ) : null}
            <MetricTile
              label={t("focus")}
              value={format.duration(tasks!.completedMinutes)}
              hint={
                focus.data
                  ? t("focusHintGoal", {
                      sessions: focus.data.sessionsCompleted,
                      sessionsText: format.number(focus.data.sessionsCompleted),
                      goal: format.duration(focusGoal),
                    })
                  : t("focusGoal", { goal: format.duration(focusGoal) })
              }
            >
              <Progress
                size="sm"
                value={Math.min(100, (tasks!.completedMinutes / focusGoal) * 100)}
                label={t("focus")}
                valueText={format.percent(Math.min(1, tasks!.completedMinutes / focusGoal))}
              />
            </MetricTile>
            {data.showMood ? (
              <MetricTile
                label={t("mood")}
                value={data.mood && !moodLocked ? tm("moodLevel", { level: moodKey(data.mood.mood) }) : "—"}
                hint={moodLocked ? tm("mood.locked") : data.mood ? tm("energy", { level: data.mood.energy }) : t("moodNone")}
              />
            ) : null}
          </MetricGroup>

          {plan.status === "ready" ? <DayStrip blocks={plan.blocks} nowMinutes={nowMinutes} /> : null}
        </>
      )}
    </SignatureCard>
  );
}

/** Page enter: the ring sweeps from 0 (its CSS transition; reduced motion makes it instant). */
function useRingSweep(target: number): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setValue(target));
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}
