"use client";

import { ArrowDown, ArrowUp, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/state-views";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { Habit } from "@/data/domain";
import { Select, SelectItem } from "@/components/ui/select";
import type { Routine, RoutineAction, RoutineOccurrence, RoutineSchedule, RoutineScheduleKind } from "@/data/personal-services";
import { useRoutineDays, useRoutineExecute, useRoutines, useRoutineWrite } from "@/data/personal-services-queries";
import { DayField } from "@/features/goals/goal-sheet";
import { usePreferences } from "@/features/preferences/use-preferences";
import { addDaysToDay, weekdayOfDay } from "@/lib/dates/clock-time";
import { formatDate } from "@/lib/dates/format";
import type { Weekday } from "@/lib/dates/week";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { cn } from "@/lib/cn";
import { dayOfInstant, isClockTimeString, toggleWeekday, WEEK_ORDER } from "./reminder-model";
import { useServiceError } from "./service-error";
import { useServiceFormat } from "./use-service-format";

/*
 * Habits · Routines: a saved, ordered group of habits with an optional
 * schedule (daily / weekly / picked days at a time, in the account zone).
 * A scheduled routine shows today's day (Start / Complete / Skip, progress
 * from the habits' own check-ins) and the last 14 days. Habits are still
 * checked in one by one; completing a routine never checks in its habits,
 * and deleting archives the routine without touching habits or history.
 */

const KINDS: RoutineScheduleKind[] = ["DAILY", "WEEKLY", "WEEKDAYS"];
const HISTORY_DAYS = 14;

/** The routine window in the account zone: the last 14 days through today. */
function useWindow() {
  const today = dayOfInstant(new Date().toISOString());
  return { today, from: addDaysToDay(today, 1 - HISTORY_DAYS), to: addDaysToDay(today, 1) };
}

function actionsFor(day: RoutineOccurrence): RoutineAction[] {
  // The server refuses a day before its start time and any terminal day.
  if (day.scheduledAt === null || day.scheduledAt > new Date().toISOString()) return [];
  if (day.state === "PENDING") return ["START", "COMPLETE", "SKIP"];
  if (day.state === "RUNNING") return ["COMPLETE", "SKIP"];
  return [];
}

function useWeekdayName() {
  const { locale, digits, calendar } = usePreferences();
  return (day: number) => formatDate(new Date(2026, 9, 4 + day), "weekdayShort", { locale, digits, calendar });
}

export function RoutinesCard({ habits }: { habits: Habit[] }) {
  const t = useTranslations("Services.routines");
  const query = useRoutines();
  const [editing, setEditing] = useState<Routine | "new" | null>(null);
  const done = new Set(habits.map((habit) => habit.id));

  return (
    <UtilityCard as="section" aria-labelledby="routines-title" className="flex flex-col gap-3" data-routines>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <h2 id="routines-title" className="type-title">
            {t("title")}
          </h2>
          <p className="text-xs text-fg-muted">{t("hint")}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setEditing("new")} disabled={habits.length === 0}>
          <Plus aria-hidden="true" size={16} />
          {t("new")}
        </Button>
      </div>
      {query.isPending ? (
        <LoadingState>
          <Skeleton className="h-14 rounded-row" />
        </LoadingState>
      ) : query.isError ? (
        <ErrorState variant="bare" title={t("loadError")} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState variant="bare" icon={ListChecks} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {query.data.map((routine) => (
            <RoutineRow key={routine.id} routine={routine} active={done} onEdit={() => setEditing(routine)} />
          ))}
        </ul>
      )}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent title={editing === "new" ? t("newTitle") : t("editTitle")} description={t("hint")} size="md">
          {editing !== null ? <RoutineForm routine={editing === "new" ? undefined : editing} habits={habits} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </UtilityCard>
  );
}

function RoutineRow({ routine, active, onEdit }: { routine: Routine; active: Set<string>; onEdit(): void }) {
  const t = useTranslations("Services.routines");
  const write = useRoutineWrite();
  const message = useServiceError();
  const [confirm, setConfirm] = useState(false);
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 rounded-row bg-surface p-3 inset-ring inset-ring-line">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <bdi dir="auto" className="text-sm font-bold text-fg">
          {routine.title}
        </bdi>
        <ol className="flex flex-wrap gap-1.5" aria-label={t("habitsOf", { title: routine.title })}>
          {routine.habits.map((habit) => {
            const gone = habit.archived || !active.has(habit.id);
            return (
              <li key={habit.id} className={cn("rounded-pill bg-subtle px-2.5 py-1 text-xs font-semibold", gone ? "text-fg-muted line-through" : "text-fg-secondary")}>
                <bdi dir="auto">{habit.title}</bdi>
                {gone ? <span className="sr-only"> ({t("inactive")})</span> : null}
              </li>
            );
          })}
        </ol>
        <RoutineDays routine={routine} />
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <IconButton size="sm" variant="ghost" icon={Pencil} label={t("edit", { title: routine.title })} onClick={onEdit} />
        <IconButton size="sm" variant="ghost" icon={Trash2} label={t("delete", { title: routine.title })} disabled={write.isPending} onClick={() => setConfirm(true)} />
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        tone="destructive"
        title={t("deleteTitle")}
        description={t("deleteBody")}
        confirmLabel={t("deleteConfirm")}
        onConfirm={() =>
          write.mutate(
            { kind: "remove", routine },
            { onSuccess: () => toast({ tone: "neutral", title: t("deleted") }), onError: (error) => toast({ tone: "danger", title: message(error) }) },
          )
        }
      />
    </li>
  );
}

function RoutineDays({ routine }: { routine: Routine }) {
  const t = useTranslations("Services.routines");
  const format = useServiceFormat();
  const message = useServiceError();
  const { today, from, to } = useWindow();
  const days = useRoutineDays(routine.id, from, to);
  const execute = useRoutineExecute();
  if (days.isPending) return <Skeleton className="h-5 w-40 rounded-row" />;
  if (days.isError) return <ErrorState variant="bare" title={t("daysError")} onRetry={() => void days.refetch()} />;
  const { schedule, occurrences } = days.data;
  const todayItem = occurrences.find((day) => day.date === today);
  const history = occurrences.filter((day) => day.date < today).reverse();
  const now = new Date().toISOString();
  const run = (occurrence: RoutineOccurrence, action: RoutineAction) =>
    execute.mutate({ occurrence, action }, { onError: (error) => toast({ tone: "danger", title: message(error) }) });
  const progress = (day: RoutineOccurrence) =>
    day.linkedHabits > 0 ? <span className="text-fg-muted">{t("progress", { done: format.number(day.completedHabits), total: format.number(day.linkedHabits) })}</span> : null;
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <p className="text-fg-muted">{schedule ? <ScheduleSummary schedule={schedule} /> : t("unscheduled")}</p>
      {todayItem ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-fg">{t("today")}</span>
          <span className="rounded-pill bg-subtle px-2 py-0.5 font-semibold text-fg-secondary">{t(`states.${todayItem.state}`)}</span>
          {progress(todayItem)}
          {todayItem.state === "PENDING" && todayItem.scheduledAt && todayItem.scheduledAt > now ? (
            <span className="text-fg-muted">{t("startsAt", { time: format.instant(todayItem.scheduledAt) })}</span>
          ) : null}
          {actionsFor(todayItem).map((action) => (
            <Button key={action} size="sm" variant={action === "SKIP" ? "ghost" : "secondary"} disabled={execute.isPending} onClick={() => run(todayItem, action)}>
              {t(`actions.${action}`)}
            </Button>
          ))}
        </div>
      ) : null}
      {schedule || history.length ? (
        <details>
          <summary className="cursor-pointer font-semibold text-fg-secondary">{t("history", { count: format.number(HISTORY_DAYS) })}</summary>
          {history.length === 0 ? (
            <p className="mt-1 text-fg-muted">{t("historyEmpty")}</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-0.5">
              {history.map((day) => (
                <li key={day.date} className="flex flex-wrap gap-2 text-fg-secondary">
                  <span className="w-20 shrink-0">{format.day(day.date)}</span>
                  <span>{t(`states.${day.state === "PENDING" ? "MISSED" : day.state}`)}</span>
                  {progress(day)}
                </li>
              ))}
            </ul>
          )}
        </details>
      ) : null}
    </div>
  );
}

function ScheduleSummary({ schedule }: { schedule: RoutineSchedule }) {
  const t = useTranslations("Services.routines");
  const format = useServiceFormat();
  const { locale } = usePreferences();
  const weekdayName = useWeekdayName();
  const repeat =
    schedule.kind === "WEEKDAYS"
      ? WEEK_ORDER.filter((day) => schedule.weekdays.includes(day))
          .map(weekdayName)
          .join(locale === "fa" ? "، " : ", ")
      : schedule.kind === "WEEKLY"
        ? t("weeklyOn", { day: weekdayName(weekdayOfDay(schedule.startDate)) })
        : t("kinds.DAILY");
  const parts = [repeat, format.clock(schedule.startTime)];
  if (schedule.expectedMinutes !== null) parts.push(t("minutes", { count: format.number(schedule.expectedMinutes) }));
  return <>{parts.join(" · ")}</>;
}

function emptySchedule(today: string): RoutineSchedule {
  return { kind: "DAILY", startDate: today, endDate: null, weekdays: [], startTime: "07:00", expectedMinutes: null, reminder: false, timezone: getPlannerTimeZone() };
}

function scheduleValid(schedule: RoutineSchedule | null): boolean {
  if (!schedule) return true;
  return isClockTimeString(schedule.startTime) && (schedule.kind !== "WEEKDAYS" || schedule.weekdays.length > 0) && (schedule.endDate === null || schedule.endDate >= schedule.startDate);
}

function ScheduleFields({ value, onChange, submitted }: { value: RoutineSchedule; onChange(next: RoutineSchedule): void; submitted: boolean }) {
  const t = useTranslations("Services.routines");
  const weekdayName = useWeekdayName();
  const ids = { kind: useId(), weekdays: useId(), time: useId(), minutes: useId() };
  const set = (patch: Partial<RoutineSchedule>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <span id={ids.kind} className="text-sm font-bold text-fg">
            {t("repeats")}
          </span>
          <Select
            aria-labelledby={ids.kind}
            value={value.kind}
            onValueChange={(kind) => set({ kind: kind as RoutineScheduleKind, weekdays: kind === "WEEKDAYS" ? value.weekdays : [] })}
            className="w-44"
          >
            {KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {t(`kinds.${kind}`)}
              </SelectItem>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.time} className="text-sm font-bold text-fg">
            {t("time")}
          </label>
          <Input
            id={ids.time}
            type="time"
            dir="ltr"
            className="w-32"
            value={value.startTime}
            invalid={submitted && !isClockTimeString(value.startTime)}
            onChange={(event) => set({ startTime: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.minutes} className="text-sm font-bold text-fg">
            {t("expected")}
          </label>
          <Input
            id={ids.minutes}
            type="number"
            dir="ltr"
            min={1}
            max={1440}
            className="w-28"
            value={value.expectedMinutes === null ? "" : String(value.expectedMinutes)}
            onChange={(event) => {
              const minutes = Math.trunc(Number(event.target.value));
              set({ expectedMinutes: event.target.value === "" ? null : minutes >= 1 && minutes <= 1440 ? minutes : value.expectedMinutes });
            }}
          />
        </div>
      </div>
      {submitted && !isClockTimeString(value.startTime) ? <p className="text-xs font-semibold text-danger-text">{t("errors.time")}</p> : null}
      {value.kind === "WEEKDAYS" ? (
        <div role="group" aria-labelledby={ids.weekdays} className="flex flex-col gap-1.5">
          <span id={ids.weekdays} className="text-sm font-bold text-fg">
            {t("weekdays")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {WEEK_ORDER.map((day) => {
              const on = value.weekdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ weekdays: toggleWeekday(value.weekdays as Weekday[], day) })}
                  className={cn(
                    "min-h-9 rounded-pill px-3 text-xs font-semibold inset-ring",
                    on ? "bg-scope-soft text-scope-deep inset-ring-0" : "inset-ring-outline text-fg-secondary",
                    day === 5 && !on && "text-danger-text",
                  )}
                >
                  {weekdayName(day)}
                </button>
              );
            })}
          </div>
          {submitted && value.weekdays.length === 0 ? <p className="text-xs font-semibold text-danger-text">{t("errors.weekdays")}</p> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <DayField label={t("startDate")} emptyLabel={t("startDate")} value={value.startDate} onChange={(startDate) => startDate && set({ startDate })} />
        <DayField label={t("endDate")} emptyLabel={t("noEnd")} clearLabel={t("clearEnd")} value={value.endDate} onChange={(endDate) => set({ endDate })} />
      </div>
      {submitted && value.endDate !== null && value.endDate < value.startDate ? <p className="text-xs font-semibold text-danger-text">{t("errors.endDate")}</p> : null}
      <Checkbox label={t("reminder")} checked={value.reminder} onCheckedChange={(checked) => set({ reminder: checked === true })} />
    </div>
  );
}

function RoutineForm({ routine, habits, onDone }: { routine?: Routine; habits: Habit[]; onDone(): void }) {
  const t = useTranslations("Services.routines");
  const titleId = useId();
  const format = useServiceFormat();
  const write = useRoutineWrite();
  const message = useServiceError();
  const [title, setTitle] = useState(routine?.title ?? "");
  // Keeps habits that are no longer active in the order (the server still holds them).
  const [order, setOrder] = useState<string[]>(routine?.habits.map((habit) => habit.id) ?? []);
  const [submitted, setSubmitted] = useState(false);
  const { today, from, to } = useWindow();
  const days = useRoutineDays(routine?.id ?? "", from, to, routine !== undefined);
  const loaded = routine ? (days.data?.schedule ?? null) : null;
  // Undefined until the user edits it: an unchanged schedule is never re-sent.
  const [schedule, setSchedule] = useState<RoutineSchedule | null | undefined>(undefined);
  const current = schedule === undefined ? loaded : schedule;
  const scheduleReady = !routine || days.isSuccess;
  const titles = new Map([...(routine?.habits.map((habit) => [habit.id, habit.title] as const) ?? []), ...habits.map((habit) => [habit.id, habit.title] as const)]);
  const valid = title.trim().length > 0 && order.length > 0 && scheduleValid(current);

  const move = (index: number, delta: number) =>
    setOrder((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item!);
      return next;
    });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!valid) return;
    const input = { title: title.trim(), habitIds: order };
    const changed = schedule !== undefined && JSON.stringify(schedule) !== JSON.stringify(loaded) ? { schedule } : {};
    write.mutate(routine ? { kind: "update", routine, patch: input, ...changed } : { kind: "create", input, ...changed }, {
      onSuccess: () => {
        toast({ tone: "success", title: routine ? t("saved") : t("created") });
        onDone();
      },
      onError: (error) => toast({ tone: "danger", title: message(error) }),
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={titleId} className="text-sm font-bold text-fg">
          {t("name")}
        </label>
        <Input id={titleId} dir="auto" maxLength={300} value={title} invalid={submitted && !title.trim()} onChange={(event) => setTitle(event.target.value)} />
        {submitted && !title.trim() ? <p className="text-xs font-semibold text-danger-text">{t("errors.title")}</p> : null}
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold text-fg">{t("pick")}</legend>
        {habits.map((habit) => (
          <Checkbox
            key={habit.id}
            label={<bdi dir="auto">{habit.title}</bdi>}
            checked={order.includes(habit.id)}
            onCheckedChange={(checked) => setOrder((current) => (checked === true ? [...current, habit.id] : current.filter((id) => id !== habit.id)))}
          />
        ))}
        {submitted && order.length === 0 ? <p className="text-xs font-semibold text-danger-text">{t("errors.habits")}</p> : null}
      </fieldset>
      {order.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-fg">{t("order")}</span>
          <ol className="flex flex-col gap-1">
            {order.map((id, index) => (
              <li key={id} className="flex items-center gap-2 rounded-row bg-subtle px-3 py-1.5 text-sm">
                <span className="w-5 text-fg-muted tabular">{format.number(index + 1)}</span>
                <bdi dir="auto" className="min-w-0 flex-1 truncate">
                  {titles.get(id) ?? "—"}
                </bdi>
                <IconButton size="sm" variant="ghost" icon={ArrowUp} label={t("moveUp", { title: titles.get(id) ?? "" })} disabled={index === 0} onClick={() => move(index, -1)} />
                <IconButton size="sm" variant="ghost" icon={ArrowDown} label={t("moveDown", { title: titles.get(id) ?? "" })} disabled={index === order.length - 1} onClick={() => move(index, 1)} />
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-bold text-fg">{t("schedule")}</legend>
        {!scheduleReady ? (
          days.isError ? (
            <ErrorState variant="bare" title={t("daysError")} onRetry={() => void days.refetch()} />
          ) : (
            <Skeleton className="h-9 rounded-row" />
          )
        ) : (
          <>
            <Checkbox label={t("scheduleToggle")} checked={current !== null} onCheckedChange={(checked) => setSchedule(checked === true ? (current ?? emptySchedule(today)) : null)} />
            {current ? <ScheduleFields value={current} submitted={submitted} onChange={setSchedule} /> : null}
          </>
        )}
      </fieldset>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={write.isPending} disabled={!scheduleReady}>
          {routine ? t("save") : t("create")}
        </Button>
      </DialogFooter>
    </form>
  );
}
