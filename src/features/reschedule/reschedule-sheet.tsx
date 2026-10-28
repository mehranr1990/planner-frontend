"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTasks } from "@/data/queries";
import { usePlannerNow, type RescheduleTarget } from "@/features/my-day/my-day-context";
import { ReschedulePanel } from "./reschedule-panel";
import { useRescheduleActions, type RescheduleChoice } from "./use-reschedule-actions";
import { useRescheduleSession } from "./use-reschedule-session";

/*
 * `?sheet=reschedule` (P18 · E): the shared Reschedule panel in the host's
 * compact centred sheet. The target comes from `?task=<id>` or `?block=<id>`;
 * without one a short picker of open tasks comes first. Screens that own a
 * Reschedule (My Day, Calendar) anchor the same panel as a popover instead.
 */

export function targetFromParams(params: URLSearchParams): RescheduleTarget | null {
  const block = params.get("block");
  if (block) return { kind: "block", id: block };
  const task = params.get("task");
  return task ? { kind: "task", id: task } : null;
}

export function RescheduleSheet({ onClose }: { onClose(): void }) {
  const params = useSearchParams();
  const fromUrl = targetFromParams(new URLSearchParams(params.toString()));
  const [picked, setPicked] = useState<RescheduleTarget | null>(null);
  const target = fromUrl ?? picked;

  if (!target) return <TaskPicker onPick={(id) => setPicked({ kind: "task", id })} />;
  return (
    <RescheduleBody
      key={JSON.stringify(target)}
      target={target}
      onClose={onClose}
      onChangeTask={fromUrl ? undefined : () => setPicked(null)}
    />
  );
}

interface BodyProps {
  target: RescheduleTarget;
  onClose(): void;
  onChangeTask?: () => void;
}

function RescheduleBody({ target, onClose, onChangeTask }: BodyProps) {
  const t = useTranslations("Personal.sheets.reschedule");
  const tMyDay = useTranslations("MyDay.reschedule");
  const now = usePlannerNow();
  const session = useRescheduleSession({ target }, now.day);
  const { apply } = useRescheduleActions();
  const [busy, setBusy] = useState(false);

  const choose = async (choice: RescheduleChoice) => {
    if (session.status !== "ready") return;
    setBusy(true);
    const ok = await apply({ resolved: session.resolved, blocksByDay: session.blocksByDay }, choice);
    if (ok) onClose();
    else setBusy(false);
  };

  const change = onChangeTask ? (
    <Button variant="ghost" size="sm" onClick={onChangeTask} className="self-start">
      {t("change")}
    </Button>
  ) : null;

  if (session.status === "loading") {
    return (
      <div role="status" aria-label={tMyDay("loading")} className="flex flex-col gap-1.5">
        <Skeleton shape="row" />
        <Skeleton shape="row" />
        <Skeleton shape="row" />
      </div>
    );
  }
  if (session.status !== "ready") {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="text-sm text-fg-secondary">
          {session.status === "missing" ? t("missing") : tMyDay("unavailable")}
        </p>
        {change}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-reschedule-sheet>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-fg-secondary">
          {t.rich("target", { title: session.resolved.title, bdi: (chunks) => <bdi dir="auto">{chunks}</bdi> })}
        </p>
        {change}
      </div>
      <ReschedulePanel
        rows={session.rows}
        pickDefault={session.pickDefault}
        today={now.day}
        busy={busy}
        onChoose={choose}
      />
    </div>
  );
}

/** At most this many tasks in the picker: the soonest open ones. */
const PICKER_LIMIT = 8;

function TaskPicker({ onPick }: { onPick(id: string): void }) {
  const t = useTranslations("Personal.sheets.reschedule");
  const tasks = useTasks({ view: "all" });

  if (tasks.isPending) {
    return (
      <div role="status" aria-label={t("loading")} className="flex flex-col gap-1.5">
        <Skeleton shape="row" />
        <Skeleton shape="row" />
      </div>
    );
  }
  if (tasks.isError || !tasks.data) {
    return (
      <p role="alert" className="text-sm text-fg-secondary">
        {t("failed")}
      </p>
    );
  }

  const open = tasks.data
    .filter((task) => task.status === "open")
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || (a.time ?? "99").localeCompare(b.time ?? "99"))
    .slice(0, PICKER_LIMIT);

  if (open.length === 0) return <p className="text-sm text-fg-secondary">{t("noTasks")}</p>;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-fg-secondary">{t("pickHint")}</p>
      <ul aria-label={t("pickLabel")} className="flex flex-col gap-1.5" data-reschedule-picker>
        {open.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onPick(task.id)}
              className="flex min-h-12 w-full items-center rounded-row bg-subtle px-3.5 text-start text-sm font-semibold text-fg transition-colors hover:bg-raised"
            >
              <bdi dir="auto" className="min-w-0 truncate">
                {task.title}
              </bdi>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
