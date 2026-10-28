"use client";

import { useDroppable } from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { Task } from "@/data/domain";
import { cn } from "@/lib/cn";
import type { DayBlock, MinuteSpan } from "../domain/day-blocks";
import type { GapHint as GapHintData } from "../domain/gaps";
import { nowSummary } from "../domain/now";
import { dayDropId, type DayColumnGeometry } from "../drag";
import { useRegisterDayColumn } from "../drop-registry";
import { useMyDayFormat } from "../ui/use-my-day-format";
import { ClockText } from "./clock-text";
import { DragGhost } from "./drag-ghost";
import { ghostFor, useActiveDrag } from "./drag-state";
import { gridHeight, hourMarks, LABEL_COLUMN_PX, NOW_LINE_INSET_PX } from "./geometry";
import { NowLine } from "./now-line";
import { FreeSlot, GapHint } from "./slot-placeholders";
import { TimeBlock } from "./time-block";
import { laneOf, type DayModel } from "./timeline-model";

/*
 * The hour grid and its day columns. The grid draws the hour lines and the
 * label column once; each column is a drop target that tells the controller
 * where its minutes are (the registry), lays out that day's blocks, the ghost
 * of a drag and the placeholders, and (in the 3-days view) its own now line.
 */

export interface DayColumnData {
  day: string;
  model: DayModel;
  tasks: ReadonlyMap<string, Task>;
  /** The planner's minute-of-day when this column is today, else null. */
  nowMinutes: number | null;
  /** "Drop a task here" start, on a normal day. */
  freeSlotMinutes?: number | null;
  /** "2h free · 3 tasks fit" gaps, on a partly planned day. */
  gapHints?: readonly GapHintData[];
}

interface DayColumnProps {
  data: DayColumnData;
  window: MinuteSpan;
  pxPerMinute: number;
  /** Draw the now line inside this column (3-days view); the single-day grid draws one across itself. */
  nowLineInColumn: boolean;
}

/** Blocks that appeared since the previous data, so only they pop in. */
function useFreshIds(blocks: readonly DayBlock[]): ReadonlySet<string> {
  const key = blocks.map((block) => block.id).join("|");
  const [state, setState] = useState<{ key: string | null; ids: readonly string[]; fresh: ReadonlySet<string> }>({
    key: null,
    ids: [],
    fresh: new Set(),
  });
  if (state.key !== key) {
    const ids = blocks.map((block) => block.id);
    // The first data is not news.
    const fresh = state.key === null ? new Set<string>() : new Set(ids.filter((id) => !state.ids.includes(id)));
    setState({ key, ids, fresh });
  }
  return state.fresh;
}

export function DayColumn({ data, window, pxPerMinute, nowLineInColumn }: DayColumnProps) {
  const { day, model, tasks, nowMinutes, freeSlotMinutes = null, gapHints = [] } = data;
  const active = useActiveDrag();
  const element = useRef<HTMLDivElement | null>(null);
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(day) });
  const fresh = useFreshIds(model.blocks);
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      element.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );

  const geometry = useMemo<DayColumnGeometry>(
    () => ({
      day,
      windowStartMinutes: window.startMinutes,
      windowEndMinutes: window.endMinutes,
      pxPerMinute,
      getTop: () => element.current?.getBoundingClientRect().top ?? null,
    }),
    [day, window.startMinutes, window.endMinutes, pxPerMinute],
  );
  useRegisterDayColumn(geometry);

  const ghost = ghostFor(active, day);

  return (
    <div
      ref={ref}
      data-slot="day-column"
      data-day={day}
      data-over={isOver || undefined}
      className={cn("relative h-full rounded-[14px] transition-colors", isOver && active && "bg-scope-soft/40")}
    >
      {gapHints.map(({ gap, fit }) => (
        <GapHint
          key={gap.startMinutes}
          gap={gap}
          fit={fit}
          windowStartMinutes={window.startMinutes}
          pxPerMinute={pxPerMinute}
        />
      ))}
      {freeSlotMinutes !== null && !ghost ? (
        <FreeSlot startMinutes={freeSlotMinutes} windowStartMinutes={window.startMinutes} pxPerMinute={pxPerMinute} />
      ) : null}

      {model.blocks.map((block) => {
        const isCurrent = model.currentId === block.id && nowMinutes !== null;
        return (
          <TimeBlock
            key={block.id}
            block={block}
            day={day}
            window={window}
            pxPerMinute={pxPerMinute}
            lane={laneOf(model, block.id)}
            overlapMinutes={model.overlapById.get(block.id) ?? null}
            nowMinutes={isCurrent ? nowMinutes : null}
            leftMinutes={
              isCurrent && nowMinutes !== null
                ? nowSummary(block, block.taskId ? (tasks.get(block.taskId) ?? null) : null, nowMinutes).leftMinutes
                : null
            }
            isNew={fresh.has(block.id)}
          />
        );
      })}

      {ghost ? (
        <DragGhost
          placement={ghost.placement}
          overlapping={ghost.overlapping}
          windowStartMinutes={window.startMinutes}
          pxPerMinute={pxPerMinute}
        />
      ) : null}

      {nowLineInColumn && nowMinutes !== null ? (
        <NowLine nowMinutes={nowMinutes} window={window} pxPerMinute={pxPerMinute} insetStart={0} />
      ) : null}
    </div>
  );
}

/**
 * A day with nothing on it shows its empty state instead of the grid, but is
 * still a drop target: a task dropped on it lands at the next suggested slot.
 * It registers a column whose pixel scale is so steep that every position
 * inside it maps to that one start, so the controller needs no special case.
 */
export function EmptyDropZone({ day, startMinutes, children }: { day: string; startMinutes: number; children: ReactNode }) {
  const element = useRef<HTMLDivElement | null>(null);
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(day) });
  const geometry = useMemo<DayColumnGeometry>(
    () => ({
      day,
      windowStartMinutes: startMinutes,
      windowEndMinutes: startMinutes + 1,
      pxPerMinute: 1_000_000,
      getTop: () => element.current?.getBoundingClientRect().top ?? null,
    }),
    [day, startMinutes],
  );
  useRegisterDayColumn(geometry);
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      element.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );
  return (
    <div
      ref={ref}
      data-slot="empty-drop-zone"
      data-day={day}
      data-over={isOver || undefined}
      className={cn("rounded-[24px] transition-shadow", isOver && "ring-2 ring-scope-deep")}
    >
      {children}
    </div>
  );
}

export interface TimelineGridProps {
  columns: readonly DayColumnData[];
  window: MinuteSpan;
  pxPerMinute: number;
  /** Day headers above the columns (the 3-days view). */
  showHeaders?: boolean;
  /** Which column is the planner's today, for its header mark. */
  todayDay?: string;
  /** The protected focus window (Settings · Insights), drawn as a faint labelled band; null when off. */
  protectedFocus?: MinuteSpan | null;
  label: string;
}

export function TimelineGrid({ columns, window, pxPerMinute, showHeaders = false, todayDay, protectedFocus = null, label }: TimelineGridProps) {
  const t = useTranslations("MyDay.timeline");
  const format = useMyDayFormat();
  const height = gridHeight(window, pxPerMinute);
  // The protected focus window, clipped to the hours on screen; a cue only, drops into it stay allowed.
  const bandStart = protectedFocus ? Math.max(protectedFocus.startMinutes, window.startMinutes) : 0;
  const bandEnd = protectedFocus ? Math.min(protectedFocus.endMinutes, window.endMinutes) : 0;
  const band =
    bandEnd > bandStart
      ? { top: (bandStart - window.startMinutes) * pxPerMinute, height: (bandEnd - bandStart) * pxPerMinute }
      : null;
  const multiple = columns.length > 1;
  const today = columns.find((column) => column.nowMinutes !== null);
  const protectedId = useId();

  return (
    <div
      data-slot="timeline-grid"
      role="group"
      aria-label={label}
      aria-describedby={protectedFocus ? protectedId : undefined}
      className="relative w-full"
    >
      {protectedFocus ? (
        // The band is decoration (aria-hidden); assistive tech gets the window here instead.
        <p id={protectedId} className="sr-only">
          {t.rich("protectedFocusDescription", {
            range: format.clockRange(protectedFocus.startMinutes, protectedFocus.endMinutes),
            clock: (chunks) => <ClockText>{chunks}</ClockText>,
          })}
        </p>
      ) : null}
      {showHeaders ? (
        <div className="mb-2 flex" style={{ paddingInlineStart: LABEL_COLUMN_PX }}>
          <div className="grid min-w-0 flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
            {columns.map(({ day }) => (
              <div
                key={day}
                data-slot="day-header"
                data-today={day === todayDay || undefined}
                className="flex min-w-0 flex-col items-center gap-px rounded-[14px] bg-raised px-2 py-1.5 text-center data-[today=true]:bg-scope-soft data-[today=true]:text-scope-deep"
              >
                <span className="max-w-full truncate text-xs font-bold">{format.weekday(day)}</span>
                <span className={cn("max-w-full truncate text-[11px] font-semibold", day === todayDay ? "text-current" : "text-fg-muted")}>
                  {day === todayDay ? `${t("today")} · ${format.dayMonth(day)}` : format.dayMonth(day)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="relative" style={{ height }}>
        {band ? (
          <div
            aria-hidden
            data-slot="protected-focus"
            className="pointer-events-none absolute end-0 rounded-[14px] border border-dashed border-scope-deep/50 bg-scope-soft/40"
            style={{ insetInlineStart: LABEL_COLUMN_PX, top: band.top, height: band.height }}
          >
            <span className="absolute end-2 top-1 rounded-pill bg-surface px-2 text-[10px] leading-4 font-bold text-scope-deep">
              {t("protectedFocus")}
            </span>
          </div>
        ) : null}
        {hourMarks(window).map((minutes) => (
          <div
            key={minutes}
            aria-hidden
            data-slot="hour-line"
            className="absolute inset-x-0 border-t border-hairline"
            style={{ top: (minutes - window.startMinutes) * pxPerMinute }}
          >
            <span className="absolute start-0 -top-2 bg-surface pe-2 text-[11px] leading-4 font-semibold text-fg-muted">
              <ClockText>{format.clock(minutes)}</ClockText>
            </span>
          </div>
        ))}

        <div
          className="absolute inset-y-0 end-0 grid"
          style={{
            insetInlineStart: LABEL_COLUMN_PX,
            gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
            columnGap: multiple ? 8 : 0,
          }}
        >
          {columns.map((column) => (
            <DayColumn
              key={column.day}
              data={column}
              window={window}
              pxPerMinute={pxPerMinute}
              nowLineInColumn={multiple}
            />
          ))}
        </div>

        {!multiple && today && today.nowMinutes !== null ? (
          <NowLine
            nowMinutes={today.nowMinutes}
            window={window}
            pxPerMinute={pxPerMinute}
            insetStart={NOW_LINE_INSET_PX}
          />
        ) : null}
      </div>
    </div>
  );
}
