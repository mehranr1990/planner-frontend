"use client";

import { Check, Moon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { useLongPress } from "@/components/ui/use-long-press";
import type { Habit } from "@/data/domain";
import type { HabitDayMark } from "@/data/repositories";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { cn } from "@/lib/cn";
import { dayOfWeekday, isDoneOn, isRestDay, isScheduledRest, isSkipped, scheduledWeekdays } from "./domain/habits";
import { habitIcon } from "./ui/habit-icons";
import { useHabitFormat } from "./ui/use-habit-format";

/*
 * A Today row tile (P12 · Today row): product-card family, no notch. Tap =
 * complete (the tile tints mint and the check pops, 220ms; reduced motion
 * swaps); long-press / right-click / Shift+F10 = skip · rest · log amount.
 * Rest days (schedule) show a moon.
 */

export interface TodayTileActions {
  onToggle(habit: Habit, done: boolean): void;
  onMark(habit: Habit, mark: HabitDayMark): void;
  onLog(habit: Habit, amount: number): void;
}

export function TodayTile({ habit, today, selected, actions }: { habit: Habit; today: string; selected: boolean } & { actions: TodayTileActions }) {
  const t = useTranslations("Habits.today");
  const tTime = useTranslations("Habits.timeOfDay");
  const format = useHabitFormat();
  const reduce = useReducedMotion();
  const { week } = usePlannerSettings();
  const [menu, setMenu] = useState(false);
  const [logging, setLogging] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const press = useLongPress(() => setMenu(true));

  const done = isDoneOn(habit, today);
  const scheduledRest = isScheduledRest(habit, today);
  const rest = !done && isRestDay(habit, today);
  const skipped = !done && isSkipped(habit, today);
  const amount = habit.amounts?.[today] ?? (done && habit.target ? habit.target.amount : 0);

  const meta: string[] = [];
  if (rest && scheduledRest) {
    meta.push(scheduledWeekdays(habit, week).map((weekday) => format.weekdayRibbon(dayOfWeekday(today, weekday))).join(" · "), t("rest"));
  } else if (rest) meta.push(t("rest"));
  else if (skipped) meta.push(t("skipped"));
  else {
    if (habit.timeOfDay && habit.timeOfDay !== "anytime") meta.push(tTime(habit.timeOfDay));
    if (habit.preferredTime) meta.push(format.clock(habit.preferredTime));
    if (habit.target) meta.push(t("amount", { done: format.number(amount), target: format.number(habit.target.amount) }));
    else if (done) meta.push(t("done"));
  }
  if (habit.target && !rest && !skipped && meta.length === 1) meta.unshift(t("target", { amount: format.number(habit.target.amount), unit: habit.target.unit }));

  const state = done ? t("states.done") : rest ? t("states.rest") : skipped ? t("states.skipped") : t("states.open");
  const HabitIcon = habitIcon(habit.icon);

  const submitLog = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = Number(new FormData(event.currentTarget).get("amount"));
    if (Number.isFinite(value) && value >= 0) actions.onLog(habit, value);
    setLogging(false);
  };

  return (
    <li className="relative grid min-w-0" data-habit-tile={habit.id} data-state={done ? "done" : rest ? "rest" : skipped ? "skipped" : "open"}>
      {logging && habit.target ? (
        <form onSubmit={submitLog} className="flex min-h-26 flex-col justify-between gap-2 rounded-card bg-surface p-3.5 inset-ring inset-ring-line">
          <label className="text-xs font-bold text-fg" htmlFor={`log-${habit.id}`}>
            {t("logLabel", { habit: habit.title, unit: habit.target.unit })}
          </label>
          <div className="flex items-center gap-2">
            <Input id={`log-${habit.id}`} name="amount" type="number" inputMode="numeric" min={0} defaultValue={amount || ""} autoFocus className="min-w-0 flex-1" />
            <Button type="submit" size="sm">
              {t("logSave")}
            </Button>
          </div>
        </form>
      ) : (
        <button
          ref={button}
          type="button"
          aria-pressed={done}
          aria-label={t("toggle", { habit: habit.title, state })}
          aria-keyshortcuts="Shift+F10"
          {...press.handlers}
          onClick={() => {
            if (press.consumeClick()) return;
            actions.onToggle(habit, !done);
          }}
          className={cn(
            "flex min-h-26 min-w-0 flex-col gap-2 rounded-card p-3.5 text-start transition-colors duration-220 focus-visible:focus-ring",
            done ? "bg-scope-soft dark:muted-on-tint" : rest || skipped ? "bg-subtle" : "bg-surface shadow-island hover:bg-raised",
            selected && "inset-ring-2 inset-ring-scope-deep",
          )}
        >
          <span className="flex items-start justify-between gap-2">
            <span aria-hidden="true" className={cn("grid size-8 place-items-center rounded-full", done ? "bg-surface text-scope-deep" : "bg-subtle text-fg-secondary")}>
              <Icon icon={HabitIcon} size={15} />
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "grid size-7 place-items-center rounded-full",
                done ? "bg-scope-deep text-on-accent" : rest ? "text-fg-muted inset-ring-[1.5px] inset-ring-outline" : "inset-ring-2 inset-ring-outline",
              )}
            >
              {done ? (
                <motion.span key="check" initial={reduce ? false : { scale: 0.4 }} animate={{ scale: 1 }} transition={{ duration: 0.22, ease: "backOut" }}>
                  <Icon icon={Check} size={14} />
                </motion.span>
              ) : rest ? (
                <Icon icon={Moon} size={13} />
              ) : null}
            </span>
          </span>
          <span className="mt-auto flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-bold text-fg">
              <bdi dir="auto">{habit.title}</bdi>
            </span>
            <span className="truncate text-[0.6875rem] font-semibold text-fg-muted">{meta.join(" · ")}</span>
          </span>
        </button>
      )}

      <DropdownMenu open={menu} onOpenChange={setMenu}>
        <DropdownMenuTrigger asChild>
          {/* The tile is the visual anchor; the menu opens from long-press / context menu only. */}
          <span aria-hidden="true" tabIndex={-1} className="pointer-events-none absolute inset-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          aria-label={t("menu", { habit: habit.title })}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            button.current?.focus();
          }}
        >
          {skipped ? null : <DropdownMenuItem onSelect={() => actions.onMark(habit, "skip")}>{t("skip")}</DropdownMenuItem>}
          {rest || scheduledRest ? null : <DropdownMenuItem onSelect={() => actions.onMark(habit, "rest")}>{t("restToday")}</DropdownMenuItem>}
          {habit.target ? <DropdownMenuItem onSelect={() => setLogging(true)}>{t("log")}</DropdownMenuItem> : null}
          {skipped || (rest && !scheduledRest) ? <DropdownMenuItem onSelect={() => actions.onMark(habit, null)}>{t("clear")}</DropdownMenuItem> : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

