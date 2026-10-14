"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { formatDate, type CalendarSystem, type DateFormatOptions } from "@/lib/dates/format";
import { getCalendarParts } from "@/lib/dates/month-grid";
import { convertDigits } from "@/lib/locale/digits";
import { Button } from "./button";
import { Calendar, type CalendarProps } from "./calendar";
import { Segmented } from "./segmented";

export interface DatePickerProps
  extends Omit<CalendarProps, "calendar" | "value" | "defaultValue" | "onValueChange" | "className"> {
  /** The day picked in the grid (controlled draft). */
  value?: Date | null;
  defaultValue?: Date | null;
  onValueChange?: (date: Date) => void;
  /** "Set date": commits the picked day. Disabled until a day is picked. */
  onConfirm?: (date: Date) => void;
  /** Calendar system (controlled). Defaults to the user's preference. */
  calendar?: CalendarSystem;
  onCalendarChange?: (calendar: CalendarSystem) => void;
  /** Heading at the inline start of the toolbar, e.g. "Due date". */
  title?: ReactNode;
  /** Defaults to "Set date". */
  confirmLabel?: string;
  /** Today / weekend key under the footer. Default true. */
  showLegend?: boolean;
  className?: string;
}

/** Any Friday, for the legend's weekday glyph ("Fr" / "ج"). */
const A_FRIDAY = new Date(2026, 9, 16);

/** "21 Mehr 1405" / "13 Oct 2026" / "۲۱ مهر ۱۴۰۵". */
function formatDayMonthYear(date: Date, options: DateFormatOptions): string {
  const year = convertDigits(String(getCalendarParts(date, options.calendar).year), options.digits);
  return `${formatDate(date, "dayMonth", options)} ${year}`;
}

/**
 * Inline Jalali/Gregorian date picker (Utility): a calendar toggle, the month
 * grid, and a footer that shows the picked day in both calendars with a
 * confirm action. Popover/sheet wrappers live elsewhere.
 */
export function DatePicker({
  value,
  defaultValue = null,
  onValueChange,
  onConfirm,
  calendar: calendarProp,
  onCalendarChange,
  title,
  confirmLabel,
  showLegend = true,
  className,
  ...calendarProps
}: DatePickerProps) {
  const t = useTranslations("UI");
  const preferences = usePreferences();
  const [uncontrolledCalendar, setUncontrolledCalendar] = useState<CalendarSystem>(preferences.calendar);
  const calendar = calendarProp ?? uncontrolledCalendar;
  const [uncontrolledValue, setUncontrolledValue] = useState<Date | null>(defaultValue);
  const selected = value === undefined ? uncontrolledValue : value;

  const options: DateFormatOptions = { calendar, locale: preferences.locale, digits: preferences.digits };
  const otherOptions: DateFormatOptions = {
    ...options,
    calendar: calendar === "jalali" ? "gregorian" : "jalali",
  };

  const changeCalendar = (next: CalendarSystem) => {
    if (calendarProp === undefined) setUncontrolledCalendar(next);
    onCalendarChange?.(next);
  };

  const pick = (date: Date) => {
    if (value === undefined) setUncontrolledValue(date);
    onValueChange?.(date);
  };

  return (
    <div className={cn("flex flex-col gap-3.5", className)}>
      <div className={cn("flex items-center gap-2", title ? "justify-between" : "justify-end")}>
        {title ? <h2 className="text-lg font-semibold text-fg">{title}</h2> : null}
        <Segmented<CalendarSystem>
          size="sm"
          variant="neutral"
          label={t("calendarSystem")}
          value={calendar}
          onValueChange={changeCalendar}
          options={[
            { value: "jalali", label: t("jalali") },
            { value: "gregorian", label: t("gregorian") },
          ]}
        />
      </div>

      <Calendar {...calendarProps} calendar={calendar} value={selected} onValueChange={pick} />

      <div className="flex items-center justify-between gap-2.5 rounded-row bg-scope-soft px-3.5 py-3">
        <div className="flex min-w-0 flex-col gap-0.5 text-scope-deep" aria-live="polite">
          {selected ? (
            <>
              <span className="text-sm font-bold">{formatDate(selected, "full", options)}</span>
              <span className="text-xs font-semibold">{formatDayMonthYear(selected, otherOptions)}</span>
            </>
          ) : (
            <span className="text-sm font-semibold">{t("noDateSelected")}</span>
          )}
        </div>
        <Button
          size="sm"
          disabled={!selected}
          onClick={() => {
            if (selected) onConfirm?.(selected);
          }}
        >
          {confirmLabel ?? t("setDate")}
        </Button>
      </div>

      {showLegend ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-fg-secondary" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full inset-ring-2 inset-ring-primary" />
            {t("today")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="font-bold text-weekend-text">{formatDate(A_FRIDAY, "weekdayNarrow", options)}</span>
            {t("weekend")}
          </span>
        </div>
      ) : null}
    </div>
  );
}
