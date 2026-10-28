"use client";

import { Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { remainingMs, type FocusSession } from "./domain/timer";
import { useFocusFormat } from "./use-focus-format";

/*
 * Break (P09FocusBreak): a calmer world on the airy info surface, no task
 * details and no volt. The breathing circle runs a 4-4 rhythm (static under
 * reduced motion); suggestion chips are quiet text, not actions.
 */

export interface FocusBreakActions {
  pause(): void;
  resume(): void;
  extend(minutes: number): void;
  skip(): void;
  end(): void;
}

export function FocusBreakCard({
  session,
  now,
  taskTitle,
  focusedToday,
  actions,
}: {
  session: FocusSession;
  now: number;
  taskTitle: string | undefined;
  /** Today's focus total, already formatted (long break only). */
  focusedToday: string;
  actions: FocusBreakActions;
}) {
  const t = useTranslations("Focus");
  const format = useFocusFormat();
  const long = session.phase === "long";
  const total = session.config.cyclesBeforeLongBreak;
  const n = format.digits;
  const remaining = remainingMs(session, now);
  const seconds = Math.ceil(remaining / 1000);
  const running = session.status === "running";
  const suggestions = [
    t("break.water"),
    t("break.look", { m: n(20) }),
    t("break.stretch"),
    ...(long ? [t("break.walk")] : []),
  ];

  return (
    <SignatureCard
      as="section"
      preset="focus"
      aria-labelledby="focus-break-title"
      className="mx-auto w-full max-w-xl motion-safe:animate-[mp-fade-in_600ms_ease-out]"
      contentClassName="flex flex-col items-center gap-5 bg-info-soft p-6 text-center lg:p-8"
      action={
        <SignatureCardAction
          variant="neutral"
          icon={running ? Pause : Play}
          iconClassName="fill-current"
          label={running ? t("pause") : session.status === "ready" ? t("startBreak") : t("resume")}
          onClick={running ? actions.pause : actions.resume}
        />
      }
    >
      <p className="text-xs font-bold tracking-wide text-info-text uppercase">
        {long
          ? t("break.longEyebrow", { total: n(total) })
          : t("break.done", { current: n(session.cycle), total: n(total), minutes: n(session.config.focusMinutes) })}
      </p>
      <h2 id="focus-break-title" className="text-[clamp(1.5rem,3.5vw,2.25rem)] leading-tight font-medium">
        {t("break.title")}
      </h2>

      <div className="relative grid size-64 place-items-center">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-info-text/8 motion-safe:animate-[mp-breathe_8s_ease-in-out_infinite]"
        />
        <span aria-hidden="true" className="absolute inset-11 rounded-full bg-info-text/8" />
        <div className="relative flex flex-col items-center gap-1">
          <span className="text-xs font-semibold text-info-text">{t(`phases.${session.phase}`)}</span>
          <p
            role="timer"
            dir="ltr"
            aria-label={t("timerLabel", { minutes: n(Math.floor(seconds / 60)), seconds: n(seconds % 60) })}
            className="text-[4rem] leading-none font-light tabular"
          >
            {format.clock(remaining)}
          </p>
          <span className="text-xs text-fg-secondary">{t("break.breathe", { s: n(4) })}</span>
        </div>
      </div>

      <ul aria-label={t("break.suggestions")} className="flex flex-wrap justify-center gap-2">
        {suggestions.map((text) => (
          <li key={text} className="rounded-pill bg-surface px-3 py-1.5 text-xs font-semibold">
            {text}
          </li>
        ))}
      </ul>
      {long ? <p className="text-sm text-fg-secondary">{t("break.today", { total: focusedToday })}</p> : null}

      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="secondary" className="bg-surface" onClick={actions.skip}>
          {long ? t("skip") : t("skipBreak")}
        </Button>
        {long ? (
          <Button variant="secondary" className="bg-surface" onClick={actions.end}>
            {t("endFocus")}
          </Button>
        ) : (
          <Button variant="secondary" className="bg-surface" onClick={() => actions.extend(1)}>
            {t("plusMinutes", { n: n(1) })}
          </Button>
        )}
      </div>
      {long ? null : (
        <p className="text-xs text-fg-secondary">
          {taskTitle
            ? t("break.next", { next: n(session.cycle + 1), total: n(total), task: taskTitle })
            : t("break.nextNoTask", { next: n(session.cycle + 1), total: n(total) })}
          {" · "}
          {session.config.autoStartNext ? t("break.auto") : t("break.manual")}
        </p>
      )}
    </SignatureCard>
  );
}
