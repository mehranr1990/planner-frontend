"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { toast } from "@/components/ui/toast";
import { useHabits, useSetHabitDone } from "@/data/queries";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { cn } from "@/lib/cn";
import { HabitRibbon } from "@/features/habits/habit-ribbon";
import { isDoneOn } from "../domain/habits";
import { CardError, CardHead, CardLoading } from "../ui/card-parts";

/*
 * Habits (P01 → Habits): today's habits as toggles (checked in place) and
 * the approved Habit Streak Ribbon (shared with P12) for the pinned habit —
 * the one visualization Overview allows besides the Today ring. Its CTA
 * opens the habit in Habits. The phone shows the ribbon only.
 */

export function HabitsCard({ today, className }: { today: string; className?: string }) {
  const t = useTranslations("Overview.habits");
  const format = useMyDayFormat();
  const query = useHabits();
  const setDone = useSetHabitDone();

  const habits = query.data ?? [];
  const doneCount = habits.filter((habit) => isDoneOn(habit, today)).length;
  const pinned = habits.find((habit) => habit.pinned);

  return (
    <ProductCard as="section" aria-labelledby="overview-habits-title" className={cn("flex flex-col gap-3", className)}>
      <CardHead
        id="overview-habits-title"
        title={t("title")}
        count={query.data ? t("count", { done: format.number(doneCount), total: format.number(habits.length) }) : undefined}
        href="/personal/habits"
        linkLabel={t("open")}
      />
      {query.isPending ? (
        <CardLoading rows={2} />
      ) : query.isError ? (
        <CardError onRetry={() => void query.refetch()} />
      ) : habits.length === 0 ? (
        <p role="status" className="rounded-field bg-subtle p-4 text-sm text-fg-secondary">
          {t("empty")}
        </p>
      ) : (
        <>
          <ul aria-label={t("today")} className="grid grid-cols-5 gap-2 max-lg:hidden">
            {habits.map((habit) => {
              const done = isDoneOn(habit, today);
              return (
                <li key={habit.id} className="grid">
                  <button
                    type="button"
                    aria-pressed={done}
                    onClick={() =>
                      setDone.mutate(
                        { id: habit.id, day: today, done: !done },
                        { onError: () => toast({ tone: "danger", title: t("failed") }) },
                      )
                    }
                    className={cn(
                      "flex min-h-touch min-w-0 flex-col items-center gap-1.5 rounded-metric px-1 py-2.5 text-[0.6875rem] font-semibold transition-colors duration-(--motion-fast)",
                      done ? "bg-scope-soft text-scope-deep" : "bg-subtle text-fg-secondary hover:bg-raised",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-7 place-items-center rounded-full",
                        done ? "bg-scope-deep text-on-accent" : "border-[1.5px] border-outline",
                      )}
                    >
                      {done ? <Icon icon={Check} size={14} /> : null}
                    </span>
                    <span className="max-w-full truncate">
                      <bdi dir="auto">{habit.title}</bdi>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {pinned ? <HabitRibbon habit={pinned} today={today} className="shadow-none inset-ring inset-ring-line" /> : null}
        </>
      )}
    </ProductCard>
  );
}
