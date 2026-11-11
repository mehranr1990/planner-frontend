"use client";

import { ArrowRight, Plus, RefreshCw, Target } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { getPlannerToday } from "@/data/clock";
import type { Goal } from "@/data/domain";
import type { TeamGoal, TeamGoalPeriod, TeamKeyResult } from "@/data/team-domain";
import { useTeamGoalActions, useTeamGoals } from "@/data/team-queries";
import { GoalList } from "@/features/goals/goal-list";
import { ResultsPanel } from "@/features/goals/goal-panels";
import { teamHref } from "@/features/navigation/contexts";
import { useProjectFormat } from "@/features/projects/format";
import { cn } from "@/lib/cn";
import { teamDemoAccessOptions } from "../demo-state";
import { SourceChip } from "../source-chip";
import { useTeam } from "../team-gate";
import { TeamPageHeader } from "../team-page-header";

/*
 * TM-07 · Team goals (/teams/[id]/goals?goal=…&period=…): Personal Goals
 * (P11) list and key-result panel with the team scope (indigo), through
 * small seams (link target, note line, KR value/source line). Key results:
 * auto (team tasks tagged), linked task (follows its status) or manual
 * (who/when). Pace chip compares progress with the expected share by date
 * (amber/rose only when behind). Linked work counts only what the viewer can
 * see. Notch: Update progress (manual KRs the viewer may update), else Open
 * linked work. Personal goals never appear here.
 */

const PACE_CLASS: Record<TeamGoal["pace"], string> = {
  "on-pace": "bg-raised text-fg",
  "slightly-behind": "bg-warning-soft text-warning-text",
  behind: "bg-danger-soft text-danger-text",
};

/** A team goal in the Personal list's shape (meta line = owner · period). */
function asListGoal(goal: TeamGoal, meta: string): Goal {
  return {
    id: goal.id,
    title: goal.title,
    progress: goal.progress,
    status: goal.pace === "on-pace" ? "on-track" : "behind",
    nextStep: null,
    nextStepDay: null,
    lifecycle: goal.progress >= 1 ? "completed" : "active",
    area: meta,
    dueDay: null,
    keyResults: goal.keyResults.map(({ id, title, current, target }) => ({ id, title, current, target })),
  };
}

export function TeamGoalsScreen() {
  const t = useTranslations("TeamGoals");
  const format = useProjectFormat();
  const { team, capabilities, demo } = useTeam();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const goals = useTeamGoals(team.id, teamDemoAccessOptions(demo));
  const [periodState, setPeriodState] = useState<string | null>(params.get("period"));
  const [creating, setCreating] = useState(false);
  const periodLabel = (period: TeamGoalPeriod) =>
    t("period", { quarter: format.number(period.quarter), year: format.number(period.year) });

  const header = (selected: string | null) => (
    <TeamPageHeader
      module="goals"
      title={t("title")}
      actions={
        <>
          {goals.data && selected ? (
            <Segmented<string>
              label={t("periods")}
              value={selected}
              onValueChange={(next) => {
                setPeriodState(next);
                const search = new URLSearchParams(params.toString());
                search.set("period", next);
                search.delete("goal");
                router.replace(`${pathname}?${search.toString()}`, { scroll: false });
              }}
              options={[
                ...goals.data.periods.map((period) => ({ value: period.id, label: periodLabel(period) })),
                { value: "all", label: t("all") },
              ]}
            />
          ) : null}
          {capabilities.editAnyTask ? (
            <Button className="gap-2" onClick={() => setCreating(true)}>
              <Icon icon={Plus} size={16} />
              {t("newGoal")}
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (goals.isError) {
    return (
      <>
        {header(null)}
        <ErrorState onRetry={() => void goals.refetch()} />
      </>
    );
  }
  if (!goals.data) {
    return (
      <>
        {header(null)}
        <AccessLoading />
      </>
    );
  }

  const period = periodState ?? goals.data.current;
  const shown = goals.data.goals.filter((goal) => period === "all" || goal.period.id === period);
  const selected = shown.find((goal) => goal.id === params.get("goal")) ?? shown[0] ?? null;
  const hrefOf = (id: string) => {
    const search = new URLSearchParams(params.toString());
    search.set("goal", id);
    return `${pathname}?${search.toString()}`;
  };
  const currentPeriod = goals.data.periods.find((item) => item.id === goals.data.current)!;

  return (
    <>
      {header(period)}
      {shown.length === 0 ? (
        <EmptyState icon={Target} title={t("empty")} description={null} />
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:items-start">
          <GoalList
            goals={shown.map((goal) =>
              asListGoal(goal, t("listMeta", { owner: goal.owner.name, period: periodLabel(goal.period) })),
            )}
            selectedId={selected?.id ?? null}
            today={getPlannerToday()}
            hrefOf={hrefOf}
            noteOf={(goal) => t("krCount", { n: goal.keyResults?.length ?? 0 })}
          />
          {selected ? (
            <GoalDetailCard goal={selected} periodLabel={periodLabel(selected.period)} />
          ) : (
            <p>{t("pick")}</p>
          )}
        </div>
      )}
      <NewGoalDialog
        open={creating}
        onOpenChange={setCreating}
        periodId={currentPeriod.id}
        dueDay={shown[0]?.dueDay ?? getPlannerToday()}
      />
    </>
  );
}

function GoalDetailCard({ goal, periodLabel }: { goal: TeamGoal; periodLabel: string }) {
  const t = useTranslations("TeamGoals");
  const tStatus = useTranslations("TeamWork.status");
  const format = useProjectFormat();
  const router = useRouter();
  const { team } = useTeam();
  const [updating, setUpdating] = useState(false);
  const manual = goal.keyResults.filter((kr) => kr.canUpdate);
  const action = manual.length ? (
    <SignatureCardAction icon={RefreshCw} label={t("update")} onClick={() => setUpdating(true)} />
  ) : (
    <SignatureCardAction
      icon={ArrowRight}
      mirror
      label={t("openLinked")}
      onClick={() => router.push(teamHref(team.id, "work"))}
    />
  );
  const byId = new Map(goal.keyResults.map((kr) => [kr.id, kr]));
  const sourceLine = (kr: TeamKeyResult) => {
    const { source } = kr;
    if (source.kind === "auto") return t("source.auto", { tag: source.tag });
    if (source.kind === "task") return t("source.task", { title: source.taskTitle });
    return source.updatedBy && source.updatedAt
      ? t("source.manual", { name: source.updatedBy.name, when: format.relative(source.updatedAt) })
      : t("source.manualNever");
  };

  return (
    <SignatureCard action={action} as="section" aria-labelledby="team-goal-title" contentClassName="gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-bold tracking-wide text-scope-deep uppercase">
          {t("kicker", { period: periodLabel })}
        </p>
        <h2 id="team-goal-title" className="type-title text-fg">
          <bdi>{goal.title}</bdi>
        </h2>
        <p className="text-xs font-medium text-fg-secondary">
          {t("owner", { name: goal.owner.name, date: format.day(goal.dueDay) })}
        </p>
      </div>
      <p className="flex flex-wrap items-center gap-3">
        <span className="text-5xl font-bold text-fg tabular">{format.percent(goal.progress * 100)}</span>
        <span
          className={cn("rounded-pill px-2.5 py-1 text-xs font-bold", PACE_CLASS[goal.pace])}
          aria-label={t("pace.label", { pace: t(`pace.${goal.pace}`), expected: format.percent(goal.expected * 100) })}
        >
          {t(`pace.${goal.pace}`)}
        </span>
      </p>
      <section aria-label={t("results")}>
        <ResultsPanel
          goal={asListGoal(goal, "")}
          detailOf={(result) => {
            const kr = byId.get(result.id);
            if (!kr) return undefined;
            return {
              ...(kr.source.kind === "task" ? { value: tStatus(kr.source.status) } : {}),
              source: sourceLine(kr),
            };
          }}
        />
      </section>
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-bold tracking-wide text-fg-secondary uppercase">{t("linked")}</h3>
        {goal.linked.team || goal.linked.projects.length ? (
          <ul className="flex flex-wrap items-center gap-2">
            {goal.linked.team ? (
              <li className="flex items-center gap-1.5">
                <SourceChip source={{ kind: "team" }} />
                <span className="rounded-pill bg-raised px-2.5 py-0.5 text-xs font-semibold text-fg">
                  {t("linkedTasks", { n: goal.linked.team })}
                </span>
              </li>
            ) : null}
            {goal.linked.projects.map((link) => (
              <li key={link.projectId} className="flex items-center gap-1.5">
                <SourceChip source={{ kind: "project", projectId: link.projectId, projectName: link.projectName }} />
                <span className="rounded-pill bg-raised px-2.5 py-0.5 text-xs font-semibold text-fg">
                  {t("linkedTasks", { n: link.count })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">{t("noLinked")}</p>
        )}
      </div>
      <UpdateProgressDialog goal={goal} manual={manual} open={updating} onOpenChange={setUpdating} />
    </SignatureCard>
  );
}

function UpdateProgressDialog({
  goal,
  manual,
  open,
  onOpenChange,
}: {
  goal: TeamGoal;
  manual: readonly TeamKeyResult[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("TeamGoals");
  const format = useProjectFormat();
  const { team } = useTeam();
  const { update } = useTeamGoalActions(team.id);
  const [values, setValues] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setValues(Object.fromEntries(manual.map((kr) => [kr.id, String(kr.current)])));
        setFailed(false);
        onOpenChange(next);
      }}
    >
      <DialogContent title={t("update")} description={t("updateDialog.body")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const numbers = Object.fromEntries(manual.map((kr) => [kr.id, Number(values[kr.id] ?? kr.current)]));
            update.mutate(
              { goalId: goal.id, values: numbers },
              {
                onSuccess: () => {
                  toast({ title: t("updateDialog.saved") });
                  onOpenChange(false);
                },
                onError: () => setFailed(true),
              },
            );
          }}
        >
          {manual.map((kr) => (
            <Field key={kr.id}>
              <FieldLabel>{kr.title}</FieldLabel>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                dir="ltr"
                value={values[kr.id] ?? String(kr.current)}
                onChange={(event) => setValues((current) => ({ ...current, [kr.id]: event.target.value }))}
              />
              <FieldDescription>{t("updateDialog.of", { target: format.number(kr.target) })}</FieldDescription>
            </Field>
          ))}
          {failed ? <InlineAlert tone="danger" title={t("updateDialog.failed")} /> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              {t("updateDialog.cancel")}
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {t("updateDialog.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewGoalDialog({
  open,
  onOpenChange,
  periodId,
  dueDay,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodId: string;
  dueDay: string;
}) {
  const t = useTranslations("TeamGoals");
  const format = useProjectFormat();
  const { team } = useTeam();
  const { create } = useTeamGoalActions(team.id);
  const [title, setTitle] = useState("");
  const [touched, setTouched] = useState(false);
  const [failed, setFailed] = useState(false);
  const error = touched && !title.trim() ? t("newDialog.titleRequired") : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("newGoal")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (!title.trim()) return;
            create.mutate(
              { title, periodId, dueDay },
              {
                onSuccess: () => {
                  toast({ title: t("newDialog.created") });
                  setTitle("");
                  setTouched(false);
                  onOpenChange(false);
                },
                onError: () => setFailed(true),
              },
            );
          }}
        >
          <Field invalid={error !== null}>
            <FieldLabel>{t("newDialog.name")}</FieldLabel>
            <Input
              dir="auto"
              value={title}
              maxLength={80}
              onChange={(event) => setTitle(event.target.value)}
              autoFocus
            />
            {error ? <FieldError>{error}</FieldError> : null}
            <FieldDescription>{t("newDialog.due", { date: format.day(dueDay) })}</FieldDescription>
          </Field>
          {failed ? <InlineAlert tone="danger" title={t("updateDialog.failed")} /> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              {t("updateDialog.cancel")}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {t("newDialog.create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
