"use client";

import { AlertCircle, ArrowRight, Check, Inbox, Plus, Target, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleChip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ReviewPriority, ReviewWin } from "@/data/domain";
import { CarryOverFlow } from "@/design-system/data-display/carry-over-flow";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { usePreferences } from "@/features/preferences/use-preferences";
import { RouteList } from "@/features/shutdown/route-list";
import { useTasksFormat } from "@/features/tasks/ui/use-tasks-format";
import { cn } from "@/lib/cn";
import { getDirection } from "@/lib/locale/direction";
import { MAX_PRIORITIES, MAX_WINS } from "./domain/weekly";
import type { WeeklyReviewSession } from "./use-weekly-review";

/*
 * The five P16 steps. Rows, tiles and form groups are plain product /
 * utility geometry (never notched); the Weekly Story above is the page's one
 * signature card.
 */

const newId = (prefix: string) => `${prefix}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** One text field + Add, for "add your own" (wins, priorities). */
function AddOwn({ label, disabled, onAdd }: { label: string; disabled: boolean; onAdd(title: string): void }) {
  const t = useTranslations("Review");
  const [text, setText] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const title = text.trim();
    if (!title || disabled) return;
    onAdd(title);
    setText("");
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input aria-label={label} placeholder={label} value={text} onChange={(event) => setText(event.target.value)} dir="auto" disabled={disabled} className="min-w-0 flex-1" />
      <Button type="submit" variant="secondary" disabled={disabled || !text.trim()}>
        <Plus aria-hidden size={16} />
        {t("add")}
      </Button>
    </form>
  );
}

// ── 1 · Wins ─────────────────────────────────────────────────────────────

export function WinsStep({ session }: { session: WeeklyReviewSession }) {
  const t = useTranslations("Review.wins");
  const format = useTasksFormat();
  const chosen = new Set(session.wins.map((win) => win.id));
  const full = session.wins.length >= MAX_WINS;
  const own = session.wins.filter((win) => win.source === "own");
  const toggle = (win: ReviewWin, on: boolean) =>
    session.setWins(on ? [...session.wins, win].slice(0, MAX_WINS) : session.wins.filter((item) => item.id !== win.id));
  return (
    <ProductCard className="gap-4 p-5 lg:p-6">
      <p aria-live="polite" className="text-xs font-semibold text-fg-muted">
        {t("picked", { count: format.number(session.wins.length), max: format.number(MAX_WINS) })}
      </p>
      {session.suggestions.length === 0 && own.length === 0 ? (
        <p className="rounded-2xl bg-subtle p-4 text-sm text-fg-secondary">{t("none")}</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label={t("listLabel")}>
          {[...session.suggestions, ...own].map((win) => (
            <li key={win.id} className="rounded-2xl bg-subtle px-3.5 py-2.5">
              <Checkbox
                checked={chosen.has(win.id)}
                disabled={!chosen.has(win.id) && full}
                onCheckedChange={(value) => toggle(win, value === true)}
                label={<bdi>{win.title}</bdi>}
                description={t(`source.${win.source}`)}
              />
            </li>
          ))}
        </ul>
      )}
      <AddOwn
        label={full ? t("full") : t("addOwn")}
        disabled={full}
        onAdd={(title) => session.setWins([...session.wins, { id: newId("own"), title, source: "own" }])}
      />
    </ProductCard>
  );
}

// ── 2 · Carry over ───────────────────────────────────────────────────────

export function CarryStep({ session, onPlan }: { session: WeeklyReviewSession; onPlan(): void }) {
  const t = useTranslations("Review.carry");
  const format = useTasksFormat();
  const { locale } = usePreferences();
  const { counts } = session;
  const pill = "inline-flex min-h-8 items-center rounded-full px-3 text-xs font-bold";
  return (
    <div className="flex flex-col gap-4">
      <ProductCard as="section" aria-labelledby="review-carry-title" className="gap-4 p-5 lg:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="review-carry-title" className="type-title text-fg">
            {t("title")}
          </h3>
          <p className="text-xs font-semibold text-fg-muted">{t("planned", { count: format.number(counts.planned) })}</p>
        </div>
        <CarryOverFlow
          label={t("title")}
          totalLabel={t("plannedShort")}
          emphasis="completed"
          direction={getDirection(locale)}
          formatNumber={format.number}
          formatPercent={format.percent}
          items={[
            {
              id: "completed",
              count: counts.completed,
              label: t("completed"),
              color: "var(--success-text)",
              icon: <Check size={14} strokeWidth={2.6} />,
              cta: counts.completed > 0 ? <span className={cn(pill, "bg-scope-deep text-on-accent")}>{t("greatWeek")}</span> : null,
            },
            {
              id: "moved",
              count: counts.moved,
              label: t("moved"),
              color: "var(--warning)",
              icon: <ArrowRight size={14} strokeWidth={2.6} className="rtl:-scale-x-100" />,
              cta: (
                <button type="button" onClick={onPlan} className={cn(pill, "bg-surface text-fg hover:bg-secondary-hover")}>
                  {t("reviewInPlan")}
                </button>
              ),
            },
            {
              id: "overdue",
              count: counts.overdue,
              label: t("overdue"),
              color: "var(--danger)",
              icon: <AlertCircle size={14} strokeWidth={2.6} />,
              cta:
                counts.overdue > 0 ? (
                  <a href="#review-unfinished" className={cn(pill, "bg-surface text-fg hover:bg-secondary-hover")}>
                    {t("reschedule")}
                  </a>
                ) : null,
            },
            {
              id: "inbox",
              count: counts.inbox,
              label: t("inbox"),
              color: "var(--color-fg-muted)",
              icon: <Inbox size={14} strokeWidth={2.4} />,
              cta: (
                <Link href="/personal/inbox" className={cn(pill, "bg-surface text-fg hover:bg-secondary-hover")}>
                  {t("sortLater")}
                </Link>
              ),
            },
          ]}
        />
      </ProductCard>
      <div id="review-unfinished" className="scroll-mt-24">
        {session.unfinished.length === 0 ? (
          <UtilityCard className="items-center gap-2 py-8 text-center">
            <span aria-hidden className="grid size-12 place-items-center rounded-full bg-surface text-fg-secondary">
              <Check size={22} />
            </span>
            <p className="type-title text-fg">{t("nothing.title")}</p>
            <p className="max-w-xs text-sm text-fg-secondary">{t("nothing.body")}</p>
          </UtilityCard>
        ) : (
          <RouteList tasks={session.unfinished} today={session.today} days={session.routing} draft={session.routes} onRoute={session.setRoutes} />
        )}
      </div>
    </div>
  );
}

// ── 3 · Goals ────────────────────────────────────────────────────────────

export function GoalsStep({ session }: { session: WeeklyReviewSession }) {
  const t = useTranslations("Review.goals");
  const format = useTasksFormat();
  if (!session.goalsLoading && session.goals.length === 0) {
    return (
      <UtilityCard className="items-center gap-2 py-8 text-center">
        <span aria-hidden className="grid size-12 place-items-center rounded-full bg-surface text-fg-secondary">
          <Target size={22} />
        </span>
        <p className="type-title text-fg">{t("empty.title")}</p>
        <p className="max-w-xs text-sm text-fg-secondary">{t("empty.body")}</p>
        <Button asChild variant="secondary">
          <Link href="/personal/goals">{t("empty.action")}</Link>
        </Button>
      </UtilityCard>
    );
  }
  return (
    <ul className="flex flex-col gap-2.5" aria-busy={session.goalsLoading || undefined}>
      {session.goals.map(({ goal, delta, next, delayed }) => (
        <li key={goal.id}>
          <Link
            href={`/personal/goals/${encodeURIComponent(goal.id)}`}
            className="flex flex-col gap-2.5 rounded-3xl bg-surface p-4 shadow-sm transition-colors hover:bg-secondary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-fg">
                <bdi>{goal.title}</bdi>
              </span>
              <span
                className={cn(
                  "inline-flex min-h-7 items-center gap-1 rounded-full px-2.5 text-xs font-bold",
                  delayed ? "bg-warning-soft text-warning-text" : "bg-success-soft text-success-text",
                )}
              >
                {delayed ? <AlertCircle aria-hidden size={13} /> : <Check aria-hidden size={13} />}
                {delayed ? t("delayed") : t("onTrack")}
              </span>
            </span>
            <span className="flex items-center gap-3">
              <span
                role="progressbar"
                aria-label={t("progress", { title: goal.title })}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(goal.progress * 100)}
                className="h-2 flex-1 overflow-hidden rounded-full bg-subtle"
              >
                <span className="block h-full rounded-full bg-scope-deep" style={{ inlineSize: `${Math.round(goal.progress * 100)}%` }} />
              </span>
              <span className="text-sm font-semibold text-fg tabular">{format.percent(goal.progress)}</span>
            </span>
            <span className="flex flex-wrap gap-x-3 text-xs font-semibold text-fg-secondary">
              <span className="tabular">{delta > 0 ? t("delta", { delta: format.percent(delta) }) : t("noDelta")}</span>
              {next ? (
                <span>
                  {t("next")} · <bdi>{next.title}</bdi>
                </span>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ── 4 · Plan ─────────────────────────────────────────────────────────────

export function PlanStep({ session }: { session: WeeklyReviewSession }) {
  const t = useTranslations("Review.plan");
  const format = useTasksFormat();
  const [picked, setPicked] = useState<string | null>(null);
  const hintId = useId();
  const priorities = session.priorities;
  const full = priorities.length >= MAX_PRIORITIES;
  const chosenTasks = new Set(priorities.flatMap((item) => (item.taskId ? [item.taskId] : [])));
  const nextWeek = new Set(session.plan.map((day) => day.day));
  const candidates = [
    ...session.carried,
    ...session.tasks.filter((task) => task.status === "open" && task.date !== null && nextWeek.has(task.date) && !session.carried.includes(task)),
  ].slice(0, 8);
  const toggleTask = (id: string, title: string, on: boolean) =>
    session.setPriorities(on ? [...priorities, { id: `task:${id}`, title, taskId: id }].slice(0, MAX_PRIORITIES) : priorities.filter((item) => item.taskId !== id));
  const remove = (item: ReviewPriority) => session.setPriorities(priorities.filter((entry) => entry.id !== item.id));
  const placedDay = (id: string) => session.plan.find((day) => day.placed.includes(id))?.day ?? null;
  const place = (taskId: string, day: string | null) => {
    session.placeOn(taskId, day);
    setPicked(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <ProductCard as="section" aria-labelledby="review-priorities" className="gap-3 p-5 lg:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="review-priorities" className="type-title text-fg">
            {t("priorities")}
          </h3>
          <p aria-live="polite" className="text-xs font-semibold text-fg-muted">
            {t("picked", { count: format.number(priorities.length), max: format.number(MAX_PRIORITIES) })}
          </p>
        </div>
        {priorities.length > 0 ? (
          <ol className="flex flex-col gap-2">
            {priorities.map((item, index) => (
              <li key={item.id} className="flex items-center gap-3 rounded-2xl bg-subtle px-3.5 py-2">
                <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-scope-deep text-xs font-bold text-on-accent tabular">
                  {format.number(index + 1)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
                  <bdi>{item.title}</bdi>
                </span>
                <IconButton size="sm" variant="ghost" icon={X} label={t("remove", { title: item.title })} onClick={() => remove(item)} />
              </li>
            ))}
          </ol>
        ) : null}
        {candidates.length > 0 ? (
          <div role="group" aria-label={t("candidates")} className="flex flex-wrap gap-2">
            {candidates.map((task) => (
              <ToggleChip
                key={task.id}
                selected={chosenTasks.has(task.id)}
                disabled={!chosenTasks.has(task.id) && full}
                onSelectedChange={(on) => toggleTask(task.id, task.title, on)}
              >
                <bdi>{task.title}</bdi>
              </ToggleChip>
            ))}
          </div>
        ) : null}
        <AddOwn
          label={full ? t("full") : t("addOwn")}
          disabled={full}
          onAdd={(title) => session.setPriorities([...priorities, { id: newId("own"), title }])}
        />
      </ProductCard>

      <ProductCard as="section" aria-labelledby="review-week-strip" className="gap-3 p-5 lg:p-6">
        <div className="flex flex-col gap-1">
          <h3 id="review-week-strip" className="type-title text-fg">
            {t("strip")}
          </h3>
          <p id={hintId} className="text-xs text-fg-secondary">
            {session.carried.length ? t("stripHint") : t("stripEmpty")}
          </p>
        </div>
        {session.carried.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label={t("carried")}>
            {session.carried.map((task) => {
              const on = picked === task.id;
              const day = placedDay(task.id);
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    draggable
                    aria-pressed={on}
                    aria-describedby={hintId}
                    onClick={() => setPicked(on ? null : task.id)}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", task.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    className={cn(
                      "inline-flex min-h-9 max-w-64 items-center gap-2 rounded-full bg-subtle px-3 text-xs font-semibold text-fg",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      on && "bg-scope-soft inset-ring-2 inset-ring-scope-deep",
                    )}
                  >
                    <span className="truncate">
                      <bdi>{task.title}</bdi>
                    </span>
                    <span className="shrink-0 text-fg-muted tabular">
                      {day ? format.weekdayShort(day) : format.durationShort(task.durationMinutes ?? 30)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        <ol className="grid grid-cols-7 gap-1.5" aria-label={t("strip")}>
          {session.plan.map((day) => {
            const ratio = day.capacityMinutes ? day.loadMinutes / day.capacityMinutes : day.loadMinutes ? 1 : 0;
            const over = day.loadMinutes > day.capacityMinutes;
            const weekend = day.kind === "weekend";
            const label = t("dayLabel", {
              day: format.weekdayShort(day.day),
              load: format.durationShort(day.loadMinutes),
              capacity: format.durationShort(day.capacityMinutes),
            });
            return (
              <li key={day.day} className="min-w-0">
                <button
                  type="button"
                  aria-label={picked ? t("placeOn", { day: label }) : label}
                  disabled={!picked}
                  onClick={() => picked && place(picked, day.day)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const id = event.dataTransfer.getData("text/plain");
                    if (id) place(id, day.day);
                  }}
                  className={cn(
                    "flex w-full flex-col items-center gap-1.5 rounded-2xl bg-subtle px-1 py-2.5 disabled:cursor-default",
                    picked && "hover:bg-scope-soft",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  )}
                >
                  <span className={cn("text-[11px] font-bold", weekend ? "text-danger-text" : "text-fg-secondary")}>{format.weekdayShort(day.day)}</span>
                  <span className={cn("text-sm font-bold tabular", weekend ? "text-danger-text" : "text-fg")}>{format.dayMonth(day.day).split(" ")[0]}</span>
                  <span aria-hidden className="h-1.5 w-full max-w-10 overflow-hidden rounded-full bg-surface">
                    <span
                      className={cn("block h-full rounded-full", over ? "bg-warning" : "bg-scope-deep")}
                      style={{ inlineSize: `${Math.min(100, Math.round(ratio * 100))}%` }}
                    />
                  </span>
                  <span className={cn("text-[10px] font-semibold tabular", over ? "text-warning-text" : "text-fg-muted")}>
                    {day.kind === "half" ? t("half") : weekend ? t("off") : format.durationShort(day.loadMinutes)}
                  </span>
                  {day.placed.length > 0 ? (
                    <span className="rounded-full bg-scope-soft px-1.5 text-[10px] font-bold text-scope-deep tabular">+{format.number(day.placed.length)}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      </ProductCard>
    </div>
  );
}

// ── 5 · Reflect ──────────────────────────────────────────────────────────

export function ReflectStep({ session }: { session: WeeklyReviewSession }) {
  const t = useTranslations("Review.reflect");
  const ids = { wentWell: useId(), slipped: useId(), change: useId() };
  return (
    <ProductCard className="gap-4 p-5 lg:p-6">
      {(["wentWell", "slipped", "change"] as const).map((key) => (
        <div key={key} className="flex flex-col gap-1.5">
          <label htmlFor={ids[key]} className="text-sm font-bold text-fg">
            {t(`${key}.label`)}
          </label>
          <Textarea
            id={ids[key]}
            dir="auto"
            rows={key === "change" ? 2 : 3}
            placeholder={t(`${key}.placeholder`)}
            value={session.reflection[key]}
            onChange={(event) => session.setReflection({ [key]: event.target.value })}
          />
        </div>
      ))}
      <p className="text-xs font-semibold text-fg-muted">{t("journalHint")}</p>
    </ProductCard>
  );
}
