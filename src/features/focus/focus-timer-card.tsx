"use client";

import { Check, Circle, Pause, Play, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { Task } from "@/data/domain";
import { Progress } from "@/design-system/feedback/progress";
import { SignatureCard, SignatureCardAction, SignatureCardHeader } from "@/design-system/surfaces/signature-card";
import { cn } from "@/lib/cn";
import { phaseEndsAt, phaseMinutes, phaseProgress, remainingMs, type FocusSession } from "./domain/timer";
import { useFocusFormat } from "./use-focus-format";

/*
 * The timer card (P09): the screen's one signature card, focus preset
 * (72×72 / f30, 56px), Pause / Resume in the notch. Running = volt digits,
 * session bar and notch button; paused or ready drop volt entirely.
 */

export interface FocusTimerActions {
  pause(): void;
  resume(): void;
  extend(minutes: number): void;
  finishTask(): void;
  finishSession(): void;
}

const quietButton = "bg-on-deep-card/10 text-on-deep-card hover:bg-on-deep-card/20 active:bg-on-deep-card/25";

export function FocusTimerCard({
  session,
  now,
  task,
  actions,
}: {
  session: FocusSession;
  now: number;
  task: Task | undefined;
  actions: FocusTimerActions;
}) {
  const t = useTranslations("Focus");
  const format = useFocusFormat();
  const running = session.status === "running";
  const remaining = remainingMs(session, now);
  const endsAt = phaseEndsAt(session, now);
  const nextIsLong = session.cycle >= session.config.cyclesBeforeLongBreak;
  const nextBreak = phaseMinutes(session.config, nextIsLong ? "long" : "short");
  const nextStep = task?.checklist?.find((item) => !item.done);
  const seconds = Math.ceil(remaining / 1000);
  const pausedMinutes = session.pausedSince !== null ? Math.floor(Math.max(0, now - session.pausedSince) / 60_000) : 0;

  const notch = running ? (
    <SignatureCardAction
      icon={Pause}
      label={t("pause")}
      onClick={actions.pause}
      iconClassName="fill-current"
      className="bg-volt text-on-volt hover:bg-volt active:bg-volt"
    />
  ) : (
    <SignatureCardAction
      icon={Play}
      label={session.status === "ready" ? t("startFocus") : t("resume")}
      onClick={actions.resume}
      iconClassName="fill-current"
    />
  );

  return (
    <SignatureCard
      as="section"
      preset="focus"
      tone="deep"
      aria-labelledby="focus-task-title"
      className="motion-safe:animate-[mp-focus-enter_360ms_ease-out]"
      contentClassName="flex min-h-[26rem] flex-col gap-3 p-6 lg:p-7"
      action={notch}
    >
      <SignatureCardHeader className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex h-6 items-center gap-1.5 rounded-pill bg-on-deep-card/10 px-2.5 text-xs font-bold">
          <span aria-hidden="true" className={cn("size-2 rounded-full", running ? "bg-volt" : "bg-on-deep-card/50")} />
          {running
            ? t("status.focusing")
            : session.status === "paused"
              ? t("status.paused", { minutes: format.digits(pausedMinutes) })
              : t("status.ready")}
        </span>
        {task?.project ? (
          <span className="text-xs text-on-deep-card-muted">
            <bdi dir="auto">{task.project}</bdi>
          </span>
        ) : null}
      </SignatureCardHeader>

      <h2 id="focus-task-title" className="text-[clamp(1.75rem,4vw,2.5rem)] leading-tight font-semibold">
        <bdi dir="auto">{task?.title ?? t("noTaskTitle")}</bdi>
      </h2>
      {task?.subtasks ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-on-deep-card-muted">
          {nextStep ? (
            <span className="inline-flex items-center gap-2 font-semibold text-on-deep-card">
              <Icon icon={Circle} size={18} />
              <bdi dir="auto">{nextStep.title}</bdi>
            </span>
          ) : null}
          <span>
            {t("subtasks", { done: format.digits(task.subtasks.done), total: format.digits(task.subtasks.total) })}
          </span>
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-end gap-x-6 gap-y-2 pt-6">
        {/* Clock digits are an LTR island; role=timer is not live, so it never announces each second. */}
        <p
          role="timer"
          dir="ltr"
          aria-label={t("timerLabel", { minutes: format.digits(Math.floor(seconds / 60)), seconds: format.digits(seconds % 60) })}
          className={cn(
            "text-[clamp(4.5rem,15vw,8.5rem)] leading-none font-light tracking-tight tabular",
            running ? "text-volt" : "text-on-deep-card",
          )}
        >
          {format.clock(remaining)}
        </p>
        <p className="pb-3 text-xs leading-relaxed text-on-deep-card-muted">
          {endsAt !== null
            ? t("of", { total: format.clock(session.durationMs), end: format.time(endsAt) })
            : t("ofPaused", { total: format.clock(session.durationMs) })}
          <br />
          {t(nextIsLong ? "thenLong" : "then", { minutes: format.digits(nextBreak) })}
        </p>
      </div>
      <Progress
        value={phaseProgress(session, now) * 100}
        label={t("sessionBar")}
        valueText={format.clock(remaining)}
        className="bg-on-deep-card/15"
        indicatorClassName={cn("duration-1000 ease-linear", running ? "bg-volt" : "bg-on-deep-card/60")}
      />
      <div className="flex flex-wrap gap-2 pt-2">
        <Button variant="ghost" className={quietButton} onClick={actions.finishTask} disabled={!task || task.status === "done"}>
          <Icon icon={Check} size={18} />
          {t("finishTask")}
        </Button>
        <Button variant="ghost" className={quietButton} onClick={actions.finishSession}>
          <Icon icon={Square} size={16} />
          {t("finishSession")}
        </Button>
        <Button variant="ghost" className={quietButton} onClick={() => actions.extend(5)}>
          {t("plusMinutes", { n: format.digits(5) })}
        </Button>
      </div>
    </SignatureCard>
  );
}
