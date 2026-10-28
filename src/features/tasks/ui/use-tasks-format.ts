"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import type { EnergyLevel, Scope, TaskPriority } from "@/data/domain";
import type { Preferences } from "@/features/preferences/preferences-store";
import { usePreferences } from "@/features/preferences/use-preferences";
import { createMyDayFormat, type MyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { dayToLocalDate } from "@/lib/dates/clock-time";
import { convertDigits } from "@/lib/locale/digits";
import { formatGregorian } from "@/lib/dates/gregorian";
import type { RelativeDay, TaskGroup } from "../domain/group";
import type { WhenDescriptor } from "../domain/when";

/*
 * Everything the Tasks screen prints that is a number, time, date or a
 * translated label for task data, in the person's language, calendar and
 * digit setting. Builds on the My Day formatter (clock, duration, digits,
 * weekday, dayMonth…) and adds the list's date headers, relative days and
 * the labels of priorities, energies, contexts and groups. Clock values are
 * 24-hour; render them in a `dir="ltr"` island with tabular numerals.
 */

export interface GroupTitle {
  /** "Overdue" · "Morning" · "Tomorrow" · "Wed 22 Mehr" · an area name. */
  title: string;
  /** The date beside a relative title: "Wed 22 Mehr" next to "Tomorrow". */
  subtitle?: string;
  /** Date groups on a weekend day: show the red "weekend" tag. */
  weekend: boolean;
}

export interface WhenText {
  text: string;
  /** Paint rose, next to the words (never colour alone). */
  overdue: boolean;
}

export interface TasksFormat extends MyDayFormat {
  /** "2h 05m" in English; Persian "۲س ۵د" (compact, for rows, chips and headers). */
  durationShort(minutes: number): string;
  /** "Thu" in English, "پنجشنبه" in Persian (Persian has no short form). */
  weekdayShort(day: string): string;
  /** "Wed 22 Mehr" · "چهارشنبه ۲۲ مهر": the date headers. */
  dateHeader(day: string): string;
  relative(relative: RelativeDay): string;
  priority(priority: TaskPriority | null): string;
  energy(energy: EnergyLevel): string;
  scope(scope: Scope): string;
  /** The When column: "09:00", "Today", "Yesterday", "Thu", "21 Mehr". */
  when(when: WhenDescriptor): WhenText;
  groupTitle(group: TaskGroup): GroupTitle;
}

/** The untranslated part, pure so it is testable without React. */
export function createTasksBaseFormat(preferences: Pick<Preferences, "locale" | "digits" | "calendar">) {
  const base = createMyDayFormat(preferences);
  const { locale, digits } = preferences;
  return {
    ...base,
    durationShort(minutes: number) {
      if (locale !== "fa") return base.duration(minutes);
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      const text = hours === 0 ? `${rest}د` : rest === 0 ? `${hours}س` : `${hours}س ${rest}د`;
      return convertDigits(text, digits);
    },
    weekdayShort(day: string) {
      return locale === "fa" ? base.weekday(day) : convertDigits(formatGregorian(dayToLocalDate(day), "EEE", "en"), digits);
    },
    dateHeader(day: string) {
      return locale === "fa" ? `${base.weekday(day)} ${base.dayMonth(day)}` : `${formatGregorian(dayToLocalDate(day), "EEE", "en")} ${base.dayMonth(day)}`;
    },
  };
}

export function useTasksFormat(): TasksFormat {
  const { locale, digits, calendar } = usePreferences();
  const tLabels = useTranslations("Tasks.labels");
  const tTitles = useTranslations("Tasks.group.titles");

  return useMemo<TasksFormat>(() => {
    const base = createTasksBaseFormat({ locale, digits, calendar });
    const relative = (value: RelativeDay) => tLabels(`relative.${value}`);
    return {
      ...base,
      relative,
      priority: (priority) => tLabels(`priority.${priority ?? "none"}`),
      energy: (energy) => tLabels(`energy.${energy}`),
      scope: (scope) => tLabels(`scope.${scope}`),
      when(when) {
        switch (when.kind) {
          case "time":
            return { text: base.clock(when.time), overdue: when.tone === "overdue" };
          case "relative":
            return { text: relative(when.relative), overdue: when.tone === "overdue" };
          case "weekday":
            return { text: base.weekdayShort(when.day), overdue: when.tone === "overdue" };
          case "date":
            return { text: base.dayMonth(when.day), overdue: when.tone === "overdue" };
          default:
            return { text: "", overdue: false };
        }
      },
      groupTitle(group) {
        const weekend = group.weekend === true;
        const { label } = group;
        switch (label.type) {
          case "window":
            return { title: tTitles(label.window), weekend };
          case "date":
            if (label.day === null) return { title: tTitles("noDate"), weekend };
            return label.relative
              ? { title: relative(label.relative), subtitle: base.dateHeader(label.day), weekend }
              : { title: base.dateHeader(label.day), weekend };
          case "area":
            return { title: label.area ? label.area.name : tTitles("noArea"), weekend };
          case "scope":
            return { title: tLabels(`scope.${label.scope}`), weekend };
          case "priority":
            return { title: label.priority ? tLabels(`priority.${label.priority}`) : tTitles("noPriority"), weekend };
          default:
            return { title: tTitles("all"), weekend };
        }
      },
    };
  }, [locale, digits, calendar, tLabels, tTitles]);
}

/** The "weekend" tag beside a weekend date header. */
export function useWeekendLabel(): string {
  return useTranslations("Tasks.group.titles")("weekend");
}
