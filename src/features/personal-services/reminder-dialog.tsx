"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { getPlannerToday } from "@/data/clock";
import {
  NOTIFICATION_CHANNELS,
  REPEAT_FREQUENCIES,
  type NotificationChannel,
  type Reminder,
  type ReminderInput,
  type ReminderSchedule,
  type RepeatFrequency,
  type RepeatRule,
  type TaskReminderField,
} from "@/data/personal-services";
import { useNotificationPreferences, useReminderWrite } from "@/data/personal-services-queries";
import { DayField } from "@/features/goals/goal-sheet";
import { dayOfInstant, instantToClockTime, isClockTimeString } from "./reminder-model";
import { RepeatFields } from "./repeat-fields";
import { useServiceError } from "./service-error";
import { useServiceFormat } from "./use-service-format";

/*
 * Reminder create / edit (P18 container rule: a dialog over the current
 * screen). Without a task: once (day + time) or repeating; with a task:
 * once or relative to the task's due / start / scheduled date (task
 * reminders cannot repeat — contract rule). Times are in the account zone.
 * Channels come from Notification preferences; unavailable ones are shown
 * disabled. Editing sends only what changed.
 */

type Mode = "once" | "repeat" | "task";
const OFFSETS = [0, -5, -15, -30, -60, -1440] as const;

interface Draft {
  title: string;
  body: string;
  mode: Mode;
  day: string;
  time: string;
  repeat: RepeatRule;
  field: TaskReminderField;
  offset: number;
  channels: NotificationChannel[];
  urgent: boolean;
}

const DEFAULT_REPEAT: RepeatRule = { frequency: "daily", interval: 1, weekdays: [], until: null, count: null };

function draftOf(reminder: Reminder | undefined, defaultTitle: string, taskId: string | null): Draft {
  const base: Draft = {
    title: reminder?.title ?? defaultTitle,
    body: reminder?.body ?? "",
    mode: taskId ? "task" : "once",
    day: getPlannerToday(),
    time: "09:00",
    repeat: DEFAULT_REPEAT,
    field: "due",
    offset: 0,
    channels: reminder?.channels ?? ["inApp"],
    urgent: reminder?.urgent ?? false,
  };
  const schedule = reminder?.schedule;
  if (!schedule) return base;
  if (schedule.kind === "at") return { ...base, mode: "once", day: dayOfInstant(schedule.at), time: instantToClockTime(schedule.at) };
  if (schedule.kind === "local") return { ...base, mode: schedule.repeat ? "repeat" : "once", day: schedule.day, time: schedule.time, repeat: schedule.repeat ?? DEFAULT_REPEAT };
  return { ...base, mode: "task", field: schedule.field, offset: schedule.offsetMinutes, time: schedule.time ?? "09:00" };
}

function scheduleOf(draft: Draft): ReminderSchedule {
  if (draft.mode === "task") return { kind: "task", field: draft.field, offsetMinutes: draft.offset, time: draft.field === "scheduled" ? draft.time : null };
  return { kind: "local", day: draft.day, time: draft.time, repeat: draft.mode === "repeat" ? draft.repeat : null };
}

export function ReminderDialog({
  open,
  onOpenChange,
  taskId,
  reminder,
  defaultTitle = "",
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  taskId: string | null;
  reminder?: Reminder;
  defaultTitle?: string;
}) {
  const t = useTranslations("Services.reminders");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={reminder ? t("editTitle") : t("newTitle")} description={t("dialogHint")} size="md">
        {open ? <ReminderForm key={reminder?.id ?? "new"} taskId={reminder?.taskId ?? taskId} reminder={reminder} defaultTitle={defaultTitle} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ReminderForm({ taskId, reminder, defaultTitle, onDone }: { taskId: string | null; reminder?: Reminder; defaultTitle: string; onDone(): void }) {
  const t = useTranslations("Services.reminders");
  const ids = { title: useId(), body: useId(), time: useId(), field: useId(), offset: useId() };
  const initial = draftOf(reminder, defaultTitle, taskId);
  const [draft, setDraft] = useState<Draft>(initial);
  const [submitted, setSubmitted] = useState(false);
  const format = useServiceFormat();
  const preferences = useNotificationPreferences();
  const write = useReminderWrite();
  const message = useServiceError();
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const available = preferences.data?.available ?? ["inApp"];
  const needsTime = draft.mode !== "task" || draft.field === "scheduled";
  const errors = {
    title: !draft.title.trim() ? t("errors.title") : null,
    time: needsTime && !isClockTimeString(draft.time) ? t("errors.time") : null,
    channels: draft.channels.length === 0 ? t("errors.channels") : null,
    weekdays: draft.mode === "repeat" && draft.repeat.frequency === "weekdays" && draft.repeat.weekdays.length === 0 ? t("errors.weekdays") : null,
  };
  const valid = Object.values(errors).every((error) => error === null);
  const modes: Mode[] = taskId ? ["once", "task"] : ["once", "repeat"];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!valid) return;
    const input: ReminderInput = { title: draft.title.trim(), body: draft.body.trim() || null, taskId, schedule: scheduleOf(draft), channels: draft.channels, urgent: draft.urgent };
    const changed = (key: keyof Draft) => JSON.stringify(draft[key]) !== JSON.stringify(initial[key]);
    const scheduleChanged = (["mode", "day", "time", "repeat", "field", "offset"] as const).some(changed);
    const patch: Partial<ReminderInput> = {
      ...(changed("title") ? { title: input.title } : {}),
      ...(changed("body") ? { body: input.body } : {}),
      ...(scheduleChanged ? { schedule: input.schedule } : {}),
      ...(changed("channels") ? { channels: input.channels } : {}),
      ...(changed("urgent") ? { urgent: input.urgent } : {}),
    };
    write.mutate(reminder ? { kind: "update", reminder, patch } : { kind: "create", input }, {
      onSuccess: () => {
        toast({ tone: "success", title: reminder ? t("saved") : t("created") });
        onDone();
      },
      onError: (error) => toast({ tone: "danger", title: message(error) }),
    });
  };

  const show = (error: string | null) => (submitted && error ? <p className="text-xs font-semibold text-danger-text">{error}</p> : null);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.title} className="text-sm font-bold text-fg">
          {t("title")}
        </label>
        <Input id={ids.title} dir="auto" maxLength={300} value={draft.title} invalid={submitted && !!errors.title} onChange={(event) => set({ title: event.target.value })} />
        {show(errors.title)}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.body} className="text-sm font-bold text-fg">
          {t("body")}
        </label>
        <Textarea id={ids.body} dir="auto" rows={2} maxLength={2000} value={draft.body} onChange={(event) => set({ body: event.target.value })} />
      </div>
      <Segmented<Mode> label={t("when")} value={draft.mode} onValueChange={(mode) => set({ mode })} options={modes.map((value) => ({ value, label: t(`modes.${value}`) }))} />
      {draft.mode === "task" ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <span id={ids.field} className="text-sm font-bold text-fg">
              {t("taskField")}
            </span>
            <Select aria-labelledby={ids.field} value={draft.field} onValueChange={(field) => set({ field: field as TaskReminderField })} className="w-44">
              {(["due", "start", "scheduled"] as const).map((field) => (
                <SelectItem key={field} value={field}>
                  {t(`fields.${field}`)}
                </SelectItem>
              ))}
            </Select>
          </div>
          {draft.field === "scheduled" ? null : (
            <div className="flex flex-col gap-1.5">
              <span id={ids.offset} className="text-sm font-bold text-fg">
                {t("offset")}
              </span>
              <Select aria-labelledby={ids.offset} value={String(draft.offset)} onValueChange={(offset) => set({ offset: Number(offset) })} className="w-44">
                {(OFFSETS.includes(draft.offset as (typeof OFFSETS)[number]) ? OFFSETS : [...OFFSETS, draft.offset]).map((offset) => (
                  <SelectItem key={offset} value={String(offset)}>
                    {format.digits(t("offsets", { minutes: -offset }))}
                  </SelectItem>
                ))}
              </Select>
            </div>
          )}
        </div>
      ) : (
        <DayField label={draft.mode === "repeat" ? t("startDay") : t("day")} emptyLabel={t("day")} value={draft.day} onChange={(day) => day && set({ day })} />
      )}
      {needsTime ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.time} className="text-sm font-bold text-fg">
            {t("time")}
          </label>
          <Input id={ids.time} type="time" dir="ltr" className="w-32" value={draft.time} invalid={submitted && !!errors.time} onChange={(event) => set({ time: event.target.value })} />
          {show(errors.time)}
        </div>
      ) : null}
      {draft.mode === "repeat" ? (
        <>
          <RepeatFields value={draft.repeat} onChange={(repeat) => set({ repeat })} frequencies={REPEAT_FREQUENCIES as RepeatFrequency[]} />
          {show(errors.weekdays)}
        </>
      ) : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold text-fg">{t("channels")}</legend>
        {NOTIFICATION_CHANNELS.map((channel) => {
          const enabled = available.includes(channel);
          return (
            <Checkbox
              key={channel}
              label={t(`channel.${channel}`)}
              description={enabled ? undefined : t("channelUnavailable")}
              disabled={!enabled}
              checked={draft.channels.includes(channel)}
              onCheckedChange={(checked) => set({ channels: checked === true ? [...draft.channels, channel] : draft.channels.filter((item) => item !== channel) })}
            />
          );
        })}
        {show(errors.channels)}
      </fieldset>
      <label className="flex items-center justify-between gap-3 text-sm font-semibold text-fg">
        <span className="flex flex-col">
          {t("urgent")}
          <span className="text-xs font-normal text-fg-muted">{t("urgentHint")}</span>
        </span>
        <Switch checked={draft.urgent} onCheckedChange={(urgent) => set({ urgent })} />
      </label>
      <p className="text-xs text-fg-muted">{t("deliveryNote")}</p>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={write.isPending}>
          {reminder ? t("save") : t("create")}
        </Button>
      </DialogFooter>
    </form>
  );
}
