"use client";

import { useTranslations } from "next-intl";
import type { Habit } from "@/data/domain";
import { HabitStreakRibbon } from "@/design-system/data-display/habit-streak-ribbon";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { usePreferences } from "@/features/preferences/use-preferences";
import { weekdayOfDay } from "@/lib/dates/clock-time";
import { getDirection } from "@/lib/locale/direction";
import { habitStreak, ribbonCopy, streakWeek } from "./domain/habits";
import { useHabitFormat } from "./ui/use-habit-format";

/**
 * The approved Habit Streak Ribbon for one habit's current week (planner
 * week setting: Saturday first for Iran), localised. Used by Overview (the
 * pinned habit, CTA opens it in Habits) and P12 (the selected habit).
 */
export function HabitRibbon({
  habit,
  today,
  compact = false,
  cta = true,
  className,
}: {
  habit: Habit;
  today: string;
  compact?: boolean;
  /** Show the adaptive CTA capsule (desktop), opening the habit. */
  cta?: boolean;
  className?: string;
}) {
  const t = useTranslations("Habits.ribbon");
  const format = useHabitFormat();
  const { locale } = usePreferences();
  const { week } = usePlannerSettings();
  const streak = habitStreak(habit, today);
  const days = streakWeek(habit, today, week);
  const todayState = days.find((entry) => entry.day === today)?.state ?? "today-open";

  return (
    <HabitStreakRibbon
      direction={getDirection(locale)}
      compact={compact}
      className={className}
      streak={streak}
      streakText={format.number(streak)}
      streakLabel={t("streak")}
      label={t("label", { habit: habit.title, streak, streakText: format.number(streak), today: t(`today.${todayState}`) })}
      cta={cta ? { label: t(`cta.${ribbonCopy(days, streak, today)}`), href: `/personal/habits/${encodeURIComponent(habit.id)}` } : undefined}
      nodes={days.map((entry) => ({
        key: entry.day,
        state: entry.state,
        weekday: format.weekdayRibbon(entry.day),
        date: format.date(entry.day),
        weekend: week.weekendDays.includes(weekdayOfDay(entry.day)),
        ariaLabel: t("node", { day: `${format.weekday(entry.day)} ${format.dayMonth(entry.day)}`, state: t(`states.${entry.state}`) }),
      }))}
    />
  );
}
