"use client";

import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Share2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { ErrorState, LoadingState } from "@/components/feedback/state-views";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import type { ReviewStep } from "@/data/domain";
import { WeeklyStory } from "@/design-system/data-display/weekly-story";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { moodKey } from "@/features/overview/ui/mood";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useTasksFormat } from "@/features/tasks/ui/use-tasks-format";
import { cn } from "@/lib/cn";
import { addDaysToDay, dayToLocalDate } from "@/lib/dates/clock-time";
import { formatDateParam } from "@/lib/dates/date-param";
import { formatDateRange } from "@/lib/dates/format";
import { isReviewStep, moodLevel, reviewWeekDays } from "./domain/weekly";
import { CarryStep, GoalsStep, PlanStep, ReflectStep, WinsStep } from "./review-steps";
import { useWeeklyReviewSession, type WeeklyReviewSession } from "./use-weekly-review";

/*
 * P16 · Weekly review (/personal/review/:week, ?step=). A contextual flow
 * (no nav item): Wins → Carry over → Goals → Plan → Reflect behind a
 * segmented stepper (never folder tabs). The Weekly Story sits on top of
 * every step (its entrance plays once per review); the aside summarises the
 * steps and shows habits and mood as two numbers only. Save & exit keeps
 * progress; Finish writes the routes, the #weekly Journal entry and the
 * review. Too early in the week, the review waits (unlocks after 3 days).
 */

export function WeeklyReviewScreen({ weekParam }: { weekParam: string }) {
  const settings = usePlannerSettings();
  const t = useTranslations("Review");
  const days = reviewWeekDays(weekParam, settings.week);
  if (!days) return <ErrorState title={t("invalid.title")} description={t("invalid.body")} />;
  return <ReviewFlow key={days[0]} days={days} />;
}

function useWeekRange(days: readonly string[]) {
  const { locale, digits, calendar } = usePreferences();
  return formatDateRange(dayToLocalDate(days[0]!), dayToLocalDate(days[6]!), { locale, digits, calendar });
}

function ReviewFlow({ days }: { days: readonly string[] }) {
  const t = useTranslations("Review");
  const tShutdown = useTranslations("Shutdown");
  const format = useTasksFormat();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const reduce = useReducedMotion();
  const session = useWeeklyReviewSession(days);
  const range = useWeekRange(days);
  const current = days.includes(session.today);
  const param = params.get("step");
  const step: ReviewStep = isReviewStep(param) && session.steps.includes(param) ? param : (session.storedStep ?? "wins");
  const index = Math.max(0, session.steps.indexOf(step));
  const [moved, setMoved] = useState(false);

  const goTo = (next: ReviewStep) => {
    const search = new URLSearchParams(params.toString());
    search.set("step", next);
    router.replace(`${pathname}?${search.toString()}`, { scroll: false });
    setMoved(true);
  };

  const saveAndExit = async () => {
    if (await session.saveProgress(step)) {
      toast({ tone: "neutral", title: t("toast.saved") });
      router.push("/personal");
    }
  };

  const ready = session.status === "ready" && session.availability.status === "open" && !session.done;

  const header = (
    <PageHeader
      breadcrumb={<p className="text-xs font-bold text-fg-muted">{t("kicker", { range })}</p>}
      title={current ? t("title.current") : t("title.past", { range })}
      size="display"
      actions={
        ready ? (
          <Button variant="secondary" onClick={() => void saveAndExit()} loading={session.saving} loadingText={t("saving")}>
            {t("saveExit")}
          </Button>
        ) : null
      }
    />
  );

  if (session.status === "loading") {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <LoadingState label={t("loading")} />
      </div>
    );
  }
  if (session.status === "error") {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState title={t("error.title")} description={t("error.body")} onRetry={session.retry} retryLabel={t("error.retry")} />
      </div>
    );
  }
  if (session.availability.status === "too-early") {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <TooEarly firstReviewDay={session.availability.firstReviewDay} previousWeek={addDaysToDay(days[0]!, -7)} />
      </div>
    );
  }
  if (session.done) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ReviewDone session={session} />
      </div>
    );
  }

  const next = session.steps[index + 1];
  const back = session.steps[index - 1];
  const finish = async () => {
    if (await session.finish()) toast({ tone: "success", title: t("toast.finished") });
  };

  return (
    <div className="flex flex-col gap-6 pb-6">
      {header}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label={t("steps.label")}
          value={step}
          onValueChange={goTo}
          variant="accent"
          options={session.steps.map((value, i) => ({
            value,
            label: (
              <span className="inline-flex items-center gap-1.5">
                {i < index ? <Check aria-hidden size={14} /> : <span className="tabular">{format.number(i + 1)}</span>}
                {t(`steps.${value}`)}
              </span>
            ),
          }))}
        />
        <p className="text-xs font-semibold text-fg-muted">{t("stepOf", { step: format.number(index + 1), total: format.number(session.steps.length) })}</p>
      </div>

      <Story session={session} range={range} onStep={goTo} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.section
            key={step}
            aria-labelledby="review-step-title"
            className="flex min-w-0 flex-col gap-4"
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
            transition={{ duration: reduce ? 0 : 0.28, ease: "easeOut" }}
          >
            <StepTitle step={step} index={index} total={session.steps.length} focus={moved} />
            {step === "wins" ? <WinsStep session={session} /> : null}
            {step === "carry" ? <CarryStep session={session} onPlan={() => goTo("plan")} /> : null}
            {step === "goals" ? <GoalsStep session={session} /> : null}
            {step === "plan" ? <PlanStep session={session} /> : null}
            {step === "reflect" ? <ReflectStep session={session} /> : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {back ? (
                <Button variant="secondary" onClick={() => goTo(back)}>
                  <ArrowLeft aria-hidden size={16} className="rtl:-scale-x-100" />
                  {t("back")}
                </Button>
              ) : null}
              {next ? (
                <Button onClick={() => goTo(next)}>
                  {t("next", { step: t(`steps.${next}`) })}
                  <ArrowRight aria-hidden size={16} className="rtl:-scale-x-100" />
                </Button>
              ) : (
                <Button onClick={() => void finish()} loading={session.finishing} loadingText={t("finishing")}>
                  <CheckCircle2 aria-hidden size={16} />
                  {t("finish")}
                </Button>
              )}
            </div>
          </motion.section>
        </AnimatePresence>
        <Aside session={session} step={step} onStep={goTo} moodText={(level) => tShutdown(`reflect.moodLevel.${moodKey(level)}`)} />
      </div>
    </div>
  );
}

function StepTitle({ step, index, total, focus }: { step: ReviewStep; index: number; total: number; focus: boolean }) {
  const t = useTranslations("Review");
  const format = useTasksFormat();
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus({ preventScroll: true });
  }, [focus, step]);
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[11px] font-bold tracking-wide text-scope-deep uppercase">
        {t("stepOf", { step: format.number(index + 1), total: format.number(total) })}
      </p>
      <h2 ref={ref} id="review-step-title" tabIndex={-1} className="type-h2 text-fg outline-none">
        {t(`steps.${step}`)}
      </h2>
      <p className="text-sm text-fg-secondary">{t(`intro.${step}`)}</p>
    </div>
  );
}

// ── Weekly Story ─────────────────────────────────────────────────────────

function trend(current: number | null, previous: number | null): "up" | "down" | "same" | null {
  if (current === null || previous === null) return null;
  if (Math.abs(current - previous) < 0.05 * Math.max(1, Math.abs(previous))) return "same";
  return current > previous ? "up" : "down";
}

function Story({ session, range, onStep }: { session: WeeklyReviewSession; range: string; onStep(step: ReviewStep): void }) {
  const t = useTranslations("Review.story");
  const tr = useTranslations("Review");
  const tShutdown = useTranslations("Shutdown");
  const format = useTasksFormat();
  const { facts, visible } = session;
  const moodText = (value: number) => tShutdown(`reflect.moodLevel.${moodKey(moodLevel(value))}`);
  const note = (direction: ReturnType<typeof trend>, up: string) => (direction === "up" ? up : direction === "down" ? t("notes.lighter") : t("notes.steady"));
  const metrics = [
    {
      id: "focus",
      value: facts.focus / 60,
      format: (value: number) => t("hours", { value: format.number(Math.round(value)) }),
      label: t("focus"),
      note: note(trend(facts.focus, facts.lastFocus), t("notes.more")),
      onSelect: () => onStep("plan"),
      selectLabel: t("jump", { metric: t("focus"), step: tr("steps.plan") }),
    },
    {
      id: "tasks",
      value: facts.completed,
      format: (value: number) => format.number(Math.round(value)),
      label: t("tasks"),
      note:
        facts.completed > facts.lastWeekDone
          ? t("notes.moreBy", { count: format.number(facts.completed - facts.lastWeekDone) })
          : note(trend(facts.completed, facts.lastWeekDone), t("notes.more")),
      onSelect: () => onStep("carry"),
      selectLabel: t("jump", { metric: t("tasks"), step: tr("steps.carry") }),
    },
    ...(visible.habits && facts.habits.total > 0
      ? [
          {
            id: "habits",
            value: facts.habits.kept,
            format: (value: number) => t("of", { value: format.number(Math.round(value)), total: format.number(facts.habits.total) }),
            label: t("habits"),
            note: note(trend(facts.habits.rate, facts.lastHabits.rate), t("notes.more")),
            onSelect: () => onStep("wins"),
            selectLabel: t("jump", { metric: t("habits"), step: tr("steps.wins") }),
          },
        ]
      : []),
    ...(visible.journal && facts.mood !== null
      ? [
          {
            id: "mood",
            value: facts.mood,
            format: moodText,
            label: t("mood"),
            note: facts.lastMood !== null && moodLevel(facts.lastMood) !== moodLevel(facts.mood) ? t("notes.from", { mood: moodText(facts.lastMood) }) : t("notes.steady"),
            onSelect: () => onStep("reflect"),
            selectLabel: t("jump", { metric: t("mood"), step: tr("steps.reflect") }),
          },
        ]
      : []),
  ];

  const share = async () => {
    const text = [t(`headline.${facts.tone}`), ...metrics.map((metric) => `${metric.label}: ${metric.format(metric.value)}`)].join("\n");
    try {
      if (typeof navigator.share === "function") await navigator.share({ title: t("shareTitle", { range }), text });
      else {
        await navigator.clipboard.writeText(text);
        toast({ tone: "neutral", title: t("copied") });
      }
    } catch {
      // Share sheet dismissed: nothing to do.
    }
  };

  return (
    <WeeklyStory
      tone={facts.tone}
      headingId="review-story"
      kicker={t("kicker", { range })}
      headline={t(`headline.${facts.tone}`)}
      line={t(`line.${facts.tone}`)}
      metrics={metrics}
      action={<SignatureCardAction label={t("share")} icon={Share2} variant="neutral" onClick={() => void share()} />}
    />
  );
}

// ── Aside: step summaries + habits & mood ────────────────────────────────

function Aside({
  session,
  step,
  onStep,
  moodText,
}: {
  session: WeeklyReviewSession;
  step: ReviewStep;
  onStep(step: ReviewStep): void;
  moodText(level: number): string;
}) {
  const t = useTranslations("Review");
  const format = useTasksFormat();
  const { facts, visible } = session;
  const summary: Record<ReviewStep, string> = {
    wins: t("aside.wins", { count: format.number(session.wins.length) }),
    carry: t("aside.carry", { done: format.number(session.counts.completed), open: format.number(session.unfinished.length) }),
    goals: session.goals.map(({ goal, delta }) => `${goal.title} ${delta > 0 ? `+${format.percent(delta)}` : ""}`.trim()).join(" · ") || t("aside.noGoals"),
    plan: t("aside.plan", { count: format.number(session.priorities.length) }),
    reflect: session.reflection.wentWell || session.reflection.slipped || session.reflection.change ? t("aside.reflectStarted") : t("aside.reflect"),
  };
  const habitDelta = facts.habits.rate !== null && facts.lastHabits.rate !== null ? Math.round((facts.habits.rate - facts.lastHabits.rate) * 100) : null;
  return (
    <aside aria-label={t("aside.label")} className="flex min-w-0 flex-col gap-4">
      <ProductCard className="gap-2 p-4">
        <ol className="flex flex-col gap-2">
          {session.steps.map((value, i) => {
            const doneBefore = i < session.steps.indexOf(step);
            return (
              <li key={value}>
                <button
                  type="button"
                  onClick={() => onStep(value)}
                  aria-current={value === step ? "step" : undefined}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-2xl bg-subtle px-3 py-2.5 text-start hover:bg-secondary-hover",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    value === step && "bg-scope-soft",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular",
                      doneBefore ? "bg-scope-deep text-on-accent" : "bg-surface text-fg-secondary",
                    )}
                  >
                    {doneBefore ? <Check size={14} /> : format.number(i + 1)}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-bold text-fg">{t(`steps.${value}`)}</span>
                    <span className="truncate text-xs text-fg-secondary">{summary[value]}</span>
                    {value === "wins" && session.wins.length > 0 ? (
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {session.wins.slice(0, 3).map((win) => (
                          <li key={win.id} className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                            <Check aria-hidden size={12} className="shrink-0 text-scope-deep" />
                            <bdi className="truncate">{win.title}</bdi>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </ProductCard>
      {visible.habits || visible.journal ? (
        <ProductCard as="section" aria-labelledby="review-numbers" className="gap-3 p-4">
          <h2 id="review-numbers" className="type-title text-fg">
            {t("numbers.title")}
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {visible.habits ? (
              <UtilityCard className="gap-0.5 p-3.5">
                <span className="text-xs font-semibold text-fg-secondary">{t("numbers.habits")}</span>
                <span className="type-h2 text-fg tabular">{facts.habits.rate === null ? "—" : format.percent(facts.habits.rate)}</span>
                <span className="text-[11px] font-semibold text-fg-muted tabular">
                  {habitDelta === null || habitDelta === 0
                    ? t("numbers.steady")
                    : t("numbers.points", { sign: habitDelta > 0 ? "+" : "−", value: format.number(Math.abs(habitDelta)) })}
                </span>
              </UtilityCard>
            ) : null}
            {visible.journal ? (
              <UtilityCard className="gap-0.5 p-3.5">
                <span className="text-xs font-semibold text-fg-secondary">{t("numbers.mood")}</span>
                <span className="type-h2 text-fg">{facts.mood === null ? "—" : moodText(facts.mood)}</span>
                <span className="text-[11px] font-semibold text-fg-muted">
                  {facts.mood === null ? t("numbers.noMood") : t("numbers.steady")}
                </span>
              </UtilityCard>
            ) : null}
          </div>
          <p className="text-xs text-fg-muted">{t("numbers.footnote")}</p>
        </ProductCard>
      ) : null}
    </aside>
  );
}

// ── States ───────────────────────────────────────────────────────────────

function TooEarly({ firstReviewDay, previousWeek }: { firstReviewDay: string; previousWeek: string }) {
  const t = useTranslations("Review.tooEarly");
  const format = useTasksFormat();
  return (
    <UtilityCard role="status" className="mx-auto w-full max-w-lg items-center gap-3 px-6 py-10 text-center">
      <span aria-hidden className="grid size-14 place-items-center rounded-full bg-surface text-fg-secondary">
        <CalendarDays size={24} />
      </span>
      <h2 className="type-title text-fg">{t("title")}</h2>
      <p className="max-w-sm text-sm text-fg-secondary">{t("body", { day: format.weekday(firstReviewDay) })}</p>
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        <Button asChild variant="secondary">
          <Link href={`/personal/review/${formatDateParam(dayToLocalDate(previousWeek))}`}>{t("lastWeek")}</Link>
        </Button>
        <Button asChild>
          <Link href="/personal">{t("overview")}</Link>
        </Button>
      </div>
    </UtilityCard>
  );
}

function ReviewDone({ session }: { session: WeeklyReviewSession }) {
  const t = useTranslations("Review.done");
  const format = useTasksFormat();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <UtilityCard role="status" className="mx-auto w-full max-w-lg items-center gap-3 px-6 py-10 text-center">
      <span aria-hidden className="grid size-14 place-items-center rounded-full bg-scope-soft text-scope-deep">
        <CheckCircle2 size={24} />
      </span>
      <h2 ref={heading} tabIndex={-1} className="type-h1 text-fg outline-none">
        {t("title")}
      </h2>
      <p className="text-sm text-fg-secondary">
        {t("summary", { wins: format.number(session.wins.length), priorities: format.number(session.priorities.length) })}
      </p>
      {session.priorities.length > 0 ? (
        <ol className="flex flex-col gap-1 text-sm font-semibold text-fg">
          {session.priorities.map((item, i) => (
            <li key={item.id}>
              {format.number(i + 1)} · <bdi>{item.title}</bdi>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/personal">{t("overview")}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/personal/calendar">{t("calendar")}</Link>
        </Button>
        <Button variant="ghost" onClick={session.reopen}>
          {t("edit")}
        </Button>
      </div>
    </UtilityCard>
  );
}
