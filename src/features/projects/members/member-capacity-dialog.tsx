"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { ErrorState } from "@/components/feedback/state-views";
import { Button, IconButton } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { getPlannerToday } from "@/data/clock";
import type { ProjectCapacityDay, ProjectMemberCapacity, ProjectPerson } from "@/data/project-domain";
import { useProjectMemberCapacity, useProjectMemberEffectiveCapacity, useSaveProjectMemberCapacity } from "@/data/project-queries";
import { RepositoryError } from "@/data/repositories";
import { useWeekdayName, WEEK_ORDER } from "@/features/teams/people/member-dialogs";
import { addDaysToDay, weekdayOfDay } from "@/lib/dates/clock-time";
import type { Weekday } from "@/lib/dates/week";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import { cn } from "@/lib/cn";
import { useProjectFormat } from "../format";

/*
 * A member's capacity in this project: the resolved week (available vs
 * allocated hours per day, Saturday-first, advisory overload warnings that
 * never block assignment) and the weekday pattern. Each weekday inherits
 * (owning Team template, else Sat–Wed 8 h / Thu–Fri off), is set in hours,
 * or is off. Date-specific exceptions are untouched and still win.
 */

type DayMode = "inherit" | "hours" | "off";
interface DayDraft {
  mode: DayMode;
  hours: string;
}

const hoursOf = (minutes: number) => Math.round(minutes / 6) / 10;
const weekStart = (day: string) => addDaysToDay(day, -((weekdayOfDay(day) + 1) % 7));

export function MemberCapacityDialog({ projectId, person, editable, onClose }: { projectId: string; person: ProjectPerson | null; editable: boolean; onClose: () => void }) {
  const t = useTranslations("Members.capacityDialog");
  return (
    <Dialog open={person !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      {person ? (
        <DialogContent title={t("title", { name: person.name })} description={t("description")} size="lg">
          <CapacityWeek projectId={projectId} person={person} />
          <CapacityPattern projectId={projectId} person={person} editable={editable} onDone={onClose} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function CapacityWeek({ projectId, person }: { projectId: string; person: ProjectPerson }) {
  const t = useTranslations("Members.capacityDialog");
  const format = useProjectFormat();
  const [from, setFrom] = useState(() => weekStart(getPlannerToday()));
  const timezone = getPlannerTimeZone();
  const week = useProjectMemberEffectiveCapacity(projectId, person.id, { from, to: addDaysToDay(from, 7), timezone });
  const hours = (minutes: number | null) => (minutes === null ? t("unknown") : t("hours", { n: format.number(hoursOf(minutes)) }));

  const days: readonly ProjectCapacityDay[] = week.data ?? [];
  const known = days.filter((day) => day.capacityMinutes !== null);
  const available = known.reduce((sum, day) => sum + (day.capacityMinutes ?? 0), 0);
  const allocated = days.reduce((sum, day) => sum + day.allocatedMinutes, 0);
  const over = days.filter((day) => (day.overbookedMinutes ?? 0) > 0);

  return (
    <section aria-labelledby="capacity-week" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="capacity-week" className="text-sm font-bold text-fg">
          {t("week", { range: format.range(from, addDaysToDay(from, 6)) })}
        </h3>
        <span className="flex gap-1">
          <IconButton icon={ChevronLeft} mirror size="sm" variant="ghost" label={t("previousWeek")} onClick={() => setFrom(addDaysToDay(from, -7))} />
          <IconButton icon={ChevronRight} mirror size="sm" variant="ghost" label={t("nextWeek")} onClick={() => setFrom(addDaysToDay(from, 7))} />
        </span>
      </div>
      {week.isPending ? (
        <Skeleton className="h-40 rounded-row" />
      ) : week.isError ? (
        <ErrorState variant="bare" title={t("loadError")} onRetry={() => void week.refetch()} />
      ) : (
        <>
          <p className="text-sm text-fg-secondary">
            {known.length === 0 ? t("summaryUnknown", { allocated: hours(allocated) }) : t("summary", { allocated: hours(allocated), available: hours(available) })}
          </p>
          {over.length > 0 ? (
            <InlineAlert
              tone="warning"
              title={t("overTitle", { n: format.number(over.length) })}
              description={t("overBody", { hours: hours(over.reduce((sum, day) => sum + (day.overbookedMinutes ?? 0), 0)) })}
            />
          ) : null}
          <table className="w-full text-sm">
            <caption className="sr-only">{t("week", { range: format.range(from, addDaysToDay(from, 6)) })}</caption>
            <thead>
              <tr className="text-xs text-fg-muted">
                <th scope="col" className="py-1 text-start font-normal">
                  {t("day")}
                </th>
                <th scope="col" className="py-1 text-end font-normal">
                  {t("available")}
                </th>
                <th scope="col" className="py-1 text-end font-normal">
                  {t("allocated")}
                </th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => {
                const isOver = (day.overbookedMinutes ?? 0) > 0;
                return (
                  <tr key={day.date} className="border-t border-line">
                    <th scope="row" className="py-1.5 text-start font-normal">
                      {format.day(day.date, "weekday")} <span className="text-xs text-fg-muted">{format.day(day.date)}</span>
                    </th>
                    <td className={cn("py-1.5 text-end tabular", day.capacityMinutes === null && "text-fg-muted")}>{hours(day.capacityMinutes)}</td>
                    <td className="py-1.5 text-end tabular">
                      {hours(day.allocatedMinutes)}
                      {isOver ? <span className="ms-2 rounded-pill bg-warning-soft px-2 text-xs font-semibold text-warning-text">{t("overBy", { hours: hours(day.overbookedMinutes) })}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function CapacityPattern({ projectId, person, editable, onDone }: { projectId: string; person: ProjectPerson; editable: boolean; onDone: () => void }) {
  const t = useTranslations("Members.capacityDialog");
  const query = useProjectMemberCapacity(projectId, person.id);
  if (query.isPending) return <Skeleton className="h-48 rounded-row" />;
  if (query.isError) return <ErrorState variant="bare" title={t("loadError")} onRetry={() => void query.refetch()} />;
  // Re-key on the revision: a save or a conflict reload starts from the server's pattern.
  return <PatternForm key={query.data.revision} projectId={projectId} capacity={query.data} editable={editable} onDone={onDone} />;
}

function PatternForm({ projectId, capacity, editable, onDone }: { projectId: string; capacity: ProjectMemberCapacity; editable: boolean; onDone: () => void }) {
  const t = useTranslations("Members.capacityDialog");
  const weekday = useWeekdayName();
  const format = useProjectFormat();
  const save = useSaveProjectMemberCapacity(projectId);
  const [error, setError] = useState<"invalid" | "conflict" | "failed" | null>(null);
  const [draft, setDraft] = useState<Record<Weekday, DayDraft>>(() => {
    const out = {} as Record<Weekday, DayDraft>;
    for (const day of WEEK_ORDER) {
      const minutes = capacity.template?.weekdays[day] ?? null;
      out[day] = minutes === null ? { mode: "inherit", hours: "" } : minutes === 0 ? { mode: "off", hours: "" } : { mode: "hours", hours: String(hoursOf(minutes)) };
    }
    return out;
  });

  const submit = (clear: boolean) => {
    let weekdays: (number | null)[] = [0, 1, 2, 3, 4, 5, 6].map(() => null);
    if (!clear) {
      for (const day of WEEK_ORDER) {
        const { mode, hours } = draft[day];
        if (mode === "off") weekdays[day] = 0;
        else if (mode === "hours") {
          const value = Number(hours);
          if (hours.trim() === "" || !Number.isFinite(value) || value <= 0 || value > 24) return setError("invalid");
          weekdays[day] = Math.round(value * 60);
        }
      }
    }
    const empty = weekdays.every((minutes) => minutes === null);
    if (empty) weekdays = [];
    setError(null);
    save.mutate(
      {
        current: capacity,
        template: empty
          ? null
          : { timezone: capacity.template?.timezone ?? getPlannerTimeZone(), effectiveFrom: capacity.template?.effectiveFrom ?? getPlannerToday(), weekdays },
      },
      {
        onSuccess: () => {
          toast({ title: t("saved"), tone: "success" });
          onDone();
        },
        onError: (cause) => setError(cause instanceof RepositoryError && cause.code === "conflict" ? "conflict" : cause instanceof RepositoryError && cause.code === "invalid" ? "invalid" : "failed"),
      },
    );
  };

  return (
    <section aria-labelledby="capacity-pattern" className="flex flex-col gap-2">
      <h3 id="capacity-pattern" className="text-sm font-bold text-fg">
        {t("pattern")}
      </h3>
      <p className="text-xs text-fg-muted">
        {t("patternHint")}
        {capacity.template ? ` ${t("effectiveFrom", { date: format.day(capacity.template.effectiveFrom, "full") })}` : ""}
      </p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit(false);
        }}
      >
        <ul className="flex flex-col">
          {WEEK_ORDER.map((day) => {
            const row = draft[day];
            const name = weekday(day, "weekday");
            return (
              <li key={day} className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-t border-line py-1.5">
                <span className="text-sm text-fg">{name}</span>
                {editable ? (
                  <span className="flex items-center gap-2">
                    <Select aria-label={t("modeLabel", { day: name })} value={row.mode} onValueChange={(mode) => setDraft({ ...draft, [day]: { ...row, mode: mode as DayMode } })} className="w-36">
                      <SelectItem value="inherit">{t("mode.inherit")}</SelectItem>
                      <SelectItem value="hours">{t("mode.hours")}</SelectItem>
                      <SelectItem value="off">{t("mode.off")}</SelectItem>
                    </Select>
                    {row.mode === "hours" ? (
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0.5}
                        max={24}
                        step={0.5}
                        dir="ltr"
                        aria-label={t("hoursLabel", { day: name })}
                        className="w-20"
                        value={row.hours}
                        onChange={(event) => setDraft({ ...draft, [day]: { ...row, hours: event.target.value } })}
                      />
                    ) : null}
                  </span>
                ) : (
                  <span className="text-sm text-fg-secondary">{row.mode === "hours" ? t("hours", { n: format.number(Number(row.hours)) }) : t(`mode.${row.mode}`)}</span>
                )}
              </li>
            );
          })}
        </ul>
        {error ? <InlineAlert tone={error === "invalid" ? "warning" : "danger"} title={t(`error.${error}`)} /> : null}
        {editable ? (
          <div className="flex flex-wrap justify-end gap-2">
            {capacity.template ? (
              <Button type="button" variant="secondary" disabled={save.isPending} onClick={() => submit(true)}>
                {t("inheritAll")}
              </Button>
            ) : null}
            <Button type="submit" disabled={save.isPending}>
              {t("save")}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-fg-muted">{t("readOnly")}</p>
        )}
      </form>
    </section>
  );
}
