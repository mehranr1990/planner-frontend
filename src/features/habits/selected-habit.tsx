"use client";

import { Archive, Check, Pencil } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Habit } from "@/data/domain";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { RingCard } from "@/design-system/surfaces/ring-card";
import { SignatureCard, SignatureCardAction, SignatureCardHeader } from "@/design-system/surfaces/signature-card";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { usePreferences } from "@/features/preferences/use-preferences";
import { bestStreak, dayOfWeekday, daysOfData, isDoneOn, isRestDay, monthHistory, RING_MIN_DAYS, scheduledWeekdays } from "./domain/habits";
import { HabitRibbon } from "./habit-ribbon";
import { useHabitFormat } from "./ui/use-habit-format";

/*
 * The selected habit (P12): head = the screen's one signature card, its
 * notch holding Check today; the Habit Streak Ribbon below; then the Habit
 * RingCard (the approved ring precedent) — this month's completion, the
 * last four months as periods, HISTORY / DETAILS bottom tabs. Sparse (< 7
 * days of data): no ring yet, the details stay.
 */

export function SelectedHabit({
  habit,
  today,
  compact,
  onToggleToday,
  onEdit,
  onArchive,
}: {
  habit: Habit;
  today: string;
  compact: boolean;
  onToggleToday(done: boolean): void;
  onEdit(): void;
  onArchive(): void;
}) {
  const t = useTranslations("Habits.selected");
  const reduce = useReducedMotion();
  const done = isDoneOn(habit, today);
  const rest = !done && isRestDay(habit, today);
  const frequency = useFrequencyText(habit, today);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.section
        key={habit.id}
        aria-label={t("label", { habit: habit.title })}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reduce ? undefined : { opacity: 0 }}
        transition={{ duration: 0.24 }}
        className="flex min-w-0 flex-col gap-3"
        data-selected-habit={habit.id}
      >
        <SignatureCard
          contentClassName="flex flex-col gap-1"
          action={
            <SignatureCardAction
              icon={Check}
              variant={done ? "primary" : "neutral"}
              label={done ? t("uncheck") : t("check")}
              aria-pressed={done}
              onClick={() => onToggleToday(!done)}
            />
          }
        >
          <SignatureCardHeader className="flex flex-col gap-1 pe-16">
            <p className="text-[0.6875rem] font-bold uppercase tracking-wide text-fg-muted">{t("kicker")}</p>
            <h2 className="truncate text-2xl font-semibold text-fg">
              <bdi dir="auto">{habit.title}</bdi>
            </h2>
            <p className="text-xs font-semibold text-fg-secondary">
              {[habit.area, frequency, done ? t("doneToday") : rest ? t("restToday") : t("notDoneToday")].filter(Boolean).join(" · ")}
            </p>
          </SignatureCardHeader>
        </SignatureCard>
        <HabitRibbon habit={habit} today={today} compact={compact} cta={false} />
        <HabitRing habit={habit} today={today} frequency={frequency} onEdit={onEdit} onArchive={onArchive} />
      </motion.section>
    </AnimatePresence>
  );
}

function useFrequencyText(habit: Habit, today: string): string {
  const t = useTranslations("Habits.details");
  const format = useHabitFormat();
  const { week } = usePlannerSettings();
  const name = (weekday: number) => format.weekdayRibbon(dayOfWeekday(today, weekday));
  if (habit.restWeekdays.length === 0) return t("daily");
  // Mostly daily: name the rest days; otherwise the days it runs.
  if (habit.restWeekdays.length <= 2) return t("dailyExcept", { days: habit.restWeekdays.map(name).join(" · ") });
  return scheduledWeekdays(habit, week).map(name).join(" · ");
}

function HabitRing({ habit, today, frequency, onEdit, onArchive }: { habit: Habit; today: string; frequency: string; onEdit(): void; onArchive(): void }) {
  const t = useTranslations("Habits.ring");
  const tDetails = useTranslations("Habits.details");
  const format = useHabitFormat();
  const { calendar } = usePreferences();
  const months = monthHistory(habit, today, calendar);
  const [selected, setSelected] = useState(months.length - 1);
  const index = Math.min(selected, months.length - 1);
  const month = months[index]!;
  const ratio = month.completion.ratio ?? 0;
  const best = bestStreak(habit, today);

  const details = (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
        <dt className="font-semibold text-fg-muted">{tDetails("frequency")}</dt>
        <dd className="text-end font-bold">{frequency}</dd>
        <dt className="font-semibold text-fg-muted">{tDetails("target")}</dt>
        <dd className="text-end font-bold">
          {habit.target ? (
            <bdi dir="auto">{tDetails("targetValue", { amount: format.number(habit.target.amount), unit: habit.target.unit })}</bdi>
          ) : (
            tDetails("none")
          )}
        </dd>
        <dt className="font-semibold text-fg-muted">{tDetails("time")}</dt>
        <dd className="text-end font-bold">
          {[habit.timeOfDay && habit.timeOfDay !== "anytime" ? tDetails(`timeOfDay.${habit.timeOfDay}`) : null, habit.preferredTime ? format.clock(habit.preferredTime) : null]
            .filter(Boolean)
            .join(" · ") || tDetails("anyTime")}
        </dd>
        <dt className="font-semibold text-fg-muted">{tDetails("reminder")}</dt>
        <dd className="text-end font-bold">
          {habit.reminder
            ? habit.reminder.ifNotDone
              ? tDetails("reminderIfNotDone", { time: format.clock(habit.reminder.time) })
              : format.clock(habit.reminder.time)
            : tDetails("off")}
        </dd>
        <dt className="font-semibold text-fg-muted">{tDetails("best")}</dt>
        <dd className="text-end font-bold">{tDetails("bestValue", { count: best, countText: format.number(best) })}</dd>
      </dl>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onArchive}>
          <Archive aria-hidden="true" size={16} />
          {tDetails("archive")}
        </Button>
        <Button variant="secondary" size="sm" onClick={onEdit}>
          <Pencil aria-hidden="true" size={16} />
          {tDetails("edit")}
        </Button>
      </div>
    </div>
  );

  if (daysOfData(habit, today) < RING_MIN_DAYS) {
    return (
      <ProductCard as="section" aria-label={t("tabs")} className="flex flex-col gap-4" data-habit-ring="sparse">
        <p role="status" className="rounded-field bg-subtle p-3 text-sm text-fg-secondary">
          {t("sparse", { days: RING_MIN_DAYS, daysText: format.number(RING_MIN_DAYS) })}
        </p>
        {details}
      </ProductCard>
    );
  }

  const current = index === months.length - 1;
  return (
    <RingCard
      title={t("title")}
      value={Math.round(ratio * 100)}
      max={100}
      displayValue={format.percent(ratio)}
      unit={current ? t("thisMonth") : format.monthName(month.start)}
      ringLabel={t("label", { habit: habit.title, month: format.monthName(month.start) })}
      ringValueText={format.percent(ratio)}
      onPrevious={index > 0 ? () => setSelected(index - 1) : undefined}
      onNext={index < months.length - 1 ? () => setSelected(index + 1) : undefined}
      previousLabel={t("previous")}
      nextLabel={t("next")}
      periods={months.map((entry) => ({
        id: entry.start,
        value: entry.completion.ratio === null ? "–" : format.percent(entry.completion.ratio),
        label: format.monthName(entry.start),
        ariaLabel: t("period", { month: format.monthName(entry.start), value: entry.completion.ratio === null ? t("noData") : format.percent(entry.completion.ratio) }),
      }))}
      selectedPeriod={month.start}
      onPeriodChange={(id) => setSelected(Math.max(0, months.findIndex((entry) => entry.start === id)))}
      periodsLabel={t("periods")}
      historyLabel={t("history")}
      detailsLabel={t("details")}
      tabsLabel={t("tabs")}
      details={details}
    />
  );
}

