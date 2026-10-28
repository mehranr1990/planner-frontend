"use client";

import { Flag, Link2, Plus, Unlink } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Direction } from "radix-ui";
import { useState, type FormEvent } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useIsDesktop } from "@/components/ui/use-is-desktop";
import type { Goal, GoalMilestone } from "@/data/domain";
import {
  useAddMilestone,
  useCreateTask,
  useGoalTasks,
  useHabits,
  useRemoveTasks,
  useSetMilestoneDone,
  useSetTaskDone,
  useTasks,
  useUpdateGoal,
  useUpdateTask,
} from "@/data/queries";
import { GoalMilestonePath, type MilestonePathNode } from "@/design-system/data-display/goal-milestone-path";
import { Progress } from "@/design-system/feedback/progress";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { habitStreak } from "@/features/overview/domain/habits";
import { isModuleVisible } from "@/features/planner-settings/planner-settings";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { usePreferences } from "@/features/preferences/use-preferences";
import { TASKS_HREF, taskDetailHref } from "@/features/personal/routes";
import { TaskCheck } from "@/features/tasks/list/task-parts";
import { taskWhen } from "@/features/tasks/domain/when";
import { useTasksFormat } from "@/features/tasks/ui/use-tasks-format";
import { cn } from "@/lib/cn";
import { formatCompactMoney } from "@/lib/locale/money";
import { currentMilestone, daysLeft, hasMilestones, isDelayed, isReached, lateDays, milestoneState, nextMilestone, planStepTitle } from "./domain/goals";

/*
 * The four P11 folder-tab panels of the selected goal. Journey: the Goal
 * Milestone Path (or number + bar for a goal without milestones) and one
 * card under it — next milestone with "Plan next step", the Delayed
 * suggestion, or Completed. Key results: plain bars. Linked: tasks (open
 * first), habits with a streak chip, the optional money target (amber, the
 * Finance colour). Notes: free text.
 */

const sectionLabel = "text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-fg-muted";

// ── Journey ─────────────────────────────────────────────────────────────

export function JourneyPanel({ goal, today, onEdit }: { goal: Goal; today: string; onEdit(): void }) {
  const t = useTranslations("Goals.journey");
  const format = useMyDayFormat();
  const direction = Direction.useDirection() === "rtl" ? "rtl" : "ltr";
  const desktop = useIsDesktop();
  const settings = usePlannerSettings();
  const setDone = useSetMilestoneDone();
  const current = currentMilestone(goal);
  const [selectedId, setSelectedId] = useState<string | null>(current?.id ?? null);
  const [inserting, setInserting] = useState<number | null>(null);
  const milestones = goal.milestones ?? [];
  const reached = isReached(goal);

  const statusOf = (milestone: GoalMilestone): MilestonePathNode => {
    const state = milestoneState(goal, milestone, today);
    const late = lateDays(goal, today);
    const status =
      state === "done"
        ? t("done")
        : state === "late"
          ? t("behind", { days: late, daysText: format.number(late) })
          : state === "current"
            ? t("inProgress", { percent: format.percent(goal.progress) })
            : milestone.dueDay
              ? t("next", { date: format.dayMonth(milestone.dueDay) })
              : t("nextNoDate");
    const detail = milestone.doneDay
      ? t("detailDone", { date: format.dayMonth(milestone.doneDay) })
      : milestone.dueDay && milestone.nextAction
        ? t("detailNext", { date: format.dayMonth(milestone.dueDay), action: milestone.nextAction })
        : milestone.dueDay
          ? t("detailDue", { date: format.dayMonth(milestone.dueDay) })
          : milestone.nextAction;
    return { id: milestone.id, label: milestone.title, status, state, detail };
  };

  const goalNode = {
    label: goal.title,
    reached,
    status: reached ? t("reached") : goal.dueDay ? t("goal", { date: format.dayMonth(goal.dueDay) }) : t("goalNoDate"),
  };
  const selectedMilestone = milestones.find((item) => item.id === selectedId) ?? null;

  const body = hasMilestones(goal) ? (
    <>
      <GoalMilestonePath
        nodes={milestones.map(statusOf)}
        goal={goalNode}
        label={t("pathLabel", { title: goal.title })}
        direction={direction}
        orientation={desktop ? "horizontal" : "vertical"}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onInsert={desktop ? setInserting : undefined}
        insertLabel={(index) => t("insert", { position: format.number(index + 1) })}
      />
      <div className="flex flex-wrap items-center gap-2">
        {!desktop ? (
          <Button variant="ghost" size="sm" onClick={() => setInserting(milestones.length)}>
            <Plus aria-hidden="true" size={16} />
            {t("addMilestone")}
          </Button>
        ) : null}
        {selectedMilestone && !reached ? (
          <Button
            variant="ghost"
            size="sm"
            loading={setDone.isPending}
            onClick={() => setDone.mutate({ goalId: goal.id, milestoneId: selectedMilestone.id, done: !selectedMilestone.doneDay })}
          >
            {selectedMilestone.doneDay ? t("reopen", { title: selectedMilestone.title }) : t("markDone", { title: selectedMilestone.title })}
          </Button>
        ) : null}
      </div>
    </>
  ) : goal.measure ? (
    <UtilityCard className="flex flex-col gap-3" data-goal-simple>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="tabular text-4xl font-semibold text-fg">{format.number(goal.measure.current)}</span>
        <span className="text-sm text-fg-secondary">
          {t("simple", { target: format.number(goal.measure.target), unit: goal.measure.unit })}
          <DaysLeft goal={goal} today={today} prefix=" · " />
        </span>
      </p>
      <Progress value={goal.progress * 100} label={goal.title} valueText={format.percent(goal.progress)} />
      <p className="text-xs text-fg-muted">{t("simpleNote")}</p>
    </UtilityCard>
  ) : (
    <GoalMilestonePath
      nodes={[]}
      goal={goalNode}
      label={t("pathLabel", { title: goal.title })}
      direction={direction}
      empty={
        <>
          <p className="text-[0.9375rem] font-semibold text-fg">{t("first")}</p>
          <Button size="sm" onClick={() => setInserting(0)}>
            {t("addMilestone")}
          </Button>
        </>
      }
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {body}
      {inserting !== null ? <AddMilestoneForm goal={goal} index={inserting} onDone={() => setInserting(null)} /> : null}
      {reached ? (
        <UtilityCard className="flex flex-col gap-1.5 bg-success-soft" data-goal-state="completed">
          <p className="font-bold text-success-text">{t("completedTitle", { percent: format.percent(1) })}</p>
          <p className="text-sm text-success-text">{t("completedBody")}</p>
          {isModuleVisible(settings, "journal") ? (
            <Link href="/personal/journal" className="self-start text-sm font-bold text-success-text underline underline-offset-4 focus-visible:focus-ring">
              {t("reflect")}
            </Link>
          ) : null}
        </UtilityCard>
      ) : hasMilestones(goal) ? (
        <NextStepCard goal={goal} today={today} onEdit={onEdit} />
      ) : null}
    </div>
  );
}

function DaysLeft({ goal, today, prefix = "" }: { goal: Goal; today: string; prefix?: string }) {
  const t = useTranslations("Goals.detail");
  const format = useMyDayFormat();
  const left = daysLeft(goal, today);
  if (left === null) return null;
  const days = Math.abs(left);
  return (
    <>
      {prefix}
      {left >= 0 ? t("daysLeft", { days, daysText: format.number(days) }) : t("overdue", { days, daysText: format.number(days) })}
    </>
  );
}

function AddMilestoneForm({ goal, index, onDone }: { goal: Goal; index: number; onDone(): void }) {
  const t = useTranslations("Goals.journey");
  const add = useAddMilestone();
  const [title, setTitle] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || add.isPending) return;
    add.mutate({ goalId: goal.id, title, dueDay: null, index }, { onSuccess: onDone });
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 rounded-field bg-subtle p-2" data-add-milestone={index}>
      <Input
        aria-label={t("addMilestoneLabel")}
        placeholder={t("addMilestonePlaceholder")}
        value={title}
        dir="auto"
        autoFocus
        className="min-w-40 flex-1"
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onDone();
        }}
      />
      <Button type="button" variant="ghost" size="sm" onClick={onDone}>
        {t("cancel")}
      </Button>
      <Button type="submit" size="sm" loading={add.isPending}>
        {t("add")}
      </Button>
    </form>
  );
}

/** Under the path: the milestone to plan for — the late one when the goal is behind, else the next one. */
function NextStepCard({ goal, today, onEdit }: { goal: Goal; today: string; onEdit(): void }) {
  const t = useTranslations("Goals.journey");
  const tDetail = useTranslations("Goals.detail");
  const format = useMyDayFormat();
  const tasks = useGoalTasks(goal.id);
  const create = useCreateTask();
  const remove = useRemoveTasks();
  const delayed = isDelayed(goal, today);
  const target = delayed ? currentMilestone(goal) : nextMilestone(goal);
  if (!target) return null;
  const open = (tasks.data ?? []).filter((task) => task.status === "open").length;
  const late = lateDays(goal, today);

  const plan = async () => {
    const title = planStepTitle(target);
    try {
      const task = await create.mutateAsync({ title, goalId: goal.id, deadline: target.dueDay, source: "manual" });
      toast({
        tone: "success",
        title: t("planned", { title }),
        action: {
          label: tDetail("undo"),
          altText: t("plannedUndone"),
          onClick: () => void remove.mutateAsync({ ids: [task.id] }).then(() => toast({ tone: "neutral", title: t("plannedUndone") })),
        },
      });
    } catch {
      toast({ tone: "danger", title: tDetail("error") });
    }
  };

  return (
    <UtilityCard className="flex flex-wrap items-center gap-3" data-goal-state={delayed ? "delayed" : "on-track"}>
      <span
        aria-hidden="true"
        className={cn("grid size-9 shrink-0 place-items-center rounded-full", delayed ? "bg-warning-soft text-warning-text" : "bg-scope-soft text-scope-deep")}
      >
        <Flag size={16} />
      </span>
      <div className="min-w-0 flex-1">
        {delayed ? (
          <>
            <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-fg">
              <span className="rounded-pill bg-warning-soft px-2 py-0.5 text-xs font-bold text-warning-text">
                {t("behind", { days: late, daysText: format.number(late) })}
              </span>
              <bdi dir="auto">{target.title}</bdi>
            </p>
            {target.nextAction ? (
              <p className="mt-1 text-xs text-fg-secondary">{t.rich("delayedSuggestion", { action: () => <bdi dir="auto">{target.nextAction}</bdi> })}</p>
            ) : null}
          </>
        ) : (
          <>
            <p className="truncate text-sm font-bold text-fg">{t.rich("nextMilestone", { title: () => <bdi dir="auto">{target.title}</bdi> })}</p>
            <p className="text-xs text-fg-secondary">
              {[
                target.dueDay ? format.dayMonth(target.dueDay) : null,
                tasks.data ? t("tasksLeft", { count: open, countText: format.number(open) }) : null,
                tDetail("onTrack"),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {delayed ? (
          <Button variant="secondary" size="sm" onClick={onEdit}>
            {t("adjustDeadline")}
          </Button>
        ) : null}
        <Button size="sm" loading={create.isPending} onClick={() => void plan()}>
          {t("planNext")}
        </Button>
      </div>
    </UtilityCard>
  );
}

// ── Key results ─────────────────────────────────────────────────────────

export function ResultsPanel({ goal }: { goal: Goal }) {
  const t = useTranslations("Goals.results");
  const format = useMyDayFormat();
  const results = goal.keyResults ?? [];
  if (!results.length) return <p className="py-6 text-center text-sm text-fg-muted">{t("empty")}</p>;
  return (
    <ul aria-label={t("label")} className="flex flex-col gap-4">
      {results.map((result) => {
        const ratio = result.target > 0 ? Math.min(1, result.current / result.target) : 0;
        const unit = result.unit ?? "";
        const value = t("value", { current: `${format.number(result.current)}${unit}`, target: `${format.number(result.target)}${unit}` });
        return (
          <li key={result.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-semibold text-fg">
                <bdi dir="auto">{result.title}</bdi>
              </span>
              <span className="tabular shrink-0 text-sm font-semibold text-fg-secondary">{value}</span>
            </div>
            <Progress size="sm" value={ratio * 100} label={result.title} valueText={value} />
          </li>
        );
      })}
    </ul>
  );
}

// ── Linked ──────────────────────────────────────────────────────────────

export function LinkedPanel({ goal, today }: { goal: Goal; today: string }) {
  const t = useTranslations("Goals.linked");
  const format = useTasksFormat();
  const settings = usePlannerSettings();
  const { currency, digits, locale } = usePreferences();
  const linked = useGoalTasks(goal.id);
  const openTasks = useTasks({ status: "open" });
  const habits = useHabits();
  const setTaskDone = useSetTaskDone();
  const updateTask = useUpdateTask();
  const tasks = linked.data ?? [];
  const open = tasks.filter((task) => task.status === "open").length;
  const candidates = (openTasks.data ?? []).filter((task) => !task.goalId).slice(0, 12);
  const goalHabits = (habits.data ?? []).filter((habit) => goal.habitIds?.includes(habit.id));
  const showHabits = isModuleVisible(settings, "habits");
  const failed = () => toast({ tone: "danger", title: t("failed") });
  const money = (toman: number) => formatCompactMoney(toman, { currency, digits, locale });

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby={`${goal.id}-tasks`} className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 id={`${goal.id}-tasks`} className={sectionLabel}>
            {t("tasks", { open: format.number(open), total: format.number(tasks.length) })}
          </h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Link2 aria-hidden="true" size={16} />
                {t("link")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-80">
              {candidates.length === 0 ? (
                <DropdownMenuItem disabled>{t("linkEmpty")}</DropdownMenuItem>
              ) : (
                candidates.map((task) => (
                  <DropdownMenuItem
                    key={task.id}
                    onSelect={() =>
                      updateTask.mutate(
                        { id: task.id, patch: { goalId: goal.id } },
                        { onSuccess: () => toast({ tone: "success", title: t("linked", { title: task.title }) }), onError: failed },
                      )
                    }
                  >
                    <bdi dir="auto" className="truncate">
                      {task.title}
                    </bdi>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {tasks.length === 0 ? (
          <p className="rounded-field bg-subtle p-4 text-sm text-fg-secondary">{t("noTasks")}</p>
        ) : (
          <ul className="flex flex-col">
            {tasks.map((task) => {
              const done = task.status === "done";
              const when = task.date ? format.when(taskWhen(task, { day: today })) : null;
              return (
                <li key={task.id} className="group flex min-h-12 items-center gap-3 rounded-[14px] px-2 hover:bg-subtle">
                  <TaskCheck
                    look={done ? "done" : "open"}
                    aria-label={done ? t("reopen", { title: task.title }) : t("complete", { title: task.title })}
                    aria-pressed={done}
                    onClick={() => setTaskDone.mutate({ id: task.id, done: !done }, { onError: failed })}
                  />
                  <Link
                    href={taskDetailHref(task.id)}
                    className={cn("min-w-0 flex-1 truncate text-sm font-semibold focus-visible:focus-ring", done ? "text-fg-muted line-through" : "text-fg")}
                  >
                    <bdi dir="auto">{task.title}</bdi>
                  </Link>
                  {when ? <span className={cn("shrink-0 text-xs", when.overdue ? "font-semibold text-danger-text" : "text-fg-muted")}>{when.text}</span> : null}
                  <IconButton
                    size="sm"
                    variant="ghost"
                    icon={Unlink}
                    label={t("unlink", { title: task.title })}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => updateTask.mutate({ id: task.id, patch: { goalId: null } }, { onError: failed })}
                  />
                </li>
              );
            })}
          </ul>
        )}
        <Link href={TASKS_HREF} className="self-start text-sm font-bold text-scope-deep underline-offset-4 hover:underline focus-visible:focus-ring">
          {t("showAll")}
        </Link>
      </section>

      {showHabits ? (
        <section aria-labelledby={`${goal.id}-habits`} className="flex flex-col gap-2">
          <h3 id={`${goal.id}-habits`} className={sectionLabel}>
            {t("habits")}
          </h3>
          {goalHabits.length === 0 ? (
            <p className="text-sm text-fg-muted">{t("noHabits")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {goalHabits.map((habit) => {
                const streak = habitStreak(habit, today);
                return (
                  <li key={habit.id} className="flex min-h-12 items-center justify-between gap-3 rounded-[14px] bg-subtle px-3">
                    <Link href="/personal/habits" className="min-w-0 truncate text-sm font-semibold text-fg focus-visible:focus-ring">
                      <bdi dir="auto">{habit.title}</bdi>
                    </Link>
                    <span className="shrink-0 rounded-pill bg-scope-soft px-2.5 py-1 text-xs font-bold text-scope-deep">
                      {t("streak", { days: streak, daysText: format.number(streak) })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {goal.money ? (
        <section aria-labelledby={`${goal.id}-money`} className="flex flex-col gap-2">
          <h3 id={`${goal.id}-money`} className={sectionLabel}>
            {t("money")} <span className="normal-case tracking-normal">{t("optional")}</span>
          </h3>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-semibold text-fg">
              <bdi dir="auto">{goal.money.label}</bdi>
            </span>
            <span className="tabular shrink-0 text-sm font-semibold text-fg-secondary">
              {t("moneyValue", { saved: money(goal.money.savedToman), target: formatCompactMoney(goal.money.targetToman, { currency, digits, locale, unit: true }) })}
            </span>
          </div>
          <Progress
            size="sm"
            value={goal.money.targetToman > 0 ? (goal.money.savedToman / goal.money.targetToman) * 100 : 0}
            label={goal.money.label}
            indicatorClassName="bg-warning"
          />
        </section>
      ) : null}
    </div>
  );
}

// ── Notes ───────────────────────────────────────────────────────────────

export function NotesPanel({ goal }: { goal: Goal }) {
  const t = useTranslations("Goals.notes");
  const update = useUpdateGoal();
  const [text, setText] = useState(goal.notes ?? "");
  const dirty = text.trim() !== (goal.notes ?? "");
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate({ id: goal.id, patch: { notes: text } }, { onSuccess: () => toast({ tone: "success", title: t("saved") }) });
      }}
    >
      <Textarea aria-label={t("label")} placeholder={t("placeholder")} value={text} dir="auto" rows={5} onChange={(event) => setText(event.target.value)} />
      <Button type="submit" size="sm" className="self-end" disabled={!dirty} loading={update.isPending}>
        {t("save")}
      </Button>
    </form>
  );
}
