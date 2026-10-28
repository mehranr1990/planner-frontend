"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { remainingMs, type FocusSession } from "./domain/timer";
import { useFocusTimer } from "./focus-store";
import { usePreferences } from "@/features/preferences/use-preferences";
import { convertDigits } from "@/lib/locale/digits";
import { clockText } from "./use-focus-format";

/*
 * The running Focus session outside Focus (P09 "Leaving"): a chip in the
 * schedule island and a line on the My Day Focus card. Volt only while a
 * focus phase actually runs; paused and breaks use the soft scope tint.
 */

export const FOCUS_ROUTE = "/personal/focus";

export function focusRouteFor(taskId: string | null): string {
  return taskId ? `${FOCUS_ROUTE}?task=${encodeURIComponent(taskId)}` : FOCUS_ROUTE;
}

export type FocusRunState = "running" | "paused" | "break";

export interface FocusRunning {
  session: FocusSession;
  state: FocusRunState;
  /** Remaining time, already "mm:ss" with the viewer's digits. */
  time: string;
  href: string;
}

/** The live session for readers outside Focus; null when none (or it is complete). */
export function useFocusRunning(): FocusRunning | null {
  const { session, now } = useFocusTimer();
  const { digits } = usePreferences();
  if (!session || session.status === "complete") return null;
  const state: FocusRunState =
    session.status !== "running" ? "paused" : session.phase === "focus" ? "running" : "break";
  return { session, state, time: convertDigits(clockText(remainingMs(session, now)), digits), href: focusRouteFor(session.taskId) };
}

export function FocusRunDot({ state, className }: { state: FocusRunState; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-state={state}
      className={cn("size-2 shrink-0 rounded-full", state === "running" ? "bg-volt ring-2 ring-scope-deep" : "bg-scope-deep/40", className)}
    />
  );
}

function FocusIslandChipInner({ running }: { running: FocusRunning }) {
  const t = useTranslations("Focus");
  return (
    <Link
      href={running.href}
      data-slot="focus-chip"
      aria-label={t("running.chip", { status: t(`running.${running.state}`, { time: running.time }) })}
      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-pill bg-surface px-3 text-xs font-bold shadow-island hover:bg-subtle"
    >
      <FocusRunDot state={running.state} />
      <span dir="ltr" className="tabular">
        {running.time}
      </span>
    </Link>
  );
}

/** Schedule island chip: renders nothing unless a session is live. */
export function FocusIslandChip() {
  const running = useFocusRunning();
  return running ? <FocusIslandChipInner running={running} /> : null;
}
