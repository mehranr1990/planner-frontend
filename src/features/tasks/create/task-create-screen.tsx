"use client";

import { Calendar, Check, ChevronDown, Clock, Plus, Rows3 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { PillGroup } from "@/components/ui/pills";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { getPlannerNow, getPlannerToday } from "@/data/clock";
import type { Scope, Task, TaskPriority } from "@/data/domain";
import { useAddTaskNote, useAreas, useBlocks, useCreateTask } from "@/data/queries";
import { protectedSpan } from "@/features/my-day/domain/placement";
import { taskDetailHref } from "@/features/personal/routes";
import { planningDurationMinutes } from "@/features/planner-settings/planner-settings";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { useIsClient } from "@/hooks/use-is-client";
import { cn } from "@/lib/cn";
import { dayToLocalDate, localDateToDay, minutesFromDayStart, minutesOfInstant, parseClockTime, formatClockTime } from "@/lib/dates/clock-time";
import { ENERGIES } from "../domain/filters";
import { quickParse } from "../domain/quick-parse";
import { Kbd } from "../list/task-parts";
import { useScheduleOptionsFor } from "../list/use-task-actions";
import { useTasksFormat } from "../ui/use-tasks-format";
import { draftFromParams, safeReturnPath, splitLabels, suggestedStarts, type TaskDraft } from "./create-draft";
import { dayLabel, ParsedChips } from "./parsed-chips";

/*
 * P05 · Task Create — the full page behind Quick Add's "Details". One page,
 * four anchored steps (Capture → Details → Schedule → Done); the stepper
 * reflects completion. Details shows Title, Context, Date, Estimate, Priority,
 * Energy; Repeat, Area, Labels and Notes sit under "More options" (remembered
 * per browser). The Schedule panel offers free slots between the day's
 * blocks inside work hours, and "Keep unscheduled" always. Done shows 2.5s,
 * then returns to where creation started — unless "Create another" is on.
 * Forms and panels are product/utility surfaces: no notch (P00).
 */

const ESTIMATES = [15, 30, 60, 120, 240];
const SCOPES: readonly Scope[] = ["personal", "project", "team", "company"];
const PRIORITY_ORDER: readonly (TaskPriority | "none")[] = ["none", "low", "medium", "high", "urgent"];
const MORE_KEY = "mp-task-create-more";
const DONE_MS = 2500;
const DEFAULT_RETURN = "/personal/my-day";

type StepId = "capture" | "details" | "schedule" | "done";

interface Extras {
  recurring: boolean;
  labels: string;
  notes: string;
}

const NO_EXTRAS: Extras = { recurring: false, labels: "", notes: "" };

const card = "rounded-product bg-surface p-5 shadow-island lg:p-6";
const sectionLabel = "type-label mb-2 block text-fg-secondary";

/**
 * Up to two free starts (minutes) on `day` for the planning length (estimate
 * buffer applied), inside work hours, after now on today, and outside the
 * protected focus window when anything else fits.
 */
function useFreeSlots(day: string | null, planMinutes: number): { slots: number[]; loading: boolean } {
  const { workHours, insights } = usePlannerSettings();
  const query = useBlocks(day ?? getPlannerToday());
  const guardStart = insights.protectedFocus?.start;
  const guardEnd = insights.protectedFocus?.end;
  return useMemo(() => {
    if (!day || !query.data) return { slots: [], loading: Boolean(day) && query.isLoading };
    const window = { startMinutes: parseClockTime(workHours.start) ?? 540, endMinutes: parseClockTime(workHours.end) ?? 1020 };
    const busy = query.data.map((block) => ({
      startMinutes: minutesFromDayStart(block.start, day),
      endMinutes: minutesFromDayStart(block.end, day),
    }));
    const after = day === getPlannerToday() ? minutesOfInstant(getPlannerNow()) : window.startMinutes;
    const avoid = protectedSpan(guardStart && guardEnd ? { start: guardStart, end: guardEnd } : null);
    return { slots: suggestedStarts(busy, after, planMinutes, window, avoid), loading: false };
  }, [day, planMinutes, query.data, query.isLoading, workHours, guardStart, guardEnd]);
}

export function TaskCreateScreen() {
  const t = useTranslations("Tasks.create");
  const params = useSearchParams();
  const settings = usePlannerSettings();
  const defaults = { durationMinutes: settings.planning.defaultDurationMinutes, energy: settings.planning.defaultEnergy };
  const initial = useMemo(() => draftFromParams(params, defaults), [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const returnTo = safeReturnPath(params.get("from")) ?? DEFAULT_RETURN;
  const [draft, setDraft] = useState<TaskDraft>(initial);
  const [extras, setExtras] = useState<Extras>(NO_EXTRAS);
  const [scheduled, setScheduled] = useState(initial.date !== null || initial.time !== null);
  const [created, setCreated] = useState<Task | null>(null);
  const [another, setAnother] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setDraft({ ...initial, title: "", time: null });
    setExtras(NO_EXTRAS);
    setScheduled(initial.date !== null);
    setCreated(null);
    requestAnimationFrame(() => titleRef.current?.focus());
  };

  const done: Record<StepId, boolean> = {
    capture: draft.title.trim() !== "",
    details: draft.title.trim() !== "" && draft.durationMinutes !== null,
    schedule: scheduled,
    done: created !== null,
  };

  return (
    <div data-screen="task-create" className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-label text-fg-muted">
            {(["capture", "details", "schedule", "done"] as const).map((step) => t(`steps.${step}`)).join(" → ")}
          </p>
          <h1 className="type-h1 text-fg">{t("title")}</h1>
        </div>
        <Stepper done={done} />
      </header>

      {created ? (
        <DonePanel task={created} returnTo={returnTo} onAnother={reset} />
      ) : (
        <CreateForm
          draft={draft}
          setDraft={setDraft}
          extras={extras}
          setExtras={setExtras}
          scheduled={scheduled}
          setScheduled={setScheduled}
          another={another}
          setAnother={setAnother}
          returnTo={returnTo}
          titleRef={titleRef}
          onCreated={(task) => {
            if (another) {
              toast({ tone: "success", title: t("added"), description: <bdi>{task.title}</bdi> });
              reset();
            } else setCreated(task);
          }}
        />
      )}
    </div>
  );
}

/** Wizard → stepper (CLAUDE.md tab families): anchors on one page, ticks for completed steps. */
function Stepper({ done }: { done: Record<StepId, boolean> }) {
  const t = useTranslations("Tasks.create.steps");
  const steps: StepId[] = ["capture", "details", "schedule", "done"];
  const current = steps.find((step) => !done[step]) ?? "done";
  return (
    <nav aria-label={t("label")}>
      <ol className="flex flex-wrap items-center gap-1.5 rounded-pill bg-surface p-1.5 shadow-island">
        {steps.map((step, index) => {
          const complete = done[step];
          const active = step === current;
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-6 place-items-center rounded-full text-xs font-bold tabular-nums",
                  complete ? "bg-primary text-on-accent" : active ? "bg-scope-deep text-on-accent" : "bg-subtle text-fg-muted",
                )}
              >
                {complete ? <Check size={13} strokeWidth={3} /> : index + 1}
              </span>
              <span>{complete ? <><span className="sr-only">{t("complete", { step: t(step) })}</span><span aria-hidden="true">{t(step)}</span></> : t(step)}</span>
            </>
          );
          const className = cn(
            "inline-flex min-h-9 items-center gap-2 rounded-pill pe-3.5 ps-1.5 text-sm font-semibold",
            active ? "bg-scope-soft text-scope-deep" : "text-fg-secondary",
          );
          return (
            <li key={step} aria-current={active ? "step" : undefined}>
              {step === "done" ? (
                <span className={className}>{content}</span>
              ) : (
                <a href={`#${step}`} className={cn(className, "hover:text-fg focus-visible:focus-ring")}>
                  {content}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

interface CreateFormProps {
  draft: TaskDraft;
  setDraft: (update: (draft: TaskDraft) => TaskDraft) => void;
  extras: Extras;
  setExtras: (update: (extras: Extras) => Extras) => void;
  scheduled: boolean;
  setScheduled: (value: boolean) => void;
  another: boolean;
  setAnother: (value: boolean) => void;
  returnTo: string;
  titleRef: React.RefObject<HTMLInputElement | null>;
  onCreated: (task: Task) => void;
}

function CreateForm({ draft, setDraft, extras, setExtras, scheduled, setScheduled, another, setAnother, returnTo, titleRef, onCreated }: CreateFormProps) {
  const t = useTranslations("Tasks.create");
  const format = useTasksFormat();
  const today = getPlannerToday();
  const { data: areas } = useAreas();
  const create = useCreateTask();
  const addNote = useAddTaskNote();
  const [titleError, setTitleError] = useState(false);
  const titleId = useId();
  const titleErrorId = useId();
  const { insights } = usePlannerSettings();
  const area = areas?.find((candidate) => candidate.id === draft.areaId) ?? null;
  const labels = splitLabels(extras.labels);
  const rawMinutes = draft.durationMinutes ?? 30;
  // Planning length only: the task keeps rawMinutes; the Schedule panel fits this.
  const planMinutes = planningDurationMinutes(rawMinutes, [...labels, area?.id, area?.name], insights.estimateBuffers);

  const patch = (next: Partial<TaskDraft>) => setDraft((current) => ({ ...current, ...next }));

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const title = draft.title.trim();
    if (!title) {
      setTitleError(true);
      titleRef.current?.focus();
      return;
    }
    create.mutate(
      {
        title,
        scope: draft.scope,
        date: draft.date,
        time: draft.date ? draft.time : null,
        durationMinutes: draft.durationMinutes,
        priority: draft.priority,
        energy: draft.energy,
        area,
        labels: labels.length ? labels : undefined,
        recurring: extras.recurring || undefined,
      },
      {
        onSuccess: (task) => {
          const notes = extras.notes.trim();
          if (notes) addNote.mutate({ id: task.id, body: notes });
          onCreated(task);
        },
        onError: () => toast({ tone: "danger", title: t("failed") }),
      },
    );
  };

  return (
    <form
      noValidate
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          submit();
        }
      }}
      className="flex flex-col gap-4"
    >
      <CaptureBar today={today} areas={areas} onApply={(next) => setDraft((current) => ({ ...current, ...next }))} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
        <section id="details" aria-labelledby={`${titleId}-h`} className={cn(card, "flex scroll-mt-24 flex-col gap-5")}>
          <h2 id={`${titleId}-h`} className="sr-only">
            {t("steps.details")}
          </h2>
          <div>
            <label htmlFor={titleId} className={sectionLabel}>
              {t("fields.title")}
            </label>
            <Input
              ref={titleRef}
              id={titleId}
              value={draft.title}
              dir="auto"
              required
              invalid={titleError}
              aria-describedby={titleError ? titleErrorId : undefined}
              onChange={(event) => {
                patch({ title: event.target.value });
                setTitleError(false);
              }}
              inputClassName="text-lg font-semibold"
            />
            {titleError && (
              <p id={titleErrorId} role="alert" className="mt-1.5 text-sm text-danger-text">
                {t("fields.titleRequired")}
              </p>
            )}
          </div>

          <Group label={t("fields.context")}>
            <PillGroup
              label={t("fields.context")}
              value={draft.scope}
              onValueChange={(scope) => patch({ scope })}
              options={SCOPES.map((scope) => ({ value: scope, label: format.scope(scope) }))}
            />
          </Group>

          <div className="grid gap-5 md:grid-cols-2">
            <DateField draft={draft} today={today} onChange={(date) => {
              patch({ date, time: date ? draft.time : null });
              setScheduled(date !== null || scheduled);
            }} />
            <div className="flex flex-col gap-5">
              <Group label={t("fields.estimate")}>
                <PillGroup
                  label={t("fields.estimate")}
                  value={String(draft.durationMinutes ?? "")}
                  onValueChange={(value) => patch({ durationMinutes: Number(value) })}
                  options={[...new Set([...ESTIMATES, ...(draft.durationMinutes ? [draft.durationMinutes] : [])])]
                    .sort((a, b) => a - b)
                    .map((minutes) => ({ value: String(minutes), label: format.durationShort(minutes) }))}
                />
                {planMinutes > rawMinutes && (
                  <p data-slot="plans-as" className="mt-1.5 text-xs text-fg-muted">
                    {t("fields.plansAs", { duration: format.durationShort(planMinutes) })}
                  </p>
                )}
              </Group>
              <Group label={t("fields.priority")}>
                <PillGroup
                  label={t("fields.priority")}
                  value={draft.priority ?? "none"}
                  onValueChange={(value) => patch({ priority: value === "none" ? null : value })}
                  options={PRIORITY_ORDER.map((priority) => ({ value: priority, label: format.priority(priority === "none" ? null : priority) }))}
                />
              </Group>
              <Group label={t("fields.energy")}>
                <PillGroup
                  label={t("fields.energy")}
                  value={draft.energy ?? "medium"}
                  onValueChange={(energy) => patch({ energy })}
                  options={ENERGIES.map((energy) => ({ value: energy, label: format.energy(energy) }))}
                />
              </Group>
            </div>
          </div>

          <MoreOptions draft={draft} patch={patch} extras={extras} setExtras={setExtras} areas={areas ?? []} />

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Switch label={t("footer.createAnother")} checked={another} onCheckedChange={setAnother} wrapperClassName="me-auto" />
            <Button variant="outline" asChild>
              <Link href={returnTo}>{t("footer.cancel")}</Link>
            </Button>
            <Button type="submit" loading={create.isPending}>
              {t("footer.submit")}
              <Kbd className="bg-white/15 text-current max-lg:hidden">{t("footer.shortcut")}</Kbd>
            </Button>
          </div>
        </section>

        <SchedulePanel draft={draft} planMinutes={planMinutes} today={today} scheduled={scheduled} onPick={(time) => {
          patch({ time, date: draft.date ?? today });
          setScheduled(true);
        }} onKeep={() => {
          patch({ time: null });
          setScheduled(true);
        }} />
      </div>
    </form>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span aria-hidden="true" className={sectionLabel}>
        {label}
      </span>
      {children}
    </div>
  );
}

/** The one-line capture: Enter re-parses and applies the recognised fields (and a title, if any). */
function CaptureBar({ today, areas, onApply }: { today: string; areas: { id: string; name: string }[] | undefined; onApply(next: Partial<TaskDraft>): void }) {
  const t = useTranslations("Tasks.create.capture");
  const [value, setValue] = useState("");
  const parsed = useMemo(() => quickParse(value, today, { areas }), [value, today, areas]);
  const hintId = useId();

  const apply = () => {
    const next: Partial<TaskDraft> = {};
    if (parsed.title.trim()) next.title = parsed.title.trim();
    if (parsed.date) next.date = parsed.date;
    if (parsed.time) {
      next.time = parsed.time;
      next.date = parsed.date ?? today;
    }
    if (parsed.durationMinutes) next.durationMinutes = parsed.durationMinutes;
    if (parsed.priority) next.priority = parsed.priority;
    if (parsed.area) next.areaId = parsed.area.id;
    onApply(next);
    setValue("");
  };

  return (
    <section id="capture" aria-label={t("label")} className={cn(card, "flex scroll-mt-24 flex-col gap-3 lg:py-4")}>
      <div className="flex min-h-12 items-center gap-3 rounded-field bg-subtle px-4 focus-within:focus-ring">
        <Plus aria-hidden="true" size={18} className="shrink-0 text-fg-muted" />
        <input
          value={value}
          dir="auto"
          aria-label={t("label")}
          aria-describedby={hintId}
          placeholder={t("placeholder")}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              apply();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ParsedChips parsed={parsed} today={today} />
        <p id={hintId} className="text-xs text-fg-muted">
          {t("hint")}
        </p>
      </div>
    </section>
  );
}

function DateField({ draft, today, onChange }: { draft: TaskDraft; today: string; onChange(date: string | null): void }) {
  const t = useTranslations("Tasks.create.fields");
  const tWhen = useTranslations("Tasks.bulk.when");
  const format = useTasksFormat();
  const options = useScheduleOptionsFor(today);
  const [open, setOpen] = useState(false);
  const matched = options.find((option) => option.date === draft.date);
  const value = matched ? matched.id : "custom";

  return (
    <div className="flex flex-col gap-2">
      <span aria-hidden="true" className={sectionLabel.replace("mb-2 ", "")}>
        {t("date")}
      </span>
      <PillGroup
        label={t("date")}
        value={value}
        onValueChange={(id) => {
          const option = options.find((candidate) => candidate.id === id);
          if (option) onChange(option.date);
        }}
        options={options.map((option) => ({ value: option.id, label: tWhen(option.id) }))}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex min-h-14 items-center gap-3 rounded-field bg-subtle px-4 text-start hover:bg-raised focus-visible:focus-ring"
          >
            <Calendar aria-hidden="true" size={18} className="shrink-0 text-scope-deep" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-fg">
                {draft.date ? dayLabel(format, draft.date, today) : tWhen("noDate")}
              </span>
              {draft.date && <span className="block text-xs text-fg-muted">{format.altDayMonth(draft.date)}</span>}
            </span>
            <span className="text-xs font-bold text-scope-deep">{t("pickDate")}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <DatePicker
            title={t("date")}
            value={draft.date ? dayToLocalDate(draft.date) : null}
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

function readMoreOpen(): boolean {
  try {
    return window.localStorage.getItem(MORE_KEY) === "open";
  } catch {
    return false;
  }
}

function MoreOptions({
  draft,
  patch,
  extras,
  setExtras,
  areas,
}: {
  draft: TaskDraft;
  patch(next: Partial<TaskDraft>): void;
  extras: Extras;
  setExtras: (update: (extras: Extras) => Extras) => void;
  areas: { id: string; name: string }[];
}) {
  const t = useTranslations("Tasks.create");
  // Remembered open/closed (P05); read only after hydration so SSR and the first render agree.
  const hydrated = useIsClient();
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? (hydrated && readMoreOpen());
  const panelId = useId();
  const labelsId = useId();
  const labelsHintId = useId();
  const notesId = useId();

  const toggle = () => {
    const next = !open;
    setChoice(next);
    try {
      window.localStorage.setItem(MORE_KEY, next ? "open" : "closed");
    } catch {
      // Not remembered; still toggles.
    }
  };

  return (
    <div className="rounded-utility inset-ring inset-ring-line">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className="flex min-h-12 w-full items-center gap-3 rounded-utility px-4 text-start focus-visible:focus-ring"
      >
        <Rows3 aria-hidden="true" size={16} className="text-fg-muted" />
        <span className="text-sm font-bold text-fg">{t("more.toggle")}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{t("more.summary")}</span>
        <ChevronDown aria-hidden="true" size={16} className={cn("text-fg-muted motion-safe:transition-transform", open && "rotate-180")} />
      </button>
      <div id={panelId} hidden={!open} className="flex flex-col gap-5 px-4 pb-4 pt-1">
        <Switch
          label={t("fields.repeat")}
          checked={extras.recurring}
          onCheckedChange={(recurring) => setExtras((current) => ({ ...current, recurring }))}
        />
        <Group label={t("fields.area")}>
          <PillGroup
            label={t("fields.area")}
            value={draft.areaId ?? "none"}
            onValueChange={(id) => patch({ areaId: id === "none" ? null : id })}
            options={[{ value: "none", label: t("fields.noArea") }, ...areas.map((area) => ({ value: area.id, label: <bdi>{area.name}</bdi> }))]}
          />
        </Group>
        <div>
          <label htmlFor={labelsId} className={sectionLabel}>
            {t("fields.labels")}
          </label>
          <Input
            id={labelsId}
            dir="auto"
            value={extras.labels}
            aria-describedby={labelsHintId}
            onChange={(event) => setExtras((current) => ({ ...current, labels: event.target.value }))}
          />
          <p id={labelsHintId} className="mt-1.5 text-xs text-fg-muted">
            {t("fields.labelsHint")}
          </p>
        </div>
        <div>
          <label htmlFor={notesId} className={sectionLabel}>
            {t("fields.notes")}
          </label>
          <Textarea
            id={notesId}
            dir="auto"
            value={extras.notes}
            placeholder={t("fields.notesPlaceholder")}
            onChange={(event) => setExtras((current) => ({ ...current, notes: event.target.value }))}
          />
        </div>
        <p className="text-xs text-fg-muted">{t("more.pending")}</p>
      </div>
    </div>
  );
}

function SchedulePanel({
  draft,
  planMinutes,
  today,
  scheduled,
  onPick,
  onKeep,
}: {
  draft: TaskDraft;
  /** The estimate with its accepted buffer: what the slots must hold. */
  planMinutes: number;
  today: string;
  scheduled: boolean;
  onPick(time: string): void;
  onKeep(): void;
}) {
  const t = useTranslations("Tasks.create.schedule");
  const format = useTasksFormat();
  const duration = draft.durationMinutes ?? 30;
  const { slots } = useFreeSlots(draft.date, planMinutes);
  const headingId = useId();

  const option = (key: string, selected: boolean, onClick: () => void, icon: ReactNode, title: ReactNode, hint: string) => (
    <li key={key}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onClick}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 rounded-field px-3.5 text-start focus-visible:focus-ring",
          selected ? "bg-scope-soft inset-ring-[1.5px] inset-ring-scope-deep" : "bg-subtle hover:bg-raised",
        )}
      >
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-surface text-scope-deep">
          {selected ? <Check size={15} strokeWidth={3} /> : icon}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-fg">{title}</span>
          <span className="block text-xs text-fg-muted">{hint}</span>
        </span>
      </button>
    </li>
  );

  return (
    <section id="schedule" aria-labelledby={headingId} className="flex scroll-mt-24 flex-col gap-3 rounded-product bg-surface p-5 shadow-island">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={headingId} className="type-title text-fg">
          {t("title")}
        </h2>
        {draft.date && <span className="text-xs text-fg-muted">{t("day", { day: format.dayMonth(draft.date) })}</span>}
      </div>
      {!draft.date && <p className="text-sm text-fg-secondary">{t("noDate")}</p>}
      {draft.date && slots.length === 0 && <p className="text-sm text-fg-secondary">{t("noRoom", { duration: format.durationShort(planMinutes) })}</p>}
      <ul className="flex flex-col gap-2">
        {slots.map((start, index) => {
          const time = formatClockTime(start);
          return option(
            time,
            draft.time === time,
            () => onPick(time),
            <Clock size={15} />,
            <bdi dir="ltr" className="tabular-nums">
              {format.clockRange(start, start + duration)}
            </bdi>,
            index === 0 ? t("bestFit") : t("alsoFree"),
          );
        })}
        {option("keep", scheduled && draft.time === null, onKeep, <Rows3 size={15} />, t("keep"), t("keepHint"))}
      </ul>
      {draft.time && !slots.some((start) => formatClockTime(start) === draft.time) && (
        <p className="text-xs text-fg-muted">
          <bdi dir="ltr" className="tabular-nums">
            {format.clock(draft.time)}
          </bdi>
          {draft.date ? ` · ${dayLabel(format, draft.date, today)}` : null}
        </p>
      )}
    </section>
  );
}

/** Step 4 · Done: 2.5s, then back to where creation started; any interaction keeps it open. */
function DonePanel({ task, returnTo, onAnother }: { task: Task; returnTo: string; onAnother(): void }) {
  const t = useTranslations("Tasks.create.done");
  const format = useTasksFormat();
  const router = useRouter();
  const today = getPlannerToday();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const timer = useRef<number | null>(null);
  const [paused, setPaused] = useState(false);

  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setPaused(true);
  };

  useEffect(() => {
    headingRef.current?.focus();
    timer.current = window.setTimeout(() => router.push(returnTo), DONE_MS);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [router, returnTo]);

  const when = task.date ? [dayLabel(format, task.date, today), task.time ? format.clock(task.time) : null].filter(Boolean).join(" · ") : null;
  const meta = [
    format.scope(task.scope),
    task.durationMinutes ? format.durationShort(task.durationMinutes) : null,
    task.priority ? format.priority(task.priority) : null,
    task.energy ? format.energy(task.energy) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const backLabel = returnTo.startsWith(DEFAULT_RETURN) ? t("backMyDay") : t("back");

  return (
    <section
      id="done"
      aria-labelledby="task-create-done"
      onPointerDown={stop}
      onKeyDown={stop}
      className={cn(card, "flex flex-col items-center gap-3 py-12 text-center motion-safe:transition-opacity")}
    >
      <span aria-hidden="true" className="grid size-16 place-items-center rounded-full bg-scope-soft text-scope-deep">
        <Check size={28} strokeWidth={2.5} />
      </span>
      <h2 id="task-create-done" ref={headingRef} tabIndex={-1} className="type-title text-fg outline-none">
        {when ? t("title", { when }) : t("noDate")}
      </h2>
      <p className="text-sm text-fg-secondary">
        <bdi>{task.title}</bdi> · {meta}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button onClick={() => { stop(); onAnother(); }}>{t("createAnother")}</Button>
        <Button variant="outline" asChild>
          <Link href={taskDetailHref(task.id)} onClick={stop}>{t("open")}</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={returnTo} onClick={stop}>{backLabel}</Link>
        </Button>
      </div>
      <p role="status" className="min-h-4 text-xs text-fg-muted">
        {paused ? null : t("returning")}
      </p>
    </section>
  );
}
