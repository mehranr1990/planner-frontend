"use client";

import { Archive, ArrowLeft, CheckCircle2, MoreHorizontal, Pencil, RotateCcw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { IconButton } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import type { Goal, GoalLifecycle } from "@/data/domain";
import { useSetGoalLifecycle } from "@/data/queries";
import { SignatureCard, SignatureCardAction, SignatureCardHeader } from "@/design-system/surfaces/signature-card";
import { FolderTabsCard } from "@/design-system/surfaces/folder-tabs-card";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { useOpenSheet } from "@/features/sheets/sheet-params";
import { cn } from "@/lib/cn";
import { daysLeft, defaultTab, GOAL_TABS, isDelayed, isGoalTab, isReached, type GoalTab } from "./domain/goals";
import { GOAL_SHEET_PARAM } from "./goal-sheet";
import { JourneyPanel, LinkedPanel, NotesPanel, ResultsPanel } from "./goal-panels";

/*
 * The selected goal (P11): ONE FolderTabsCard object — Journey · Key results
 * · Linked · Notes in ?tab= — whose panel is the signature card, its
 * sculpted corner holding Edit. Progress shows once as the number in the
 * head and once as the path. Selecting a goal cross-fades the detail
 * (400ms); switching tabs cross-fades the panel (180ms); reduced motion swaps.
 */

export const TAB_PARAM = "tab";

export function GoalDetail({ goal, today, backHref }: { goal: Goal; today: string; backHref: string }) {
  const t = useTranslations("Goals.detail");
  const format = useMyDayFormat();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openSheet = useOpenSheet();
  const reduce = useReducedMotion();
  const tabParam = params.get(TAB_PARAM);
  const tab: GoalTab = isGoalTab(tabParam) ? tabParam : defaultTab(goal);
  const edit = () => openSheet("goal", { [GOAL_SHEET_PARAM]: goal.id });

  const setTab = (next: string) => {
    const query = new URLSearchParams(params.toString());
    if (next === defaultTab(goal)) query.delete(TAB_PARAM);
    else query.set(TAB_PARAM, next);
    const search = query.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  };

  const milestones = goal.milestones?.length ?? 0;
  const linkedCount = (goal.habitIds?.length ?? 0) + (goal.money ? 1 : 0);
  const panels: Record<GoalTab, { label: string; count?: string; body: ReactNode }> = {
    journey: {
      label: t("tabs.journey"),
      count: milestones ? t("milestoneCount", { count: milestones, countText: format.number(milestones) }) : undefined,
      body: <JourneyPanel goal={goal} today={today} onEdit={edit} />,
    },
    results: {
      label: t("tabs.results"),
      count: goal.keyResults?.length ? format.number(goal.keyResults.length) : undefined,
      body: <ResultsPanel goal={goal} />,
    },
    linked: { label: t("tabs.linked"), count: linkedCount ? format.number(linkedCount) : undefined, body: <LinkedPanel goal={goal} today={today} /> },
    notes: { label: t("tabs.notes"), body: <NotesPanel key={goal.notes ?? ""} goal={goal} /> },
  };
  const first = GOAL_TABS[0] === tab;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={goal.id}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reduce ? undefined : { opacity: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="flex min-w-0 flex-col gap-3"
        data-goal-detail={goal.id}
      >
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-fg-secondary hover:text-fg focus-visible:focus-ring lg:hidden"
        >
          <ArrowLeft aria-hidden="true" size={16} className="rtl:-scale-x-100" />
          {t("back")}
        </Link>
        <FolderTabsCard
          label={t("tabsLabel")}
          value={tab}
          onValueChange={setTab}
          panelClassName="p-0 bg-transparent"
          tabs={GOAL_TABS.map((value) => ({
            value,
            label: panels[value].label,
            count: panels[value].count,
            content: (
              <motion.div
                key={value}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.18 }}
              >
                <SignatureCard
                  as="section"
                  aria-label={goal.title}
                  squareStartTop={first}
                  contentClassName={cn("flex flex-col gap-5", first && "lg:rounded-ss-none")}
                  action={<SignatureCardAction icon={Pencil} variant="neutral" label={t("edit")} onClick={edit} />}
                >
                  <GoalHead goal={goal} today={today} />
                  {panels[value].body}
                </SignatureCard>
              </motion.div>
            ),
          }))}
        />
      </motion.div>
    </AnimatePresence>
  );
}

function GoalHead({ goal, today }: { goal: Goal; today: string }) {
  const t = useTranslations("Goals.detail");
  const format = useMyDayFormat();
  const setLifecycle = useSetGoalLifecycle();
  const delayed = isDelayed(goal, today);
  const reached = isReached(goal);
  const left = daysLeft(goal, today);
  const lifecycle: GoalLifecycle = goal.lifecycle ?? "active";

  const move = (next: GoalLifecycle, message: string) => {
    setLifecycle.mutate(
      { id: goal.id, lifecycle: next },
      {
        onSuccess: () =>
          toast({
            tone: "neutral",
            title: message,
            action: { label: t("undo"), altText: t("undoAlt"), onClick: () => setLifecycle.mutate({ id: goal.id, lifecycle }) },
          }),
      },
    );
  };

  const meta = [
    goal.target ? t("target", { target: goal.target }) : null,
    goal.dueDay ? t("due", { date: format.dayMonth(goal.dueDay) }) : null,
    left !== null && !reached
      ? left >= 0
        ? t("daysLeft", { days: left, daysText: format.number(left) })
        : t("overdue", { days: -left, daysText: format.number(-left) })
      : null,
  ].filter(Boolean);

  return (
    <SignatureCardHeader className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-fg-secondary">
          <span aria-hidden="true" className="size-2 rounded-full bg-scope-dot" />
          <span>
            {t("personal")}
            {goal.area ? (
              <>
                {" · "}
                <bdi dir="auto">{goal.area}</bdi>
              </>
            ) : null}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton size="sm" variant="ghost" icon={MoreHorizontal} label={t("actions")} className="-my-2 ms-auto" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {lifecycle === "active" ? (
                <>
                  <DropdownMenuItem icon={CheckCircle2} onSelect={() => move("completed", t("completedToast"))}>
                    {t("complete")}
                  </DropdownMenuItem>
                  <DropdownMenuItem icon={Archive} onSelect={() => move("archived", t("archivedToast"))}>
                    {t("archive")}
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem icon={RotateCcw} onSelect={() => move("active", t("restoredToast"))}>
                  {t("restore")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </p>
        <h2 className="min-w-0 break-words text-2xl font-bold text-fg lg:text-[1.875rem]">
          <bdi dir="auto">{goal.title}</bdi>
        </h2>
        {meta.length ? <p className="text-xs text-fg-secondary">{meta.join(" · ")}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className={cn("tabular text-4xl font-semibold leading-none", delayed ? "text-warning-text" : "text-fg")}>{format.percent(goal.progress)}</span>
        <span className={cn("text-xs font-semibold", delayed ? "text-warning-text" : "text-fg-secondary")}>
          {reached ? t("reached") : delayed ? t("behind") : t("onTrack")}
        </span>
      </div>
    </SignatureCardHeader>
  );
}
