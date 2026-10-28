"use client";

import { Check, RotateCw } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment, useState, type ReactElement, type ReactNode } from "react";
import { ErrorState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import type { Scope, Task } from "@/data/domain";
import { Progress } from "@/design-system/feedback/progress";
import { SignatureCard, SignatureCardAction, SignatureCardHeader } from "@/design-system/surfaces/signature-card";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import type { DayBlock } from "../domain/day-blocks";
import type { NowSummary } from "../domain/now";
import { useMyDay } from "../my-day-context";
import { useMyDayFormat, type MyDayFormat } from "../ui/use-my-day-format";
import { FocusStartAction, focusHref } from "./focus-entry";
import { useMarkDone } from "./use-mark-done";
import { useNowBlock } from "./use-now-block";

/*
 * The Now card (P02): the page's one volt area. Volt means live, so the card
 * is volt only while a block is running; otherwise it quietly becomes "Up
 * next" on the plain surface. It only exists on the planner's today.
 */

function ScopeName({ scope }: { scope: Scope }) {
  const t = useTranslations("Navigation.contexts");
  return <>{t(`${scope}.label`)}</>;
}

/** "Personal · Planner side project · high energy": scope, the task's project, energy. */
function MetaLine({ block, task }: { block: DayBlock; task: Task | null }) {
  const t = useTranslations("MyDay.now");
  const parts: ReactNode[] = [<ScopeName key="scope" scope={block.scope} />];
  if (task?.project) {
    parts.push(
      <bdi key="project" dir="auto">
        {task.project}
      </bdi>,
    );
  }
  // A task block takes its energy from the task (the block itself may not carry it).
  const energy = block.energy ?? task?.energy ?? null;
  if (energy) parts.push(<Fragment key="energy">{t("energy", { level: energy })}</Fragment>);
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? " · " : null}
          {part}
        </Fragment>
      ))}
    </>
  );
}

/** "Next · 16:30 Client call (Projects) · 17:15 Gym". */
function NextLine({ blocks, format, className }: { blocks: readonly DayBlock[]; format: MyDayFormat; className?: string }) {
  const t = useTranslations("MyDay.now");
  if (blocks.length === 0) return <p className={className}>{t("nothingNext")}</p>;
  return (
    <p className={className}>
      {t("next")}
      {blocks.map((block) => (
        <Fragment key={block.id}>
          {" · "}
          <span dir="ltr" className="tabular">
            {format.clock(block.startMinutes)}
          </span>{" "}
          <bdi dir="auto">{block.title}</bdi>
          {block.scope !== "personal" ? (
            <>
              {" ("}
              <ScopeName scope={block.scope} />)
            </>
          ) : null}
        </Fragment>
      ))}
    </p>
  );
}

function LiveNowCard({
  block,
  task,
  summary,
  next,
  className,
}: {
  block: DayBlock;
  task: Task | null;
  summary: NowSummary;
  next: readonly DayBlock[];
  className?: string;
}) {
  const t = useTranslations("MyDay.now");
  const format = useMyDayFormat();
  const { focus } = usePlannerSettings();
  const markDone = useMarkDone();
  // The check "pops" (200ms) on every press; the key restarts the animation.
  const [pops, setPops] = useState(0);

  return (
    <SignatureCard
      as="section"
      tone="volt"
      aria-label={t("landmark")}
      className={className}
      // Board: 256px of content height, so the right column does not jump.
      contentClassName="flex min-h-64 flex-col gap-2.5"
      action={
        <SignatureCardAction
          label={t("markDone")}
          onClick={() => {
            setPops((count) => count + 1);
            void markDone(block);
          }}
        >
          <motion.span
            key={pops}
            aria-hidden
            className="inline-flex"
            initial={false}
            animate={pops > 0 ? { scale: [1, 1.3, 1] } : undefined}
            transition={{ duration: 0.2 }}
          >
            <Icon icon={Check} size={20} />
          </motion.span>
        </SignatureCardAction>
      }
    >
      <SignatureCardHeader className="flex-wrap gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-primary px-3 py-1.5 text-xs font-bold text-on-accent">
          <span aria-hidden className="size-1.5 rounded-full bg-volt" />
          {t("chip", { left: format.duration(summary.leftMinutes) })}
        </span>
        <span dir="ltr" className="tabular text-sm font-semibold text-on-volt-2">
          {format.clockRange(block.startMinutes, block.endMinutes)}
        </span>
      </SignatureCardHeader>
      <h2 className="mt-auto type-h1 [&:not(:lang(fa))]:font-semibold [&:not(:lang(fa))]:leading-[1.08]">
        <bdi dir="auto">{block.title}</bdi>
      </h2>
      <p className="text-sm font-semibold text-on-volt-2">
        <MetaLine block={block} task={task} />
      </p>
      <Progress
        value={summary.progressPercent}
        label={t("progress")}
        valueText={format.percent(summary.progressPercent / 100)}
        className="bg-primary/18"
      />
      <Button
        asChild
        variant="secondary"
        className="w-full bg-surface/55 text-on-volt hover:bg-surface/75 active:bg-surface/90 dark:bg-on-volt/10 dark:hover:bg-on-volt/20 dark:active:bg-on-volt/25"
      >
        <Link href={focusHref(block.taskId)}>
          <svg aria-hidden viewBox="0 0 24 24" className="size-4.5 fill-current">
            <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />
          </svg>
          {t("startFocus", { duration: format.duration(focus.focusMinutes) })}
        </Link>
      </Button>
      <NextLine blocks={next} format={format} className="text-xs font-semibold text-on-volt-2" />
    </SignatureCard>
  );
}

/** Nothing is running: plain surface (volt is for live only) with what comes next. */
function UpNextCard({ upNext, today, className }: { upNext: DayBlock | null; today: string; className?: string }) {
  const t = useTranslations("MyDay.now");
  const format = useMyDayFormat();

  return (
    <SignatureCard
      as="section"
      aria-label={t("landmark")}
      className={className}
      contentClassName="flex min-h-44 flex-col gap-2.5"
      action={<FocusStartAction day={today} />}
    >
      <SignatureCardHeader className="flex-wrap gap-x-2 gap-y-1">
        <span className="inline-flex items-center rounded-pill bg-scope-soft px-3 py-1.5 text-xs font-bold text-scope-deep">
          {upNext ? t("upNextChip", { time: format.clock(upNext.startMinutes) }) : t("idleChip")}
        </span>
        {upNext ? (
          <span dir="ltr" className="tabular text-sm font-semibold text-fg-secondary">
            {format.clockRange(upNext.startMinutes, upNext.endMinutes)}
          </span>
        ) : null}
      </SignatureCardHeader>
      <h2 className="mt-auto type-title">{upNext ? <bdi dir="auto">{upNext.title}</bdi> : t("idleTitle")}</h2>
      <p className="text-sm font-semibold text-fg-secondary">
        {upNext ? <MetaLine block={upNext} task={null} /> : t("idleDescription")}
      </p>
    </SignatureCard>
  );
}

/** Loading and error frames: plain surface, the notch still holds a real action. */
function NowCardShell({ children, action, className }: { children: ReactNode; action: ReactElement; className?: string }) {
  const t = useTranslations("MyDay.now");
  return (
    <SignatureCard
      as="section"
      aria-label={t("landmark")}
      className={className}
      contentClassName="flex min-h-44 flex-col gap-2.5"
      action={action}
    >
      <SignatureCardHeader />
      {children}
    </SignatureCard>
  );
}

function NowCardContent({ className }: { className?: string }) {
  const t = useTranslations("MyDay.now");
  const state = useNowBlock();

  if (state.status === "pending") {
    return (
      <NowCardShell className={className} action={<SignatureCardAction icon={Check} label={t("markDone")} disabled />}>
        <div role="status" aria-live="polite" className="mt-auto flex flex-col gap-3">
          <span className="sr-only">{t("loading")}</span>
          <Skeleton shape="pill" className="w-32" />
          <Skeleton shape="line" className="h-8 w-[70%]" />
          <Skeleton className="w-[50%]" />
        </div>
      </NowCardShell>
    );
  }

  if (state.status === "error") {
    return (
      <NowCardShell
        className={className}
        action={<SignatureCardAction icon={RotateCw} label={t("retry")} onClick={state.refetch} />}
      >
        <ErrorState title={t("error")} description={null} size="compact" variant="tinted" className="mt-auto" />
      </NowCardShell>
    );
  }

  if (state.current && state.summary) {
    return (
      <LiveNowCard block={state.current} task={state.task} summary={state.summary} next={state.next} className={className} />
    );
  }
  return <UpNextCard upNext={state.next[0] ?? null} today={state.today} className={className} />;
}

/** Desktop right column, top. Renders nothing on any day but the planner's today. */
export function NowCard({ className }: { className?: string }) {
  const { isToday } = useMyDay();
  return isToday ? <NowCardContent className={className} /> : null;
}
