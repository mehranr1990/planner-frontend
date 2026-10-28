"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useId, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/shell/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button, IconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SearchField } from "@/components/ui/search-field";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectItem } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { UtilityCard, UtilityField } from "@/design-system/surfaces/utility-card";
import { optionalModuleIds } from "@/features/planner-settings/modules";
import {
  cyclesBeforeLongBreakOptions,
  DEFAULT_PLANNER_SETTINGS,
  focusMinuteOptions,
  longBreakMinuteOptions,
  shortBreakMinuteOptions,
  type ClockTime,
  type Energy,
  type PlannerSettings,
  type PlannerSettingsPatch,
  type Rollover,
} from "@/features/planner-settings/planner-settings";
import { usePlannerSettings, usePlannerSettingsActions } from "@/features/planner-settings/use-planner-settings";
import type { Preferences } from "@/features/preferences/preferences-store";
import { usePreferenceActions, usePreferences } from "@/features/preferences/use-preferences";
import { useIsClient } from "@/hooks/use-is-client";
import { formatDate } from "@/lib/dates/format";
import type { Weekday } from "@/lib/dates/week";
import { cn } from "@/lib/cn";
import { convertDigits } from "@/lib/locale/digits";
import {
  DAILY_GOAL,
  dayKindOf,
  dayKinds,
  durationOptions,
  isClockTime,
  isDeleteConfirmed,
  isValidTimeRange,
  matchesSettingsQuery,
  orderedWeekdays,
  setDayKind,
  settingsGroupIds,
  undoPatchFor,
  type DayKind,
  type SettingsGroupId,
} from "./settings-model";

/*
 * P17 · Settings: one page with an in-page index (not one route per group).
 * Groups are utility cards (never notched, no folder tabs). Every change
 * saves instantly through the existing stores and offers "Saved · Undo";
 * destructive actions confirm. Mobile: the index is the root list and a
 * group opens as a pushed panel with Back (CSS only, so SSR stays stable).
 */

const SAVED_TOAST_ID = "settings-saved";
const ENERGIES: readonly Energy[] = ["low", "medium", "high"];
const ROLLOVERS: readonly Rollover[] = ["ask", "move-to-tomorrow", "keep"];
const BUFFER_PERCENTS = [10, 25, 50, 75, 100] as const;

type ThemeChoice = "light" | "dark" | "system";
const isThemeChoice = (value: string | undefined): value is ThemeChoice =>
  value === "light" || value === "dark" || value === "system";

const groupDomId = (id: SettingsGroupId) => `settings-${id}`;

function useSettingsSave() {
  const t = useTranslations("Settings.page");
  const settings = usePlannerSettings();
  const preferences = usePreferences();
  const { update } = usePlannerSettingsActions();
  const preferenceActions = usePreferenceActions();

  const saved = (undo: () => void) =>
    toast({
      id: SAVED_TOAST_ID,
      title: t("saved"),
      tone: "neutral",
      action: { label: t("undo"), altText: t("undoAlt"), onClick: undo },
    });

  return {
    planner(patch: PlannerSettingsPatch) {
      const undo = undoPatchFor(settings, patch);
      update(patch);
      saved(() => update(undo));
    },
    preferences(patch: Partial<Preferences>) {
      const previous = Object.fromEntries(
        Object.keys(patch).map((key) => [key, preferences[key as keyof Preferences]]),
      ) as Partial<Preferences>;
      preferenceActions.update(patch);
      saved(() => preferenceActions.update(previous));
    },
    locale(locale: Preferences["locale"]) {
      const { locale: previousLocale, direction, digits, calendar } = preferences;
      preferenceActions.setLocale(locale);
      saved(() => preferenceActions.update({ locale: previousLocale, direction, digits, calendar }));
    },
    saved,
  };
}

/** Weekday name of a JS weekday number, in the user's language and digits. */
function useWeekdayName() {
  const { locale, digits, calendar } = usePreferences();
  // 4 Oct 2026 is a Sunday: add the weekday number to land on it.
  return (weekday: number) => formatDate(new Date(2026, 9, 4 + weekday), "weekday", { locale, digits, calendar });
}

function useDigits() {
  const { digits } = usePreferences();
  return (value: number | string) => convertDigits(value, digits);
}

// ── Layout pieces ──────────────────────────────────────────────────────────

function Group({
  id,
  title,
  active,
  hidden,
  onBack,
  children,
}: {
  id: SettingsGroupId;
  title: string;
  active: boolean;
  hidden: boolean;
  onBack: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("Settings.page");
  const headingId = `${groupDomId(id)}-title`;
  return (
    <UtilityCard
      as="section"
      id={groupDomId(id)}
      aria-labelledby={headingId}
      // Mobile: only the pushed group shows; desktop: every group the search matches.
      className={cn("scroll-mt-24 gap-3", hidden ? "hidden" : active ? "flex" : "max-lg:hidden lg:flex")}
    >
      <Button variant="ghost" size="sm" className="self-start lg:hidden" onClick={onBack}>
        <Icon icon={ChevronLeft} size={16} mirror />
        {t("back")}
      </Button>
      <h2 id={headingId} tabIndex={-1} className="type-title outline-none">
        {title}
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
    </UtilityCard>
  );
}

/** One labelled setting: label + hint at the inline start, the control at the end. */
function Row({ label, hint, labelId, children }: { label: ReactNode; hint?: ReactNode; labelId?: string; children: ReactNode }) {
  return (
    <UtilityField className="flex-wrap justify-between gap-x-4 gap-y-2 py-2">
      <div className="flex min-w-0 flex-col">
        <span id={labelId}>{label}</span>
        {hint ? <span className="text-xs font-normal text-fg-muted">{hint}</span> : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </UtilityField>
  );
}

/** A setting the boards show that has no store or API yet: read-only value + "Not available yet". */
function PlaceholderRow({ label, value }: { label: string; value: string }) {
  const t = useTranslations("Settings.page");
  return (
    <Row label={label} hint={t("soon")}>
      <span className="text-sm font-normal text-fg-secondary" dir="auto">
        {value}
      </span>
    </Row>
  );
}

function SwitchRow({ label, hint, checked, onCheckedChange }: { label: string; hint?: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <UtilityField className="py-2">
      <Switch label={label} description={hint} checked={checked} onCheckedChange={onCheckedChange} wrapperClassName="w-full" />
    </UtilityField>
  );
}

/** Two clock inputs; saves only a valid range (end after start) and explains an invalid one. */
function TimeRange({ value, onSave, label }: { value: { start: ClockTime; end: ClockTime }; onSave: (range: { start: ClockTime; end: ClockTime }) => void; label: string }) {
  const t = useTranslations("Settings.planning");
  const n = useDigits();
  const errorId = useId();
  const [draft, setDraft] = useState<{ start: string; end: string }>(value);
  const invalid = !isValidTimeRange(draft.start, draft.end);

  const change = (key: "start" | "end", next: string) => {
    const range = { ...draft, [key]: next };
    setDraft(range);
    if (isValidTimeRange(range.start, range.end)) onSave(range as { start: ClockTime; end: ClockTime });
  };

  return (
    <div role="group" aria-label={label} className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2" dir="ltr">
        <Input
          type="time"
          aria-label={t("start")}
          value={draft.start}
          invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          className="w-32"
          onChange={(event) => change("start", event.target.value)}
        />
        <span aria-hidden>–</span>
        <Input
          type="time"
          aria-label={t("end")}
          value={draft.end}
          invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          className="w-32"
          onChange={(event) => change("end", event.target.value)}
        />
      </div>
      {invalid ? (
        <p id={errorId} role="alert" className="text-xs font-normal text-danger-text">
          {t("rangeError")}
        </p>
      ) : (
        <span className="sr-only">{n(`${value.start} – ${value.end}`)}</span>
      )}
    </div>
  );
}

// ── Groups ─────────────────────────────────────────────────────────────────

function AppearanceGroup() {
  const t = useTranslations("Settings.appearance");
  const { theme, setTheme } = useTheme();
  const save = useSettingsSave();
  const isClient = useIsClient();
  const value: ThemeChoice = isClient && isThemeChoice(theme) ? theme : "system";
  const choose = (next: ThemeChoice) => {
    const previous = value;
    setTheme(next);
    save.saved(() => setTheme(previous));
  };
  return (
    <>
      <Row label={t("theme")}>
        <Segmented<ThemeChoice>
          label={t("theme")}
          value={value}
          onValueChange={choose}
          options={(["light", "dark", "system"] as const).map((v) => ({ value: v, label: t(v) }))}
        />
      </Row>
      <PlaceholderRow label={t("reducedMotion")} value={t("reducedMotionValue")} />
      <PlaceholderRow label={t("density")} value={t("densityValue")} />
    </>
  );
}

function LanguageGroup() {
  const t = useTranslations("Settings.language");
  const n = useDigits();
  const { locale, digits } = usePreferences();
  const save = useSettingsSave();
  return (
    <>
      <Row label={t("language")} hint={t("languageHint")}>
        <Segmented
          label={t("language")}
          value={locale}
          onValueChange={save.locale}
          options={[
            { value: "fa", label: "فارسی", lang: "fa" },
            { value: "en", label: "English", lang: "en" },
          ]}
        />
      </Row>
      <Row label={t("digits")} hint={t("digitsHint")}>
        <Segmented
          label={t("digits")}
          value={digits}
          onValueChange={(next) => save.preferences({ digits: next })}
          options={[
            { value: "fa", label: "۱۲۳", lang: "fa", ariaLabel: t("persianDigits") },
            { value: "latn", label: "123", ariaLabel: t("latinDigits") },
          ]}
        />
      </Row>
      <PlaceholderRow label={t("timeFormat")} value={n(t("timeFormatValue"))} />
    </>
  );
}

function CalendarGroup() {
  const t = useTranslations("Settings.calendar");
  const { calendar } = usePreferences();
  const { week } = usePlannerSettings();
  const save = useSettingsSave();
  const weekday = useWeekdayName();
  const [error, setError] = useState(false);
  const errorId = useId();

  const changeKind = (day: Weekday, kind: DayKind) => {
    const next = setDayKind(week, day, kind);
    setError(next === null);
    if (next) save.planner({ week: next });
  };

  return (
    <>
      <Row label={t("calendar")} hint={t("calendarHint")}>
        <Segmented
          label={t("calendar")}
          value={calendar}
          onValueChange={(next) => save.preferences({ calendar: next })}
          options={[
            { value: "jalali", label: t("shamsi") },
            { value: "gregorian", label: t("gregorian") },
          ]}
        />
      </Row>
      <Row label={t("weekStarts")}>
        <Select
          aria-label={t("weekStarts")}
          value={String(week.weekStartsOn)}
          onValueChange={(next) => save.planner({ week: { weekStartsOn: Number(next) as Weekday } })}
          className="w-40"
        >
          {orderedWeekdays(6).map((day) => (
            <SelectItem key={day} value={String(day)}>
              {weekday(day)}
            </SelectItem>
          ))}
        </Select>
      </Row>
      <fieldset className="flex flex-col gap-2 rounded-field bg-[color:var(--utility-field,var(--surface))] px-3.5 py-3" aria-describedby={error ? errorId : undefined}>
        <legend className="sr-only">{t("days")}</legend>
        <div aria-hidden className="flex flex-col">
          <span className="text-sm font-semibold text-fg">{t("days")}</span>
          <span className="text-xs text-fg-muted">{t("daysHint")}</span>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {orderedWeekdays(week.weekStartsOn).map((day) => {
            const kind = dayKindOf(week, day);
            return (
              <li key={day} className="flex items-center justify-between gap-3">
                <span className={cn("text-sm font-semibold", kind === "weekend" ? "text-danger-text" : "text-fg")}>{weekday(day)}</span>
                <Select
                  aria-label={t("dayLabel", { day: weekday(day) })}
                  value={kind}
                  onValueChange={(next) => changeKind(day, next as DayKind)}
                  className="w-36"
                >
                  {dayKinds.map((option) => (
                    <SelectItem key={option} value={option} dotClassName={option === "weekend" ? "bg-danger" : undefined}>
                      {t(`dayKind.${option}`)}
                    </SelectItem>
                  ))}
                </Select>
              </li>
            );
          })}
        </ul>
        {error ? (
          <p id={errorId} role="alert" className="text-xs text-danger-text">
            {t("noWorkday")}
          </p>
        ) : null}
      </fieldset>
    </>
  );
}

function PlanningGroup() {
  const t = useTranslations("Settings.planning");
  const tCategory = useTranslations("Insights.estimates");
  const n = useDigits();
  const settings = usePlannerSettings();
  const save = useSettingsSave();
  const { workHours, planning, insights } = settings;
  const rolloverLabelId = useId();
  const buffers = Object.entries(insights.estimateBuffers).filter((entry): entry is [string, number] => (entry[1] ?? 0) > 0);
  // Buffers are keyed by the Insights estimate categories; unknown keys show as stored.
  const categoryName = (key: string) => {
    const message = key as Parameters<typeof tCategory>[0];
    return tCategory.has(message) ? tCategory(message) : key;
  };
  const durations: readonly number[] = durationOptions.includes(planning.defaultDurationMinutes as (typeof durationOptions)[number])
    ? durationOptions
    : [...durationOptions, planning.defaultDurationMinutes].sort((a, b) => a - b);

  return (
    <>
      <Row label={t("workHours")}>
        <TimeRange
          key={`${workHours.start}-${workHours.end}`}
          label={t("workHours")}
          value={workHours}
          onSave={(range) => save.planner({ workHours: range })}
        />
      </Row>
      <Row label={t("defaultDuration")}>
        <Select
          aria-label={t("defaultDuration")}
          value={String(planning.defaultDurationMinutes)}
          onValueChange={(next) => save.planner({ planning: { defaultDurationMinutes: Number(next) } })}
          className="w-36"
        >
          {durations.map((minutes) => (
            <SelectItem key={minutes} value={String(minutes)}>
              {t("minutes", { count: n(minutes) })}
            </SelectItem>
          ))}
        </Select>
      </Row>
      <Row label={t("defaultEnergy")}>
        <Segmented<Energy>
          label={t("defaultEnergy")}
          value={planning.defaultEnergy}
          onValueChange={(next) => save.planner({ planning: { defaultEnergy: next } })}
          options={ENERGIES.map((v) => ({ value: v, label: t(`energy.${v}`) }))}
        />
      </Row>
      <PlaceholderRow label={t("taskReminders")} value={n(t("taskRemindersValue"))} />
      <UtilityField className="flex-col items-stretch gap-2 py-3">
        <span id={rolloverLabelId}>{t("rollover")}</span>
        <RadioGroup
          aria-labelledby={rolloverLabelId}
          value={planning.rollover}
          onValueChange={(next) => save.planner({ planning: { rollover: next as Rollover } })}
        >
          {ROLLOVERS.map((value) => (
            <RadioGroupItem key={value} value={value} label={t(`rolloverValue.${value}`)} description={t(`rolloverHint.${value}`)} />
          ))}
        </RadioGroup>
      </UtilityField>
      <PlaceholderRow label={t("suggestSlots")} value="—" />

      <div className="mt-2 flex flex-col gap-0.5">
        <h3 className="text-sm font-bold text-fg">{t("fromInsights")}</h3>
        <p className="text-xs text-fg-muted">{t("fromInsightsHint")}</p>
      </div>
      <UtilityField className="flex-col items-stretch gap-2 py-3">
        <Switch
          label={t("protectedFocus")}
          description={t("protectedFocusHint")}
          checked={insights.protectedFocus !== null}
          onCheckedChange={(on) =>
            save.planner({ insights: { protectedFocus: on ? { start: workHours.start, end: "12:00" <= workHours.start ? workHours.end : "12:00" } : null } })
          }
          wrapperClassName="w-full"
        />
        {insights.protectedFocus ? (
          <TimeRange
            key={`${insights.protectedFocus.start}-${insights.protectedFocus.end}`}
            label={t("protectedFocus")}
            value={insights.protectedFocus}
            onSave={(range) => save.planner({ insights: { protectedFocus: range } })}
          />
        ) : null}
      </UtilityField>
      <UtilityField className="flex-col items-stretch gap-2 py-3">
        <span>{t("buffers")}</span>
        {buffers.length === 0 ? (
          <p className="text-xs font-normal text-fg-muted">{t("buffersEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {buffers.map(([category, percent]) => (
              <li key={category} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">{categoryName(category)}</span>
                <span className="flex items-center gap-1">
                  <Select
                    aria-label={t("bufferLabel", { category: categoryName(category) })}
                    value={String(percent)}
                    onValueChange={(next) =>
                      save.planner({ insights: { estimateBuffers: { ...insights.estimateBuffers, [category]: Number(next) } } })
                    }
                    className="w-28"
                  >
                    {[...new Set([...BUFFER_PERCENTS, percent])].sort((a, b) => a - b).map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {t("percent", { percent: n(value) })}
                      </SelectItem>
                    ))}
                  </Select>
                  <IconButton
                    icon={X}
                    variant="ghost"
                    size="sm"
                    aria-label={t("removeBuffer", { category: categoryName(category) })}
                    onClick={() => {
                      const rest = Object.fromEntries(Object.entries(insights.estimateBuffers).filter(([key]) => key !== category));
                      save.planner({ insights: { estimateBuffers: rest } });
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </UtilityField>
    </>
  );
}

function FocusGroup() {
  const t = useTranslations("Settings.focus");
  const n = useDigits();
  const { focus } = usePlannerSettings();
  const save = useSettingsSave();
  const options = (values: readonly number[]) => values.map((v) => ({ value: String(v), label: n(v) }));
  const segment = (label: string, values: readonly number[], value: number, key: "focusMinutes" | "shortBreakMinutes" | "longBreakMinutes" | "cyclesBeforeLongBreak") => (
    <Row label={label}>
      <Segmented
        label={label}
        value={String(value)}
        onValueChange={(next) => save.planner({ focus: { [key]: Number(next) } as PlannerSettingsPatch["focus"] })}
        options={options(values)}
      />
    </Row>
  );
  const [goal, setGoal] = useState<number>(focus.dailyGoalMinutes);
  const hours = (minutes: number) => t("hours", { hours: n(Number((minutes / 60).toFixed(1))) });

  return (
    <>
      {segment(t("focus"), focusMinuteOptions, focus.focusMinutes, "focusMinutes")}
      {segment(t("shortBreak"), shortBreakMinuteOptions, focus.shortBreakMinutes, "shortBreakMinutes")}
      {segment(t("longBreak"), longBreakMinuteOptions, focus.longBreakMinutes, "longBreakMinutes")}
      {segment(t("cycles"), cyclesBeforeLongBreakOptions, focus.cyclesBeforeLongBreak, "cyclesBeforeLongBreak")}
      <SwitchRow
        label={t("autoStart")}
        hint={t("autoStartHint")}
        checked={focus.autoStartNext}
        onCheckedChange={(autoStartNext) => save.planner({ focus: { autoStartNext } })}
      />
      <UtilityField className="py-3">
        <Slider
          className="w-full"
          label={t("dailyGoal")}
          min={DAILY_GOAL.min}
          max={DAILY_GOAL.max}
          step={DAILY_GOAL.step}
          value={goal}
          onValueChange={setGoal}
          formatValue={hours}
          onValueCommit={(dailyGoalMinutes) => save.planner({ focus: { dailyGoalMinutes } })}
        />
      </UtilityField>
    </>
  );
}

function ModulesGroup() {
  const t = useTranslations("Settings.moduleSettings");
  const tModules = useTranslations("Settings.modules");
  const { modules } = usePlannerSettings();
  const save = useSettingsSave();
  return (
    <>
      <p className="text-sm text-fg-secondary">{t("note")}</p>
      <ul className="flex flex-col gap-2">
        {optionalModuleIds.map((id) => (
          <li key={id}>
            <SwitchRow label={tModules(id)} checked={modules[id]} onCheckedChange={(on) => save.planner({ modules: { [id]: on } })} />
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-muted">{t("coreNote")}</p>
    </>
  );
}

function FinanceGroup() {
  const t = useTranslations("Settings.finance");
  const n = useDigits();
  const { currency } = usePreferences();
  const save = useSettingsSave();
  return (
    <>
      <Row label={t("currency")} hint={n(t("currencyHint"))}>
        <Segmented
          label={t("currency")}
          value={currency}
          onValueChange={(next) => save.preferences({ currency: next })}
          options={[
            { value: "toman", label: t("toman") },
            { value: "rial", label: t("rial") },
          ]}
        />
      </Row>
      <PlaceholderRow label={t("monthStarts")} value={t("monthStartsValue")} />
      <PlaceholderRow label={t("categories")} value={n(t("categoriesValue"))} />
    </>
  );
}

function NotificationsGroup() {
  const t = useTranslations("Settings.notifications");
  const n = useDigits();
  const { weeklyReview } = usePlannerSettings();
  const save = useSettingsSave();
  const weekday = useWeekdayName();
  const [time, setTime] = useState<string>(weeklyReview.time);
  const invalid = !isClockTime(time);
  return (
    <>
      <PlaceholderRow label={t("taskReminders")} value="—" />
      <PlaceholderRow label={t("morningNudge")} value={n(t("morningNudgeValue"))} />
      <PlaceholderRow label={t("shutdown")} value={t("shutdownValue")} />
      <Row label={t("weeklyReview")} hint={t("weeklyReviewHint")}>
        <Select
          aria-label={t("weekday")}
          value={String(weeklyReview.weekday)}
          onValueChange={(next) => save.planner({ weeklyReview: { weekday: Number(next) as Weekday } })}
          className="w-36"
        >
          {orderedWeekdays(6).map((day) => (
            <SelectItem key={day} value={String(day)}>
              {weekday(day)}
            </SelectItem>
          ))}
        </Select>
        <Input
          type="time"
          dir="ltr"
          aria-label={t("time")}
          value={time}
          invalid={invalid}
          className="w-32"
          onChange={(event) => {
            setTime(event.target.value);
            if (isClockTime(event.target.value)) save.planner({ weeklyReview: { time: event.target.value } });
          }}
        />
      </Row>
    </>
  );
}

function PrivacyGroup() {
  const t = useTranslations("Settings.privacy");
  const { privacy } = usePlannerSettings();
  const save = useSettingsSave();
  return (
    <>
      <SwitchRow
        label={t("journalLock")}
        hint={t("journalLockHint")}
        checked={privacy.journalLock}
        onCheckedChange={(journalLock) => save.planner({ privacy: { journalLock } })}
      />
      <SwitchRow
        label={t("financeLock")}
        hint={t("financeLockHint")}
        checked={privacy.financeLock}
        onCheckedChange={(financeLock) => save.planner({ privacy: { financeLock } })}
      />
    </>
  );
}

function withoutVersion(settings: PlannerSettings): PlannerSettingsPatch {
  return Object.fromEntries(Object.entries(settings).filter(([key]) => key !== "version")) as PlannerSettingsPatch;
}

function DataGroup() {
  const t = useTranslations("Settings.data");
  const tPage = useTranslations("Settings.page");
  const n = useDigits();
  const settings = usePlannerSettings();
  const { update } = usePlannerSettingsActions();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const confirmId = useId();

  const reset = () => {
    const previous = withoutVersion(settings);
    update(withoutVersion(DEFAULT_PLANNER_SETTINGS));
    toast({
      id: "settings-reset",
      title: t("resetDone"),
      tone: "neutral",
      action: { label: tPage("undo"), altText: tPage("undoAlt"), onClick: () => update(previous) },
    });
  };

  const openDelete = (open: boolean) => {
    setDeleteOpen(open);
    if (!open) setConfirmText("");
  };

  return (
    <>
      <UtilityField className="flex-col items-stretch gap-2 py-3">
        <span>{t("account")}</span>
        <p className="text-xs font-normal text-fg-muted">{t("accountHint")}</p>
        <ul className="flex flex-col gap-1">
          {(["google", "email", "magicLink"] as const).map((method) => (
            <li key={method} className="flex items-center justify-between gap-3 text-sm">
              <span>{t(method)}</span>
              <span className="font-normal text-fg-muted">{t("notConnected")}</span>
            </li>
          ))}
        </ul>
      </UtilityField>
      <PlaceholderRow label={t("import")} value={t("importValue")} />
      <PlaceholderRow label={t("export")} value={t("exportValue")} />
      <PlaceholderRow label={t("archive")} value={n(t("archiveValue"))} />
      <Row label={t("reset")} hint={t("resetHint")}>
        <Button variant="outline" size="sm" onClick={reset}>
          {t("resetButton")}
        </Button>
      </Row>
      <Row label={t("deleteAccount")}>
        <Button variant="outline" size="sm" className="text-danger-text" onClick={() => openDelete(true)}>
          {t("deleteButton")}
        </Button>
      </Row>
      <AlertDialog open={deleteOpen} onOpenChange={openDelete}>
        <AlertDialogContent tone="destructive" title={t("delete.title")} description={t("delete.description")}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={confirmId} className="text-sm font-semibold text-fg">
              {t("delete.typeLabel")}
            </label>
            <Input
              id={confirmId}
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => toast({ title: t("delete.exportUnavailable"), tone: "info" })}
            >
              {t("delete.exportFirst")}
            </AlertDialogCancel>
            <AlertDialogAction
              tone="destructive"
              disabled={!isDeleteConfirmed(confirmText)}
              onClick={() => toast({ title: t("delete.unavailable"), tone: "info" })}
            >
              {t("delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const GROUP_BODIES: Record<SettingsGroupId, () => ReactNode> = {
  appearance: AppearanceGroup,
  language: LanguageGroup,
  calendar: CalendarGroup,
  planning: PlanningGroup,
  focus: FocusGroup,
  modules: ModulesGroup,
  finance: FinanceGroup,
  notifications: NotificationsGroup,
  privacy: PrivacyGroup,
  data: DataGroup,
};

// ── Screen ─────────────────────────────────────────────────────────────────

export function SettingsScreen() {
  const t = useTranslations("Settings");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<SettingsGroupId | null>(null);

  const visible = settingsGroupIds.filter((id) =>
    matchesSettingsQuery(query, [t(`groups.${id}.title`), t(`groups.${id}.keywords`)]),
  );

  const push = (id: SettingsGroupId) => {
    setActive(id);
    // Move focus to the opened group (mobile push / desktop jump).
    requestAnimationFrame(() => document.getElementById(`${groupDomId(id)}-title`)?.focus({ preventScroll: true }));
  };
  const back = () => {
    const from = active;
    setActive(null);
    if (from) requestAnimationFrame(() => document.getElementById(`${groupDomId(from)}-link`)?.focus());
  };

  return (
    <>
      <PageHeader title={t("page.title")} subtitle={t("page.subtitle")} />
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <UtilityCard
          as="aside"
          aria-label={t("page.index")}
          className={cn("flex-col gap-3 lg:sticky lg:top-24", active ? "hidden lg:flex" : "flex")}
        >
          <SearchField aria-label={t("page.search")} placeholder={t("page.search")} value={query} onValueChange={setQuery} />
          <nav aria-label={t("page.index")}>
            <ul className="flex flex-col gap-1">
              {visible.map((id) => (
                <li key={id}>
                  <a
                    id={`${groupDomId(id)}-link`}
                    href={`#${groupDomId(id)}`}
                    onClick={() => push(id)}
                    className={cn(
                      "flex min-h-11 items-center justify-between gap-2 rounded-row px-3 text-sm font-semibold text-fg-secondary",
                      "hover:bg-subtle hover:text-fg",
                    )}
                  >
                    {t(`groups.${id}.title`)}
                    <span className="lg:hidden" aria-hidden>
                      <Icon icon={ChevronRight} size={16} mirror />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          {visible.length === 0 ? (
            <p role="status" className="px-3 text-sm text-fg-muted">
              {t("page.noResults", { query })}
            </p>
          ) : null}
        </UtilityCard>
        <div className="flex min-w-0 flex-col gap-4">
          {settingsGroupIds.map((id) => {
            const Body = GROUP_BODIES[id];
            return (
              <Group
                key={id}
                id={id}
                title={t(`groups.${id}.title`)}
                active={active === id}
                hidden={!visible.includes(id)}
                onBack={back}
              >
                <Body />
              </Group>
            );
          })}
        </div>
      </div>
    </>
  );
}
