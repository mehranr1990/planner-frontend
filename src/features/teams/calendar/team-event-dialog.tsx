"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectItem } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { TeamEventDetail } from "@/data/team-domain";
import { useTeamEventActions } from "@/data/team-queries";
import type { TeamEventInput } from "@/data/team-repositories";
import { useProjectFormat } from "@/features/projects/format";

/*
 * TM-03 create / edit a team event: kind (Team event · Time off), title,
 * day (from the shown days), start / end and an external meeting link.
 * Every team member is invited; time off is always the creator's own (T7)
 * and never changes the manual status. Agenda editing is not in this
 * dialog (the board shows it on the event only).
 */

type Kind = TeamEventInput["kind"];

export function TeamEventDialog({
  teamId,
  days,
  defaultDay,
  editing,
  open,
  onOpenChange,
}: {
  teamId: string;
  days: readonly string[];
  defaultDay: string;
  /** The event to edit, or null to create. */
  editing: TeamEventDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("TeamCal");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? t("dialog.editTitle") : t("dialog.createTitle")}>
        {open ? (
          <EventForm
            key={editing?.id ?? "new"}
            teamId={teamId}
            days={days}
            defaultDay={defaultDay}
            editing={editing}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EventForm({
  teamId,
  days,
  defaultDay,
  editing,
  onDone,
}: {
  teamId: string;
  days: readonly string[];
  defaultDay: string;
  editing: TeamEventDetail | null;
  onDone: () => void;
}) {
  const t = useTranslations("TeamCal");
  const format = useProjectFormat();
  const { create, update } = useTeamEventActions(teamId);
  const [kind, setKind] = useState<Kind>(editing?.kind === "time-off" ? "time-off" : "meeting");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [day, setDay] = useState(editing?.day ?? defaultDay);
  const [start, setStart] = useState(editing?.time ?? "10:00");
  const [end, setEnd] = useState(editing?.end ?? "11:00");
  const [url, setUrl] = useState(editing?.url ?? "");
  const [touched, setTouched] = useState(false);
  const [failed, setFailed] = useState(false);
  const meeting = kind === "meeting";
  const dayOptions = days.includes(day) ? days : [day, ...days];

  const errors = {
    title: meeting && !title.trim() ? t("dialog.titleRequired") : null,
    end: meeting && start && end && end <= start ? t("dialog.endBeforeStart") : null,
    url: meeting && url.trim() && !/^https?:\/\/\S+$/.test(url.trim()) ? t("dialog.badUrl") : null,
  };

  const submit = () => {
    setTouched(true);
    if (errors.title || errors.end || errors.url) return;
    setFailed(false);
    const input: TeamEventInput = {
      kind,
      title: title.trim(),
      day,
      time: meeting ? start || null : null,
      end: meeting ? end || null : null,
      url: meeting ? url.trim() || null : null,
    };
    const options = {
      onSuccess: () => {
        toast({ title: editing ? t("dialog.updated") : t("dialog.created") });
        onDone();
      },
      onError: () => setFailed(true),
    };
    if (editing) update.mutate({ eventId: editing.id, input }, options);
    else create.mutate(input, options);
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {editing ? null : (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold text-fg">{t("dialog.kind")}</p>
          <Segmented<Kind>
            label={t("dialog.kind")}
            value={kind}
            onValueChange={setKind}
            options={[
              { value: "meeting", label: t("event") },
              { value: "time-off", label: t("timeOff") },
            ]}
          />
        </div>
      )}
      <Field invalid={touched && errors.title !== null}>
        <FieldLabel>{t("dialog.title")}</FieldLabel>
        <Input dir="auto" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} autoFocus />
        {touched && errors.title ? <FieldError>{errors.title}</FieldError> : null}
      </Field>
      <Field>
        <FieldLabel>{t("dialog.day")}</FieldLabel>
        <Select value={day} onValueChange={setDay}>
          {dayOptions.map((option) => (
            <SelectItem key={option} value={option}>
              {format.day(option, "weekdayShort")} {format.day(option, "dayMonth")}
            </SelectItem>
          ))}
        </Select>
      </Field>
      {meeting ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>{t("dialog.start")}</FieldLabel>
              <Input type="time" dir="ltr" value={start} onChange={(event) => setStart(event.target.value)} />
            </Field>
            <Field invalid={touched && errors.end !== null}>
              <FieldLabel>{t("dialog.end")}</FieldLabel>
              <Input type="time" dir="ltr" value={end} onChange={(event) => setEnd(event.target.value)} />
              {touched && errors.end ? <FieldError>{errors.end}</FieldError> : null}
            </Field>
          </div>
          <Field invalid={touched && errors.url !== null}>
            <FieldLabel>{t("dialog.url")}</FieldLabel>
            <Input
              type="url"
              dir="ltr"
              value={url}
              placeholder="https://"
              onChange={(event) => setUrl(event.target.value)}
            />
            {touched && errors.url ? <FieldError>{errors.url}</FieldError> : null}
            <FieldDescription>{t("dialog.invitees")}</FieldDescription>
          </Field>
        </>
      ) : (
        <p className="text-sm text-fg-secondary">{t("dialog.timeOffHint")}</p>
      )}
      {failed ? <InlineAlert tone="danger" title={t("dialog.failed")} /> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("dialog.cancel")}
        </Button>
        <Button type="submit" disabled={create.isPending || update.isPending}>
          {t("dialog.save")}
        </Button>
      </div>
    </form>
  );
}
