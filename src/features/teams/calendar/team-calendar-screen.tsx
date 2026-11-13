"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { ErrorState } from "@/components/feedback/state-views";
import { Button, IconButton } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/segmented";
import { getPlannerNow } from "@/data/clock";
import type { BusySlot } from "@/data/project-domain";
import { useMyBusy } from "@/data/project-queries";
import type { TeamEventDetail } from "@/data/team-domain";
import { useTeamCalendarOverlays, useTeamEvents } from "@/data/team-queries";
import { CalendarProvider, useCalendar } from "@/features/calendar/calendar-context";
import type { CalendarView } from "@/features/calendar/domain/calendar-params";
import { monthGridOf, rangeDays } from "@/features/calendar/domain/navigation";
import { useCalendarFormat } from "@/features/calendar/use-calendar-format";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { BusyChip, CalendarSystemOverride } from "@/features/projects/calendar/project-calendar-screen";
import { useMediaQuery } from "@/features/projects/use-media";
import type { CalendarSystem } from "@/lib/dates/format";
import { localDateToDay, weekdayOfDay } from "@/lib/dates/clock-time";
import { cn } from "@/lib/cn";
import { teamDemoAccessOptions } from "../demo-state";
import { useTeam } from "../team-gate";
import { TeamPageHeader } from "../team-page-header";
import {
  endOf,
  hourWindow,
  itemsByDay,
  minutesOf,
  pickEvent,
  startOf,
  TEAM_CAL_LAYERS,
  type TeamCalItem,
  type TeamCalLayer,
} from "./calendar-model";
import { TeamEventCard } from "./team-event-card";
import { CalendarMeetings } from "@/features/messages/meetings/calendar-meetings";
import { TeamEventDialog } from "./team-event-dialog";

/*
 * TM-03 · Team calendar (/teams/[id]/calendar). Reuses the Personal
 * Calendar's URL state (CalendarProvider: ?date / ?view / ?cal), navigation,
 * month grid and formatting (as PJ-07 does) with the team as one indigo
 * layer: team events, team task due dates, time off (a team event of kind
 * "time off", T7), events of projects the viewer can open (Projects blue)
 * and "My personal busy" (only me, untitled, off by default). The selected
 * event (?event=) shows in the event Signature card. Manual status is never
 * derived from this calendar and the calendar never shows live status.
 * Phones default to Agenda.
 */

const VIEWS = ["day", "week", "month", "agenda"] as const;
const HOUR_PX = 44;

export function TeamCalendarScreen() {
  return (
    <CalendarProvider>
      <CalendarSystemOverride>
        <TeamCalendarLayout />
      </CalendarSystemOverride>
    </CalendarProvider>
  );
}

function TeamCalendarLayout() {
  const t = useTranslations("TeamCal");
  const tNav = useTranslations("Navigation");
  const tCal = useTranslations("Calendar");
  const format = useCalendarFormat();
  const { team, capabilities, demo } = useTeam();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const phone = useMediaQuery("(max-width: 39.99rem)");
  const cal = useCalendar();
  const { week } = usePlannerSettings();
  const defaulted = useRef(false);
  const [shown, setShown] = useState<ReadonlySet<TeamCalLayer>>(new Set(TEAM_CAL_LAYERS));
  const [busyOn, setBusyOn] = useState(false);
  const [picked, setPicked] = useState<string | null>(() => params.get("event"));
  const [dialog, setDialog] = useState<{ open: boolean; editing: TeamEventDetail | null }>({
    open: false,
    editing: null,
  });

  // Phones default to Agenda unless the URL names a view.
  useEffect(() => {
    if (defaulted.current) return;
    defaulted.current = true;
    if (phone && !params.get("view")) cal.setView("agenda");
  }, [params, phone, cal]);

  const days = useMemo(() => {
    const all = rangeDays(cal.view, cal.anchor, cal.calendar, week);
    // The week grid shows the work week (Sat–Wed in Iran), like the board.
    return cal.view === "week" ? all.filter((day) => week.workDays.includes(weekdayOfDay(day))) : all;
  }, [cal.view, cal.anchor, cal.calendar, week]);
  const from = days[0]!;
  const to = days.at(-1)!;
  const events = useTeamEvents(team.id, from, to, teamDemoAccessOptions(demo));
  const overlays = useTeamCalendarOverlays(team.id, from, to);
  const busy = useMyBusy(from, to, busyOn);

  const byDay = useMemo(
    () => itemsByDay(events.data ?? [], overlays.data ?? [], shown),
    [events.data, overlays.data, shown],
  );
  const busyByDay = useMemo(() => {
    const map = new Map<string, BusySlot[]>();
    if (busyOn) for (const slot of busy.data ?? []) map.set(slot.day, [...(map.get(slot.day) ?? []), slot]);
    return map;
  }, [busy.data, busyOn]);
  const selected = pickEvent(events.data ?? [], picked);

  const select = (id: string) => {
    setPicked(id);
    const next = new URLSearchParams(params.toString());
    next.set("event", id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const header = (
    <TeamPageHeader
      module="calendar"
      title={tNav("items.calendar")}
      actions={
        <>
          <Segmented<(typeof VIEWS)[number]>
            label={tCal("toolbar.view")}
            value={cal.view}
            onValueChange={(next) => cal.setView(next as CalendarView)}
            options={VIEWS.map((value) => ({ value, label: tCal(`toolbar.${value}`) }))}
          />
          {capabilities.createTask ? (
            <Button className="gap-2" onClick={() => setDialog({ open: true, editing: null })}>
              <Icon icon={Plus} size={16} />
              {t("newEvent")}
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (events.isError || overlays.isError) {
    return (
      <>
        {header}
        <ErrorState
          onRetry={() => {
            void events.refetch();
            void overlays.refetch();
          }}
        />
      </>
    );
  }
  if (!events.data || !overlays.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  const title = cal.view === "month" ? format.date(cal.anchor, "monthYear") : format.range(from, to);

  return (
    <>
      {header}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,20rem)] lg:items-start">
        <section aria-labelledby="tcal-title" className="flex min-w-0 flex-col gap-4 rounded-[28px] bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <IconButton
                icon={ChevronLeft}
                mirror
                label={tCal("toolbar.previous")}
                variant="ghost"
                onClick={() => cal.shift(-1)}
              />
              <h2 id="tcal-title" className="text-[1.1875rem] font-semibold [&:lang(fa)]:font-bold">
                {title}
              </h2>
              <IconButton
                icon={ChevronRight}
                mirror
                label={tCal("toolbar.next")}
                variant="ghost"
                onClick={() => cal.shift(1)}
              />
              <Button variant="ghost" size="sm" onClick={cal.goToToday} aria-pressed={cal.anchor === cal.today}>
                {tCal("toolbar.today")}
              </Button>
              <Segmented<CalendarSystem>
                label={tCal("toolbar.system")}
                variant="neutral"
                size="sm"
                value={cal.calendar}
                onValueChange={cal.setCalendar}
                options={[
                  { value: "jalali", label: tCal("toolbar.shamsi") },
                  { value: "gregorian", label: tCal("toolbar.gregorian") },
                ]}
              />
            </div>
            <div role="group" aria-label={t("layers.label")} className="flex flex-wrap items-center gap-1.5">
              {TEAM_CAL_LAYERS.map((layer) => (
                <ToggleChip
                  key={layer}
                  scope={layer === "projects" ? "project" : "team"}
                  size="md"
                  selected={shown.has(layer)}
                  onSelectedChange={() => {
                    const next = new Set(shown);
                    if (next.has(layer)) next.delete(layer);
                    else next.add(layer);
                    setShown(next);
                  }}
                >
                  {t(`layers.${layer}`)}
                </ToggleChip>
              ))}
              <ToggleChip size="md" selected={busyOn} onSelectedChange={() => setBusyOn(!busyOn)}>
                {t(busyOn ? "layers.busyOn" : "layers.busyOff")}
              </ToggleChip>
            </div>
          </div>
          {cal.view === "month" ? (
            <MonthGrid byDay={byDay} selectedId={selected?.id ?? null} onSelect={select} />
          ) : cal.view === "agenda" ? (
            <Agenda
              days={days}
              byDay={byDay}
              busyByDay={busyByDay}
              selectedId={selected?.id ?? null}
              onSelect={select}
            />
          ) : (
            <TimeGrid
              days={days}
              byDay={byDay}
              busyByDay={busyByDay}
              selectedId={selected?.id ?? null}
              onSelect={select}
            />
          )}
        </section>
        {selected ? (
          <TeamEventCard
            teamId={team.id}
            event={selected}
            onEdit={() => setDialog({ open: true, editing: selected })}
          />
        ) : (
          <p className="rounded-[28px] bg-surface p-5 text-sm text-fg-muted">{t("pickEvent")}</p>
        )}
      </div>
      <TeamEventDialog
        teamId={team.id}
        days={days}
        defaultDay={days.includes(cal.anchor) ? cal.anchor : from}
        editing={dialog.editing}
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
      <CalendarMeetings source={{ kind: "team", workspaceId: team.id, name: team.name }} days={days} />
    </>
  );
}

interface ViewProps {
  byDay: ReadonlyMap<string, readonly TeamCalItem[]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** One item as a chip or block: events select the detail card, task dues open TM-15, project events open PJ-07. */
function ItemBody({
  item,
  selectedId,
  onSelect,
  block,
  style,
}: {
  item: TeamCalItem;
  selectedId: string | null;
  onSelect: (id: string) => void;
  block?: boolean;
  style?: CSSProperties;
}) {
  const t = useTranslations("TeamCal");
  const format = useCalendarFormat();
  const { team } = useTeam();
  const base = cn(
    "flex min-w-0 gap-1 overflow-hidden rounded-[10px] px-2 text-start text-[11px] font-semibold focus-visible:focus-ring",
    block ? "absolute inset-x-1 flex-col py-1.5" : "min-h-6 items-center",
  );
  if ("overlay" in item) {
    const { overlay } = item;
    if (overlay.kind === "task-due")
      return (
        <Link
          href={`/teams/${encodeURIComponent(team.id)}/work/${encodeURIComponent(overlay.taskId)}`}
          className={cn(base, "bg-danger-soft text-danger-text hover:underline")}
        >
          <bdi className="truncate">{t("due", { title: overlay.title })}</bdi>
        </Link>
      );
    return (
      <Link
        data-scope="project"
        href={`/projects/${encodeURIComponent(overlay.projectId)}/calendar?date=${overlay.day}`}
        aria-label={`${overlay.title}, ${t("projectEvent", { project: overlay.projectName })}`}
        style={style}
        className={cn(base, "bg-scope-soft text-scope-deep hover:underline")}
      >
        <bdi className="truncate">{overlay.title}</bdi>
        {!block ? (
          <bdi dir="ltr" className="shrink-0 tabular">
            {format.digits(overlay.time)}
          </bdi>
        ) : null}
      </Link>
    );
  }
  const { event } = item;
  const timeOff = event.kind === "time-off";
  const person = timeOff ? (event.organiser?.name ?? event.title) : null;
  const label = person ? t("timeOffOf", { name: person }) : event.title;
  return (
    <button
      type="button"
      aria-pressed={selectedId === event.id}
      onClick={() => onSelect(event.id)}
      style={style}
      className={cn(
        base,
        timeOff
          ? "bg-[repeating-linear-gradient(135deg,var(--color-hairline)_0_6px,transparent_6px_12px)] text-fg inset-ring inset-ring-outline"
          : event.kind === "checkin"
            ? "bg-surface text-scope-deep inset-ring-2 inset-ring-scope-deep/60"
            : event.kind === "deadline"
              ? "bg-danger-soft text-danger-text"
              : selectedId === event.id
                ? "bg-scope-deep text-on-accent"
                : "bg-scope-soft text-scope-deep",
      )}
    >
      <bdi className="truncate">{label}</bdi>
      {!block && event.time ? (
        <bdi dir="ltr" className="shrink-0 tabular">
          {format.digits(event.time)}
        </bdi>
      ) : null}
    </button>
  );
}

function DayHead({ day }: { day: string }) {
  const format = useCalendarFormat();
  const { today } = useCalendar();
  const { week } = usePlannerSettings();
  const weekend = week.weekendDays.includes(weekdayOfDay(day));
  return (
    <span
      aria-current={day === today ? "date" : undefined}
      className={cn(
        "truncate text-center text-xs font-semibold",
        day === today ? "text-scope-deep" : weekend ? "text-weekend-text" : "text-fg",
      )}
    >
      {format.date(day, "weekdayShort")} {format.date(day, "day")}
    </span>
  );
}

function TimeGrid({
  days,
  byDay,
  busyByDay,
  selectedId,
  onSelect,
}: ViewProps & {
  days: readonly string[];
  busyByDay: ReadonlyMap<string, readonly BusySlot[]>;
}) {
  const t = useTranslations("TeamCal");
  const format = useCalendarFormat();
  const all = days.flatMap((day) => byDay.get(day) ?? []);
  const window = hourWindow(
    all,
    days.flatMap((day) => busyByDay.get(day) ?? []),
  );
  const hours = Array.from({ length: (window.to - window.from) / 60 }, (_, index) => window.from / 60 + index);
  const now = getPlannerNow();
  const nowDay = now.slice(0, 10);
  const nowMinutes = minutesOf(now.slice(11, 16));
  const template = { gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))` };
  const top = (minutes: number) => ((minutes - window.from) / 60) * HOUR_PX;

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[36rem] flex-col gap-1.5">
        <div className="grid gap-1.5" style={template}>
          <span />
          {days.map((day) => (
            <DayHead key={day} day={day} />
          ))}
        </div>
        <div className="grid gap-1.5" style={template}>
          <span className="pt-1 text-[11px] font-semibold text-fg-muted">{t("allDay")}</span>
          {days.map((day) => (
            <ul key={day} aria-label={`${format.kicker(day)} · ${t("allDay")}`} className="flex min-h-7 flex-col gap-1">
              {(byDay.get(day) ?? [])
                .filter((item) => startOf(item) === null)
                .map((item) => (
                  <li key={"event" in item ? item.event.id : item.overlay.id}>
                    <ItemBody item={item} selectedId={selectedId} onSelect={onSelect} />
                  </li>
                ))}
            </ul>
          ))}
        </div>
        <div className="grid gap-1.5" style={template}>
          <div className="relative" style={{ height: hours.length * HOUR_PX }}>
            {hours.map((hour) => (
              <span
                key={hour}
                dir="ltr"
                className="absolute inset-x-0 text-[11px] font-semibold text-fg-muted tabular"
                style={{ top: (hour - window.from / 60) * HOUR_PX - 6 }}
              >
                {format.digits(`${String(hour).padStart(2, "0")}:00`)}
              </span>
            ))}
          </div>
          {days.map((day) => (
            <ul
              key={day}
              aria-label={format.kicker(day)}
              className="relative rounded-[16px] bg-subtle"
              style={{ height: hours.length * HOUR_PX }}
            >
              {(busyByDay.get(day) ?? []).map((slot) => (
                <li
                  key={`${slot.start}-${slot.end}`}
                  className="absolute inset-x-1"
                  style={{
                    top: top(minutesOf(slot.start)),
                    height: top(minutesOf(slot.end)) - top(minutesOf(slot.start)),
                  }}
                >
                  <BusyChip slot={slot} />
                </li>
              ))}
              {(byDay.get(day) ?? [])
                .filter((item) => startOf(item) !== null)
                .map((item) => (
                  <li key={"event" in item ? item.event.id : item.overlay.id}>
                    <ItemBody
                      item={item}
                      block
                      selectedId={selectedId}
                      onSelect={onSelect}
                      style={{
                        top: top(startOf(item)!),
                        height: Math.max(24, top(endOf(item)!) - top(startOf(item)!) - 2),
                      }}
                    />
                  </li>
                ))}
              {day === nowDay && nowMinutes >= window.from && nowMinutes <= window.to ? (
                <li
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 flex items-center"
                  style={{ top: top(nowMinutes) - 5 }}
                >
                  <span className="size-2.5 rounded-full bg-volt inset-ring-2 inset-ring-scope-deep" />
                  <span className="h-0.5 flex-1 bg-scope-deep" />
                </li>
              ) : null}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({ byDay, selectedId, onSelect }: ViewProps) {
  const format = useCalendarFormat();
  const { anchor, calendar, today, setAnchor } = useCalendar();
  const { week } = usePlannerSettings();
  const cells = useMemo(() => monthGridOf(anchor, calendar, week), [anchor, calendar, week]);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-7 gap-1.5">
        {cells[0]!.map((cell) => (
          <span
            key={cell.date.toISOString()}
            className={cn("px-2 text-xs font-semibold", cell.isWeekend ? "text-weekend-text" : "text-fg-muted")}
          >
            {format.date(localDateToDay(cell.date), "weekdayShort")}
          </span>
        ))}
      </div>
      {cells.map((row) => (
        <div key={row[0]!.date.toISOString()} className="grid grid-cols-7 gap-1.5">
          {row.map((cell) => {
            const day = localDateToDay(cell.date);
            if (!cell.inMonth) return <div key={day} className="min-h-14 rounded-[16px] bg-raised/40 sm:min-h-24" />;
            const items = byDay.get(day) ?? [];
            return (
              <div
                key={day}
                className={cn(
                  "flex min-h-14 min-w-0 flex-col gap-1 rounded-[16px] p-1.5 inset-ring inset-ring-hairline sm:min-h-24",
                  day === anchor && "inset-ring-2 inset-ring-scope-deep",
                )}
              >
                <button
                  type="button"
                  onClick={() => setAnchor(day)}
                  aria-current={day === today ? "date" : undefined}
                  aria-label={format.kicker(day)}
                  className={cn(
                    "grid size-7 place-items-center rounded-full text-sm font-bold tabular focus-visible:focus-ring",
                    day === today ? "bg-scope-deep text-on-accent" : cell.isWeekend && "text-weekend-text",
                  )}
                >
                  {format.date(day, "day")}
                </button>
                <ul className="flex min-w-0 flex-col gap-1 max-sm:hidden">
                  {items.map((item) => (
                    <li key={"event" in item ? item.event.id : item.overlay.id}>
                      <ItemBody item={item} selectedId={selectedId} onSelect={onSelect} />
                    </li>
                  ))}
                </ul>
                {items.length ? (
                  <span aria-hidden className="flex gap-0.5 sm:hidden">
                    {items.slice(0, 3).map((item) => (
                      <span
                        key={"event" in item ? item.event.id : item.overlay.id}
                        className="size-1.5 rounded-full bg-scope-dot"
                      />
                    ))}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Agenda({
  days,
  byDay,
  busyByDay,
  selectedId,
  onSelect,
}: ViewProps & {
  days: readonly string[];
  busyByDay: ReadonlyMap<string, readonly BusySlot[]>;
}) {
  const t = useTranslations("TeamCal");
  const format = useCalendarFormat();
  const filled = days.filter((day) => (byDay.get(day)?.length ?? 0) + (busyByDay.get(day)?.length ?? 0) > 0);
  if (!filled.length) return <p className="text-sm font-semibold text-fg-muted">{t("empty")}</p>;
  return (
    <ol className="flex flex-col gap-3">
      {filled.map((day) => (
        <li key={day} className="flex flex-col gap-1.5">
          <h3 className="text-sm font-bold text-fg">{format.kicker(day)}</h3>
          <ul className="flex flex-col gap-1.5">
            {(busyByDay.get(day) ?? []).map((slot) => (
              <li key={`${slot.start}-${slot.end}`}>
                <BusyChip slot={slot} />
              </li>
            ))}
            {(byDay.get(day) ?? []).map((item) => (
              <AgendaRow key={"event" in item ? item.event.id : item.overlay.id}>
                <ItemBody item={item} selectedId={selectedId} onSelect={onSelect} />
              </AgendaRow>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function AgendaRow({ children }: { children: ReactNode }) {
  return <li className="[&>*]:min-h-11 [&>*]:w-full [&>*]:text-sm">{children}</li>;
}
