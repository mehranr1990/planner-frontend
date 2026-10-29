"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { ErrorState, LoadingState } from "@/components/feedback/state-views";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsDesktop } from "@/components/ui/use-is-desktop";
import { SignatureCard, SignatureCardAction, SignatureCardHeader } from "@/design-system/surfaces/signature-card";
import { workWindow } from "@/features/my-day/domain/capacity";
import { protectedSpan } from "@/features/my-day/domain/placement";
import { visibleWindow } from "@/features/my-day/domain/window";
import { usePlannerNow } from "@/features/my-day/my-day-context";
import { LABEL_COLUMN_PX, pxPerMinuteFor } from "@/features/my-day/timeline/geometry";
import { BLOCK_HELP_ID } from "@/features/my-day/timeline/time-block";
import { TimelineGrid, type DayColumnData } from "@/features/my-day/timeline/timeline-grid";
import { buildDayModel } from "@/features/my-day/timeline/timeline-model";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { useOpenSheet } from "@/features/sheets/sheet-params";
import { cn } from "@/lib/cn";
import { weekdayOfDay } from "@/lib/dates/clock-time";
import { useCalendar } from "./calendar-context";
import { LayerChips } from "./calendar-toolbar";
import { visibleWeekDays, weekColumnsFor, weekWorkMinutes } from "./domain/navigation";
import type { CalendarData } from "./use-calendar-data";
import { useCalendarFormat } from "./use-calendar-format";

/*
 * Week (and Day) view: a Signature card ("+" = new event via Quick Add) with
 * the scope layers, day headers (Friday red, today tinted) and My Day's hour
 * grid with one column per day — the same blocks, lanes, drag, resize and
 * keyboard moves, so a task dropped on a slot gets a date and a time. Seven
 * columns while each is ≥96px, else three; one below lg (with a week strip).
 */

function useElementWidth(): [number | null, (node: HTMLElement | null) => void] {
  const [width, setWidth] = useState<number | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node || typeof ResizeObserver === "undefined") return;
    const next = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    next.observe(node);
    observer.current = next;
  }, []);
  return [width, ref];
}

export function WeekView({ days, data }: { days: readonly string[]; data: CalendarData }) {
  const t = useTranslations("Calendar");
  const tBlock = useTranslations("MyDay.block");
  const format = useCalendarFormat();
  const desktop = useIsDesktop();
  const openSheet = useOpenSheet();
  const now = usePlannerNow();
  const settings = usePlannerSettings();
  const { anchor, view, setAnchor } = useCalendar();
  const [width, measure] = useElementWidth();
  const headingId = useId();

  const work = workWindow(settings.workHours);
  const { startMinutes: workStart, endMinutes: workEnd, totalMinutes } = work;
  const columns = view === "day" ? 1 : weekColumnsFor(width === null ? null : width - LABEL_COLUMN_PX, desktop);
  const shown = useMemo(() => visibleWeekDays(days, anchor, columns), [days, anchor, columns]);
  const pxPerMinute = pxPerMinuteFor(desktop);

  const columnData = useMemo<DayColumnData[]>(
    () =>
      shown.map((day) => {
        const nowMinutes = day === now.day ? now.minutes : null;
        return {
          day,
          model: buildDayModel([...(data.byDay.get(day) ?? [])], { totalMinutes, nowMinutes }),
          tasks: data.tasks,
          nowMinutes,
        };
      }),
    [shown, data.byDay, data.tasks, now.day, now.minutes, totalMinutes],
  );
  const window = useMemo(
    () => visibleWindow(columnData.flatMap((column) => column.model.blocks), { startMinutes: workStart, endMinutes: workEnd }),
    [columnData, workStart, workEnd],
  );
  const weekEmpty = days.every((day) => (data.byDay.get(day)?.length ?? 0) === 0);
  const gridTemplate = { gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))`, columnGap: shown.length > 1 ? 8 : 0 };

  let body;
  if (data.status === "error") body = <ErrorState onRetry={data.refetch} />;
  else if (data.status === "pending")
    body = (
      <LoadingState label={t("week.loading")}>
        <div className="flex flex-col gap-3 ps-15 pt-2">
          {[44, 124, 60, 124].map((height, index) => (
            <Skeleton key={index} shape="tile" className="w-full rounded-[14px]" style={{ height }} />
          ))}
        </div>
      </LoadingState>
    );
  else
    body = (
      <div className="max-lg:max-h-[65dvh] max-lg:overflow-y-auto max-lg:overscroll-contain">
        <div className="relative">
          {/* Friday and today tints sit under the grid; never colour alone: headers carry the words. */}
          <div aria-hidden className="pointer-events-none absolute inset-y-0 end-0 grid" style={{ insetInlineStart: LABEL_COLUMN_PX, ...gridTemplate }}>
            {shown.map((day) => (
              <div
                key={day}
                className={cn(
                  "rounded-[14px]",
                  day === now.day ? "bg-scope-soft/45" : settings.week.weekendDays.includes(weekdayOfDay(day)) && "bg-danger-soft/50",
                )}
              />
            ))}
          </div>
          <TimelineGrid
            columns={columnData}
            window={window}
            pxPerMinute={pxPerMinute}
            todayDay={now.day}
            protectedFocus={protectedSpan(settings.insights.protectedFocus)}
            label={t("week.gridLabel", { from: format.dayMonth(shown[0]!), to: format.dayMonth(shown.at(-1)!) })}
          />
          {weekEmpty && view === "week" ? (
            <p className="pointer-events-none absolute inset-0 grid place-items-center ps-15 text-base font-semibold text-fg-muted/80">
              {t("week.free", { hours: format.duration(weekWorkMinutes(days, totalMinutes, settings.week)) })}
            </p>
          ) : null}
        </div>
      </div>
    );

  return (
    <SignatureCard
      as="section"
      aria-labelledby={headingId}
      contentClassName="flex flex-col gap-3.5 pb-4.5"
      action={<SignatureCardAction label={t("week.newEvent")} icon={Plus} onClick={() => openSheet("quick-add")} />}
    >
      <SignatureCardHeader className="flex-wrap gap-y-2">
        <h2 id={headingId} className="sr-only">
          {view === "day" ? t("toolbar.day") : t("week.title")}
        </h2>
        <LayerChips counts={data.counts} />
      </SignatureCardHeader>

      {!desktop && view === "week" ? <WeekStrip days={days} /> : null}

      <div ref={measure} className="flex flex-col gap-2">
        <div className="grid" style={{ paddingInlineStart: LABEL_COLUMN_PX, ...gridTemplate }}>
          {shown.map((day) => (
            <DayHeader key={day} day={day} onOpen={view === "week" && desktop ? () => setAnchor(day) : undefined} />
          ))}
        </div>
        {body}
      </div>
      <p id={BLOCK_HELP_ID} className="sr-only">
        {tBlock("help")}
      </p>
    </SignatureCard>
  );
}

function DayHeader({ day, onOpen }: { day: string; onOpen?: () => void }) {
  const t = useTranslations("Calendar.week");
  const format = useCalendarFormat();
  const now = usePlannerNow();
  const { week } = usePlannerSettings();
  const weekday = weekdayOfDay(day);
  const weekend = week.weekendDays.includes(weekday);
  const half = week.halfDays.includes(weekday);
  const today = day === now.day;
  const content = (
    <>
      <span className={cn("text-xs font-semibold", weekend ? "text-weekend-text" : "text-fg-muted", today && "text-scope-deep")}>
        {format.date(day, "weekdayShort")}
      </span>
      <span
        className={cn(
          "grid size-9 place-items-center rounded-full text-lg font-semibold tabular",
          today ? "bg-scope-deep text-on-accent" : weekend && "text-weekend-text",
        )}
      >
        {format.date(day, "day")}
      </span>
      <span className={cn("text-[11px] font-semibold text-fg-muted", today && "dark:text-fg-secondary")}>{format.altDate(day, "dayMonth")}</span>
      {weekend || half ? <span className="sr-only">{weekend ? t("weekend") : t("halfDay")}</span> : null}
    </>
  );
  const className = cn(
    "flex min-w-0 flex-col items-center gap-0.5 rounded-[14px] px-1 py-1.5 text-center",
    today && "bg-scope-soft",
  );
  return onOpen ? (
    <button type="button" data-slot="calendar-day-header" aria-current={today ? "date" : undefined} className={cn(className, "hover:bg-raised")} onClick={onOpen}>
      {content}
    </button>
  ) : (
    <div data-slot="calendar-day-header" aria-current={today ? "date" : undefined} className={className}>
      {content}
    </div>
  );
}

/** Phone: the week as a strip of seven days; the grid shows the chosen one. */
function WeekStrip({ days }: { days: readonly string[] }) {
  const t = useTranslations("Calendar.week");
  const format = useCalendarFormat();
  const now = usePlannerNow();
  const { week } = usePlannerSettings();
  const { anchor, setAnchor } = useCalendar();
  return (
    <div role="group" aria-label={t("strip")} className="grid grid-cols-7 gap-1">
      {days.map((day) => {
        const weekend = week.weekendDays.includes(weekdayOfDay(day));
        const selected = day === anchor;
        return (
          <button
            key={day}
            type="button"
            aria-pressed={selected}
            aria-current={day === now.day ? "date" : undefined}
            aria-label={format.kicker(day)}
            onClick={() => setAnchor(day)}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center rounded-[14px] text-xs font-semibold",
              selected ? "bg-scope-deep text-on-accent" : "bg-raised",
              !selected && weekend && "text-weekend-text",
            )}
          >
            <span>{format.date(day, "weekdayNarrow")}</span>
            <span className="text-sm tabular">{format.date(day, "day")}</span>
          </button>
        );
      })}
    </div>
  );
}
