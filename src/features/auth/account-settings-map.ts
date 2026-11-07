import type { CalendarSystem } from "@/lib/dates/format";
import type { Locale } from "@/lib/locale/config";
import type { Weekday } from "@/lib/dates/week";
import type { AccountSettings, AccountSettingsPatch } from "./auth-api";

/*
 * The account settings the server owns, mapped to the app's own stores:
 * locale ↔ preferences.locale, preferredCalendar ↔ preferences.calendar,
 * firstDayOfWeek ↔ planner week.weekStartsOn. Both sides count weekdays
 * Sunday=0…Saturday=6 (account convention; recurrence uses ISO and is not this).
 * timezone has no local store: it is shown and changed from Settings only.
 */

export interface LocalAccountFields {
  locale: Locale;
  calendar: CalendarSystem;
  weekStartsOn: Weekday;
}

/** BCP 47 tag → app language; null when the app has no such language (left untouched). */
export function localeFromAccount(tag: string): Locale | null {
  const language = tag.toLowerCase().split(/[-_]/)[0];
  return language === "fa" || language === "en" ? language : null;
}

export function calendarFromAccount(value: AccountSettings["preferredCalendar"]): CalendarSystem {
  return value === "JALALI" ? "jalali" : "gregorian";
}

export function calendarToAccount(value: CalendarSystem): AccountSettings["preferredCalendar"] {
  return value === "jalali" ? "JALALI" : "GREGORIAN";
}

/** Server values that differ from the local ones (server → local). */
export function serverChanges(server: AccountSettings, local: LocalAccountFields): Partial<LocalAccountFields> {
  const changes: Partial<LocalAccountFields> = {};
  const locale = localeFromAccount(server.locale);
  if (locale && locale !== local.locale) changes.locale = locale;
  const calendar = calendarFromAccount(server.preferredCalendar);
  if (calendar !== local.calendar) changes.calendar = calendar;
  if (server.firstDayOfWeek !== local.weekStartsOn) changes.weekStartsOn = server.firstDayOfWeek as Weekday;
  return changes;
}

/** Local values that differ from the last server-confirmed ones (local → server); null when in sync. */
export function localPatch(local: LocalAccountFields, server: AccountSettings): AccountSettingsPatch | null {
  const patch: AccountSettingsPatch = {};
  // Keep the server's region (fa-IR stays fa-IR) unless the language itself changed.
  if (localeFromAccount(server.locale) !== local.locale) patch.locale = local.locale;
  if (calendarFromAccount(server.preferredCalendar) !== local.calendar) patch.preferredCalendar = calendarToAccount(local.calendar);
  if (server.firstDayOfWeek !== local.weekStartsOn) patch.firstDayOfWeek = local.weekStartsOn;
  return Object.keys(patch).length ? patch : null;
}
