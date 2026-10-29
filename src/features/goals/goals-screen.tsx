"use client";

import { Plus, Target } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { PillGroup } from "@/components/ui/pills";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsDesktop } from "@/components/ui/use-is-desktop";
import { useGoal, useGoalList } from "@/data/queries";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { usePlannerNow } from "@/features/my-day/my-day-context";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { useOpenSheet } from "@/features/sheets/sheet-params";
import { cn } from "@/lib/cn";
import { activeList, completedList, type GoalListTab } from "./domain/goals";
import { GoalDetail } from "./goal-detail";
import { GoalList } from "./goal-list";
import { GOAL_SHEET_TITLE_PARAM } from "./goal-sheet";

/*
 * P11 · Goals (/personal/goals[/:id]). Desktop: the list (product cards,
 * Active · Completed · Archived pills) beside the selected goal; without an
 * id the first goal of the list is shown. Phones: the list on
 * /personal/goals, the goal alone on /personal/goals/:id (with a back
 * link). "New goal" opens the Goal sheet (?sheet=goal, P18 · C).
 */

const GOALS_HREF = "/personal/goals";
const EXAMPLES = ["example1", "example2", "example3"] as const;

export function GoalsScreen({ goalId }: { goalId: string | null }) {
  const t = useTranslations("Goals");
  const format = useMyDayFormat();
  const { day: today } = usePlannerNow();
  const openSheet = useOpenSheet();
  const desktop = useIsDesktop();
  const [listTab, setListTab] = useState<GoalListTab>("active");

  const active = useGoalList("active");
  const completed = useGoalList("completed");
  const archived = useGoalList("archived");
  const lists = {
    active: activeList(active.data ?? [], completed.data ?? [], today),
    completed: completedList(completed.data ?? [], today),
    archived: archived.data ?? [],
  };
  const visible = lists[listTab];
  const pending = active.isPending || completed.isPending || archived.isPending;
  const error = active.isError || completed.isError || archived.isError;
  const none = !pending && !error && lists.active.length + lists.completed.length + lists.archived.length === 0;

  const selectedId = goalId ?? (desktop ? (visible[0]?.id ?? null) : null);
  const selected = useGoal(selectedId);
  const retry = () => void Promise.all([active.refetch(), completed.refetch(), archived.refetch()]);

  return (
    <div className="flex flex-col gap-5" data-screen="goals">
      <PageHeader
        title={t("title")}
        subtitle={t("kicker", { countText: format.number(active.data?.length ?? 0) })}
        subtitlePlacement="above"
        className={cn(goalId && "max-lg:sr-only")}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {none ? null : (
              <PillGroup
                variant="filled"
                label={t("lists.label")}
                value={listTab}
                onValueChange={setListTab}
                options={(["active", "completed", "archived"] as const).map((value) => ({
                  value,
                  label: t(`lists.${value}`),
                  count: value === "archived" ? undefined : pending ? undefined : lists[value].length,
                }))}
              />
            )}
            <Button onClick={() => openSheet("goal")}>
              <Plus aria-hidden="true" size={18} />
              {t("new")}
            </Button>
          </div>
        }
      />

      {error ? (
        <UtilityCard role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-fg-secondary">{t("detail.error")}</p>
          <Button variant="secondary" size="sm" onClick={retry}>
            {t("detail.retry")}
          </Button>
        </UtilityCard>
      ) : none ? (
        <EmptyGoals onCreate={(title) => openSheet("goal", title ? { [GOAL_SHEET_TITLE_PARAM]: title } : undefined)} />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
          <div className={cn("flex flex-col gap-3", goalId && "max-lg:hidden")}>
            {pending ? (
              <div className="flex flex-col gap-3" aria-busy="true">
                {[0, 1, 2].map((key) => (
                  <Skeleton key={key} className="h-28 rounded-card" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <UtilityCard role="status" className="text-sm text-fg-secondary">
                {listTab === "completed" ? t("list.emptyCompleted") : t("list.emptyArchived")}
              </UtilityCard>
            ) : (
              <GoalList goals={visible} selectedId={selectedId} today={today} />
            )}
          </div>
          <div className={cn("min-w-0", !goalId && "max-lg:hidden")}>
            {selectedId === null ? (
              pending ? null : (
                <UtilityCard className="text-sm text-fg-secondary">{t("detail.pick")}</UtilityCard>
              )
            ) : selected.isPending ? (
              <Skeleton className="h-96 rounded-signature" aria-busy="true" />
            ) : selected.data ? (
              <GoalDetail goal={selected.data} today={today} backHref={GOALS_HREF} />
            ) : (
              <UtilityCard role="status" className="flex flex-col items-start gap-3 text-sm text-fg-secondary">
                {selected.isError ? t("detail.error") : t("detail.notFound")}
              </UtilityCard>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyGoals({ onCreate }: { onCreate(title?: string): void }) {
  const t = useTranslations("Goals.empty");
  const [examples, setExamples] = useState(false);
  return (
    <UtilityCard as="section" aria-labelledby="goals-empty-title" className="flex flex-col items-center gap-3 py-12 text-center" data-goals-empty>
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-surface text-fg">
        <Target size={24} />
      </span>
      <h2 id="goals-empty-title" className="text-lg font-bold text-fg">
        {t("title")}
      </h2>
      <p className="max-w-sm text-sm text-fg-secondary">{t("body")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => onCreate()}>{t("create")}</Button>
        <Button variant="secondary" aria-expanded={examples} onClick={() => setExamples((open) => !open)}>
          {t("examples")}
        </Button>
      </div>
      {examples ? (
        <ul aria-label={t("examplesLabel")} className="flex flex-wrap justify-center gap-2">
          {EXAMPLES.map((key) => (
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
