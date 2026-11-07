"use client";

import { CalendarDays } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { ProjectSummary, ProjectTint } from "@/data/project-domain";
import { isValidProjectKey, normalizeProjectKey, PROJECT_KEY_MAX } from "@/data/project-key";
import { useSettingsActions } from "@/data/project-queries";
import { RepositoryError } from "@/data/repositories";
import { dayToLocalDate, localDateToDay } from "@/lib/dates/clock-time";
import { formatDate } from "@/lib/dates/format";
import { cn } from "@/lib/cn";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useProject } from "../project-gate";
import { ProjectStatusChip } from "../project-visuals";
import { DirtyBar, useReportDirty, useSettingsError } from "./settings-shared";

/*
 * PJ-14 › General: name, key (task prefix, project-key rules), start /
 * target end shown in Gregorian and Jalali, description, colour, and the
 * manual status (read here; set from the Overview by Manager+). Edits are a
 * local draft with the sticky dirty bar (Discard · Save).
 */

const TINTS: readonly { tint: ProjectTint; className: string }[] = [
  { tint: "blue", className: "bg-project-dot" },
  { tint: "indigo", className: "bg-team-dot" },
  { tint: "amber", className: "bg-warning" },
  { tint: "purple", className: "bg-company-dot" },
];

type Draft = Pick<ProjectSummary, "name" | "key" | "startDate" | "endDate" | "description" | "tint">;

const draftOf = (project: ProjectSummary): Draft => ({
  name: project.name,
  key: project.key,
  startDate: project.startDate,
  endDate: project.endDate,
  description: project.description,
  tint: project.tint,
});

export function GeneralTab() {
  const t = useTranslations("ProjectSettings");
  const { project, capabilities } = useProject();
  const actions = useSettingsActions(project.id);
  const onError = useSettingsError();
  const [draft, setDraft] = useState<Draft>(() => draftOf(project));
  const [keyTaken, setKeyTaken] = useState(false);
  const ids = { name: useId(), key: useId(), description: useId() };
  const base = draftOf(project);
  const dirty = (Object.keys(base) as (keyof Draft)[]).some((key) => base[key] !== draft[key]);
  useReportDirty(dirty);
  const keyInvalid = !isValidProjectKey(draft.key);
  const datesInvalid = draft.endDate < draft.startDate;
  const canEdit = capabilities.editGeneral;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const save = () =>
    actions.update.mutate(draft, {
      onSuccess: () => toast({ title: t("saved") }),
      onError: (error) => {
        if (error instanceof RepositoryError && error.message === "key-taken") setKeyTaken(true);
        else onError(error);
      },
    });

  return (
    <div className="flex flex-col gap-4">
      {!canEdit ? <InlineAlert tone="info" title={t("readOnly")} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field invalid={!draft.name.trim()}>
          <FieldLabel htmlFor={ids.name}>{t("general.name")}</FieldLabel>
          <Input id={ids.name} dir="auto" value={draft.name} disabled={!canEdit} onChange={(event) => set("name", event.target.value)} />
        </Field>
        <Field invalid={keyInvalid || keyTaken}>
          <FieldLabel htmlFor={ids.key}>{t("general.key")}</FieldLabel>
          <Input
            id={ids.key}
            dir="ltr"
            value={draft.key}
            maxLength={PROJECT_KEY_MAX}
            disabled={!canEdit}
            onChange={(event) => {
              setKeyTaken(false);
              set("key", normalizeProjectKey(event.target.value));
            }}
          />
          {keyInvalid ? <FieldError>{t("general.keyFormat")}</FieldError> : keyTaken ? <FieldError>{t("general.keyTaken")}</FieldError> : null}
        </Field>
        <DateField label={t("general.start")} value={draft.startDate} disabled={!canEdit} onChange={(day) => set("startDate", day)} />
        <div className="flex flex-col gap-1">
          <DateField label={t("general.end")} value={draft.endDate} disabled={!canEdit} onChange={(day) => set("endDate", day)} />
          {datesInvalid ? <p className="text-xs font-semibold text-danger-text">{t("general.datesOrder")}</p> : null}
        </div>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor={ids.description}>{t("general.description")}</FieldLabel>
          <Textarea
            id={ids.description}
            dir="auto"
            rows={2}
            value={draft.description}
            disabled={!canEdit}
            onChange={(event) => set("description", event.target.value)}
          />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-fg">{t("general.colour")}</span>
          <div role="radiogroup" aria-label={t("general.colour")} className="flex gap-2">
            {TINTS.map((option, index) => (
              <button
                key={option.tint}
                type="button"
                role="radio"
                aria-checked={draft.tint === option.tint}
                aria-label={t("general.colourOption", { n: index + 1 })}
                disabled={!canEdit}
                onClick={() => set("tint", option.tint)}
                className={cn(
                  "size-9 rounded-[12px] focus-visible:focus-ring disabled:opacity-60",
                  option.className,
                  draft.tint === option.tint && "ring-2 ring-fg ring-offset-2 ring-offset-surface",
                )}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-fg">{t("general.status")}</span>
          <span className="flex min-w-0 items-center gap-2 text-sm text-fg-secondary">
            <ProjectStatusChip health={project.health} lifecycle={project.lifecycle} />
            {project.statusNote ? <bdi className="truncate">“{project.statusNote.text}”</bdi> : null}
          </span>
        </div>
      </div>
      {dirty && canEdit ? (
        <DirtyBar
          onDiscard={() => {
            setDraft(base);
            setKeyTaken(false);
          }}
          onSave={save}
          saving={actions.update.isPending}
          saveDisabled={keyInvalid || datesInvalid || !draft.name.trim()}
        />
      ) : null}
    </div>
  );
}

function DateField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (day: string) => void;
}) {
  const { locale, digits } = usePreferences();
  const [open, setOpen] = useState(false);
  const date = dayToLocalDate(value);
  // Both calendars side by side (Gregorian transport, Jalali display).
  const text = `${formatDate(date, "full", { calendar: "gregorian", locale, digits })} · ${formatDate(date, "full", { calendar: "jalali", locale, digits })}`;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-fg">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="secondary" disabled={disabled} className="justify-start gap-2 bg-subtle" aria-label={`${label}: ${text}`}>
            <Icon icon={CalendarDays} size={16} />
            <span className="truncate">{text}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" aria-label={label} className="w-auto" data-scope="project">
          <DatePicker
            title={label}
            defaultValue={date}
            onConfirm={(picked) => {
              onChange(localDateToDay(picked));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
