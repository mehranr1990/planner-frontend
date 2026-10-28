"use client";

import { Calendar, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { Goal } from "@/data/domain";
import { useCreateGoal, useGoal, useUpdateGoal } from "@/data/queries";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { dayToLocalDate, localDateToDay } from "@/lib/dates/clock-time";

/*
 * Goal sheet (P18 · C): title, context, target, deadline and optional
 * milestones — a 420px drawer on desktop, a bottom sheet on phones (the
 * SheetHost container). `goalId` edits an existing goal; milestones are then
 * added from the path (Journey tab), not here. `initialTitle` prefills a new
 * goal from "See examples".
 */

export const GOAL_SHEET_PARAM = "goal";
export const GOAL_SHEET_TITLE_PARAM = "title";

interface Draft {
  title: string;
  area: string;
  target: string;
  dueDay: string | null;
  milestones: { key: number; title: string; dueDay: string | null }[];
}

function draftOf(goal: Goal | null, initialTitle = ""): Draft {
  return {
    title: goal?.title ?? initialTitle,
    area: goal?.area ?? "",
    target: goal?.target ?? "",
    dueDay: goal?.dueDay ?? null,
    milestones: [],
  };
}

export function GoalSheet({ goalId, initialTitle, onClose }: { goalId?: string | null; initialTitle?: string; onClose(): void }) {
  const t = useTranslations("Goals.sheet");
  const query = useGoal(goalId ?? null);
  if (!goalId) return <GoalForm goal={null} initialTitle={initialTitle} onClose={onClose} />;
  if (query.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-12 rounded-field" />
        <Skeleton className="h-12 rounded-field" />
      </div>
    );
  }
  if (!query.data) {
    return (
      <p role="alert" className="text-sm text-fg-secondary">
        {t("notFound")}
      </p>
    );
  }
  return <GoalForm key={query.data.id} goal={query.data} onClose={onClose} />;
}

function GoalForm({ goal, initialTitle, onClose }: { goal: Goal | null; initialTitle?: string; onClose(): void }) {
  const t = useTranslations("Goals.sheet");
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const [draft, setDraft] = useState<Draft>(() => draftOf(goal, initialTitle));
  const [titleError, setTitleError] = useState(false);
  const [failed, setFailed] = useState(false);
  const [nextKey, setNextKey] = useState(1);
  const errorId = useId();
  const busy = create.isPending || update.isPending;

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const setMilestone = (key: number, patch: Partial<Draft["milestones"][number]>) =>
    set({ milestones: draft.milestones.map((item) => (item.key === key ? { ...item, ...patch } : item)) });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!draft.title.trim()) {
      setTitleError(true);
      return;
    }
    setFailed(false);
    const fields = { title: draft.title, area: draft.area || null, target: draft.target || null, dueDay: draft.dueDay };
    try {
      if (goal) {
        await update.mutateAsync({ id: goal.id, patch: fields });
        toast({ tone: "success", title: t("saved") });
      } else {
        const milestones = draft.milestones.filter((item) => item.title.trim()).map(({ title, dueDay }) => ({ title, dueDay }));
        await create.mutateAsync({ ...fields, milestones });
        toast({ tone: "success", title: t("created") });
      }
      onClose();
    } catch {
      setFailed(true);
    }
  };

  return (
    <form className="flex flex-col gap-4" data-goal-sheet={goal ? "edit" : "new"} onSubmit={(event) => void submit(event)} noValidate>
      <Field invalid={titleError}>
        <FieldLabel>{t("title")}</FieldLabel>
        <Input
          value={draft.title}
          dir="auto"
          autoFocus
          placeholder={t("titlePlaceholder")}
          inputClassName="text-base font-bold"
          onChange={(event) => {
            set({ title: event.target.value });
            if (titleError) setTitleError(false);
          }}
        />
        <FieldError>{titleError ? t("titleRequired") : null}</FieldError>
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-scope-soft px-3 text-xs font-bold text-scope-deep" data-scope="personal">
          <span aria-hidden="true" className="size-2 rounded-full bg-scope-dot" />
          {t("context")}
        </span>
      </div>
      <Field>
        <FieldLabel>{t("area")}</FieldLabel>
        <Input value={draft.area} dir="auto" placeholder={t("areaPlaceholder")} onChange={(event) => set({ area: event.target.value })} />
      </Field>
      <Field>
        <FieldLabel>{t("target")}</FieldLabel>
        <Input value={draft.target} dir="auto" placeholder={t("targetPlaceholder")} onChange={(event) => set({ target: event.target.value })} />
      </Field>
      <DayField label={t("due")} emptyLabel={t("noDue")} value={draft.dueDay} onChange={(dueDay) => set({ dueDay })} clearLabel={t("clearDate")} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold text-fg">{t("milestones")}</legend>
        {goal ? (
          <p className="text-xs text-fg-muted">{t("editMilestones")}</p>
        ) : (
          <>
            <ol className="flex flex-col gap-2">
              {draft.milestones.map((item, index) => {
                const name = item.title.trim() || t("milestoneTitle", { position: index + 1 });
                return (
                  <li key={item.key} className="flex items-center gap-2 rounded-field bg-subtle p-2">
                    <Input
                      aria-label={t("milestoneTitle", { position: index + 1 })}
                      className="min-w-0 flex-1"
                      value={item.title}
                      dir="auto"
                      placeholder={t("milestonePlaceholder")}
                      onChange={(event) => setMilestone(item.key, { title: event.target.value })}
                    />
                    <DayField compact label={t("milestoneDue", { title: name })} emptyLabel={t("noDue")} value={item.dueDay} onChange={(dueDay) => setMilestone(item.key, { dueDay })} />
                    <IconButton
                      size="sm"
                      variant="ghost"
                      icon={X}
                      label={t("removeMilestone", { title: name })}
                      onClick={() => set({ milestones: draft.milestones.filter((other) => other.key !== item.key) })}
                    />
                  </li>
                );
              })}
            </ol>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => {
                set({ milestones: [...draft.milestones, { key: nextKey, title: "", dueDay: null }] });
                setNextKey((key) => key + 1);
              }}
            >
              <Plus aria-hidden="true" size={16} />
              {t("addMilestone")}
            </Button>
            <p className="text-xs text-fg-muted">{t("hint")}</p>
          </>
        )}
      </fieldset>

      <p id={errorId} role="alert" className="text-sm text-danger-text empty:hidden">
        {failed ? t("failed") : null}
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={busy} loadingText={t("saving")}>
          {goal ? t("save") : t("create")}
        </Button>
      </div>
    </form>
  );
}

/** A deadline picker: the Jalali / Gregorian DatePicker in a popover. */
export function DayField({
  label,
  emptyLabel,
  clearLabel,
  value,
  onChange,
  compact = false,
}: {
  label: string;
  emptyLabel: string;
  clearLabel?: string;
  value: string | null;
  onChange(day: string | null): void;
  compact?: boolean;
}) {
  const format = useMyDayFormat();
  const [open, setOpen] = useState(false);
  const text = value ? format.dayMonth(value) : emptyLabel;
  return (
    <div className={compact ? "shrink-0" : "flex flex-col gap-1.5"}>
      {compact ? null : <span className="text-sm font-bold text-fg">{label}</span>}
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={compact ? `${label}: ${text}` : undefined}
              className={
                compact
                  ? "inline-flex h-10 items-center gap-1.5 rounded-pill bg-surface px-3 text-xs font-bold text-fg hover:bg-raised focus-visible:focus-ring"
                  : "flex min-h-12 flex-1 items-center gap-3 rounded-field bg-subtle px-4 text-start text-sm font-bold text-fg hover:bg-raised focus-visible:focus-ring"
              }
            >
              <Calendar aria-hidden="true" size={compact ? 14 : 18} className="shrink-0 text-scope-deep" />
              <span className="truncate">{text}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <DatePicker
              title={label}
              value={value ? dayToLocalDate(value) : null}
              onConfirm={(picked) => {
                onChange(localDateToDay(picked));
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        {!compact && value && clearLabel ? <IconButton size="sm" variant="ghost" icon={X} label={clearLabel} onClick={() => onChange(null)} /> : null}
      </div>
    </div>
  );
}
