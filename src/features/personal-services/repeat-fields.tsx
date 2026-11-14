"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import type { RepeatFrequency, RepeatRule } from "@/data/personal-services";
import { DayField } from "@/features/goals/goal-sheet";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatDate } from "@/lib/dates/format";
import { cn } from "@/lib/cn";
import { toggleWeekday, WEEK_ORDER } from "./reminder-model";

/*
 * The contract's repeat rule as form fields (reminders and bills):
 * frequency, "every N", weekdays (Saturday first) and an optional end day.
 */
export function RepeatFields({ value, onChange, frequencies }: { value: RepeatRule; onChange(next: RepeatRule): void; frequencies: RepeatFrequency[] }) {
  const t = useTranslations("Services.repeat");
  const { locale, digits, calendar } = usePreferences();
  const ids = { frequency: useId(), interval: useId(), weekdays: useId() };
  const weekdayName = (day: number) => formatDate(new Date(2026, 9, 4 + day), "weekdayShort", { locale, digits, calendar });
  const set = (patch: Partial<RepeatRule>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <span id={ids.frequency} className="text-sm font-bold text-fg">
            {t("frequency")}
          </span>
          <Select
            aria-labelledby={ids.frequency}
            value={value.frequency}
            onValueChange={(next) => set({ frequency: next as RepeatFrequency, weekdays: next === "weekdays" ? value.weekdays : [] })}
            className="w-44"
          >
            {frequencies.map((frequency) => (
              <SelectItem key={frequency} value={frequency}>
                {t(`frequencies.${frequency}`)}
              </SelectItem>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.interval} className="text-sm font-bold text-fg">
            {t(value.frequency === "interval" ? "everyDays" : "every")}
          </label>
          <Input
            id={ids.interval}
            type="number"
            dir="ltr"
            min={1}
            max={365}
            className="w-24"
            value={String(value.interval)}
            onChange={(event) => {
              const interval = Math.trunc(Number(event.target.value));
              if (interval >= 1 && interval <= 365) set({ interval });
            }}
          />
        </div>
      </div>
      {value.frequency === "weekdays" ? (
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
                  onClick={() => set({ weekdays: toggleWeekday(value.weekdays, day) })}
                  className={cn("min-h-9 rounded-pill px-3 text-xs font-semibold inset-ring", on ? "bg-scope-soft text-scope-deep inset-ring-0" : "inset-ring-outline text-fg-secondary", day === 5 && !on && "text-danger-text")}
                >
                  {weekdayName(day)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <DayField label={t("until")} emptyLabel={t("noEnd")} clearLabel={t("clearEnd")} value={value.until} onChange={(until) => set({ until })} />
    </div>
  );
}
