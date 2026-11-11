"use client";

import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { ErrorState } from "@/components/feedback/state-views";
import { Button, IconButton } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ProductCard } from "@/design-system/surfaces/product-card";
import type { TeamWeekPlan } from "@/data/team-domain";
import { useTeamPlanActions, useTeamWeekPlan } from "@/data/team-queries";
import { useProjectFormat } from "@/features/projects/format";
import { useTeam } from "../team-gate";
import { TeamPageHeader } from "../team-page-header";
import { PlanBoard } from "./plan-board";
import { addWeeks } from "./planning-model";
import { WeekReview } from "./week-review";

/*
 * TM-04 · Weekly planning (/teams/[id]/planning, weekly mode). Week switch
 * (?week=<Saturday>), the week focus bar (Lead+ edit), and two views:
 * This week (To plan · people columns · plan summary signature card) and
 * Review last week (?tab=review: last week's counts and carry-over
 * decisions). Sprint mode (TM-05) is a separate prompt.
 */

type Tab = "plan" | "review";

export function PlanningScreen() {
  const t = useTranslations("Planning");
  const format = useProjectFormat();
  const { team } = useTeam();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const current = useTeamWeekPlan(team.id);
  const [tab, setTab] = useState<Tab>(params.get("tab") === "review" ? "review" : "plan");
  const [week, setWeekState] = useState<string | null>(params.get("week"));

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const changeTab = (next: Tab) => {
    setTab(next);
    setParam("tab", next === "plan" ? null : next);
  };

  const currentWeek = current.data?.week;
  const shownWeek = week ?? currentWeek;
  const plan = useTeamWeekPlan(team.id, shownWeek);
  const setWeek = (next: string) => {
    setWeekState(next);
    setParam("week", next === currentWeek ? null : next);
  };

  const weekNumber = (value: string) =>
    current.data
      ? current.data.weekNumber + Math.round((Date.parse(value) - Date.parse(current.data.week)) / (7 * 86_400_000))
      : 0;

  const header = (
    <TeamPageHeader
      module="planning"
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        shownWeek ? (
          <div
            role="group"
            aria-label={t("week.label")}
            className="flex items-center gap-1 rounded-pill bg-surface p-1"
          >
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setWeek(addWeeks(shownWeek, -1))}>
              <ChevronLeft aria-hidden size={14} className="rtl:-scale-x-100" />
              {t("week.previous", { n: format.number(weekNumber(addWeeks(shownWeek, -1))) })}
            </Button>
            <span aria-current="date" className="rounded-pill bg-scope-deep px-3 py-2 text-xs font-bold text-on-accent">
              {t("week.current", {
                n: format.number(weekNumber(shownWeek)),
                range: format.range(shownWeek, addDays(shownWeek, 6)),
              })}
            </span>
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setWeek(addWeeks(shownWeek, 1))}>
              {t("week.next", { n: format.number(weekNumber(addWeeks(shownWeek, 1))) })}
              <ChevronRight aria-hidden size={14} className="rtl:-scale-x-100" />
            </Button>
          </div>
        ) : null
      }
    />
  );

  if (current.isError || plan.isError) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => void current.refetch()} />
      </>
    );
  }
  if (!current.data || !plan.data || !shownWeek) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  const lastWeek = addWeeks(current.data.week, -1);
  return (
    <>
      {header}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Tab>
          label={t("tabs.label")}
          value={tab}
          onValueChange={changeTab}
          options={[
            { value: "plan", label: t("tabs.plan") },
            { value: "review", label: t("tabs.review") },
          ]}
        />
      </div>
      {tab === "plan" ? (
        <>
          <WeekFocus plan={plan.data} />
          <PlanBoard
            plan={plan.data}
            weekNumber={weekNumber(shownWeek)}
            lastWeekNumber={weekNumber(lastWeek)}
            onStartFromLastWeek={() => changeTab("review")}
          />
        </>
      ) : (
        <WeekReview week={lastWeek} weekNumber={weekNumber(lastWeek)} thisWeekNumber={current.data.weekNumber} />
      )}
    </>
  );
}

const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Week focus (Lead+ edit, everyone reads it). */
function WeekFocus({ plan }: { plan: TeamWeekPlan }) {
  const t = useTranslations("Planning");
  const { team, capabilities } = useTeam();
  const actions = useTeamPlanActions(team.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const list = plan.focus.join(" · ");

  return (
    <ProductCard
      as="section"
      aria-labelledby="plan-focus"
      padding="compact"
      className="flex-row flex-wrap items-center gap-x-4 gap-y-2"
    >
      <h2 id="plan-focus" className="text-xs font-bold tracking-wide text-scope-deep uppercase">
        {t("focus")}
      </h2>
      {editing ? (
        <form
          className="flex min-w-0 flex-1 flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            actions.setFocus.mutate(
              { week: plan.week, focus: draft.split("\n") },
              {
                onSuccess: () => {
                  toast({ title: t("toast.focusSaved") });
                  setEditing(false);
                },
                onError: () => toast({ title: t("toast.failed"), tone: "danger" }),
              },
            );
          }}
        >
          <Textarea
            dir="auto"
            aria-label={t("focus")}
            aria-describedby="plan-focus-hint"
            value={draft}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
          />
          <p id="plan-focus-hint" className="text-xs text-fg-secondary">
            {t("focusHint")}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={actions.setFocus.isPending}>
              {t("save")}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p className="min-w-0 flex-1 text-sm font-semibold text-fg">
            {list ? <bdi>{list}</bdi> : <span className="text-fg-muted">{t("focusEmpty")}</span>}
          </p>
          {plan.focusBy ? (
            <span className="text-xs font-medium text-fg-secondary">{t("focusBy", { name: plan.focusBy.name })}</span>
          ) : null}
          {capabilities.editWeekFocus ? (
            <IconButton
              icon={Pencil}
              size="sm"
              variant="ghost"
              label={t("editFocus")}
              onClick={() => {
                setDraft(plan.focus.join("\n"));
                setEditing(true);
              }}
            />
          ) : null}
        </>
      )}
    </ProductCard>
  );
}
