import type { DayBlock } from "@/features/my-day/domain/day-blocks";
import { localDateToDay } from "@/lib/dates/clock-time";
import type { MonthGrid } from "@/lib/dates/month-grid";

/*
 * Month view cells: each day of the grid with at most two chips and a "+N"
 * for the rest (P04 rules). Neighbouring months' days are blank cells.
 */

export const MONTH_CHIP_LIMIT = 2;

export interface MonthCell {
  day: string;
  dayOfMonth: number;
  inMonth: boolean;
  isWeekend: boolean;
  isToday: boolean;
  chips: DayBlock[];
  /** Blocks beyond the chips. */
  overflow: number;
  total: number;
}

const NO_BLOCKS: readonly DayBlock[] = [];

export function monthCells(
  grid: MonthGrid,
  blocksByDay: ReadonlyMap<string, readonly DayBlock[]>,
  today: string,
  limit = MONTH_CHIP_LIMIT,
): MonthCell[][] {
  return grid.map((week) =>
    week.map((cell) => {
      const day = localDateToDay(cell.date);
      const blocks = cell.inMonth ? (blocksByDay.get(day) ?? NO_BLOCKS) : NO_BLOCKS;
      const sorted = [...blocks].sort((a, b) => a.startMinutes - b.startMinutes);
      return {
        day,
        dayOfMonth: cell.dayOfMonth,
        inMonth: cell.inMonth,
        isWeekend: cell.isWeekend,
        isToday: day === today,
        chips: sorted.slice(0, limit),
        overflow: Math.max(0, sorted.length - limit),
        total: sorted.length,
      };
    }),
  );
}

export interface AgendaDay {
  day: string;
  blocks: DayBlock[];
}

/** Agenda: the days that have something, each in start order. */
export function agendaDays(days: readonly string[], blocksByDay: ReadonlyMap<string, readonly DayBlock[]>): AgendaDay[] {
  return days
    .map((day) => ({ day, blocks: [...(blocksByDay.get(day) ?? NO_BLOCKS)].sort((a, b) => a.startMinutes - b.startMinutes) }))
    .filter((entry) => entry.blocks.length > 0);
}

/**
 * Month grid keyboard: arrows move by day / week (left and right follow the
 * direction), Home / End jump to the week's ends. Returns the new flat index,
 * clamped to the grid, or null for a key the grid does not handle.
 */
export function moveInGrid(index: number, key: string, total: number, rtl: boolean): number | null {
  const forward = rtl ? "ArrowLeft" : "ArrowRight";
  const back = rtl ? "ArrowRight" : "ArrowLeft";
  let next: number;
  if (key === forward) next = index + 1;
  else if (key === back) next = index - 1;
  else if (key === "ArrowDown") next = index + 7;
  else if (key === "ArrowUp") next = index - 7;
  else if (key === "Home") next = index - (index % 7);
  else if (key === "End") next = index - (index % 7) + 6;
  else return null;
  return Math.min(total - 1, Math.max(0, next));
}
