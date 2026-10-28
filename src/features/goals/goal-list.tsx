"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Goal } from "@/data/domain";
import { Progress } from "@/design-system/feedback/progress";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { addDaysToDay } from "@/lib/dates/clock-time";
import { cn } from "@/lib/cn";
import { isDelayed, lateDays } from "./domain/goals";

/*
 * P11 list: one product card per goal — number + one bar, a meta line and
 * one note (next step, behind, completed). The Milestone Path appears only
 * for the selected goal. Cards are links to /personal/goals/:id.
 */

export function goalHref(id: string): string {
  return `/personal/goals/${encodeURIComponent(id)}`;
}

function GoalNote({ goal, today }: { goal: Goal; today: string }) {
  const t = useTranslations("Goals.list");
  const format = useMyDayFormat();
  if (goal.lifecycle === "completed" && goal.completedDay) return <>{t("completedOn", { date: format.dayMonth(goal.completedDay) })}</>;
  if (goal.lifecycle === "archived") return <>{t("archivedNote")}</>;
  if (isDelayed(goal, today)) {
    const days = lateDays(goal, today);
    return (
      <>
        <span aria-hidden="true" className="me-1 inline-block size-1.5 rounded-full bg-warning align-middle" />
        {t("behind", { days, daysText: format.number(days) })}
      </>
    );
  }
  if (!goal.nextStep) return null;
  const step = () => <bdi dir="auto">{goal.nextStep}</bdi>;
  if (!goal.nextStepDay) return <>{t.rich("next", { step })}</>;
  if (goal.nextStepDay === today) return <>{t.rich("nextToday", { step })}</>;
  if (goal.nextStepDay === addDaysToDay(today, 1)) return <>{t.rich("nextTomorrow", { step })}</>;
  return <>{t.rich("nextOn", { step, date: format.dayMonth(goal.nextStepDay) })}</>;
}

export function GoalList({ goals, selectedId, today }: { goals: readonly Goal[]; selectedId: string | null; today: string }) {
  const t = useTranslations("Goals.list");
  const format = useMyDayFormat();
  return (
    <ul aria-label={t("label")} className="flex flex-col gap-3">
      {goals.map((goal) => {
        const selected = goal.id === selectedId;
        const delayed = isDelayed(goal, today);
        const meta = [goal.area, goal.dueDay ? t("due", { date: format.dayMonth(goal.dueDay) }) : null].filter(Boolean).join(" · ");
        return (
          <ProductCard
            key={goal.id}
            as="li"
            padding="compact"
            data-goal={goal.id}
            className={cn(
              "relative flex flex-col gap-2 transition-shadow has-[a:focus-visible]:focus-ring",
              selected ? "inset-ring-[1.5px] inset-ring-primary" : "hover:shadow-md",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <Link
                href={goalHref(goal.id)}
                aria-current={selected ? "page" : undefined}
                scroll={false}
                className="min-w-0 truncate text-[0.9375rem] font-bold text-fg outline-none after:absolute after:inset-0 after:rounded-[inherit]"
              >
                <bdi dir="auto">{goal.title}</bdi>
              </Link>
              <span className="tabular shrink-0 text-xl font-semibold text-fg">{format.percent(goal.progress)}</span>
            </div>
            {meta ? <p className="-mt-1.5 truncate text-xs text-fg-secondary">{meta}</p> : null}
            <Progress
              size="sm"
              value={goal.progress * 100}
              label={goal.title}
              valueText={format.percent(goal.progress)}
              indicatorClassName={delayed ? "bg-warning" : undefined}
            />
            <p className={cn("truncate text-xs", delayed ? "font-semibold text-warning-text" : "text-fg-muted")}>
              <GoalNote goal={goal} today={today} />
            </p>
          </ProductCard>
        );
      })}
    </ul>
  );
}
