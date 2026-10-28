"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, type ReactNode } from "react";
import { Calendar } from "@/components/ui/calendar";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { MyDayProvider } from "@/features/my-day/my-day-context";
import { UnscheduledCard, UnscheduledTray } from "@/features/my-day/rail";
import { RescheduleHost } from "@/features/my-day/reschedule/reschedule-host";
import { MyDayDndProvider } from "@/features/my-day/timeline";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { PreferencesOverride } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { dayToLocalDate, localDateToDay } from "@/lib/dates/clock-time";
import { CalendarProvider, useCalendar } from "./calendar-context";
import { CalendarHeader } from "./calendar-toolbar";
import { AgendaList, AgendaView } from "./agenda-view";
import { rangeDays } from "./domain/navigation";
import { MonthDndProvider } from "./month-dnd";
import { MonthView } from "./month-view";
import { SelectedEventPanel } from "./selected-event-panel";
import { useCalendarData, type CalendarData } from "./use-calendar-data";
import { useCalendarFormat } from "./use-calendar-format";
import { WeekView } from "./week-view";

/*
 * P04 Calendar. Header (range, prev / Today / next, Day · Week · Month ·
 * Agenda, Shamsi / Gregorian, + New), then the view beside a side column:
 * the selected event, the mini month (or, in Month, the selected day's
 * agenda) and My Day's Unscheduled card — the same list, dragged onto a
 * slot (Week / Day: date + time, My Day's controller) or a day (Month: date
 * only). Below lg the side column folds: the selected event sits above the
 * view and Unscheduled becomes the tray. The whole screen follows ?cal=
 * through a PreferencesOverride, so every reused My Day piece formats in the
 * chosen calendar. Mount inside <Suspense> (the URL state).
 */

export function CalendarScreen() {
  return (
    <CalendarProvider>
      <CalendarOverride>
        {/* My Day's UI state (selection, Reschedule, Unscheduled pills) stays on the planner's today. */}
        <MyDayProvider syncUrl={false}>
          <CalendarLayout />
        </MyDayProvider>
      </CalendarOverride>
    </CalendarProvider>
  );
}

function CalendarOverride({ children }: { children: ReactNode }) {
  const { calendar } = useCalendar();
  const patch = useMemo(() => ({ calendar }), [calendar]);
  return <PreferencesOverride patch={patch}>{children}</PreferencesOverride>;
}

function CalendarLayout() {
  const { view, anchor, calendar } = useCalendar();
  const { week } = usePlannerSettings();
  const days = useMemo(() => rangeDays(view, anchor, calendar, week), [view, anchor, calendar, week]);
  const data = useCalendarData(days);
  const Dnd = view === "month" ? MonthDndProvider : MyDayDndProvider;
  const weekEmpty = view === "week" && data.status === "ready" && days.every((day) => (data.byDay.get(day)?.length ?? 0) === 0);

  return (
    <Dnd>
      <div data-screen="calendar" className="flex min-w-0 flex-col gap-4 lg:gap-5">
        <CalendarHeader days={days} />
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,20rem)] lg:items-start lg:gap-4.5">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="lg:hidden">
              <SelectedEventPanel data={data} />
            </div>
            {view === "month" ? (
              <MonthView data={data} />
            ) : view === "agenda" ? (
              <AgendaView days={days} data={data} />
            ) : (
              <WeekView days={days} data={data} />
            )}
            <UnscheduledTray className="lg:hidden" />
          </div>
          <div data-slot="calendar-side" className="hidden min-w-0 flex-col gap-4.5 lg:flex">
            <SelectedEventPanel data={data} />
            {view === "month" ? <DayAgendaPanel data={data} /> : <MiniMonth />}
            {/* An empty week puts the tray forward (P04 Empty). */}
            <UnscheduledCard className={cn(weekEmpty && "ring-2 ring-scope-deep ring-offset-2 ring-offset-canvas")} />
          </div>
        </div>
      </div>
      <RescheduleHost />
    </Dnd>
  );
}

function MiniMonth() {
  const t = useTranslations("Calendar.mini");
  const { anchor, today, calendar, setAnchor } = useCalendar();
  return (
    <UtilityCard as="section" aria-label={t("label")}>
      <Calendar
        value={dayToLocalDate(anchor)}
        onValueChange={(date) => setAnchor(localDateToDay(date))}
        month={dayToLocalDate(anchor)}
        onMonthChange={(month) => setAnchor(localDateToDay(month))}
        calendar={calendar}
        today={dayToLocalDate(today)}
      />
    </UtilityCard>
  );
}

/** Month: the selected day's agenda. */
function DayAgendaPanel({ data }: { data: CalendarData }) {
  const t = useTranslations("Calendar.month");
  const format = useCalendarFormat();
  const { anchor } = useCalendar();
  const headingId = useId();
  const days = useMemo(() => [anchor], [anchor]);
  return (
    <ProductCard as="section" aria-labelledby={headingId} className="gap-3">
      <h2 id={headingId} className="text-[1.1875rem] font-semibold [&:lang(fa)]:font-bold">
        {t("dayPanel")} · {format.dayMonth(anchor)}
      </h2>
      <AgendaList days={days} data={data} empty={<p className="text-sm font-semibold text-fg-muted">{t("dayEmpty")}</p>} />
    </ProductCard>
  );
}
