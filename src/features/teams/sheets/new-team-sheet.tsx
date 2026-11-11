"use client";

import { Building2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { TeamPlanningMode } from "@/data/team-domain";
import { useCreateTeam } from "@/data/team-queries";
import { teamHref } from "@/features/navigation/contexts";

/*
 * ?sheet=team-new (TM-90): name, optional description, planning mode
 * (Weekly plan by default, or Sprints + backlog — changeable in Settings),
 * and the company row shown disabled ("available in a later phase", Phase 4).
 * The creator becomes Owner; creating opens the new team.
 */
export function NewTeamSheet({ onDone }: { onDone: () => void }) {
  const t = useTranslations("TeamNew");
  const router = useRouter();
  const create = useCreateTeam();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<TeamPlanningMode>("weekly");
  const [touched, setTouched] = useState(false);
  const [failed, setFailed] = useState(false);
  const companyId = useId();
  const nameError = touched && !name.trim() ? t("nameRequired") : null;

  const submit = () => {
    setTouched(true);
    if (!name.trim()) return;
    setFailed(false);
    create.mutate(
      { name, description, planningMode: mode },
      {
        onSuccess: (team) => {
          toast({ title: t("created", { team: team.name }) });
          onDone();
          router.push(teamHref(team.id));
        },
        onError: () => setFailed(true),
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
      <Field invalid={nameError !== null}>
        <FieldLabel>{t("name")}</FieldLabel>
        <Input
          dir="auto"
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={t("namePlaceholder")}
          autoFocus
        />
        {nameError ? <FieldError>{nameError}</FieldError> : null}
      </Field>
      <Field>
        <FieldLabel>{t("description")}</FieldLabel>
        <Textarea
          dir="auto"
          value={description}
          maxLength={140}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("descriptionPlaceholder")}
        />
      </Field>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold text-fg">{t("planning")}</p>
        <Segmented
          label={t("planning")}
          value={mode}
          onValueChange={setMode}
          options={[
            { value: "weekly", label: t("weekly") },
            { value: "sprints", label: t("sprints") },
          ]}
        />
        <FieldDescription>{t("planningHint")}</FieldDescription>
      </div>
      <p className="flex min-h-11 items-center gap-2 rounded-row bg-subtle px-3 text-sm font-semibold text-fg">
        <Icon icon={UserRound} size={16} className="text-fg-secondary" />
        {t("owner")}
      </p>
      <div
        role="group"
        aria-disabled="true"
        aria-label={t("company")}
        aria-describedby={companyId}
        className="flex min-h-11 cursor-not-allowed items-center gap-2 rounded-row bg-subtle px-3 text-sm text-fg-muted"
      >
        <Icon icon={Building2} size={16} />
        <span className="min-w-0 flex-1">{t("company")}</span>
        <span id={companyId} className="text-xs">
          {t("companyHint")}
        </span>
      </div>
      {failed ? <InlineAlert tone="danger" title={t("failed")} /> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
