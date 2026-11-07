import { addDaysToDay, dayToLocalDate, localDateToDay } from "@/lib/dates/clock-time";
import type { CalendarSystem } from "@/lib/dates/format";
import { addCalendarMonths, startOfCalendarMonth } from "@/lib/dates/month-grid";
import { daysBetween } from "../format";

/*
 * Horizontal time scale shared by PJ-04 Timeline and PJ-05 Gantt: pixels per
 * day by zoom, day → x, bar spans, and axis ticks (calendar months in the
 * user's calendar, weeks from Saturday, or days). RTL mirrors through
 * coordinates (x → width − x), never a CSS flip.
 */

export type Zoom = "days" | "weeks" | "months" | "quarter";

export const PX_PER_DAY: Record<Zoom, number> = { days: 32, weeks: 16, months: 6, quarter: 2.5 };

export interface Tick {
  day: string;
  x: number;
  /** Label anchor: month / week / day start. */
  kind: "month" | "week" | "day";
}

export interface TimeScale {
  from: string;
  to: string;
  ppd: number;
  width: number;
  rtl: boolean;
  /** Inline-start edge of a day in screen coordinates. */
  x(day: string): number;
  /** Centre of a day (now line, milestone diamond). */
  center(day: string): number;
  /** Screen box of a span of days (inclusive), at least `minWidth` wide. */
  span(start: string, end: string, minWidth?: number): { left: number; width: number };
  /** Whole days for a pointer move of `dx` screen pixels (direction-aware). */
  daysFor(dx: number): number;
  ticks(calendar: CalendarSystem): Tick[];
}

export function makeScale(from: string, to: string, zoom: Zoom, rtl: boolean): TimeScale {
  const ppd = PX_PER_DAY[zoom];
  const days = Math.max(1, daysBetween(from, to) + 1);
  const width = Math.ceil(days * ppd);
  const raw = (day: string) => daysBetween(from, day) * ppd;
  const scale: TimeScale = {
    from,
    to,
    ppd,
    width,
    rtl,
    x: (day) => (rtl ? width - raw(day) : raw(day)),
    center: (day) => (rtl ? width - raw(day) - ppd / 2 : raw(day) + ppd / 2),
    span: (start, end, minWidth = 0) => {
      const left = raw(start);
      const natural = (daysBetween(start, end) + 1) * ppd;
      const w = Math.max(minWidth, natural);
      return { left: rtl ? width - left - w : left, width: w };
    },
    daysFor: (dx) => Math.round((rtl ? -dx : dx) / ppd),
    ticks: (calendar) => {
      const ticks: Tick[] = [];
      if (zoom === "months" || zoom === "quarter") {
        let month = startOfCalendarMonth(dayToLocalDate(from), calendar);
        for (let guard = 0; guard < 48; guard++) {
          const day = localDateToDay(month);
          if (day > to) break;
          if (day >= from) ticks.push({ day, x: scale.x(day), kind: "month" });
          month = addCalendarMonths(month, 1, calendar);
        }
      } else {
        const step = zoom === "weeks" ? 7 : 1;
        // Weeks start on Saturday (Iran week).
        let day = from;
        if (step === 7) while (new Date(`${day}T00:00:00Z`).getUTCDay() !== 6) day = addDaysToDay(day, 1);
        for (; day <= to; day = addDaysToDay(day, step)) ticks.push({ day, x: scale.x(day), kind: step === 7 ? "week" : "day" });
      }
      return ticks;
    },
  };
  return scale;
}

/** Greedy packing of spans into rows so bars in one lane never overlap. */
export function packRows<T extends { start: string; end: string }>(items: readonly T[]): T[][] {
  const rows: { end: string; items: T[] }[] = [];
  for (const item of [...items].sort((a, b) => a.start.localeCompare(b.start))) {
    const row = rows.find((candidate) => candidate.end < item.start);
    if (row) {
      row.items.push(item);
      row.end = item.end;
    } else rows.push({ end: item.end, items: [item] });
  }
  return rows.map((row) => row.items);
}
