"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useTasks, useUnscheduledTasks } from "@/data/queries";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { useDayPlan } from "@/features/my-day/header/use-day-plan";
import { NowCard } from "@/features/my-day/rail";
import { focusHref } from "@/features/my-day/rail/focus-entry";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { useOpenSheet } from "@/features/sheets/sheet-params";
import { cn } from "@/lib/cn";
import { EVENING_FROM_MINUTES, liveSlot, type LiveSlot } from "../domain/live-slot";
import { useSlotDismissals } from "../domain/slot-dismissals";

/*
 * The live slot (P01 · 5 states). B is the default: My Day's Now card, the
 * page's one volt area (or its quiet Up next frame when nothing runs). The
 * other four are plain cards — volt means live only. Later / Dismiss / Skip
 * hide a suggestion for the planner day (Skip: for good — see
 * slot-dismissals.ts); the slot then falls back to B. The slot
 * cross-fades between states (MotionConfig turns that into a swap for
 * reduced motion).
 */

const MY_DAY_HREF = "/personal/my-day";
const SHUTDOWN_HREF = "/personal/shutdown";

export function LiveSlotCard({ today, nowMinutes, className }: { today: string; nowMinutes: number; className?: string }) {
  const plan = useDayPlan(today);
  const all = useTasks({ view: "all" });
  const todayTasks = useTasks({ view: "today", day: today });
  const unscheduled = useUnscheduledTasks(today, "today");
  const [dismissed, dismiss] = useSlotDismissals(today);

  const slot = useMemo<LiveSlot>(() => {
    if (plan.status !== "ready" || !all.data || !todayTasks.data) return { kind: "live" };
    return liveSlot({
      nowMinutes,
      blocks: plan.blocks,
      taskCount: all.data.length,
      openToday: todayTasks.data.filter((task) => task.status === "open").length,
      unscheduled: unscheduled.data ?? [],
      freeMinutes: plan.capacity.freeMinutes,
      dismissed,
    });
  }, [plan, all.data, todayTasks.data, unscheduled.data, nowMinutes, dismissed]);

  return (
    <div data-slot="live-slot" data-state={slot.kind} className={cn("grid", className)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={slot.kind}
          className="grid"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
        >
          {slot.kind === "live" ? <NowCard className="h-full" /> : <SuggestionCard slot={slot} onDismiss={dismiss} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Frame({ chip, chipClassName, title, children }: { chip: ReactNode; chipClassName?: string; title: ReactNode; children: ReactNode }) {
  return (
    <ProductCard as="section" aria-labelledby="overview-slot-title" className="flex h-full min-h-56 flex-col gap-3">
      <span className={cn("inline-flex self-start rounded-pill px-3 py-1.5 text-xs font-bold", chipClassName ?? "bg-scope-soft text-scope-deep")}>
        {chip}
      </span>
      <h2 id="overview-slot-title" className="mt-auto type-h2">
        {title}
      </h2>
      {children}
    </ProductCard>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

function SuggestionCard({
  slot,
  onDismiss,
}: {
  slot: Exclude<LiveSlot, { kind: "live" }>;
  onDismiss: (kind: LiveSlot["kind"]) => void;
}) {
  const t = useTranslations("Overview.slot");
  const format = useMyDayFormat();
  const openSheet = useOpenSheet();

  switch (slot.kind) {
    case "morning":
      return (
        <Frame chip={t("morning.chip")} title={t("morning.title", { count: slot.openCount, countText: format.number(slot.openCount), free: format.duration(slot.freeMinutes) })}>
          <Actions>
            <Button asChild>
              <Link href={MY_DAY_HREF}>{t("planMyDay")}</Link>
            </Button>
            <Button variant="secondary" onClick={() => onDismiss("morning")}>
              {t("later")}
            </Button>
          </Actions>
        </Frame>
      );
    case "gap":
      return (
        <Frame
          chip={t("gap.chip", { gap: format.duration(slot.gapMinutes) })}
          title={t.rich("gap.title", {
            title: () => <bdi dir="auto">{slot.next.title}</bdi>,
            time: () => (
              <span dir="ltr" className="tabular">
                {format.clock(slot.next.startMinutes)}
              </span>
            ),
          })}
        >
          <p className="text-sm text-fg-secondary">
            {slot.fit
              ? t.rich("gap.fits", {
                  task: () => <bdi dir="auto">{slot.fit!.title}</bdi>,
                  duration: format.duration(slot.fit.durationMinutes ?? 0),
                })
              : t("gap.nothingFits")}
          </p>
          <Actions>
            {slot.fit ? (
              <Button asChild>
                <Link href={focusHref(slot.fit.id)}>{t("gap.doItNow")}</Link>
              </Button>
            ) : null}
            <Button asChild variant="secondary">
              <Link href={MY_DAY_HREF}>{t("gap.pickAnother")}</Link>
            </Button>
          </Actions>
        </Frame>
      );
    case "evening":
      return (
        <Frame
          chip={t("evening.chip", { time: format.clock(EVENING_FROM_MINUTES) })}
          chipClassName="bg-warning-soft text-warning-text"
          title={t("evening.title", { count: slot.openCount, countText: format.number(slot.openCount) })}
        >
          <Actions>
            <Button asChild>
              <Link href={SHUTDOWN_HREF}>{t("evening.start")}</Link>
            </Button>
            <Button variant="secondary" onClick={() => onDismiss("evening")}>
              {t("later")}
            </Button>
            <Button variant="outline" onClick={() => onDismiss("evening")}>
              {t("dismiss")}
            </Button>
          </Actions>
        </Frame>
      );
    case "first-run":
      return <FirstRunCard onAddTask={() => openSheet("quick-add")} onSkip={() => onDismiss("first-run")} />;
  }
}

const TOUR_STEPS = ["myday", "tasks", "calendar"] as const;

/** E · First run: start with the core three; a 3-step tour explains them in place. */
function FirstRunCard({ onAddTask, onSkip }: { onAddTask: () => void; onSkip: () => void }) {
  const t = useTranslations("Overview.slot.firstRun");
  const format = useMyDayFormat();
  const [step, setStep] = useState<number | null>(null);

  if (step !== null) {
    const id = TOUR_STEPS[step]!;
    const last = step === TOUR_STEPS.length - 1;
    return (
      <Frame chip={t("tourStep", { step: format.number(step + 1), total: format.number(TOUR_STEPS.length) })} title={t(`steps.${id}.title`)}>
        <p className="text-sm text-fg-secondary">{t(`steps.${id}.body`)}</p>
        <Actions>
          {last ? (
            <Button onClick={onAddTask}>{t("addTask")}</Button>
          ) : (
            <Button onClick={() => setStep(step + 1)}>{t("next")}</Button>
          )}
          {step > 0 ? (
            <Button variant="secondary" onClick={() => setStep(step - 1)}>
              {t("back")}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => setStep(null)}>
            {t("close")}
          </Button>
        </Actions>
      </Frame>
    );
  }

  return (
    <Frame chip={t("chip")} title={t("title")}>
      <p className="text-sm text-fg-secondary">{t("body")}</p>
      <Actions>
        <Button onClick={onAddTask}>{t("addTask")}</Button>
        <Button variant="secondary" onClick={() => setStep(0)}>
          {t("tour")}
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          {t("skip")}
        </Button>
      </Actions>
    </Frame>
  );
}
