"use client";

import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDot,
  Clock,
  Copy,
  Flag,
  List,
  MoreHorizontal,
  Play,
  Repeat,
  Trash2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button, IconButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EnergyBars } from "@/components/ui/energy-bars";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { getPlannerNow, getPlannerToday } from "@/data/clock";
import type { Task } from "@/data/domain";
import { useAreas, useCreateTask, useTask } from "@/data/queries";
import type { TaskPatch } from "@/data/repositories";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { TASK_RESCHEDULE_OPTIONS } from "@/features/my-day/domain/reschedule";
import type { RescheduleRequest } from "@/features/my-day/my-day-context";
import { RescheduleSurface } from "@/features/my-day/reschedule/reschedule-host";
import { focusHref } from "@/features/my-day/rail/focus-entry";
import { useRescheduleActions } from "@/features/reschedule/use-reschedule-actions";
import { addDaysToDay, parseClockTime } from "@/lib/dates/clock-time";
import { cn } from "@/lib/cn";
import { COMPLETION_HOLD_MS } from "../domain/completion";
import { nextOccurrence, openBlockers } from "../domain/detail";
import { ENERGIES, PRIORITIES } from "../domain/filters";
import { completedClock } from "../domain/when";
import { DURATIONS } from "../list/inline-edit";
import { taskDotClass } from "../list/task-parts";
import { DELETE_TOAST_MS, useTaskActions } from "../list/use-task-actions";
import { priorityStyle } from "../ui/priority-style";
import { useTasksFormat } from "../ui/use-tasks-format";
import { DetailTabs } from "./detail-tabs";

/*
 * P06 Task detail, shared by the intercepted drawer and the full page.
 * Head = signature card whose notch holds the ONE primary action (Complete);
 * then inline-editable properties (each value opens a menu, never a form),
 * the description and the folder tabs. Reschedule (button, D, the Schedule
 * row) opens the shared Reschedule (src/features/reschedule). Completing in the drawer holds the
 * completed state for 1.2s, then dismisses; Undo lives in the toast.
 */

export type TaskDetailVariant = "drawer" | "page";

export interface TaskDetailViewProps {
  id: string;
  variant: TaskDetailVariant;
  /** Close / back control at the start of the head (drawer: the sheet's close; page: a link back). */
  closeControl: ReactNode;
  /** Leaves the detail (after delete, and after completing in the drawer). */
  onDismiss(): void;
}

type Phase = "idle" | "warning" | "completed";

const chipClass = "inline-flex min-h-7 items-center gap-1.5 rounded-pill px-2.5 text-xs font-bold";

export function TaskDetailView(props: TaskDetailViewProps) {
  const tPersonal = useTranslations("Personal");
  const task = useTask(props.id);
  if (task.isPending) return <TaskDetailLoading />;
  if (!task.data) {
    return (
      <div className="flex flex-col items-start gap-3">
        {props.closeControl}
        <p role="status" className="text-sm text-fg-secondary">
          {tPersonal("taskDetail.notFound")}
        </p>
      </div>
    );
  }
  return <TaskDetailContent {...props} task={task.data} />;
}

function TaskDetailContent({ task, variant, closeControl, onDismiss }: TaskDetailViewProps & { task: Task }) {
  const t = useTranslations("Tasks.detail");
  const tEdit = useTranslations("Tasks.edit");
  const tUndo = useTranslations("Tasks.undo");
  const router = useRouter();
  const format = useTasksFormat();
  const actions = useTaskActions();
  const createTask = useCreateTask();
  const { data: areas } = useAreas();
  const today = getPlannerToday();
  const { apply: applyReschedule } = useRescheduleActions();
  const titleId = useId();

  const [phase, setPhase] = useState<Phase>("idle");
  const [reschedule, setReschedule] = useState<RescheduleRequest | null>(null);
  const openReschedule = (anchor: HTMLElement | null) =>
    setReschedule({ target: { kind: "task", id: task.id }, anchor });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(holdTimer.current), []);

  const done = task.status === "done";
  const blockers = openBlockers(task);
  const apply = (patch: TaskPatch) => actions.update(task, patch, { silent: true });

  const complete = (anyway = false) => {
    if (done) {
      clearTimeout(holdTimer.current);
      setPhase("idle");
      actions.setDone(task, false);
      return;
    }
    if (!anyway && blockers.length > 0) {
      setPhase("warning");
      return;
    }
    setPhase("completed");
    actions.setDone(task, true);
    if (variant === "drawer") holdTimer.current = setTimeout(onDismiss, COMPLETION_HOLD_MS);
  };

  const duplicate = () => {
    createTask
      .mutateAsync({
        title: task.title,
        scope: task.scope,
        priority: task.priority,
        energy: task.energy,
        durationMinutes: task.durationMinutes,
        date: task.date,
        time: task.time,
        area: task.area ?? null,
        project: task.project ?? null,
        labels: task.labels,
        recurring: task.recurring,
        deadline: task.deadline ?? null,
      })
      .then(
        () => toast({ tone: "neutral", title: t("duplicated") }),
        () => toast({ tone: "danger", title: tUndo("failed") }),
      );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      complete();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || isEditable(event.target)) return;
    // event.code keeps the shortcuts on a Persian layout.
    if (event.code === "KeyF" && !done) {
      event.preventDefault();
      router.push(focusHref(task.id));
    } else if (event.code === "KeyD") {
      event.preventDefault();
      openReschedule(null);
    }
  };

  const Heading = variant === "page" ? "h1" : "h2";
  const range = timeRange(task, format);
  const whenText = task.date ? <When label={dayLabel(task.date, today, format)} range={range} /> : tEdit("noDate");
  const status = done ? "done" : (task.spentMinutes ?? 0) > 0 ? "inProgress" : "open";
  const priority = priorityStyle(task.priority);
  const completedAt = format.clock(completedClock(task) ?? completedClock({ completedAt: getPlannerNow() }) ?? "00:00");
  const next = nextOccurrence(task);
  const left = task.durationMinutes && task.spentMinutes ? task.durationMinutes - task.spentMinutes : 0;

  return (
    <div onKeyDown={onKeyDown} data-task-detail={task.id} className="flex flex-col gap-3">
      <SignatureCard
        as="section"
        aria-labelledby={titleId}
        padding="compact"
        contentClassName="flex flex-col gap-3 bg-subtle"
        action={
          <SignatureCardAction
            icon={Check}
            label={done ? t("reopen") : t("complete")}
            aria-pressed={done}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            onClick={() => complete()}
            className={cn("transition-[background-color,transform] duration-200 motion-reduce:transition-none", done && "scale-95")}
          />
        }
      >
        <div className="flex min-w-0 items-center gap-2">
          {closeControl}
          <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-fg-muted">
            <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", taskDotClass(task))} />
            <span>{format.scope(task.scope)}</span>
            {task.project ? (
              <>
                <ChevronRight aria-hidden="true" size={12} className="shrink-0 rtl:-scale-x-100" />
                <bdi dir="auto" className="truncate">
                  {task.project}
                </bdi>
              </>
            ) : null}
          </p>
        </div>
        <Heading
          id={titleId}
          className={cn(
            "text-2xl leading-tight font-bold tracking-tight text-fg transition-colors duration-200 motion-reduce:transition-none lg:text-[1.75rem] rtl:leading-[1.4]",
            done && "text-fg-muted line-through",
          )}
        >
          <bdi dir="auto">{task.title}</bdi>
        </Heading>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              chipClass,
              status === "inProgress" ? "bg-info-soft text-info-text" : status === "done" ? "bg-success-soft text-scope-deep" : "bg-surface text-fg-secondary",
            )}
          >
            {t(`status.${status}`)}
          </span>
          {task.priority ? <span className={cn(chipClass, priority.chip)}>{format.priority(task.priority)}</span> : null}
          <span className={cn(chipClass, "bg-surface text-fg-secondary")}>{whenText}</span>
          <button
            type="button"
            aria-pressed={Boolean(task.recurring)}
            aria-label={`${t("repeat")}: ${task.recurring ? tEdit("repeatOn") : tEdit("repeatOff")}`}
            onClick={() => apply({ recurring: !task.recurring })}
            className={cn(chipClass, "bg-surface text-fg-secondary hover:text-fg focus-visible:focus-ring")}
          >
            <Repeat aria-hidden="true" size={13} /> {task.recurring ? tEdit("repeatOn") : tEdit("repeatOff")}
          </button>
          {blockers.length > 0 ? (
            <span className={cn(chipClass, "bg-danger-soft text-danger-text")}>
              {t("blocked.chip", { count: format.number(blockers.length) })}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {done ? null : (
            <Button asChild size="sm" className="gap-2 bg-volt text-on-volt hover:bg-volt/85 active:bg-volt/75">
              <Link href={focusHref(task.id)} aria-keyshortcuts="F">
                <Play aria-hidden="true" size={14} className="fill-current" />
                {t("startFocus")}
              </Link>
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-2 bg-surface"
            aria-keyshortcuts="D"
            aria-haspopup="dialog"
            onClick={(event) => openReschedule(event.currentTarget)}
          >
            <CalendarClock aria-hidden="true" size={15} />
            {t("reschedule")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gap-2 bg-surface">
                <ArrowRight aria-hidden="true" size={15} className="rtl:-scale-x-100" />
                {t("move")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {(areas ?? []).map((area) => (
                <DropdownMenuItem key={area.id} onSelect={() => apply({ area })}>
                  {area.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onSelect={() => apply({ area: null })}>{tEdit("noArea")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton size="sm" variant="ghost" icon={MoreHorizontal} label={t("more")} className="bg-surface" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem icon={Copy} onSelect={duplicate}>
                {t("duplicate")}
              </DropdownMenuItem>
              <DropdownMenuItem icon={Calendar} comingSoon>
                {t("convertToEvent")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={Trash2} tone="destructive" onSelect={() => setConfirmDelete(true)}>
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SignatureCard>

      <div aria-live="polite" className="empty:hidden">
        {phase === "completed" && done && !next ? (
          <StateCard>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-on-accent">
              <Check aria-hidden="true" size={18} strokeWidth={2.6} />
            </span>
            <div className="flex flex-col">
              <p className="text-sm font-bold text-fg">{t("completed.title", { time: completedAt })}</p>
              {variant === "drawer" ? <p className="text-xs text-fg-secondary">{t("completed.hint")}</p> : null}
            </div>
          </StateCard>
        ) : null}
        {phase === "completed" && done && next ? (
          <StateCard className="flex-col items-stretch">
            <p className="text-sm font-bold text-fg">{t("recurring.title")}</p>
            <p className="text-xs text-fg-secondary">
              {t("recurring.body", { title: task.title })}
            </p>
            <p className="flex items-center gap-2 rounded-[12px] bg-subtle px-3 py-2 text-xs font-bold text-fg">
              <Repeat aria-hidden="true" size={14} />
              <span>
                {t("recurring.next", { when: format.dateHeader(next) })}
                {range ? <> · <When range={range} /></> : null}
              </span>
            </p>
            <p className="text-xs text-fg-muted">{t("recurring.hint")}</p>
          </StateCard>
        ) : null}
        {phase === "warning" && !done && blockers[0] ? (
          <StateCard className="flex-col items-stretch" role="alert">
            <p className="flex items-center gap-2 text-sm font-bold text-fg">
              <AlertTriangle aria-hidden="true" size={16} className="text-danger-text" />
              {t("blocked.title")}
            </p>
            <p className="flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
              <span className={cn(chipClass, "bg-danger-soft text-danger-text")}>
                {t("blocked.chip", { count: format.number(blockers.length) })}
              </span>
              {t("blocked.body", { title: blockers[0].title })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => complete(true)}>
                {t("blocked.completeAnyway")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPhase("idle")}>
                {t("blocked.cancel")}
              </Button>
            </div>
            <p className="text-xs text-fg-muted">{t("blocked.hint")}</p>
          </StateCard>
        ) : null}
      </div>

      <section aria-label={t("properties")}>
        <ul className="flex flex-col gap-2">
          <PropertyRow
            icon={Calendar}
            label={t("schedule")}
            value={task.date ? <When label={format.dateHeader(task.date)} range={range} /> : tEdit("noDate")}
            hint={task.date === today && task.time ? t("inMyDay") : undefined}
            onActivate={openReschedule}
          />
          <PropertyRow
            icon={Clock}
            label={t("duration")}
            value={task.durationMinutes ? format.durationShort(task.durationMinutes) : t("none")}
            hint={left > 0 && !done ? t("left", { duration: format.durationShort(left) }) : undefined}
          >
            {DURATIONS.map((minutes) => (
              <DropdownMenuItem key={minutes} onSelect={() => apply({ durationMinutes: minutes })}>
                {format.durationShort(minutes)}
              </DropdownMenuItem>
            ))}
          </PropertyRow>
          <PropertyRow
            icon={Zap}
            label={t("energy")}
            value={
              task.energy ? (
                <span className="inline-flex items-center gap-1.5">
                  <EnergyBars level={task.energy} decorative /> {format.energy(task.energy)}
                </span>
              ) : (
                t("none")
              )
            }
          >
            {ENERGIES.map((energy) => (
              <DropdownMenuItem key={energy} onSelect={() => apply({ energy })}>
                {format.energy(energy)}
              </DropdownMenuItem>
            ))}
          </PropertyRow>
          <PropertyRow icon={Flag} label={t("priority")} value={format.priority(task.priority)}>
            {[...PRIORITIES, null].map((value) => (
              <DropdownMenuItem key={value ?? "none"} onSelect={() => apply({ priority: value })}>
                {format.priority(value)}
              </DropdownMenuItem>
            ))}
          </PropertyRow>
          <PropertyRow icon={CircleDot} label={t("goal")} value={
              task.goalTitle && task.goalId ? (
                <Link href={`/personal/goals/${encodeURIComponent(task.goalId)}`} className="text-scope-deep underline-offset-4 hover:underline focus-visible:focus-ring">
                  <bdi dir="auto">{task.goalTitle}</bdi>
                </Link>
              ) : (
                t("noGoal")
              )
            }
          />
          <PropertyRow
            icon={List}
            label={t("areaLabels")}
            value={[task.area?.name ?? tEdit("noArea"), ...(task.labels ?? [])].join(" · ")}
          >
            {(areas ?? []).map((area) => (
              <DropdownMenuItem key={area.id} onSelect={() => apply({ area })}>
                {area.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onSelect={() => apply({ area: null })}>{tEdit("noArea")}</DropdownMenuItem>
          </PropertyRow>
        </ul>
      </section>

      <DescriptionField key={task.description ?? ""} task={task} onSave={(description) => apply({ description })} />

      <DetailTabs task={task} today={today} onPatch={apply} />

      <p className="text-xs text-fg-muted max-lg:hidden">{t("keyboard")}</p>

      {reschedule ? (
        <RescheduleSurface
          key={JSON.stringify(reschedule.target)}
          request={reschedule}
          day={today}
          apply={applyReschedule}
          options={TASK_RESCHEDULE_OPTIONS}
          onClose={() => setReschedule(null)}
        />
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        tone="destructive"
        title={t("deleteConfirm.title")}
        description={t("deleteConfirm.body", {
          title: task.title,
          count: task.checklist?.length ?? 0,
          n: format.number(task.checklist?.length ?? 0),
          seconds: format.number(DELETE_TOAST_MS / 1000),
        })}
        confirmLabel={t("delete")}
        onConfirm={() => {
          setConfirmDelete(false);
          actions.remove([task]);
          onDismiss();
        }}
      />
    </div>
  );
}

function PropertyRow({
  icon: Glyph,
  label,
  value,
  hint,
  children,
  onActivate,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: string;
  /** Menu items: the value becomes a button that opens them. Without, the row is read-only. */
  children?: ReactNode;
  /** Instead of a menu: the value is a button that opens a dialog anchored to it (Schedule → Reschedule). */
  onActivate?(anchor: HTMLElement): void;
}) {
  const body = (
    <>
      <Glyph aria-hidden="true" size={16} className="shrink-0 text-fg-muted" />
      <span className="w-24 shrink-0 text-xs text-fg-secondary sm:w-28">{label}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-fg">
        <bdi>{value}</bdi>
      </span>
      {hint ? <span className="shrink-0 text-xs text-fg-muted">{hint}</span> : null}
    </>
  );
  const rowClass = "flex min-h-[46px] w-full items-center gap-2.5 rounded-[14px] bg-subtle px-3 text-start";
  if (onActivate) {
    return (
      <li>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={(event) => onActivate(event.currentTarget)}
          className={cn(rowClass, "hover:bg-raised focus-visible:focus-ring")}
        >
          {body}
        </button>
      </li>
    );
  }
  if (!children) return <li className={rowClass}>{body}</li>;
  return (
    <li>
      <DropdownMenu>
        <DropdownMenuTrigger className={cn(rowClass, "hover:bg-raised focus-visible:focus-ring")}>{body}</DropdownMenuTrigger>
        <DropdownMenuContent align="start">{children}</DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function DescriptionField({ task, onSave }: { task: Task; onSave(description: string): void }) {
  const t = useTranslations("Tasks.detail");
  const id = useId();
  const [value, setValue] = useState(task.description ?? "");
  return (
    <div className="flex flex-col gap-1.5 px-1">
      <label htmlFor={id} className="text-[0.6875rem] font-bold tracking-[0.08em] text-fg-muted uppercase">
        {t("description")}
      </label>
      <textarea
        id={id}
        dir="auto"
        value={value}
        placeholder={t("descriptionPlaceholder")}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          if (value.trim() !== (task.description ?? "")) onSave(value);
        }}
        className="field-sizing-content min-h-12 w-full resize-none rounded-[12px] bg-transparent p-1 text-sm leading-relaxed text-fg-secondary outline-none placeholder:text-fg-muted focus-visible:bg-subtle focus-visible:focus-ring"
      />
    </div>
  );
}

function StateCard({ className, children, role }: { className?: string; children: ReactNode; role?: "alert" }) {
  return (
    <div role={role} className={cn("flex items-center gap-3 rounded-[24px] bg-surface p-4 inset-ring inset-ring-line", className)}>
      {children}
    </div>
  );
}

export function TaskDetailLoading() {
  const t = useTranslations("Tasks.detail");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{t("loading")}</span>
      <div className="flex flex-col gap-3 rounded-[32px] bg-subtle p-4.5">
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-7 w-4/5" />
        <Skeleton className="h-6 w-3/5" />
      </div>
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <Skeleton key={row} className="h-[46px] w-full rounded-[14px]" />
      ))}
    </div>
  );
}

/** "Today · 14:00 – 16:00": the clock range is an LTR island so it never reverses in RTL. */
function When({ label, range }: { label?: string; range: string | null }) {
  return (
    <>
      {label}
      {label && range ? " · " : null}
      {range ? (
        <span dir="ltr" className="tabular inline-block">
          {range}
        </span>
      ) : null}
    </>
  );
}

function isEditable(target: EventTarget): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function dayLabel(day: string, today: string, format: ReturnType<typeof useTasksFormat>): string {
  if (day === today) return format.relative("today");
  if (day === addDaysToDay(today, 1)) return format.relative("tomorrow");
  if (day === addDaysToDay(today, -1)) return format.relative("yesterday");
  return format.dayMonth(day);
}

/** "14:00 – 16:00" (or "14:00" without a duration); null without a time. */
function timeRange(task: Task, format: ReturnType<typeof useTasksFormat>): string | null {
  const start = task.time ? parseClockTime(task.time) : null;
  if (start === null) return null;
  return task.durationMinutes ? format.clockRange(start, start + task.durationMinutes) : format.clock(start);
}
