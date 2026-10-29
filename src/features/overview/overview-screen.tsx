"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { useShellProfile } from "@/components/shell/shell-provider";
import { Button } from "@/components/ui/button";
import { EnergyBars } from "@/components/ui/energy-bars";
import { Progress } from "@/design-system/feedback/progress";
import { MetricGroup, MetricTile } from "@/design-system/surfaces/metric-tile";
import { useDayPlan } from "@/features/my-day/header/use-day-plan";
import { MyDayProvider, useMyDay, usePlannerNow } from "@/features/my-day/my-day-context";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { TodaySwitch } from "@/features/personal/today-switch";
import { isModuleVisible } from "@/features/planner-settings/planner-settings";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { useTasksFormat } from "@/features/tasks/ui/use-tasks-format";
import { cn } from "@/lib/cn";
import { FinanceCard } from "./cards/finance-card";
import { GoalsCard } from "./cards/goals-card";
import { HabitsCard } from "./cards/habits-card";
import { InsightCard } from "./cards/insight-card";
import { LiveSlotCard } from "./cards/live-slot-card";
import { MoodCard } from "./cards/mood-card";
import { TasksCard } from "./cards/tasks-card";
import { TodayHero } from "./cards/today-hero";
import { UpNextCard } from "./cards/up-next-card";
import { useOverviewToday, type OverviewToday } from "./use-overview-today";

/*
 * P01 · Personal Overview. Read order: greeting/date → Now (volt) → Today
 * ring → Up next → Tasks/Habits → Goals/Mood/Finance/Insight. Signature
 * cards: the Today hero (its notch holds "Open My Day") and My Day's Now
 * card in the live slot — two of the three allowed. Hidden modules drop
 * their cards and the bottom row re-flows (4 → 3 → 2 columns), never a
 * placeholder.
 *
 * Below lg it is the PM01 "Today · Overview" phone screen, summary first:
 * the Now card, three numbers, Up next and the compact Streak Ribbon.
 *
 * The page enters with cards fading and rising 8px, 30ms apart (MotionConfig
 * reduces that to a fade for reduced motion).
 */

export interface OverviewScreenProps {
  /** Demo harness only: replaces the planner clock (an ISO instant). */
  now?: string;
}

export function OverviewScreen({ now }: OverviewScreenProps) {
  return (
    <MyDayProvider syncUrl={false} now={now}>
      <OverviewLayout />
    </MyDayProvider>
  );
}

function Rise({ index, className, children }: { index: number; className?: string; children: ReactNode }) {
  return (
    <motion.div
      className={cn("grid min-w-0", className)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: "easeOut", delay: index * 0.03 }}
    >
      {children}
    </motion.div>
  );
}

function dayPart(minutes: number): "morning" | "afternoon" | "evening" {
  if (minutes < 12 * 60) return "morning";
  if (minutes < 17 * 60) return "afternoon";
  return "evening";
}

/** Four bottom-row cards share the width; fewer get wider columns. */
const bottomColumns: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

function OverviewLayout() {
  const t = useTranslations("Overview");
  const tp = useTranslations("Personal.today");
  const format = useMyDayFormat();
  const { day: today, minutes: nowMinutes } = usePlannerNow();
  const { energy } = useMyDay();
  const settings = usePlannerSettings();
  const profile = useShellProfile();
  const plan = useDayPlan(today);
  const data = useOverviewToday(today);
  const [insightDismissed, setInsightDismissed] = useState(false);

  const visible = (id: Parameters<typeof isModuleVisible>[1]) => isModuleVisible(settings, id);
  const bottom = [
    visible("goals") ? <GoalsCard key="goals" today={today} className="h-full" /> : null,
    visible("journal") ? <MoodCard key="mood" today={today} className="h-full" /> : null,
    visible("finance") ? <FinanceCard key="finance" today={today} className="h-full" /> : null,
    visible("insights") && !insightDismissed ? (
      <InsightCard key="insight" today={today} onDismiss={() => setInsightDismissed(true)} className="h-full" />
    ) : null,
  ].filter((card) => card !== null);

  const part = dayPart(nowMinutes);
  const free = plan.status === "ready" ? plan.capacity.freeMinutes : null;

  return (
    <div data-screen="overview" className="flex min-w-0 flex-col gap-4 lg:gap-4.5">
      <PageHeader
        breadcrumb={<p className="text-sm font-semibold text-fg-muted">{format.kicker(today)}</p>}
        title={profile ? t("greeting", { part, name: profile.name }) : t("greetingAnon", { part })}
        actions={
          <div className="flex flex-wrap items-center gap-2 max-lg:hidden">
            {free !== null ? (
              <span className="inline-flex min-h-touch items-center gap-2 rounded-pill bg-surface px-4 text-xs font-semibold">
                <EnergyBars level={energy} decorative />
                {t("energyFree", { level: energy, free: format.duration(free) })}
              </span>
            ) : null}
            <Button asChild>
              <Link href="/personal/my-day">{t("planMyDay")}</Link>
            </Button>
          </div>
        }
      />
      <TodaySwitch current="overview" labels={{ nav: tp("label"), overview: tp("overview"), plan: tp("plan") }} />

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-4.5">
        <Rise index={0} className="max-lg:hidden">
          <TodayHero today={today} data={data} nowMinutes={nowMinutes} />
        </Rise>
        <Rise index={1}>
          <LiveSlotCard today={today} nowMinutes={nowMinutes} />
        </Rise>
      </div>

      <Rise index={2} className="lg:hidden">
        <PhoneNumbers data={data} />
      </Rise>

      <div className={cn("grid min-w-0 gap-4 lg:gap-4.5", visible("habits") ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
        <Rise index={3}>
          <UpNextCard today={today} nowMinutes={nowMinutes} className="h-full" />
        </Rise>
        <Rise index={4} className="max-lg:hidden">
          <TasksCard today={today} className="h-full" />
        </Rise>
        {visible("habits") ? (
          <Rise index={5}>
            <HabitsCard today={today} className="h-full" />
          </Rise>
        ) : null}
      </div>

      {bottom.length > 0 ? (
        <div data-slot="overview-modules" className={cn("grid min-w-0 gap-4 max-lg:hidden lg:gap-4.5", bottomColumns[bottom.length])}>
          {bottom.map((card, index) => (
            <Rise key={card.key} index={6 + index}>
              {card}
            </Rise>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** PM01 phone: three numbers (tasks, habits or focus, free time) instead of the hero. */
function PhoneNumbers({ data }: { data: OverviewToday }) {
  const t = useTranslations("Overview.hero");
  // Phone tiles are a third of 390px: Persian durations take the short form ("۱س ۴۵د", as on board cards)
  // and the wider Persian digits a step-down value size, so all three values stay on one line.
  const format = useTasksFormat();
  const fa = useLocale() === "fa";
  const { day } = usePlannerNow();
  const plan = useDayPlan(day);
  if (data.status !== "ready" || !data.tasks || !data.habits) return null;
  const { tasks, habits } = data;
  return (
    <MetricGroup aria-label={t("metrics")} columns={3} className={cn("grid-cols-3", fa && "[&_dd:first-of-type]:text-xl")}>
      <MetricTile label={t("tasks")} value={`${format.number(tasks.done)}/${format.number(tasks.total)}`}>
        <Progress size="sm" value={tasks.total ? (tasks.done / tasks.total) * 100 : 0} label={t("tasks")} />
      </MetricTile>
      {data.showHabits ? (
        <MetricTile label={t("habits")} value={`${format.number(habits.done)}/${format.number(habits.total)}`}>
          <Progress size="sm" value={habits.total ? (habits.done / habits.total) * 100 : 0} label={t("habits")} />
        </MetricTile>
      ) : (
        <MetricTile label={t("focus")} value={format.durationShort(tasks.completedMinutes)} />
      )}
      <MetricTile label={t("free")} value={plan.status === "ready" ? format.durationShort(plan.capacity.freeMinutes) : "—"} />
    </MetricGroup>
  );
}
