"use client";

import { CalendarDays, Flag, UserRound, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PillGroup } from "@/components/ui/pills";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { getPlannerToday } from "@/data/clock";
import type { ProjectTemplate } from "@/data/project-domain";
import { isValidProjectKey, normalizeProjectKey, PROJECT_KEY_MAX, suggestProjectKey } from "@/data/project-key";
import { useCreateProject, useProjectDirectory, useProjectKeyAvailable } from "@/data/project-queries";
import { RepositoryError } from "@/data/repositories";
import { projectHref } from "@/features/navigation/contexts";
import { addDaysToDay } from "@/lib/dates/clock-time";
import { dayToDate, useProjectFormat } from "../format";
import { projectSheetHref } from "./project-sheet-params";

/*
 * ?sheet=project-new (PJ-90): name, short description, start / end, "Start
 * from" template, owner line (independent project). The Team/Company
 * association row is shown disabled — "available in a later phase" (P3/P4).
 * Project key: suggested from the name until edited (project-key.ts rules),
 * format checked here, uniqueness through the repository (backend
 * authoritative later). Visibility: only Private — the backend handoff
 * contract defines no visibility field or values yet, so it is display-only
 * (not sent) and never bypasses membership or capabilities.
 * Create & invite opens the new project with the invite sheet; Undo discards.
 */

const TEMPLATES: readonly ProjectTemplate[] = ["blank", "product-launch", "website", "event"];

const toDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Team seam (TM-06 "New team project"): the owning team, with its row label ("Owned by Design Team"). */
export interface NewProjectOwnerTeam {
  teamId: string;
  label: string;
}

export function NewProjectSheet({ onDone, ownerTeam }: { onDone: () => void; ownerTeam?: NewProjectOwnerTeam }) {
  const t = useTranslations("Projects.sheets");
  const router = useRouter();
  const format = useProjectFormat();
  const { create, discard } = useCreateProject();
  const today = getPlannerToday();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDaysToDay(today, 60));
  const [template, setTemplate] = useState<ProjectTemplate>("blank");
  const [error, setError] = useState<string | null>(null);
  const [typedKey, setTypedKey] = useState<string | null>(null);
  const [keyTouched, setKeyTouched] = useState(false);
  const [takenKeys, setTakenKeys] = useState<readonly string[]>([]);
  const directory = useProjectDirectory();
  const knownKeys = useMemo(
    () => new Set([...(directory.data?.projects.map((project) => project.key) ?? []), ...takenKeys]),
    [directory.data, takenKeys],
  );
  const projectKey = typedKey ?? (name.trim() ? suggestProjectKey(name, (key) => knownKeys.has(key)) : "");
  const keyValid = isValidProjectKey(projectKey);
  const availability = useProjectKeyAvailable(projectKey, keyValid);
  const keyTaken = keyValid && (takenKeys.includes(projectKey) || availability.data === false);
  const keyError =
    keyTouched && !keyValid ? t("new.keyInvalid") : keyTaken ? t("new.keyTaken") : null;
  const nameId = useId();
  const descriptionId = useId();
  const associationId = useId();

  const submit = () => {
    if (!name.trim()) return setError(t("new.nameRequired"));
    setKeyTouched(true);
    if (!keyValid || keyTaken) return setError(null);
    if (end < start) return setError(t("new.datesInvalid"));
    setError(null);
    create.mutate(
      {
        name,
        key: projectKey,
        description,
        startDate: start,
        endDate: end,
        template,
        ...(ownerTeam ? { ownerTeamId: ownerTeam.teamId } : {}),
      },
      {
        onError: (cause) => {
          if (cause instanceof RepositoryError && cause.message === "key-taken")
            setTakenKeys((keys) => [...keys, projectKey]);
          else if (cause instanceof RepositoryError && cause.message === "key-format") setKeyTouched(true);
        },
        onSuccess: (project) => {
          toast({
            title: t("new.created", { name: project.name }),
            action: {
              label: t("new.undo"),
              altText: t("new.undoAlt"),
              onClick: () => discard.mutate(project.id, { onSuccess: () => router.push("/projects") }),
            },
          });
          onDone();
          router.push(projectSheetHref(projectHref(project.id), "", "project-invite"));
        },
      },
    );
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor={nameId} className="sr-only">
        {t("new.name")}
      </label>
      <Input
        id={nameId}
        dir="auto"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t("new.namePlaceholder")}
        autoFocus
      />
      <label htmlFor={descriptionId} className="sr-only">
        {t("new.description")}
      </label>
      <Textarea
        id={descriptionId}
        dir="auto"
        value={description}
        maxLength={140}
        onChange={(event) => setDescription(event.target.value)}
        placeholder={t("new.description")}
      />
      <Field invalid={keyError !== null}>
        <FieldLabel>{t("new.key")}</FieldLabel>
        <Input
          dir="ltr"
          value={projectKey}
          maxLength={PROJECT_KEY_MAX}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="font-semibold tracking-wide"
          onChange={(event) => setTypedKey(normalizeProjectKey(event.target.value))}
          onBlur={() => setKeyTouched(true)}
        />
        <FieldDescription>{t("new.keyHelp")}</FieldDescription>
        {keyError ? <FieldError>{keyError}</FieldError> : null}
      </Field>
      <div className="flex flex-wrap gap-2">
        <DateChip
          icon={CalendarDays}
          label={t("new.startLabel")}
          text={t("new.start", { date: format.day(start) })}
          value={start}
          onChange={setStart}
        />
        <DateChip
          icon={Flag}
          label={t("new.endLabel")}
          text={t("new.end", { date: format.day(end) })}
          value={end}
          onChange={setEnd}
        />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold text-fg">{t("new.template")}</p>
        <PillGroup
          label={t("new.template")}
          value={template}
          onValueChange={setTemplate}
          options={TEMPLATES.map((value) => ({ value, label: t(`new.templates.${value}`) }))}
        />
      </div>
      <Field>
        <FieldLabel>{t("new.visibility")}</FieldLabel>
        <RadioGroup value="private">
          <RadioGroupItem value="private" label={t("new.private")} description={t("new.privateDescription")} />
        </RadioGroup>
        <FieldDescription>{t("new.visibilityHint")}</FieldDescription>
      </Field>
      <p className="flex min-h-11 items-center gap-2 rounded-row bg-subtle px-3 text-sm font-semibold text-fg">
        <Icon icon={UserRound} size={16} className="text-fg-secondary" />
        {t("new.owner")}
      </p>
      {ownerTeam ? (
        <p
          data-owner-team={ownerTeam.teamId}
          className="flex min-h-11 items-center gap-2 rounded-row bg-scope-soft px-3 text-sm font-semibold text-scope-deep"
        >
          <Icon icon={UsersRound} size={16} />
          <bdi>{ownerTeam.label}</bdi>
        </p>
      ) : (
        <div
          role="group"
          aria-disabled="true"
          aria-describedby={associationId}
          className="flex min-h-11 cursor-not-allowed items-center gap-2 rounded-row px-3 text-sm text-fg-muted inset-ring inset-ring-line"
        >
          <Icon icon={UsersRound} size={16} />
          <span className="min-w-0 flex-1">{t("new.association")}</span>
          <span id={associationId} className="text-xs">
            {t("new.associationHint")}
          </span>
        </div>
      )}
      {error ? <InlineAlert tone="danger" title={error} /> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {t("new.submit")}
        </Button>
      </div>
    </form>
  );
}

function DateChip({
  icon,
  label,
  text,
  value,
  onChange,
}: {
  icon: typeof CalendarDays;
  label: string;
  text: string;
  value: string;
  onChange: (day: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${text}`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-pill bg-subtle px-3 text-xs font-semibold text-fg hover:bg-raised"
        >
          <Icon icon={icon} size={14} className="text-fg-secondary" />
          {text}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto" aria-label={label}>
        <DatePicker
          title={label}
          defaultValue={dayToDate(value)}
          onConfirm={(date) => {
            onChange(toDay(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
