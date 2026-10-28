"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePlannerNow } from "@/features/my-day/my-day-context";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { useTasksFormat } from "@/features/tasks/ui/use-tasks-format";
import { dayToLocalDate, localDateToDay } from "@/lib/dates/clock-time";
import { snoozeOptions, snoozeUntilDay, type SnoozeOption } from "./domain/inbox";

/*
 * "Snooze until" (P07): This evening · Tomorrow morning · Next working day ·
 * Next week · Pick date…, each with its time or date at the inline end.
 * A popover (P18 container rule); "Pick date…" swaps in the Jalali picker.
 */

export function SnoozeMenu({
  trigger,
  onSnooze,
  open,
  onOpenChange,
}: {
  /** A single button (the popover trigger). */
  trigger: ReactNode;
  onSnooze(until: string): void;
  open?: boolean;
  onOpenChange?(open: boolean): void;
}) {
  const t = useTranslations("Inbox.snooze");
  const format = useTasksFormat();
  const { instant, day: today } = usePlannerNow();
  const { week } = usePlannerSettings();
  const [ownOpen, setOwnOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const isOpen = open ?? ownOpen;
  const setOpen = (next: boolean) => {
    if (!next) setPicking(false);
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  const choose = (until: string) => {
    setOpen(false);
    onSnooze(until);
  };
  const tomorrow = dayToLocalDate(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const detail = (option: SnoozeOption) => {
    if (option.id === "evening") return format.clock(option.minutes);
    if (option.id === "nextWeek") return `${format.weekdayShort(option.day)} ${format.dayMonth(option.day)}`;
    return `${format.weekdayShort(option.day)} ${format.clock(option.minutes)}`;
  };

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-3">
        {picking ? (
          <DatePicker
            title={t("pickTitle")}
            min={tomorrow}
            confirmLabel={t("confirm")}
            showLegend={false}
            onConfirm={(date) => choose(snoozeUntilDay(localDateToDay(date)))}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="px-2 pb-1 pt-1 text-sm font-bold text-fg">{t("title")}</p>
            {snoozeOptions(instant, week).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => choose(option.until)}
                className="flex min-h-11 items-center justify-between gap-3 rounded-2xl bg-subtle px-3 text-start text-[13px] font-semibold text-fg hover:bg-raised focus-visible:focus-ring"
              >
                <span>{t(option.id)}</span>
                <span className="text-xs font-medium text-fg-muted tabular" dir="auto">
                  {detail(option)}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="flex min-h-11 items-center rounded-2xl bg-subtle px-3 text-start text-[13px] font-semibold text-fg hover:bg-raised focus-visible:focus-ring"
            >
              {t("pick")}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
