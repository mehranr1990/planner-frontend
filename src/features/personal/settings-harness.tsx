"use client";

import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { optionalModuleIds } from "@/features/planner-settings/modules";
import { usePlannerSettings, usePlannerSettingsActions } from "@/features/planner-settings/use-planner-settings";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatDate } from "@/lib/dates/format";
import { convertDigits } from "@/lib/locale/digits";

/*
 * STEP 3 VALIDATION HARNESS for the planner-settings seam, until P17 is
 * built: module switches (hidden-module behaviour end to end) and a read-only
 * list of the current defaults. Utility surfaces only (P17: no notches).
 */

export function ModuleSwitches() {
  const t = useTranslations("Personal.settings");
  const tModules = useTranslations("Settings.modules");
  const settings = usePlannerSettings();
  const { setModuleVisible } = usePlannerSettingsActions();
  return (
    <UtilityCard as="section" aria-labelledby="settings-modules" className="flex flex-col gap-3">
      <h2 id="settings-modules" className="type-title">
        {t("modules")}
      </h2>
      <p className="text-sm text-fg-secondary">{t("modulesNote")}</p>
      <ul className="flex flex-col gap-2">
        {optionalModuleIds.map((id) => (
          <li key={id} className="rounded-field bg-surface px-3.5 py-2">
            <Switch
              label={tModules(id)}
              checked={settings.modules[id]}
              onCheckedChange={(checked) => setModuleVisible(id, checked)}
            />
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-muted">{t("coreNote")}</p>
    </UtilityCard>
  );
}

/** Weekday name of a JS weekday number, in the user's language and digits. */
function useWeekdayName() {
  const { locale, digits, calendar } = usePreferences();
  // 4 Oct 2026 is a Sunday: add the weekday number to land on it.
  return (weekday: number) => formatDate(new Date(2026, 9, 4 + weekday), "weekday", { locale, digits, calendar });
}

export function SettingsDefaults() {
  const t = useTranslations("Personal.settings");
  const settings = usePlannerSettings();
  const { digits, locale } = usePreferences();
  const weekday = useWeekdayName();
  const n = (value: number | string) => convertDigits(value, digits);
  const rows = [
    [t("rollover"), t(`rolloverValue.${settings.planning.rollover}`)],
    [t("weeklyReview"), `${weekday(settings.weeklyReview.weekday)} · ${n(settings.weeklyReview.time)}`],
    [
      t("focus"),
      t("focusValue", {
        focus: n(settings.focus.focusMinutes),
        short: n(settings.focus.shortBreakMinutes),
        long: n(settings.focus.longBreakMinutes),
        cycles: n(settings.focus.cyclesBeforeLongBreak),
      }),
    ],
    [t("workHours"), `${n(settings.workHours.start)} – ${n(settings.workHours.end)}`],
    [
      t("week"),
      t("weekValue", {
        start: weekday(settings.week.weekStartsOn),
        weekend: settings.week.weekendDays.map(weekday).join(locale === "fa" ? "، " : ", "),
      }),
    ],
  ] as const;

  return (
    <UtilityCard as="section" aria-labelledby="settings-defaults" className="flex flex-col gap-3">
      <h2 id="settings-defaults" className="type-title">
        {t("defaults")}
      </h2>
      <dl className="flex flex-col divide-y divide-line">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
            <dt className="text-sm font-semibold text-fg-secondary">{label}</dt>
            <dd className="text-sm text-fg">{value}</dd>
          </div>
        ))}
      </dl>
    </UtilityCard>
  );
}
