"use client";

import { Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { useFocusToday } from "@/data/queries";
import { SignatureCard, SignatureCardAction, SignatureCardHeader } from "@/design-system/surfaces/signature-card";
import { FocusRunDot, useFocusRunning } from "@/features/focus/focus-running";
import { useFocusSession } from "@/features/focus/focus-store";
import { useFocusSync } from "@/features/focus/use-focus-sync";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { usePlannerNow } from "../my-day-context";
import { useMyDayFormat } from "../ui/use-my-day-format";
import { FocusStartAction, focusHref } from "./focus-entry";
import { useNowBlock } from "./use-now-block";

/*
 * The Focus card (P02): an entry into Pomodoro, not the timer. It shows the
 * planner's focus setting and how many sessions are done today, and its
 * notch starts focus on the running block's task, or asks which task when
 * nothing task-shaped is running. It always speaks about the planner's
 * today, whichever day the page shows.
 */
export function FocusCard({ className }: { className?: string }) {
  const t = useTranslations("MyDay.focus");
  const format = useMyDayFormat();
  const { focus } = usePlannerSettings();
  const { day: today } = usePlannerNow();
  const summary = useFocusToday(today);
  const now = useNowBlock();
  const tFocus = useTranslations("Focus.running");
  const router = useRouter();
  // A live Focus session (left via "Leave focus") shows here and keeps recording cycles.
  const running = useFocusRunning();
  useFocusSync(useFocusSession());

  const taskId = now.status === "ready" ? (now.current?.taskId ?? null) : null;
  const counts = {
    focus: format.number(focus.focusMinutes),
    short: format.number(focus.shortBreakMinutes),
    cycles: format.number(focus.cyclesBeforeLongBreak),
  };

  return (
    <SignatureCard
      as="section"
      tone="scope-soft"
      aria-label={t("landmark")}
      className={className}
      contentClassName="flex flex-col gap-1"
      action={
        running ? (
          <SignatureCardAction icon={Timer} label={tFocus("open")} onClick={() => router.push(running.href)} />
        ) : (
          <FocusStartAction day={today} href={taskId ? focusHref(taskId) : undefined} />
        )
      }
    >
      <SignatureCardHeader>
        <h2 className="text-[0.9375rem] font-bold text-scope-deep">{t("title")}</h2>
      </SignatureCardHeader>
      {/* The clock is an LTR island that still sits at the inline-start edge. */}
      <p className="text-[2.75rem] font-medium leading-[1.1] tracking-tight">
        <span dir="ltr" className="tabular inline-block">
          {running ? running.time : format.digits(`${String(focus.focusMinutes).padStart(2, "0")}:00`)}
        </span>
      </p>
      {running ? (
        <p data-slot="focus-running" className="flex items-center gap-1.5 text-xs font-semibold text-scope-deep">
          <FocusRunDot state={running.state} />
          {tFocus(running.state, { time: running.time })}
        </p>
      ) : null}
      {summary.isPending ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">{t("loading")}</span>
          <Skeleton className="mt-1.5 h-3 w-[70%]" />
        </div>
      ) : (
        <p className="text-xs font-semibold text-scope-deep">
          {summary.data
            ? t("summary", {
                ...counts,
                cycle: format.number(summary.data.cycle),
                sessions: summary.data.sessionsCompleted,
                sessionsFormatted: format.number(summary.data.sessionsCompleted),
              })
            : t("plan", counts)}
        </p>
      )}
    </SignatureCard>
  );
}
