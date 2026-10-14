"use client";

import { isSameDay } from "date-fns";
import { useTranslations } from "next-intl";
import { Segmented } from "@/components/ui/segmented";
import { usePreferenceActions, usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import {
  formatDate,
  formatDateRange,
  formatDuration,
  formatTime,
  getWeekDays,
  type CalendarSystem,
  type DateFormatOptions,
  type WeekDay,
} from "@/lib/dates/format";
import { formatDateParam } from "@/lib/dates/date-param";
import { nextWorkingDay } from "@/lib/dates/week";
import { SAMPLE_DATE, SAMPLE_DURATION_MINUTES, SAMPLE_HALF_DAY, SAMPLE_RANGE } from "../samples";
import { StyleguideSection } from "../styleguide-section";

type RowKey = "full" | "short" | "monthYear" | "range" | "time" | "duration";

const ROWS: readonly RowKey[] = ["full", "short", "monthYear", "range", "time", "duration"];

function formatRow(row: RowKey, options: DateFormatOptions): string {
  switch (row) {
    case "range":
      return formatDateRange(SAMPLE_RANGE[0], SAMPLE_RANGE[1], options);
    case "time":
      return formatTime(SAMPLE_DATE, options);
    case "duration":
      return formatDuration(SAMPLE_DURATION_MINUTES, options);
    default:
      return formatDate(SAMPLE_DATE, row, options);
  }
}

type DayLabel = "workday" | "halfDay" | "weekend";

/** Full work day, half day (Thursday) or weekend; a day the week leaves out has none. */
function dayLabel(day: WeekDay): DayLabel | null {
  if (day.isWeekend) return "weekend";
  if (day.isHalfDay) return "halfDay";
  return day.isWorkday ? "workday" : null;
}

/*
 * The day marker differs in shape as well as colour: a filled dot for a work
 * day, a ring for a half day, a red dot for the weekend.
 */
function DayMarker({ kind, onAccent = false }: { kind: DayLabel | null; onAccent?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 rounded-pill",
        kind === "workday" && (onAccent ? "bg-on-accent" : "bg-scope-dot"),
        kind === "halfDay" && (onAccent ? "border border-on-accent" : "border border-scope-dot"),
        kind === "weekend" && "bg-weekend",
        kind === null && "bg-transparent",
      )}
    />
  );
}

function WeekStrip({ options }: { options: DateFormatOptions }) {
  const t = useTranslations("Styleguide.dates");
  const days = getWeekDays(SAMPLE_DATE, options);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="type-label text-fg-muted">{t("week")}</h3>
      <ol className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const today = isSameDay(day.date, SAMPLE_DATE);
          const kind = dayLabel(day);
          return (
            <li
              key={day.date.toISOString()}
              aria-current={today ? "date" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 rounded-row py-2",
                today ? "bg-primary text-on-accent" : "bg-subtle",
              )}
            >
              <span
                aria-hidden
                className={cn("text-xs font-semibold", day.isWeekend && !today ? "text-weekend-text" : today ? "" : "text-fg-muted")}
              >
                {day.narrow}
              </span>
              <span aria-hidden className="tabular text-base font-semibold">
                {day.dayOfMonth}
              </span>
              <DayMarker kind={kind} onAccent={today} />
              <span className="sr-only">
                {day.label} {day.dayOfMonth}
                {kind ? `, ${t(kind)}` : ""}
                {today ? `, ${t("today")}` : ""}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-medium text-fg-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 rounded-pill bg-scope-dot" />
          {t("workday")}
        </span>
        <span className="flex items-center gap-1.5">
          <DayMarker kind="halfDay" />
          {t("halfDay")}
        </span>
        <span className="flex items-center gap-1.5 text-weekend-text">
          <DayMarker kind="weekend" />
          {t("weekend")}
        </span>
      </p>
    </div>
  );
}

/** Scheduling rules that read the week config and the URL date format. */
function DateRules({ options }: { options: DateFormatOptions }) {
  const t = useTranslations("Styleguide.dates");
  const next = nextWorkingDay(SAMPLE_HALF_DAY);

  return (
    <dl className="flex flex-col divide-y divide-line">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
        <dt className="text-xs font-semibold text-fg-muted">
          {t("nextWorkingDay", { from: formatDate(SAMPLE_HALF_DAY, "weekday", options) })}
        </dt>
        <dd className="text-sm font-semibold">{next ? formatDate(next, "full", options) : "—"}</dd>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
        <dt className="text-xs font-semibold text-fg-muted">{t("urlParam")}</dt>
        <dd>
          <code dir="ltr" className="text-sm font-semibold">
            ?date={formatDateParam(SAMPLE_DATE)}
          </code>
        </dd>
      </div>
    </dl>
  );
}

export function DatesSection() {
  const t = useTranslations("Styleguide.dates");
  const { locale, digits, calendar } = usePreferences();
  const { update } = usePreferenceActions();
  const calendars: readonly CalendarSystem[] = ["jalali", "gregorian"];

  return (
    <StyleguideSection
      id="dates"
      span="wide"
      title={t("title")}
      description={t("description")}
      action={
        <Segmented
          label={t("calendarLabel")}
          variant="neutral"
          value={calendar}
          onValueChange={(next) => update({ calendar: next })}
          options={calendars.map((value) => ({ value, label: t(value) }))}
        />
      }
    >
      <div className="flex flex-col">
        <div className="hidden grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b border-line pb-2 md:grid">
          <span />
          {calendars.map((value) => (
            <span key={value} className={cn("type-label", value === calendar ? "text-scope-deep" : "text-fg-muted")}>
              {t(value)}
            </span>
          ))}
        </div>
        <dl className="flex flex-col divide-y divide-line">
          {ROWS.map((row) => (
            <div key={row} className="grid grid-cols-2 gap-x-4 gap-y-1 py-3 md:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)]">
              <dt className="col-span-2 text-xs font-semibold text-fg-muted md:col-span-1">{t(row)}</dt>
              {calendars.map((value) => (
                <dd key={value} className="min-w-0">
                  <span className="type-label block text-fg-muted md:sr-only">{t(value)}</span>
                  <span className={cn("text-sm", value === calendar ? "font-semibold" : "text-fg-secondary")}>
                    {formatRow(row, { calendar: value, locale, digits })}
                  </span>
                </dd>
              ))}
            </div>
          ))}
        </dl>
      </div>
      <WeekStrip options={{ calendar, locale, digits }} />
      <DateRules options={{ calendar, locale, digits }} />
    </StyleguideSection>
  );
}
