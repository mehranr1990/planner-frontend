"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { ErrorState, LoadingState } from "@/components/feedback/state-views";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/design-system/surfaces/product-card";
import {
  SignatureCard,
  SignatureCardAction,
  SignatureCardHeader,
} from "@/design-system/surfaces/signature-card";
import { useUnscheduledTasks } from "@/data/queries";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { useOpenSheet } from "@/features/sheets/sheet-params";
import { cn } from "@/lib/cn";
import { addDaysToDay } from "@/lib/dates/clock-time";
import { workWindow } from "../domain/capacity";
import { gapHints } from "../domain/gaps";
import { nextFreeSlot } from "../domain/placement";
import { visibleWindow } from "../domain/window";
import { useMyDay, usePlannerNow, type MyDayView } from "../my-day-context";
import { useMyDayFormat } from "../ui/use-my-day-format";
import { BLOCK_HELP_ID } from "./time-block";
import { minuteToY, pxPerMinuteFor } from "./geometry";
import { EmptyDropZone, TimelineGrid, type DayColumnData } from "./timeline-grid";
import { useDayData } from "./use-day-data";
import { useIsDesktop } from "@/components/ui/use-is-desktop";

/*
 * The Timeline card of My Day. Desktop: the Signature card (the notch's
 * action is "Add block"), a title row with the hint and the Day / 3 days
 * switch, the full-height hour grid (no inner scroll). Below lg: a plain
 * rounded card with a bounded, inner-scrolling grid at 56px per hour that
 * opens with the now line in view, one day only (PM01). The overload bar or
 * any other footer goes in the `footer` slot; `emptyState` replaces the grid
 * for a day with no blocks but stays a drop target.
 */

export interface TimelineCardProps {
  /** Rendered under the grid inside the card (the capacity / overload bar). */
  footer?: ReactNode;
  /** Rendered instead of the grid when the day has no blocks. */
  emptyState?: ReactNode;
  /** Phone: give the grid a short fixed height (the Unscheduled tray is open) instead of filling the page. */
  shrunk?: boolean;
  className?: string;
}

export function TimelineCard({ footer, emptyState, shrunk = false, className }: TimelineCardProps) {
  const t = useTranslations("MyDay.timeline");
  const tBlock = useTranslations("MyDay.block");
  const desktop = useIsDesktop();
  const openSheet = useOpenSheet();
  const { view, setView } = useMyDay();
  const headingId = useId();

  const body = (
    <>
      <TimelineBody desktop={desktop} emptyState={emptyState} shrunk={shrunk} />
      {footer}
      {/* One description for every block's aria-describedby. */}
      <p id={BLOCK_HELP_ID} className="sr-only">
        {tBlock("help")}
      </p>
    </>
  );

  if (!desktop) {
    return (
      <ProductCard
        as="section"
        aria-labelledby={headingId}
        padding="none"
        className={cn("gap-3 rounded-[26px] p-3", className)}
      >
        <h2 id={headingId} className="sr-only">
          {t("title")}
        </h2>
        {body}
      </ProductCard>
    );
  }

  return (
    <SignatureCard
      as="section"
      aria-labelledby={headingId}
      className={className}
      contentClassName="flex flex-col gap-3.5 pb-4.5"
      action={
        <SignatureCardAction label={t("addBlock")} icon={Plus} onClick={() => openSheet("quick-add")} />
      }
    >
      <SignatureCardHeader className="flex-wrap gap-y-2">
        <h2 id={headingId} className="text-[19px] leading-tight font-semibold">
          {t("title")}
        </h2>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fg-muted">{t("hint")}</span>
        <Segmented<MyDayView>
          label={t("viewLabel")}
          variant="neutral"
          size="sm"
          value={view}
          onValueChange={setView}
          options={[
            { value: "day", label: t("day") },
            { value: "3days", label: t("threeDays") },
          ]}
        />
      </SignatureCardHeader>
      {body}
    </SignatureCard>
  );
}

function TimelineBody({ desktop, emptyState, shrunk }: { desktop: boolean; emptyState?: ReactNode; shrunk: boolean }) {
  const { view } = useMyDay();
  return desktop && view === "3days" ? <ThreeDaysBody /> : <SingleDayBody desktop={desktop} emptyState={emptyState} shrunk={shrunk} />;
}

// ── Single day ───────────────────────────────────────────────────────────

function SingleDayBody({ desktop, emptyState, shrunk }: { desktop: boolean; emptyState?: ReactNode; shrunk: boolean }) {
  const t = useTranslations("MyDay.timeline");
  const format = useMyDayFormat();
  const { day, energy } = useMyDay();
  const now = usePlannerNow();
  const settings = usePlannerSettings();
  const data = useDayData(day);
  const unscheduled = useUnscheduledTasks(day, "today", settings.week);

  const work = workWindow(settings.workHours);
  const { startMinutes: workStart, endMinutes: workEnd } = work;
  const defaultDuration = settings.planning.defaultDurationMinutes;
  const pxPerMinute = pxPerMinuteFor(desktop);
  const { blocks, model } = data;
  const window = useMemo(
    () => visibleWindow(blocks, { startMinutes: workStart, endMinutes: workEnd }),
    [blocks, workStart, workEnd],
  );

  if (data.status === "pending") return <TimelineSkeleton desktop={desktop} shrunk={shrunk} />;
  if (data.status === "error") return <ErrorState onRetry={data.refetch} />;

  const isToday = day === now.day;
  const nowMinutes = isToday ? now.minutes : null;

  if (blocks.length === 0 && emptyState) {
    // A drop on an empty day lands at the next free half hour (today) or the start of work.
    const start = nextFreeSlot([], isToday ? now.minutes : workStart, defaultDuration) ?? workStart;
    return <EmptyDropZone day={day} startMinutes={start}>{emptyState}</EmptyDropZone>;
  }

  const state = model.capacity.state;
  const lastEnd = blocks.reduce((latest, block) => Math.max(latest, block.endMinutes), 0);
  const column: DayColumnData = {
    day,
    model,
    tasks: data.tasks,
    nowMinutes,
    freeSlotMinutes:
      state === "normal" ? nextFreeSlot(blocks, lastEnd, defaultDuration, window) : null,
    gapHints:
      state === "partial"
        ? gapHints(blocks, { startMinutes: workStart, endMinutes: workEnd }, unscheduled.data ?? [], energy, defaultDuration)
        : [],
  };

  // Below lg the grid scrolls inside the card; open on the now line (today) or the first block.
  const focusMinutes = nowMinutes ?? blocks[0]?.startMinutes ?? workStart;
  return (
    <GridScroller key={day} desktop={desktop} shrunk={shrunk} targetY={minuteToY(focusMinutes, window.startMinutes, pxPerMinute)}>
      <TimelineGrid
        columns={[column]}
        window={window}
        pxPerMinute={pxPerMinute}
        todayDay={now.day}
        label={t("gridLabel", { date: format.kicker(day) })}
      />
    </GridScroller>
  );
}

// ── Three days ───────────────────────────────────────────────────────────

function ThreeDaysBody() {
  const t = useTranslations("MyDay.timeline");
  const format = useMyDayFormat();
  const { day } = useMyDay();
  const now = usePlannerNow();
  const settings = usePlannerSettings();
  const { startMinutes: workStart, endMinutes: workEnd } = workWindow(settings.workHours);
  const days = [day, addDaysToDay(day, 1), addDaysToDay(day, 2)] as const;
  const first = useDayData(days[0]);
  const second = useDayData(days[1]);
  const third = useDayData(days[2]);
  const all = [first, second, third];
  const pxPerMinute = pxPerMinuteFor(true);

  const allBlocks = useMemo(
    () => [...first.blocks, ...second.blocks, ...third.blocks],
    [first.blocks, second.blocks, third.blocks],
  );
  const window = useMemo(
    () => visibleWindow(allBlocks, { startMinutes: workStart, endMinutes: workEnd }),
    [allBlocks, workStart, workEnd],
  );

  if (all.some((item) => item.status === "error")) {
    return <ErrorState onRetry={() => all.forEach((item) => item.refetch())} />;
  }
  if (all.some((item) => item.status === "pending")) return <TimelineSkeleton desktop />;

  const columns: DayColumnData[] = all.map((item, index) => ({
    day: days[index]!,
    model: item.model,
    tasks: item.tasks,
    nowMinutes: now.day === days[index] ? now.minutes : null,
  }));

  return (
    <TimelineGrid
      columns={columns}
      window={window}
      pxPerMinute={pxPerMinute}
      showHeaders
      todayDay={now.day}
      label={t("gridLabelRange", { from: format.dayMonth(days[0]), to: format.dayMonth(days[2]) })}
    />
  );
}

// ── Scroll and loading ───────────────────────────────────────────────────

/** Phone: the grid fills the card (which fills the page column); with the tray open it keeps a short fixed height. */
const PHONE_GRID_HEIGHT = {
  fill: "min-h-0 flex-1",
  shrunk: "h-[min(18rem,36dvh)] min-h-40 flex-none",
} as const;

/**
 * Desktop draws the whole day, so there is nothing to scroll. Below lg the
 * grid lives in a bounded scroller that starts with `targetY` about 40% down;
 * it only positions once, when the day opens, never on a tick. Setting
 * scrollTop is instant, so it is reduced-motion safe by construction.
 */
function GridScroller({
  desktop,
  shrunk,
  targetY,
  children,
}: {
  desktop: boolean;
  shrunk: boolean;
  targetY: number;
  children: ReactNode;
}) {
  const element = useRef<HTMLDivElement | null>(null);
  const initial = useRef({ desktop, targetY });
  useLayoutEffect(() => {
    const node = element.current;
    const { desktop: wide, targetY: y } = initial.current;
    if (!node || wide) return;
    node.scrollTop = Math.max(0, y - node.clientHeight * 0.4);
  }, []);
  if (desktop) return <>{children}</>;
  return (
    <div
      ref={element}
      data-slot="timeline-scroller"
      className={cn(PHONE_GRID_HEIGHT[shrunk ? "shrunk" : "fill"], "overflow-y-auto overscroll-contain")}
    >
      {children}
    </div>
  );
}

function TimelineSkeleton({ desktop, shrunk = false }: { desktop: boolean; shrunk?: boolean }) {
  const t = useTranslations("MyDay.timeline");
  return (
    <LoadingState label={t("loading")} className={cn(!desktop && PHONE_GRID_HEIGHT[shrunk ? "shrunk" : "fill"], !desktop && "overflow-hidden")}>
      <div data-slot="timeline-skeleton" className="relative flex flex-col gap-3 ps-15 pt-2">
        {[44, 124, 44, 44, 124, 60].map((height, index) => (
          <Skeleton key={index} shape="tile" className="w-full rounded-[14px]" style={{ height }} />
        ))}
      </div>
    </LoadingState>
  );
}
