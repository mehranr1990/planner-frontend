"use client";

import { addDays, isSameDay, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Direction } from "radix-ui";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { formatDate, getWeekDays, type CalendarSystem, type DateFormatOptions } from "@/lib/dates/format";
import { formatGregorian } from "@/lib/dates/gregorian";
import { formatJalali } from "@/lib/dates/jalali";
import {
  addCalendarMonths,
  clampToRange,
  dayKey,
  getDaysInCalendarMonth,
  getMonthGrid,
  isMonthInRange,
  isOutsideRange,
  isSameCalendarMonth,
  startOfCalendarMonth,
  weekColumn,
} from "@/lib/dates/month-grid";
import { convertDigits } from "@/lib/locale/digits";
import { IconButton } from "./button";

export interface CalendarProps {
  /** Selected day (controlled). */
  value?: Date | null;
  defaultValue?: Date | null;
  onValueChange?: (date: Date) => void;
  /** Any day in the visible month (controlled). */
  month?: Date;
  defaultMonth?: Date;
  onMonthChange?: (month: Date) => void;
  /** Defaults to the user's calendar preference. */
  calendar?: CalendarSystem;
  min?: Date | null;
  max?: Date | null;
  isDateDisabled?: (date: Date) => boolean;
  /** Event dots under day numbers. */
  hasMarker?: (date: Date) => boolean;
  /** Overrides "now" (tests, or server-provided time). */
  today?: Date;
  /** Show neighbouring months' days, muted. Default false (hidden, per Utility). */
  showOutsideDays?: boolean;
  /** Always six rows, so the height never jumps between months. */
  fixedWeeks?: boolean;
  className?: string;
}

function monthName(date: Date, options: DateFormatOptions): string {
  const raw =
    options.calendar === "jalali"
      ? formatJalali(date, "MMMM", options.locale)
      : formatGregorian(date, "MMMM", options.locale);
  return convertDigits(raw, options.digits);
}

/** The visible month in the other calendar: "Sep – Oct 2026" / "شهریور – مهر ۱۴۰۵". */
function equivalentMonths(first: Date, last: Date, options: DateFormatOptions): string {
  const start = formatDate(first, "monthYear", options);
  const end = formatDate(last, "monthYear", options);
  if (start === end) return start;
  const sameYear = start.split(" ").at(-1) === end.split(" ").at(-1);
  return `${sameYear ? monthName(first, options) : start} – ${end}`;
}

/**
 * Month grid on the Jalali or Gregorian calendar (Utility date picker):
 * Saturday-first weeks, Friday in the weekend tone, today ringed, the
 * selected day filled with the scope colour. role="grid" with a roving
 * tab stop: arrows move by day/week (left/right follow the direction),
 * Home/End jump to the week's ends, PageUp/PageDown change month
 * (+Shift: year).
 */
export function Calendar({
  value,
  defaultValue = null,
  onValueChange,
  month,
  defaultMonth,
  onMonthChange,
  calendar: calendarProp,
  min,
  max,
  isDateDisabled,
  hasMarker,
  today: todayProp,
  showOutsideDays = false,
  fixedWeeks = false,
  className,
}: CalendarProps) {
  const t = useTranslations("UI");
  const preferences = usePreferences();
  const direction = Direction.useDirection();
  const calendar = calendarProp ?? preferences.calendar;
  const options: DateFormatOptions = { calendar, locale: preferences.locale, digits: preferences.digits };
  const otherOptions: DateFormatOptions = {
    ...options,
    calendar: calendar === "jalali" ? "gregorian" : "jalali",
  };

  const [now] = useState(() => startOfDay(new Date()));
  const today = todayProp ? startOfDay(todayProp) : now;

  const [uncontrolledValue, setUncontrolledValue] = useState<Date | null>(defaultValue);
  const selected = value === undefined ? uncontrolledValue : value;

  const [uncontrolledMonth, setUncontrolledMonth] = useState<Date>(
    () => defaultMonth ?? selected ?? today,
  );
  const viewMonth = month ?? uncontrolledMonth;

  const [focusedDate, setFocusedDate] = useState<Date | null>(null);
  const shouldFocusRef = useRef(false);
  const gridRef = useRef<HTMLTableElement>(null);
  const titleId = useId();

  const first = startOfCalendarMonth(viewMonth, calendar);
  const last = addDays(first, getDaysInCalendarMonth(first, calendar) - 1);
  const grid = getMonthGrid(first, calendar, { fixedWeeks });
  const weekDays = getWeekDays(first, options);

  const isDisabled = (date: Date) => isOutsideRange(date, min, max) || (isDateDisabled?.(date) ?? false);

  // The one day that holds the tab stop in the visible month.
  const inView = (date: Date | null | undefined): date is Date =>
    !!date && isSameCalendarMonth(date, first, calendar);
  const activeDate = inView(focusedDate)
    ? focusedDate
    : inView(selected)
      ? selected
      : inView(today)
        ? today
        : clampToRange(first, min, max);

  const changeMonth = (next: Date) => {
    if (month === undefined) setUncontrolledMonth(next);
    onMonthChange?.(next);
  };

  const focusedKey = dayKey(activeDate);
  const focusDay = (key: string) =>
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${key}"]`)?.focus();

  const moveFocus = (target: Date) => {
    const next = clampToRange(target, min, max);
    setFocusedDate(next);
    if (dayKey(next) === focusedKey) {
      // A no-op move (Home on the week's first day, an arrow clamped at
      // min/max) changes no key, so the effect below would never run and a
      // stale flag would later pull focus into the grid on a header click.
      focusDay(focusedKey);
      return;
    }
    shouldFocusRef.current = true;
    if (!isSameCalendarMonth(next, first, calendar)) changeMonth(next);
  };

  useEffect(() => {
    if (!shouldFocusRef.current) return;
    shouldFocusRef.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focusedKey}"]`)?.focus();
  }, [focusedKey]);

  const select = (date: Date) => {
    if (isDisabled(date)) return;
    setFocusedDate(date);
    if (value === undefined) setUncontrolledValue(date);
    onValueChange?.(date);
    if (!isSameCalendarMonth(date, first, calendar)) changeMonth(date);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: Date) => {
    const forward = direction === "rtl" ? -1 : 1;
    let target: Date | null = null;
    switch (event.key) {
      case "ArrowRight":
        target = addDays(date, forward);
        break;
      case "ArrowLeft":
        target = addDays(date, -forward);
        break;
      case "ArrowDown":
        target = addDays(date, 7);
        break;
      case "ArrowUp":
        target = addDays(date, -7);
        break;
      case "Home":
        target = addDays(date, -weekColumn(date));
        break;
      case "End":
        target = addDays(date, 6 - weekColumn(date));
        break;
      case "PageUp":
        target = addCalendarMonths(date, event.shiftKey ? -12 : -1, calendar);
        break;
      case "PageDown":
        target = addCalendarMonths(date, event.shiftKey ? 12 : 1, calendar);
        break;
      default:
        return;
    }
    event.preventDefault();
    moveFocus(target);
  };

  const stepMonth = (amount: number) => {
    const nextMonth = addCalendarMonths(first, amount, calendar);
    // The header buttons keep focus where it is: drop any pending grid focus.
    shouldFocusRef.current = false;
    setFocusedDate(clampToRange(addCalendarMonths(activeDate, amount, calendar), min, max));
    changeMonth(nextMonth);
  };

  const canGoBack = isMonthInRange(addCalendarMonths(first, -1, calendar), calendar, min, max);
  const canGoForward = isMonthInRange(addCalendarMonths(first, 1, calendar), calendar, min, max);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-2">
        <IconButton
          icon={ChevronLeft}
          mirror
          size="sm"
          variant="secondary"
          label={t("previousMonth")}
          disabled={!canGoBack}
          onClick={() => stepMonth(-1)}
        />
        <div className="flex min-w-0 flex-1 flex-col items-center text-center">
          <span id={titleId} aria-live="polite" className="text-[1.0625rem] font-bold leading-tight text-fg">
            {formatDate(first, "monthYear", options)}
          </span>
          <span className="text-xs font-semibold text-fg-muted">{equivalentMonths(first, last, otherOptions)}</span>
        </div>
        <IconButton
          icon={ChevronRight}
          mirror
          size="sm"
          variant="secondary"
          label={t("nextMonth")}
          disabled={!canGoForward}
          onClick={() => stepMonth(1)}
        />
      </div>

      <table ref={gridRef} role="grid" aria-labelledby={titleId} className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            {weekDays.map((day) => (
              <th
                key={day.label}
                scope="col"
                abbr={day.label}
                className={cn(
                  "pb-1 text-center text-[0.6875rem] font-bold",
                  day.isWeekend ? "text-weekend-text" : "text-fg-muted",
                )}
              >
                {day.narrow}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((week) => (
            <tr key={dayKey(week[0]!.date)}>
              {week.map((day) => {
                const key = dayKey(day.date);
                const visible = day.inMonth || showOutsideDays;
                const isSelected = !!selected && isSameDay(day.date, selected);
                const isToday = isSameDay(day.date, today);
                const disabled = isDisabled(day.date);
                const marker = visible && (hasMarker?.(day.date) ?? false);
                return (
                  <td
                    key={key}
                    role="gridcell"
                    aria-selected={visible ? isSelected : undefined}
                    className="p-0.5 text-center"
                  >
                    {visible ? (
                      <button
                        type="button"
                        data-day={key}
                        tabIndex={day.inMonth && isSameDay(day.date, activeDate) ? 0 : -1}
                        aria-label={formatDate(day.date, "full", options)}
                        aria-pressed={isSelected}
                        aria-current={isToday ? "date" : undefined}
                        aria-disabled={disabled || undefined}
                        onClick={() => select(day.date)}
                        onKeyDown={(event) => handleKeyDown(event, day.date)}
                        className={cn(
                          "tabular relative mx-auto inline-flex size-10 items-center justify-center rounded-full text-sm font-medium transition-colors",
                          day.isWeekend ? "text-weekend-text" : "text-fg",
                          !day.inMonth && "text-fg-muted",
                          isToday && !isSelected && "font-extrabold inset-ring-2 inset-ring-primary",
                          isSelected
                            ? "bg-primary font-extrabold text-on-accent"
                            : !disabled && "hover:bg-subtle",
                          disabled && "cursor-not-allowed text-fg-muted line-through opacity-45",
                        )}
                      >
                        {convertDigits(String(day.dayOfMonth), options.digits)}
                        {marker ? (
                          <span
                            aria-hidden="true"
                            className={cn(
                              "absolute inset-x-0 bottom-1 mx-auto size-1 rounded-full",
                              isSelected ? "bg-on-accent" : "bg-scope-dot",
                            )}
                          />
                        ) : null}
                      </button>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
