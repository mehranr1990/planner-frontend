"use client";

import { BarChart3, Flame } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import type { Habit } from "@/data/domain";
import { HabitField, type HabitFieldCellState, type HabitFieldSize } from "@/design-system/data-display/habit-field";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { usePreferences } from "@/features/preferences/use-preferences";
import { dayToLocalDate, weekdayOfDay } from "@/lib/dates/clock-time";
import { getCalendarParts } from "@/lib/dates/month-grid";
import { getDirection } from "@/lib/locale/direction";
import { cellState, completion, fieldDays, habitStreak, isCellInteractive, trimBeforeStart, type FieldPeriod } from "./domain/habits";
import { habitIcon } from "./ui/habit-icons";
import { useHabitFormat } from "./ui/use-habit-format";

/*
 * Habit Field · consistency (P12): the approved Habit Field for every
 * habit over the period (14 days · Month · Year — same cells, wider grid;
 * phones show the last 7 days), then two KPI tiles (best current streak,
 * completion). Period switch: the grid fades / scales in (240ms; reduced
 * motion swaps). Year is a read-only overview.
 */

const SIZE: Record<FieldPeriod, HabitFieldSize> = { "14d": "md", month: "sm", year: "xs" };
const LEGEND = ["done", "missed", "today", "future", "skipped", "rest"] as const;

export function HabitFieldCard({
  habits,
  today,
  period,
  compact,
  selectedId,
  onSelect,
  onToggle,
  onSkip,
}: {
  habits: readonly Habit[];
  today: string;
  period: FieldPeriod;
  compact: boolean;
  selectedId: string | null;
  onSelect(id: string): void;
  onToggle(habit: Habit, day: string, done: boolean): void;
  onSkip(habit: Habit, day: string): void;
}) {
  const t = useTranslations("Habits.field");
  const format = useHabitFormat();
  const reduce = useReducedMotion();
  const { locale, calendar } = usePreferences();
  const { week } = usePlannerSettings();
  const days = trimBeforeStart(fieldDays(period, today, calendar, compact), habits);
  const size = SIZE[period];
  const byId = new Map(habits.map((habit) => [habit.id, habit]));

  const columns = days.map((day) => {
    const firstOfMonth = getCalendarParts(dayToLocalDate(day), calendar).day === 1;
    return {
      key: day,
      weekday: size === "xs" ? "" : format.weekdayNarrow(day),
      date: size === "xs" ? (firstOfMonth ? format.monthName(day) : "") : format.date(day),
      weekend: week.weekendDays.includes(weekdayOfDay(day)),
      today: day === today,
    };
  });

  const stateText = (state: HabitFieldCellState) => t(`states.${state}`);
  const rows = habits.map((habit) => {
    const HabitIcon = habitIcon(habit.icon);
    const rate = completion(habit, days, today).ratio;
    return {
      id: habit.id,
      title: habit.title,
      icon: <Icon icon={HabitIcon} size={14} />,
      streakText: t("streakShort", { streak: habitStreak(habit, today), streakText: format.number(habitStreak(habit, today)) }),
      rateText: rate === null ? "–" : format.percent(rate),
      cells: days.map((day) => {
        const state = cellState(habit, day, today);
        return {
          state,
          interactive: isCellInteractive(habit, day, today),
          ariaLabel: t("cell", { habit: habit.title, day: format.dayMonth(day), state: stateText(state) }),
        };
      }),
    };
  });

  const best = habits.reduce<{ habit: Habit | null; streak: number }>(
    (top, habit) => {
      const streak = habitStreak(habit, today);
      return streak > top.streak ? { habit, streak } : top;
    },
    { habit: null, streak: 0 },
  );
  const overall = habits.reduce(
    (sum, habit) => {
      const part = completion(habit, days, today);
      return { done: sum.done + part.done, possible: sum.possible + part.possible };
    },
    { done: 0, possible: 0 },
  );

  return (
    <ProductCard as="section" aria-labelledby="habit-field-title" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="habit-field-title" className="text-lg font-bold text-fg">
          {t("title")}
        </h2>
        {size === "xs" ? null : <p className="text-xs font-semibold text-fg-muted">{t("hint")}</p>}
      </div>
      <motion.div
        key={`${period}-${compact}`}
        initial={reduce ? false : { opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
      >
        <HabitField
          label={t("label", { period: t(`periods.${period}`) })}
          columns={columns}
          rows={rows}
          size={size}
          direction={getDirection(locale)}
          summaryHeader={t("summary")}
          selectedId={selectedId}
          onSelectRow={onSelect}
          onToggle={(id, day) => {
            const habit = byId.get(id);
            if (habit) onToggle(habit, day, !habit.doneDays.includes(day));
          }}
          onSkip={(id, day) => {
            const habit = byId.get(id);
            if (habit) onSkip(habit, day);
          }}
          legend={LEGEND.map((state) => ({ state, label: t(`legend.${state}`) }))}
        />
      </motion.div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Kpi
          icon={<Icon icon={Flame} size={18} />}
          tone="bg-warning-soft text-warning-text"
          value={format.number(best.streak)}
          label={best.habit ? t("best", { habit: best.habit.title }) : t("bestNone")}
        />
        <Kpi
          icon={<Icon icon={BarChart3} size={18} />}
          tone="bg-scope-soft text-scope-deep"
          value={overall.possible ? format.percent(overall.done / overall.possible) : "–"}
          label={t("rate", { period: t(`ratePeriods.${period}`) })}
        />
      </div>
    </ProductCard>
  );
}

function Kpi({ icon, tone, value, label }: { icon: ReactNode; tone: string; value: string; label: string }) {
  return (
    <dl className="flex items-center gap-3.5 rounded-metric bg-subtle p-3.5">
      <span aria-hidden="true" className={`grid size-11 shrink-0 place-items-center rounded-full ${tone}`}>
        {icon}
      </span>
      <div className="flex min-w-0 flex-col-reverse">
        <dt className="truncate text-xs font-semibold text-fg-muted">
          {label}
        </dt>
        <dd className="tabular text-2xl font-semibold leading-tight">{value}</dd>
      </div>
    </dl>
  );
}
