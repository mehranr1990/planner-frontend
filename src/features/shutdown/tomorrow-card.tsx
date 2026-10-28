"use client";

import { ArrowUpRight, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EnergyBars } from "@/components/ui/energy-bars";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/design-system/feedback/progress";
import { SignatureCard, SignatureCardAction, SignatureCardHeader } from "@/design-system/surfaces/signature-card";
import type { DayBlock } from "@/features/my-day/domain/day-blocks";
import { searchWithDayView } from "@/features/my-day/my-day-context";
import { useTasksFormat } from "@/features/tasks/ui/use-tasks-format";
import { cn } from "@/lib/cn";
import { busySpans, placeInGap, tomorrowGaps, type PendingTask, type Placements, type RouteDays, type TomorrowLoad } from "./domain/shutdown";

/*
 * Step 2 · Tomorrow (P10): the page's signature card. The notch opens
 * tomorrow in My Day. A compact hour list (the board's list, not the full
 * timeline): tomorrow's blocks and placed tasks in time order, free gaps
 * as "Drop here · 1h 15m free" targets. Placing is pick-then-slot (a real
 * button per step, so it works by keyboard and touch); Auto-arrange fills
 * the gaps by energy. The capacity bar grows as tasks land (220ms spring;
 * instant under reduced motion).
 */

export interface TomorrowCardProps {
  days: RouteDays;
  today: string;
  work: { startMinutes: number; endMinutes: number; totalMinutes: number };
  blocks: readonly DayBlock[];
  pending: readonly PendingTask[];
  placements: Placements;
  load: TomorrowLoad;
  suggestion: readonly PendingTask[];
  loading: boolean;
  onPlace(id: string, minutes: number | null): void;
  onArrange(): void;
  onApplySuggestion(): void;
  onKeep(): void;
}

type Row =
  | { kind: "block"; key: string; start: number; title: string; duration: number; energy: DayBlock["energy"]; placedId?: string }
  | { kind: "gap"; key: string; start: number; minutes: number };

export function TomorrowCard(props: TomorrowCardProps) {
  const { days, today, work, blocks, pending, placements, load, suggestion, loading } = props;
  const t = useTranslations("Shutdown.tomorrow");
  const format = useTasksFormat();
  const router = useRouter();
  const reduce = useReducedMotion();
  const [picked, setPicked] = useState<string | null>(null);

  const unplaced = pending.filter((task) => placements[task.id] === undefined);
  const pickedTask = unplaced.find((task) => task.id === picked) ?? null;

  const rows: Row[] = [
    ...blocks
      .filter((block) => block.kind !== "break")
      .map((block): Row => ({ kind: "block", key: block.id, start: block.startMinutes, title: block.title, duration: block.durationMinutes, energy: block.energy })),
    ...pending.flatMap((task): Row[] =>
      placements[task.id] === undefined
        ? []
        : [{ kind: "block", key: `p-${task.id}`, start: placements[task.id]!, title: task.title, duration: task.durationMinutes, energy: task.energy, placedId: task.id }],
    ),
    ...tomorrowGaps(busySpans(blocks, pending, placements), work).map(
      (gap): Row => ({ kind: "gap", key: `g-${gap.startMinutes}`, start: gap.startMinutes, minutes: gap.minutes }),
    ),
  ].sort((a, b) => a.start - b.start);

  const openInMyDay = () => {
    const search = searchWithDayView("", days.tomorrow, "day", today);
    router.push(`/personal/my-day${search ? `?${search}` : ""}`);
  };

  const ratio = load.totalMinutes > 0 ? load.plannedMinutes / load.totalMinutes : 0;
  const over = load.overMinutes > 0;

  return (
    <SignatureCard
      as="section"
      id="shutdown-tomorrow"
      tone="scope-soft"
      aria-labelledby="shutdown-tomorrow-title"
      action={<SignatureCardAction icon={ArrowUpRight} mirror variant="neutral" label={t("open")} onClick={openInMyDay} />}
      contentClassName="flex flex-col gap-3"
    >
      <SignatureCardHeader className="flex-col items-start gap-1">
        <p className="text-xs font-bold tracking-wide text-scope-deep uppercase">{t("kicker")}</p>
        <h2 id="shutdown-tomorrow-title" className={cn("type-h2 text-fg", !days.tomorrowIsWorkDay && "text-weekend-text")}>
          {format.dateHeader(days.tomorrow)}
        </h2>
        {!days.tomorrowIsWorkDay ? (
          <p className="text-xs font-semibold text-weekend-text">{t("weekend", { day: format.dateHeader(days.nextWorkingDay) })}</p>
        ) : null}
      </SignatureCardHeader>

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
          <span className={cn("font-bold", over ? "text-danger-text" : "text-fg")}>
            {t("planned", { duration: format.duration(load.plannedMinutes) })}
          </span>
          <span className="text-fg-muted">
            {t("of", {
              duration: format.duration(load.totalMinutes),
              range: format.clockRange(work.startMinutes, work.endMinutes),
            })}
          </span>
        </div>
          <Progress
            value={Math.min(100, Math.round(ratio * 100))}
            label={t("capacity")}
            valueText={format.percent(ratio)}
            size="sm"
            indicatorClassName={over ? "bg-danger" : undefined}
          />
      </div>

      {over && suggestion.length > 0 ? (
        <div role="status" className="flex flex-col gap-2 rounded-2xl bg-surface p-3.5">
          <p className="text-sm font-bold text-fg">{t("full.title")}</p>
          <p className="text-xs font-semibold text-danger-text">
            {t("full.meta", {
              planned: format.duration(load.plannedMinutes),
              over: format.duration(load.overMinutes),
              total: format.duration(load.totalMinutes),
            })}
          </p>
          <p className="text-xs text-fg-secondary">
            {t("full.suggest", { titles: suggestion.map((task) => `“${task.title}”`).join(" · ") })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={props.onApplySuggestion}>
              {t("full.apply")}
            </Button>
            <Button size="sm" variant="secondary" onClick={props.onKeep}>
              {t("full.keep")}
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-2" aria-hidden>
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li key={row.key} className="grid grid-cols-[3.25rem_1fr] items-center gap-2">
              <span dir="ltr" className="text-xs font-bold text-fg-secondary tabular">
                {format.clock(row.start)}
              </span>
              {row.kind === "block" ? (
                <motion.div
                  layout={!reduce}
                  transition={{ type: "spring", duration: 0.22 }}
                  className="flex min-h-11 items-center gap-2 rounded-xl bg-surface px-3 ps-4 [border-inline-start:3px_solid_var(--color-scope-deep)]"
                >
                  <span dir="auto" className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
                    {row.title}
                  </span>
                  <EnergyBars level={row.energy} />
                  <span className="text-xs text-fg-muted tabular">{format.durationShort(row.duration)}</span>
                  {row.placedId ? (
                    <button
                      type="button"
                      aria-label={t("unplace", { title: row.title, time: format.clock(row.start) })}
                      className="-me-1 grid size-8 place-items-center rounded-full text-fg-muted hover:bg-raised focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none"
                      onClick={() => props.onPlace(row.placedId!, null)}
                    >
                      <X aria-hidden size={14} />
                    </button>
                  ) : null}
                </motion.div>
              ) : (
                <button
                  type="button"
                  disabled={!pickedTask || placeInGap({ startMinutes: row.start, endMinutes: row.start + row.minutes }, pickedTask) === null}
                  aria-label={
                    pickedTask
                      ? t("placeHere", { title: pickedTask.title, time: format.clock(row.start) })
                      : t("dropHere", { duration: format.durationShort(row.minutes) })
                  }
                  onClick={() => {
                    if (!pickedTask) return;
                    props.onPlace(pickedTask.id, row.start);
                    setPicked(null);
                  }}
                  className={cn(
                    "min-h-11 rounded-xl border-[1.5px] border-dashed border-scope-deep/50 px-3 text-xs font-semibold text-scope-deep",
                    "enabled:hover:bg-surface focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none",
                    "disabled:opacity-70",
                    pickedTask && "border-solid border-scope-deep bg-surface/60",
                  )}
                >
                  {t("dropHere", { duration: format.durationShort(row.minutes) })}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      {unplaced.length > 0 ? (
        <div className="flex flex-col gap-2.5 rounded-2xl bg-surface/70 p-3">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("notPlaced", { count: format.number(unplaced.length) })}>
            <span className="me-1 text-xs font-bold text-fg">{t("notPlaced", { count: format.number(unplaced.length) })}</span>
            {unplaced.map((task) => (
              <button
                key={task.id}
                type="button"
                aria-pressed={picked === task.id}
                onClick={() => setPicked((current) => (current === task.id ? null : task.id))}
                className={cn(
                  "inline-flex min-h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold",
                  "focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none",
                  picked === task.id ? "bg-scope-deep text-on-accent" : "bg-subtle text-fg-secondary hover:text-fg",
                )}
              >
                <bdi>{task.title}</bdi>
                <span className="tabular opacity-80">· {format.durationShort(task.durationMinutes)}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-fg-muted">{t("pickToPlace")}</p>
            <Button size="sm" onClick={props.onArrange}>
              {t("autoArrange")}
            </Button>
          </div>
        </div>
      ) : null}
    </SignatureCard>
  );
}
