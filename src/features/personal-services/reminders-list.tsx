"use client";

import { BellRing, History, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/state-views";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button, IconButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { Reminder, ReminderSchedule, RepeatRule } from "@/data/personal-services";
import { useReminderDeliveries, useReminders, useReminderWrite } from "@/data/personal-services-queries";
import { taskDetailHref } from "@/features/personal/routes";
import { ReminderDialog } from "./reminder-dialog";
import { useServiceError } from "./service-error";
import { useServiceFormat } from "./use-service-format";

/*
 * Reminder management: one list for a task (Task detail · Reminders) or for
 * the account (Settings · Notifications). Pause / resume and delete use the
 * reminder's revision; delivery history is read-only and shows the server's
 * outcome per channel (pending, retrying, failed…), never assumed sends.
 */

export function RemindersList({ taskId, taskTitle }: { taskId: string | null; taskTitle?: string }) {
  const t = useTranslations("Services.reminders");
  const query = useReminders(taskId);
  const [editing, setEditing] = useState<Reminder | "new" | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-muted">{taskId ? t("taskHint") : t("allHint")}</p>
        <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
          <Plus aria-hidden="true" size={16} />
          {t("new")}
        </Button>
      </div>
      {query.isPending ? (
        <LoadingState>
          <Skeleton className="h-16 rounded-row" />
        </LoadingState>
      ) : query.isError ? (
        <ErrorState variant="bare" title={t("loadError")} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState variant="bare" icon={BellRing} title={t("emptyTitle")} description={taskId ? t("emptyTask") : t("emptyAll")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {query.data.map((reminder) => (
            <ReminderRow key={reminder.id} reminder={reminder} showTask={!taskId} onEdit={() => setEditing(reminder)} />
          ))}
        </ul>
      )}
      <ReminderDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        taskId={taskId}
        reminder={editing === "new" || editing === null ? undefined : editing}
        defaultTitle={taskTitle}
      />
    </div>
  );
}

export function useScheduleText() {
  const t = useTranslations("Services.reminders");
  const repeatText = useRepeatText();
  const format = useServiceFormat();
  return (schedule: ReminderSchedule): string => {
    if (schedule.kind === "at") return format.instant(schedule.at);
    if (schedule.kind === "task") {
      const field = t(`fields.${schedule.field}`);
      return schedule.field === "scheduled" ? t("taskAtTime", { field, time: format.clock(schedule.time ?? "") }) : format.digits(t("taskOffset", { field, minutes: -schedule.offsetMinutes }));
    }
    const at = `${format.day(schedule.day)} · ${format.clock(schedule.time)}`;
    return schedule.repeat ? `${repeatText(schedule.repeat)} · ${t("from", { at })}` : at;
  };
}

/** "Monthly · every 2 · until 1 Mehr" for a repeat rule (reminders and bills). */
export function useRepeatText() {
  const tr = useTranslations("Services.repeat");
  const format = useServiceFormat();
  return (repeat: RepeatRule): string => {
    const parts = [tr(`frequencies.${repeat.frequency}`)];
    if (repeat.interval > 1) parts.push(tr("everyN", { formatted: format.number(repeat.interval) }));
    if (repeat.until) parts.push(tr("untilDay", { day: format.day(repeat.until) }));
    return parts.join(" · ");
  };
}

function ReminderRow({ reminder, showTask, onEdit }: { reminder: Reminder; showTask: boolean; onEdit(): void }) {
  const t = useTranslations("Services.reminders");
  const format = useServiceFormat();
  const scheduleText = useScheduleText();
  const write = useReminderWrite();
  const message = useServiceError();
  const [history, setHistory] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const paused = reminder.state === "paused";

  const run = (kind: "pause" | "remove") =>
    write.mutate(kind === "pause" ? { kind, reminder, paused: !paused } : { kind, reminder }, {
      onSuccess: () => toast({ tone: "neutral", title: kind === "remove" ? t("deleted") : paused ? t("resumed") : t("paused") }),
      onError: (error) => toast({ tone: "danger", title: message(error) }),
    });

  const status = paused ? t("state.paused") : reminder.exhausted ? t("state.ended") : reminder.nextAt ? t("next", { at: format.instant(reminder.nextAt) }) : t("state.waiting");

  return (
    <li className="flex flex-col gap-2 rounded-row bg-surface p-3 inset-ring inset-ring-line">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <bdi dir="auto" className="truncate text-sm font-bold text-fg">
            {reminder.title}
          </bdi>
          <span className="text-xs text-fg-secondary">{scheduleText(reminder.schedule)}</span>
          <span className="text-xs text-fg-muted">
            {status} · {reminder.channels.map((channel) => t(`channel.${channel}`)).join(t("separator"))}
            {reminder.urgent ? ` · ${t("urgent")}` : ""}
          </span>
          {showTask && reminder.taskId ? (
            <Link href={taskDetailHref(reminder.taskId)} className="text-xs font-semibold text-scope-deep hover:underline">
              {t("openTask")}
            </Link>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton size="sm" variant="ghost" icon={Pencil} label={t("edit")} onClick={onEdit} />
          <IconButton size="sm" variant="ghost" icon={paused ? Play : Pause} label={paused ? t("resume") : t("pause")} disabled={write.isPending} onClick={() => run("pause")} />
          <IconButton size="sm" variant="ghost" icon={History} label={t("history")} aria-expanded={history} onClick={() => setHistory((open) => !open)} />
          <IconButton size="sm" variant="ghost" icon={Trash2} label={t("delete")} disabled={write.isPending} onClick={() => setConfirm(true)} />
        </div>
      </div>
      {history ? <Deliveries reminderId={reminder.id} /> : null}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        tone="destructive"
        title={t("deleteTitle")}
        description={t("deleteBody")}
        confirmLabel={t("delete")}
        onConfirm={() => run("remove")}
      />
    </li>
  );
}

function Deliveries({ reminderId }: { reminderId: string }) {
  const t = useTranslations("Services.reminders");
  const format = useServiceFormat();
  const query = useReminderDeliveries(reminderId, true);
  if (query.isPending) return <LoadingState><Skeleton className="h-8 rounded-row" /></LoadingState>;
  if (query.isError) return <ErrorState variant="bare" title={t("historyError")} onRetry={() => void query.refetch()} />;
  if (query.data.length === 0) return <p className="text-xs text-fg-muted">{t("historyEmpty")}</p>;
  return (
    <ul aria-label={t("history")} className="flex flex-col gap-1 border-t border-line pt-2">
      {query.data.map((item) => (
        <li key={item.id} className="flex flex-wrap justify-between gap-x-3 text-xs">
          <span className="text-fg-secondary">
            {t(`channel.${item.channel}`)} · {t(`delivery.${item.state}`)}
            {item.reason ? <bdi dir="ltr"> ({item.reason})</bdi> : null}
          </span>
          <span className="text-fg-muted">{item.at ? format.instant(item.at) : "—"}</span>
        </li>
      ))}
    </ul>
  );
}
