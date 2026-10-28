"use client";

import { useTranslations } from "next-intl";
import type { Goal } from "@/data/domain";
import { useGoals } from "@/data/queries";
import { Progress } from "@/design-system/feedback/progress";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { addDaysToDay } from "@/lib/dates/clock-time";
import { cn } from "@/lib/cn";
import { CardError, CardHead, CardLoading } from "../ui/card-parts";

/*
 * Goals (P01 → Goals): the first three active goals as number + linear bar
 * (no rings or gauges). A goal behind plan says so in words and turns its
 * bar amber — never colour alone.
 */

const MAX_GOALS = 3;

function GoalNote({ goal, today }: { goal: Goal; today: string }) {
  const t = useTranslations("Overview.goals");
  const format = useMyDayFormat();
  if (goal.status === "behind") {
    const days = goal.behindDays ?? 0;
    return <>{t("behind", { days, daysText: format.number(days) })}</>;
  }
  if (!goal.nextStep) return null;
  const step = <bdi dir="auto">{goal.nextStep}</bdi>;
  if (!goal.nextStepDay) return <>{t.rich("next", { step: () => step })}</>;
  if (goal.nextStepDay === addDaysToDay(today, 1)) return <>{t.rich("nextTomorrow", { step: () => step })}</>;
  if (goal.nextStepDay === today) return <>{t.rich("nextToday", { step: () => step })}</>;
  return <>{t.rich("nextOn", { step: () => step, date: format.dayMonth(goal.nextStepDay) })}</>;
}

export function GoalsCard({ today, className }: { today: string; className?: string }) {
  const t = useTranslations("Overview.goals");
  const format = useMyDayFormat();
  const query = useGoals();
  const goals = (query.data ?? []).slice(0, MAX_GOALS);

  return (
    <ProductCard as="section" aria-labelledby="overview-goals-title" className={cn("flex flex-col gap-3", className)}>
      <CardHead id="overview-goals-title" title={t("title")} href="/personal/goals" linkLabel={t("open")} />
      {query.isPending ? (
        <CardLoading rows={3} />
      ) : query.isError ? (
        <CardError onRetry={() => void query.refetch()} />
      ) : goals.length === 0 ? (
        <p role="status" className="rounded-field bg-subtle p-4 text-sm text-fg-secondary">
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {goals.map((goal) => (
            <li key={goal.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold">
                  <bdi dir="auto">{goal.title}</bdi>
                </span>
                <span className="tabular text-xs font-semibold text-fg-secondary">{format.percent(goal.progress)}</span>
              </div>
              <Progress
                size="sm"
                value={goal.progress * 100}
                label={goal.title}
                valueText={format.percent(goal.progress)}
                indicatorClassName={goal.status === "behind" ? "bg-warning" : undefined}
              />
              <p className={cn("text-[0.6875rem]", goal.status === "behind" ? "font-semibold text-warning-text" : "text-fg-muted")}>
                <GoalNote goal={goal} today={today} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </ProductCard>
  );
}
