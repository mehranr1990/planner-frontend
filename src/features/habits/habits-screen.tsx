"use client";

import { Plus, RefreshCw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsDesktop } from "@/components/ui/use-is-desktop";
import { useHabits } from "@/data/queries";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { usePlannerNow } from "@/features/my-day/my-day-context";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { useOpenSheet } from "@/features/sheets/sheet-params";
import { FIELD_PERIODS, isDoneOn, isFieldPeriod, type FieldPeriod } from "./domain/habits";
import { HabitFieldCard } from "./habit-field-card";
import { HABIT_SHEET_PARAM, HABIT_SHEET_TITLE_PARAM } from "./habit-sheet";
import { SelectedHabit } from "./selected-habit";
import { TodayTile } from "./today-tile";
import { useHabitActions } from "./use-habit-actions";

/*
 * P12 · Habits (/personal/habits[/:id], ?period=14d|month|year). Track →
 * understand → continue: the Today row first (fast check-in), then the
 * Habit Field (consistency), then one selected habit (signature head, Streak
 * Ribbon, RingCard). Without an id the pinned (else first) habit is
 * selected; clicking a row name selects it. "New habit" opens the Habit
 * sheet (?sheet=habit, P18 · B). No analytics here: correlations live in
 * Insights.
 */

const HABITS_HREF = "/personal/habits";
export const PERIOD_PARAM = "period";
const IDEAS = ["idea1", "idea2", "idea3", "idea4"] as const;

export function HabitsScreen({ habitId }: { habitId: string | null }) {
  const t = useTranslations("Habits");
  const format = useMyDayFormat();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openSheet = useOpenSheet();
  const desktop = useIsDesktop();
  const { day: today } = usePlannerNow();
  const actions = useHabitActions(today);
  const query = useHabits();

  const periodParam = params.get(PERIOD_PARAM);
  const period: FieldPeriod = isFieldPeriod(periodParam) ? periodParam : "14d";
  const habits = query.data ?? [];
  const doneToday = habits.filter((habit) => isDoneOn(habit, today)).length;
  const selected = habits.find((habit) => habit.id === habitId) ?? habits.find((habit) => habit.pinned) ?? habits[0] ?? null;
  const missing = habitId !== null && query.isSuccess && !habits.some((habit) => habit.id === habitId);

  const hrefWith = (path: string, nextPeriod: FieldPeriod) => {
    const search = new URLSearchParams(params.toString());
    if (nextPeriod === "14d") search.delete(PERIOD_PARAM);
    else search.set(PERIOD_PARAM, nextPeriod);
    const text = search.toString();
    return text ? `${path}?${text}` : path;
  };
  const select = (id: string) => router.replace(hrefWith(`${HABITS_HREF}/${encodeURIComponent(id)}`, period), { scroll: false });

  return (
    <div className="flex flex-col gap-5" data-screen="habits">
      <PageHeader
        title={t("title")}
        subtitle={
          query.data && habits.length
            ? t("kicker", { done: doneToday, doneText: format.number(doneToday), totalText: format.number(habits.length) })
            : t("personal")
        }
        subtitlePlacement="above"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {habits.length ? (
              <Segmented
                variant="accent"
                label={t("period.label")}
                value={period}
                onValueChange={(next) => router.replace(hrefWith(pathname, next), { scroll: false })}
                options={FIELD_PERIODS.map((value) => ({ value, label: t(`period.${value}`) }))}
              />
            ) : null}
            <Button onClick={() => openSheet("habit")}>
              <Plus aria-hidden="true" size={18} />
              {t("new")}
            </Button>
          </div>
        }
      />

      {query.isPending ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[0, 1, 2, 3, 4].map((key) => (
              <Skeleton key={key} className="h-26 rounded-card" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-card" />
        </div>
      ) : query.isError ? (
        <UtilityCard role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-fg-secondary">{t("error")}</p>
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            {t("retry")}
          </Button>
        </UtilityCard>
      ) : habits.length === 0 ? (
        <EmptyHabits onCreate={(title) => openSheet("habit", title ? { [HABIT_SHEET_TITLE_PARAM]: title } : undefined)} />
      ) : (
        <>
          {missing ? (
            <UtilityCard role="status" className="text-sm text-fg-secondary">
              {t("selected.notFound")}
            </UtilityCard>
          ) : null}
          <section aria-labelledby="habits-today-title">
            <h2 id="habits-today-title" className="sr-only">
              {t("today.label")}
            </h2>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              {habits.map((habit) => (
                <TodayTile
                  key={habit.id}
                  habit={habit}
                  today={today}
                  selected={habit.id === selected?.id}
                  actions={{
                    onToggle: (item, done) => actions.toggle(item, today, done),
                    onMark: (item, mark) => actions.mark(item, today, mark),
                    onLog: (item, amount) => actions.log(item, today, amount),
                  }}
                />
              ))}
            </ul>
          </section>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
            <HabitFieldCard
              habits={habits}
              today={today}
              period={period}
              compact={!desktop}
              selectedId={selected?.id ?? null}
              onSelect={select}
              onToggle={(habit, day, done) => actions.toggle(habit, day, done)}
              onSkip={(habit, day) => actions.mark(habit, day, habit.skippedDays?.includes(day) ? null : "skip")}
            />
            {selected ? (
              <SelectedHabit
                habit={selected}
                today={today}
                compact={!desktop}
                onToggleToday={(done) => actions.toggle(selected, today, done)}
                onEdit={() => openSheet("habit", { [HABIT_SHEET_PARAM]: selected.id })}
                onArchive={() => actions.archive(selected, () => router.replace(hrefWith(HABITS_HREF, period), { scroll: false }))}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyHabits({ onCreate }: { onCreate(title?: string): void }) {
  const t = useTranslations("Habits.empty");
  const [ideas, setIdeas] = useState(false);
  return (
    <UtilityCard as="section" aria-labelledby="habits-empty-title" className="flex flex-col items-center gap-3 py-12 text-center" data-habits-empty>
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-surface text-fg">
        <RefreshCw size={24} />
      </span>
      <h2 id="habits-empty-title" className="text-lg font-bold text-fg">
        {t("title")}
      </h2>
      <p className="max-w-sm text-sm text-fg-secondary">{t("body")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => onCreate()}>{t("create")}</Button>
        <Button variant="secondary" aria-expanded={ideas} onClick={() => setIdeas((open) => !open)}>
          {t("ideas")}
        </Button>
      </div>
      {ideas ? (
        <ul aria-label={t("ideasLabel")} className="flex flex-wrap justify-center gap-2">
          {IDEAS.map((key) => (
            <li key={key}>
              <Button variant="outline" size="sm" onClick={() => onCreate(t(key))}>
                {t(key)}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </UtilityCard>
  );
}
