"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import type { FocusSession } from "./domain/timer";
import { useFocusFormat } from "./use-focus-format";

/*
 * The cycle capsule at the top of Focus: one mark per cycle (done deep,
 * current wide, upcoming grey) and where the session is. Volt only on the
 * current cycle while focus runs; a break shows the next cycle in mint.
 */
export function FocusCapsule({ session }: { session: FocusSession }) {
  const t = useTranslations("Focus.capsule");
  const format = useFocusFormat();
  const total = session.config.cyclesBeforeLongBreak;
  const n = (value: number) => format.digits(value);
  const onBreak = session.phase !== "focus";
  const currentIndex = session.status === "complete" ? 0 : session.phase === "short" ? session.cycle + 1 : session.cycle;

  const text =
    session.status === "complete"
      ? t("complete")
      : session.phase === "focus"
        ? t("focus", { current: n(session.cycle), total: n(total) })
        : session.phase === "short"
          ? t("short", { next: n(session.cycle + 1), total: n(total) })
          : t("long", { total: n(total) });

  return (
    <div
      role="group"
      aria-label={t("label")}
      className="inline-flex min-h-11 items-center gap-3 rounded-pill bg-surface px-4 shadow-island"
    >
      <ol className="flex items-center gap-1.5">
        {Array.from({ length: total }, (_, index) => {
          const cycle = index + 1;
          const done = cycle <= session.completedCycles;
          const current = !done && cycle === currentIndex;
          return (
            <li
              key={cycle}
              data-state={done ? "done" : current ? "current" : "upcoming"}
              className={cn(
                "h-2.5 rounded-pill",
                done && "w-4 bg-scope-deep",
                current && "w-8",
                current && (onBreak || session.status !== "running" ? "bg-scope-soft ring-1 ring-scope-deep/30" : "bg-volt ring-1 ring-scope-deep"),
                !done && !current && "w-4 bg-hairline",
              )}
            >
              <span className="sr-only">
                {t(done ? "cycleDone" : current ? "cycleCurrent" : "cycleUpcoming", { n: n(cycle) })}
              </span>
            </li>
          );
        })}
      </ol>
      <span className="text-xs font-bold">{text}</span>
    </div>
  );
}
