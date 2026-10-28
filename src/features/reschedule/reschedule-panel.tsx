"use client";

import { CalendarArrowDown, Calendar, Clock, Inbox, Sun, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icon";
import { Select, SelectItem } from "@/components/ui/select";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { dayToLocalDate, formatClockTime, localDateToDay, parseClockTime } from "@/lib/dates/clock-time";
import type { RescheduleOption } from "@/features/my-day/domain/reschedule";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import type { RescheduleChoice } from "./use-reschedule-actions";
import type { RescheduleRows } from "./plan-reschedule";

/*
 * The body of Reschedule (P02 + P18), shared by the desktop popover and the
 * mobile bottom sheet: a list of 48px rows, the first one selected, and a
 * second step for "Pick date & time…". The list is a menu with a roving tab
 * stop: ↑ ↓ Home End move, Enter or Space chooses; the container supplies
 * the title and Esc.
 */

const ROW_ICON: Record<RescheduleOption["id"], LucideIcon> = {
  "later-today": Clock,
  tomorrow: Sun,
  "next-working-day": CalendarArrowDown,
  pick: Calendar,
  unscheduled: Inbox,
};

/** Start times of the pick step: every 15 minutes of the day. */
const TIME_STEPS = Array.from({ length: 96 }, (_, index) => index * 15);

export interface ReschedulePanelProps {
  rows: RescheduleRows;
  /** Where "Pick date & time…" starts (the Tomorrow suggestion). */
  pickDefault: { day: string; startMinutes: number };
  /** The planner's today: earlier days cannot be picked. */
  today: string;
  onChoose: (choice: RescheduleChoice) => void;
  /** A choice is being applied: the rows ignore further clicks. */
  busy?: boolean;
}

export function ReschedulePanel({ rows, pickDefault, today, onChoose, busy = false }: ReschedulePanelProps) {
  const t = useTranslations("MyDay.reschedule");
  const [step, setStep] = useState<"list" | "pick">("list");
  const [active, setActive] = useState(rows.initialIndex);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const { options } = rows;
  const pickIndex = options.findIndex((option) => option.id === "pick");

  // Focus lands on the selected row on open and when coming back from the pick step.
  useEffect(() => {
    if (step === "list") refs.current[active]?.focus({ preventScroll: true });
    // Only the step switch moves focus; arrow keys move it themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const choose = (option: RescheduleOption) => {
    if (busy) return;
    if (option.id === "pick") {
      setStep("pick");
      return;
    }
    if (option.id === "unscheduled") onChoose({ type: "unschedule" });
    else onChoose({ type: "slot", day: option.day, startMinutes: option.startMinutes });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = options.length - 1;
    const next =
      event.key === "ArrowDown"
        ? (active + 1) % options.length
        : event.key === "ArrowUp"
          ? (active - 1 + options.length) % options.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    refs.current[next]?.focus({ preventScroll: true });
  };

  if (step === "pick") {
    return (
      <PickStep
        pickDefault={pickDefault}
        today={today}
        busy={busy}
        onBack={() => {
          setActive(pickIndex >= 0 ? pickIndex : active);
          setStep("list");
        }}
        onApply={(day, startMinutes) => onChoose({ type: "slot", day, startMinutes })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* The rows are actions, not a form: a menu keeps the arrow-key model of the P02 board. */}
      <div role="menu" aria-label={t("listLabel")} aria-orientation="vertical" onKeyDown={onKeyDown} className="flex flex-col gap-1.5">
        {options.map((option, index) => (
          <RescheduleRow
            key={option.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            option={option}
            active={index === active}
            onFocus={() => setActive(index)}
            onSelect={() => choose(option)}
            disabled={busy}
          />
        ))}
      </div>
      <p className="px-1 pt-1 text-xs leading-snug text-fg-muted">{t("footnote")}</p>
    </div>
  );
}

interface RowProps {
  option: RescheduleOption;
  active: boolean;
  disabled: boolean;
  onFocus: () => void;
  onSelect: () => void;
  ref: (node: HTMLButtonElement | null) => void;
}

function RescheduleRow({ option, active, disabled, onFocus, onSelect, ref }: RowProps) {
  const t = useTranslations("MyDay.reschedule");
  const format = useMyDayFormat();
  const { locale } = usePreferences();

  const label = t(`options.${option.id}`);
  const clock = "start" in option ? (
    <bdi dir="ltr" className="tabular-nums">
      {format.clock(option.start)}
    </bdi>
  ) : null;
  let suffix: ReactNode = clock;
  let note: string | null = null;

  if (option.id === "next-working-day") {
    const weekday = format.weekday(option.day);
    suffix = locale === "en" ? weekday.slice(0, 3) : weekday;
    note = option.note === "fri-weekend" ? t("note.fri-weekend") : option.bestFit ? t("note.bestFit") : null;
  } else if (option.id === "later-today") {
    note = t("note.free", { duration: format.duration(option.freeMinutes) });
  } else if (option.id === "tomorrow") {
    note = option.bestFit ? t("note.bestFit") : null;
  }

  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      tabIndex={active ? 0 : -1}
      data-active={active || undefined}
      disabled={disabled}
      onFocus={onFocus}
      onClick={onSelect}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-row bg-subtle px-3.5 text-start text-sm font-semibold text-fg",
        "transition-colors hover:bg-raised disabled:pointer-events-none disabled:opacity-60",
        "data-[active]:bg-surface data-[active]:ring-[1.5px] data-[active]:ring-inset data-[active]:ring-primary",
      )}
    >
      <Icon icon={ROW_ICON[option.id]} size={18} className="text-fg-secondary" />
      <span className="min-w-0 flex-1 truncate">
        {label}
        {suffix ? <> · {suffix}</> : null}
      </span>
      {note ? <span className="shrink-0 text-xs font-medium text-fg-muted">{note}</span> : null}
    </button>
  );
}

interface PickStepProps {
  pickDefault: { day: string; startMinutes: number };
  today: string;
  busy: boolean;
  onBack: () => void;
  onApply: (day: string, startMinutes: number) => void;
}

/** "Pick date & time…": the Jalali / Gregorian date picker plus a 15-minute start time. Never a full calendar. */
function PickStep({ pickDefault, today, busy, onBack, onApply }: PickStepProps) {
  const t = useTranslations("MyDay.reschedule.pick");
  const format = useMyDayFormat();
  const [date, setDate] = useState<Date>(() => dayToLocalDate(pickDefault.day));
  const [start, setStart] = useState(() => formatClockTime(pickDefault.startMinutes));
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 ref={heading} tabIndex={-1} className="text-sm font-bold text-fg outline-none">
          {t("title")}
        </h3>
        <Button variant="ghost" size="sm" onClick={onBack}>
          {t("back")}
        </Button>
      </div>
      <label className="flex items-center justify-between gap-3 text-sm font-semibold text-fg">
        <span>{t("time")}</span>
        <Select value={start} onValueChange={setStart} aria-label={t("time")} className="w-32">
          {TIME_STEPS.map((minutes) => (
            <SelectItem key={minutes} value={formatClockTime(minutes)}>
              <bdi dir="ltr" className="tabular-nums">
                {format.clock(minutes)}
              </bdi>
            </SelectItem>
          ))}
        </Select>
      </label>
      <DatePicker
        value={date}
        onValueChange={setDate}
        onConfirm={(picked) => {
          if (busy) return;
          onApply(localDateToDay(picked), parseClockTime(start) ?? pickDefault.startMinutes);
        }}
        min={dayToLocalDate(today)}
        confirmLabel={t("apply")}
        showLegend={false}
      />
    </div>
  );
}
