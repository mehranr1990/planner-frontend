"use client";

import { ArrowRight, Check, CheckCircle2, Inbox, Moon, Sun, AlertCircle, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "@/components/feedback/state-views";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { searchWithDayView } from "@/features/my-day/my-day-context";
import { useSlotDismissals } from "@/features/overview/domain/slot-dismissals";
import { moodKey } from "@/features/overview/ui/mood";
import { useTasksFormat } from "@/features/tasks/ui/use-tasks-format";
import { cn } from "@/lib/cn";
import type { Outcome } from "./domain/shutdown";
import { ReflectCard } from "./reflect-card";
import { RouteList } from "./route-list";
import { TomorrowCard } from "./tomorrow-card";
import { useShutdown, type FinishedSummary } from "./use-shutdown";

/*
 * P10 · Daily shutdown. A contextual flow (no nav item), optional and never
 * forced: Later leaves without changing anything. Desktop shows all three
 * steps at once (the segmented stepper only scrolls to and highlights one);
 * below lg it is a three-step flow, one step at a time (?step=). Finish day
 * (bottom-end) commits the routing draft, tomorrow's placements and the
 * reflection, then the page dims into the "Day closed" card (500ms; fade
 * under reduced motion).
 */

type Step = "route" | "tomorrow" | "reflect";
const STEPS: readonly Step[] = ["route", "tomorrow", "reflect"];
const SECTION_ID: Record<Step, string> = { route: "shutdown-route", tomorrow: "shutdown-tomorrow", reflect: "shutdown-reflect" };

function stepFromParam(value: string | null): Step {
  return STEPS.includes(value as Step) ? (value as Step) : "route";
}

export function ShutdownScreen() {
  const t = useTranslations("Shutdown");
  const format = useTasksFormat();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const reduce = useReducedMotion();
  const session = useShutdown();
  const [, dismissSlot] = useSlotDismissals(session.today);
  const step = stepFromParam(params.get("step"));

  const goTo = (next: Step) => {
    const search = new URLSearchParams(params.toString());
    if (next === "route") search.delete("step");
    else search.set("step", next);
    const query = search.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    document.getElementById(SECTION_ID[next])?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  const later = () => {
    dismissSlot("evening");
    router.push("/personal");
  };

  const header = (
    <PageHeader
      breadcrumb={<p className="text-xs font-bold text-fg-muted">{t("kicker", { time: format.clock(session.now.minutes) })}</p>}
      title={t("title")}
      size="display"
      actions={
        session.finished ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label={t("steps.label")}
              value={step}
              onValueChange={goTo}
              options={STEPS.map((value) => ({ value, label: t(`steps.${value}`) }))}
            />
            <Button variant="secondary" onClick={later} title={t("laterHint")}>
              {t("later")}
            </Button>
          </div>
        )
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
        <ErrorState title={t("error.title")} description={t("error.description")} onRetry={session.retry} retryLabel={t("error.retry")} />
      </div>
    );
  }

  const onStep = (target: Step) => cn(step !== target && "max-lg:hidden");
  const nothingToRoute = session.unfinished.length === 0;

  return (
    <div className="flex flex-col gap-6 pb-6">
      {header}
      <AnimatePresence mode="wait" initial={false}>
        {session.finished ? (
          <motion.div
            key="finished"
            initial={{ opacity: 0, scale: reduce ? 1 : 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <DayClosed summary={session.finished} tomorrow={session.days.tomorrow} today={session.today} />
          </motion.div>
        ) : (
          <motion.div
            key="flow"
            exit={{ opacity: reduce ? 0 : 0.35 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col gap-4"
          >
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <div className={cn("flex min-w-0 flex-col gap-4", onStep("route"))}>
                <OutcomeCard outcome={session.counts} onPlanTomorrow={() => goTo("tomorrow")} />
                {nothingToRoute ? (
                  <UtilityCard className="items-center gap-3 py-8 text-center">
                    <span aria-hidden className="grid size-12 place-items-center rounded-full bg-surface text-fg-secondary">
                      <Check size={22} />
                    </span>
                    <h2 className="type-title text-fg">{t("nothing.title")}</h2>
                    <p className="max-w-xs text-sm text-fg-secondary">
                      {t("nothing.body", { count: format.number(session.doneCount) })}
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button onClick={() => goTo("tomorrow")}>{t("nothing.arrange")}</Button>
                      <Button variant="secondary" onClick={() => void session.finish()} disabled={session.finishing}>
                        {t("finish.action")}
                      </Button>
                    </div>
                  </UtilityCard>
                ) : (
                  <RouteList
                    tasks={session.unfinished}
                    today={session.today}
                    days={session.days}
                    draft={session.draft}
                    onRoute={session.setRoutes}
                  />
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-4">
                <div className={onStep("tomorrow")}>
                  <TomorrowCard
                    days={session.days}
                    today={session.today}
                    work={session.work}
                    blocks={session.tomorrowBlocks}
                    pending={session.pending}
                    placements={session.placements}
                    load={session.load}
                    suggestion={session.suggestion}
                    loading={session.tomorrowLoading}
                    onPlace={session.place}
                    onArrange={session.arrange}
                    onApplySuggestion={session.applySuggestion}
                    onKeep={session.keepOverload}
                  />
                </div>
                <div className={onStep("reflect")}>
                  <ReflectCard today={session.today} value={session.reflection} onChange={session.setReflection} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <p className="text-xs text-fg-muted max-lg:hidden">{t("finish.hint")}</p>
              {step !== "reflect" ? (
                <Button
                  variant="secondary"
                  className="lg:hidden"
                  onClick={() => goTo(STEPS[STEPS.indexOf(step) + 1]!)}
                >
                  {t(`steps.${STEPS[STEPS.indexOf(step) + 1]!}`)}
                  <ArrowRight aria-hidden size={18} className="rtl:-scale-x-100" />
                </Button>
              ) : null}
              <Button
                size="lg"
                onClick={() => void session.finish()}
                loading={session.finishing}
                loadingText={t("finish.saving")}
                className={cn(step !== "reflect" && "max-lg:hidden")}
              >
                <Moon aria-hidden size={18} />
                {t("finish.action")}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function OutcomeCard({ outcome, onPlanTomorrow }: { outcome: Outcome; onPlanTomorrow(): void }) {
  const t = useTranslations("Shutdown.outcome");
  const format = useTasksFormat();
  const share = (count: number) => format.percent(outcome.planned > 0 ? count / outcome.planned : 0);
  const tiles: { key: "completed" | "tomorrow" | "overdue" | "inbox"; icon: LucideIcon; tile: string; count: number }[] = [
    { key: "completed", icon: CheckCircle2, tile: "bg-success-soft text-success-text", count: outcome.completed },
    { key: "tomorrow", icon: ArrowRight, tile: "bg-warning-soft text-warning-text", count: outcome.tomorrow },
    { key: "overdue", icon: AlertCircle, tile: "bg-danger-soft text-danger-text", count: outcome.overdue },
    { key: "inbox", icon: Inbox, tile: "bg-secondary text-fg-secondary", count: outcome.inbox },
  ];
  return (
    <ProductCard as="section" aria-labelledby="shutdown-outcome-title" className="gap-4 p-5 lg:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="shutdown-outcome-title" className="type-title text-fg">
          {t("title")}
        </h2>
        <p aria-live="polite" className="text-xs font-semibold text-fg-muted">
          {t("planned", { count: format.number(outcome.planned) })}
          {outcome.later + outcome.dropped > 0
            ? ` · ${t("extra", { later: format.number(outcome.later), dropped: format.number(outcome.dropped) })}`
            : null}
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map(({ key, icon: TileIcon, tile, count }) => (
          <li
            key={key}
            className={cn(
              "flex min-h-32 flex-col gap-2 rounded-2xl bg-subtle p-3.5",
              key === "tomorrow" && "inset-ring-[1.5px] inset-ring-warning",
            )}
          >
            <div className="flex items-center justify-between">
              <span aria-hidden className={cn("grid size-7 place-items-center rounded-full", tile)}>
                <TileIcon size={15} className={key === "tomorrow" ? "rtl:-scale-x-100" : undefined} />
              </span>
              <span className="text-xs font-semibold text-fg-muted tabular" aria-label={t("share", { percent: share(count) })}>
                {share(count)}
              </span>
            </div>
            <p className="type-h2 text-fg tabular">{format.number(count)}</p>
            <p className="text-xs font-semibold text-fg-secondary">{t(key)}</p>
            {key === "tomorrow" ? (
              <Button size="sm" className="mt-auto min-h-8 self-start px-3 text-xs" onClick={onPlanTomorrow}>
                {t("planTomorrow")}
              </Button>
            ) : key === "overdue" && count > 0 ? (
              <a href="#shutdown-route" className="mt-auto text-xs font-semibold text-fg-secondary underline-offset-2 hover:underline">
                {t("reschedule")}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </ProductCard>
  );
}

function DayClosed({ summary, tomorrow, today }: { summary: FinishedSummary; tomorrow: string; today: string }) {
  const t = useTranslations("Shutdown");
  const format = useTasksFormat();
  const heading = useFocusOnMount();
  const search = searchWithDayView("", tomorrow, "day", today);
  const parts = [
    t("finished.summary", {
      done: format.number(summary.done),
      tomorrow: format.number(summary.tomorrow),
      dropped: format.number(summary.dropped),
    }),
    summary.mood !== null ? t("finished.mood", { mood: t(`reflect.moodLevel.${moodKey(summary.mood)}`) }) : null,
  ].filter(Boolean);
  return (
    <UtilityCard role="status" className="mx-auto w-full max-w-lg items-center gap-3 px-6 py-10 text-center">
      <span aria-hidden className="grid size-14 place-items-center rounded-full bg-scope-soft text-scope-deep">
        <Moon size={24} />
      </span>
      <h2 ref={heading} tabIndex={-1} className="type-h1 text-fg outline-none">
        {t("finished.title")}
      </h2>
      <p className="text-sm text-fg-secondary">{parts.join(" · ")}</p>
      <p className="rounded-full bg-scope-soft px-3 py-1 text-xs font-semibold text-scope-deep">
        <Sun aria-hidden size={13} className="me-1 inline align-[-2px]" />
        {summary.first ? (
          <>
            {t("finished.starts", { time: format.clock(summary.first.minutes) })} ·{" "}
            <bdi>{summary.first.title}</bdi>
          </>
        ) : (
          t("finished.startsEmpty")
        )}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href={`/personal/my-day${search ? `?${search}` : ""}`}>{t("finished.openTomorrow")}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/personal">{t("finished.overview")}</Link>
        </Button>
      </div>
    </UtilityCard>
  );
}

/** Moves focus to the "Day closed" heading so the change is announced and keyboard users land on it. */
function useFocusOnMount() {
  const [node, setNode] = useState<HTMLHeadingElement | null>(null);
  useEffect(() => {
    node?.focus();
  }, [node]);
  return setNode;
}
