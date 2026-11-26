"use client";

import { useTranslations } from "next-intl";
import { isLiveApi } from "@/api/runtime";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PillGroup } from "@/components/ui/pills";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import type { Habit, HabitIcon, HabitTimeOfDay } from "@/data/domain";
import { useCreateHabit, useHabits, useUpdateHabit } from "@/data/queries";
import { RepositoryError, type HabitInput } from "@/data/repositories";
import { usePlannerNow } from "@/features/my-day/my-day-context";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { cn } from "@/lib/cn";
import { dayOfWeekday } from "./domain/habits";
import { HABIT_ICON_IDS, HABIT_ICONS } from "./ui/habit-icons";
import { useHabitFormat } from "./ui/use-habit-format";

/*
 * Habit sheet (P18 · B): name, icon, frequency, target, preferred time and
 * reminder — a 420px drawer on desktop, a bottom sheet on phones (the
 * SheetHost container). `habitId` edits; `initialTitle` prefills from Ideas.
 * Live: icon ids, category, time of day, preferred time, unit label and the
 * reminder are stored by the Habit API; the server delivers the reminder (no
 * frontend scheduler). Preferred time never turns a reminder on. The unit is
 * the canonical Latin code (fixed after create); the label is display only.
 */

export const HABIT_SHEET_PARAM = "habit";
export const HABIT_SHEET_TITLE_PARAM = "title";

const TIMES: readonly HabitTimeOfDay[] = ["anytime", "morning", "afternoon", "evening"];
/** A unit the API can keep: Latin letters, digits, spaces or _ (sent upper-cased, spaces as _). */
const LATIN_UNIT = /^[A-Za-z][A-Za-z0-9_ ]{0,29}$/;
/** category / unit label bound (API: 1–100 characters). */
const LABEL_MAX = 100;

interface Draft {
  title: string;
  icon: HabitIcon;
  area: string;
  daily: boolean;
  restWeekdays: number[];
  targetAmount: string;
  targetUnit: string;
  targetLabel: string;
  timeOfDay: HabitTimeOfDay;
  preferredTime: string;
  reminder: boolean;
  reminderTime: string;
  ifNotDone: boolean;
}

function draftOf(habit: Habit | null, initialTitle = ""): Draft {
  return {
    title: habit?.title ?? initialTitle,
    icon: habit?.icon ?? "default",
    area: habit?.area ?? "",
    daily: (habit?.restWeekdays.length ?? 0) === 0,
    restWeekdays: habit?.restWeekdays ?? [],
    targetAmount: habit?.target ? String(habit.target.amount) : "",
    targetUnit: habit?.target?.unit ?? "",
    targetLabel: habit?.target?.label ?? "",
    timeOfDay: habit?.timeOfDay ?? "anytime",
    preferredTime: habit?.preferredTime ?? "",
    reminder: Boolean(habit?.reminder),
    // Independent of the preferred time (that one only describes the habit).
    reminderTime: habit?.reminder?.time ?? "20:00",
    ifNotDone: habit?.reminder?.ifNotDone ?? true,
  };
}

export function HabitSheet({ habitId, initialTitle, onClose }: { habitId?: string | null; initialTitle?: string; onClose(): void }) {
  const t = useTranslations("Habits.sheet");
  const query = useHabits();
  if (!habitId) return <HabitForm habit={null} initialTitle={initialTitle} onClose={onClose} />;
  if (query.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-12 rounded-field" />
        <Skeleton className="h-12 rounded-field" />
      </div>
    );
  }
  const habit = query.data?.find((item) => item.id === habitId);
  if (!habit) {
    return (
      <p role="alert" className="text-sm text-fg-secondary">
        {t("notFound")}
      </p>
    );
  }
  return <HabitForm key={habit.id} habit={habit} onClose={onClose} />;
}

function HabitForm({ habit, initialTitle, onClose }: { habit: Habit | null; initialTitle?: string; onClose(): void }) {
  const t = useTranslations("Habits.sheet");
  const tTime = useTranslations("Habits.timeOfDay");
  const format = useHabitFormat();
  const { day: today } = usePlannerNow();
  const { week } = usePlannerSettings();
  const create = useCreateHabit();
  const update = useUpdateHabit();
  const [draft, setDraft] = useState<Draft>(() => draftOf(habit, initialTitle));
  const [titleError, setTitleError] = useState(false);
  const [daysError, setDaysError] = useState(false);
  const [failed, setFailed] = useState<"failed" | "conflict" | null>(null);
  const [unitError, setUnitError] = useState(false);
  // Live API: units are canonical Latin codes (COUNT, PAGES) fixed after create;
  // the free-text label (Persian or English) is what people see.
  const live = isLiveApi();
  const unitLocked = live && Boolean(habit?.target);
  const ids = useId();
  const busy = create.isPending || update.isPending;
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const weekdays = Array.from({ length: 7 }, (_, index) => (week.weekStartsOn + index) % 7);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const restWeekdays = draft.daily ? [] : draft.restWeekdays;
    const noTitle = !draft.title.trim();
    const noDays = restWeekdays.length >= 7;
    const amount = Number(draft.targetAmount);
    const badUnit = live && amount > 0 && !unitLocked && draft.targetUnit.trim() !== "" && !LATIN_UNIT.test(draft.targetUnit.trim());
    setTitleError(noTitle);
    setDaysError(noDays);
    setUnitError(badUnit);
    if (noTitle || noDays || badUnit) return;
    setFailed(null);
    const input: HabitInput = {
      title: draft.title,
      icon: draft.icon,
      area: draft.area.trim() || null,
      restWeekdays,
      target: amount > 0 ? { amount, unit: draft.targetUnit.trim() || (live ? "COUNT" : ""), label: draft.targetLabel.trim() || null } : null,
      timeOfDay: draft.timeOfDay,
      preferredTime: draft.preferredTime || null,
      reminder: draft.reminder && draft.reminderTime ? { time: draft.reminderTime, ifNotDone: draft.ifNotDone } : null,
    };
    try {
      if (habit) {
        await update.mutateAsync({ id: habit.id, patch: input });
        toast({ tone: "success", title: t("saved") });
      } else {
        await create.mutateAsync(input);
        toast({ tone: "success", title: t("created") });
      }
      onClose();
    } catch (error) {
      setFailed(error instanceof RepositoryError && error.code === "conflict" ? "conflict" : "failed");
    }
  };

  return (
    <form className="flex flex-col gap-5" data-habit-sheet={habit ? "edit" : "new"} onSubmit={(event) => void submit(event)} noValidate>
      <Field invalid={titleError}>
        <FieldLabel>{t("name")}</FieldLabel>
        <Input
          value={draft.title}
          dir="auto"
          autoFocus
          placeholder={t("namePlaceholder")}
          inputClassName="text-base font-bold"
          onChange={(event) => {
            set({ title: event.target.value });
            if (titleError) setTitleError(false);
          }}
        />
        <FieldError>{titleError ? t("nameRequired") : null}</FieldError>
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold text-fg">{t("icon")}</legend>
        <div role="radiogroup" aria-label={t("icon")} className="flex flex-wrap gap-2">
          {HABIT_ICON_IDS.map((id) => {
            const selected = draft.icon === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={t(`icons.${id}`)}
                tabIndex={selected ? 0 : -1}
                onClick={() => set({ icon: id })}
                onKeyDown={(event) => {
                  const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
                  if (!step) return;
                  event.preventDefault();
                  const rtl = getComputedStyle(event.currentTarget).direction === "rtl" && (event.key === "ArrowRight" || event.key === "ArrowLeft");
                  const index = (HABIT_ICON_IDS.indexOf(id) + (rtl ? -step : step) + HABIT_ICON_IDS.length) % HABIT_ICON_IDS.length;
                  set({ icon: HABIT_ICON_IDS[index]! });
                  (event.currentTarget.parentElement?.children[index] as HTMLElement | undefined)?.focus();
                }}
                className={cn(
                  "grid size-11 place-items-center rounded-full focus-visible:focus-ring",
                  selected ? "bg-scope-deep text-on-accent" : "bg-subtle text-fg-secondary hover:bg-raised",
                )}
              >
                <Icon icon={HABIT_ICONS[id]} size={18} />
              </button>
            );
          })}
        </div>
      </fieldset>

      <Field>
        <FieldLabel>{t("area")}</FieldLabel>
        <Input value={draft.area} dir="auto" maxLength={LABEL_MAX} placeholder={t("areaPlaceholder")} onChange={(event) => set({ area: event.target.value })} />
      </Field>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2 text-sm font-bold text-fg">{t("frequency")}</legend>
        <Segmented
          variant="neutral"
          label={t("frequency")}
          value={draft.daily ? "daily" : "days"}
          onValueChange={(value) => set({ daily: value === "daily" })}
          options={[
            { value: "daily", label: t("daily") },
            { value: "days", label: t("specificDays") },
          ]}
          className="self-start"
        />
        {draft.daily ? null : (
          <div role="group" aria-label={t("days")} aria-describedby={daysError ? `${ids}-days` : undefined} className="flex flex-wrap gap-1.5">
            {weekdays.map((weekday) => {
              const on = !draft.restWeekdays.includes(weekday);
              const day = dayOfWeekday(today, weekday);
              return (
                <button
                  key={weekday}
                  type="button"
                  aria-pressed={on}
                  aria-label={format.weekday(day)}
                  onClick={() => {
                    set({ restWeekdays: on ? [...draft.restWeekdays, weekday] : draft.restWeekdays.filter((item) => item !== weekday) });
                    setDaysError(false);
                  }}
                  className={cn(
                    "grid size-10 place-items-center rounded-full text-xs font-bold focus-visible:focus-ring",
                    on ? "bg-scope-soft text-scope-deep inset-ring-2 inset-ring-scope-deep" : "bg-subtle text-fg-muted",
                    week.weekendDays.includes(weekday as never) && !on && "text-weekend-text",
                  )}
                >
                  {format.weekdayNarrow(day)}
                </button>
              );
            })}
          </div>
        )}
        <p id={`${ids}-days`} role="alert" className="text-xs text-danger-text empty:hidden">
          {daysError ? t("daysRequired") : null}
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold text-fg">{t("target")}</legend>
        <div className="flex gap-2">
          <Input
            aria-label={t("targetAmount")}
            type="number"
            inputMode="numeric"
            min={1}
            value={draft.targetAmount}
            placeholder={t("targetAmountPlaceholder")}
            className="w-28"
            onChange={(event) => set({ targetAmount: event.target.value })}
          />
          <Input
            aria-label={t("targetUnit")}
            dir="auto"
            value={draft.targetUnit}
            readOnly={unitLocked}
            placeholder={live ? "COUNT" : t("targetUnitPlaceholder")}
            className="min-w-0 flex-1"
            aria-invalid={unitError || undefined}
            aria-describedby={unitError ? `${ids}-unit` : undefined}
            onChange={(event) => {
              set({ targetUnit: event.target.value });
              if (unitError) setUnitError(false);
            }}
          />
        </div>
        <p id={`${ids}-unit`} role="alert" className="text-xs text-danger-text empty:hidden">
          {unitError ? t("unitLatin") : null}
        </p>
        <Input
          aria-label={t("unitLabel")}
          dir="auto"
          maxLength={LABEL_MAX}
          value={draft.targetLabel}
          placeholder={t("unitLabelPlaceholder")}
          onChange={(event) => set({ targetLabel: event.target.value })}
        />
        <p className="text-xs text-fg-muted">{live ? t("targetHintLive") : t("targetHint")}</p>
      </fieldset>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2 text-sm font-bold text-fg">{t("time")}</legend>
        <PillGroup
          label={t("timeOfDay")}
          value={draft.timeOfDay}
          onValueChange={(timeOfDay) => set({ timeOfDay })}
          options={TIMES.map((value) => ({ value, label: tTime(value) }))}
        />
        <Input
          aria-label={t("preferredTime")}
          type="time"
          dir="ltr"
          value={draft.preferredTime}
          className="w-36"
          onChange={(event) => set({ preferredTime: event.target.value })}
        />
        <FieldDescription>{t("preferredTimeHint")}</FieldDescription>
      </fieldset>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="sr-only">{t("reminder")}</legend>
        <Switch label={t("reminder")} checked={draft.reminder} onCheckedChange={(reminder) => set({ reminder })} />
        <FieldDescription>{t("reminderNote")}</FieldDescription>
        {draft.reminder ? (
          <div className="flex flex-wrap items-center gap-3">
            <Input
              aria-label={t("reminderTime")}
              type="time"
              dir="ltr"
              value={draft.reminderTime}
              className="w-36"
              onChange={(event) => set({ reminderTime: event.target.value })}
            />
            <Checkbox label={t("ifNotDone")} checked={draft.ifNotDone} onCheckedChange={(checked) => set({ ifNotDone: checked === true })} />
          </div>
        ) : null}
      </fieldset>

      <p role="alert" className="text-sm text-danger-text empty:hidden">
        {failed ? t(failed) : null}
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={busy} loadingText={t("saving")}>
          {habit ? t("save") : t("create")}
        </Button>
      </div>
    </form>
  );
}
