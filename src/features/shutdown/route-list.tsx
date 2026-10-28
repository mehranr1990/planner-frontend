"use client";

import { CalendarDays, ChevronDown, Inbox, Sun, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EnergyBars } from "@/components/ui/energy-bars";
import type { Task } from "@/data/domain";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { useTasksFormat } from "@/features/tasks/ui/use-tasks-format";
import { cn } from "@/lib/cn";
import { dayToLocalDate, localDateToDay } from "@/lib/dates/clock-time";
import {
  isRepeatOffender,
  ROUTE_DESTINATIONS,
  routeDay,
  SEND_ALL_DESTINATIONS,
  type Route,
  type RouteDays,
  type RouteDestination,
  type RouteDraft,
} from "./domain/shutdown";

/*
 * Step 1 · Route (P10): every unfinished task with its destination chip,
 * a "Send all to" row, multi-select with a bulk bar. Rows are plain product
 * rows (never notched). A selected row takes the scope outline; a repeat
 * offender carries the rose "moved 3 times" hint. Routing a row slides it
 * a touch toward its chip (260ms; reduced motion swaps instantly).
 */

export interface RouteListProps {
  tasks: readonly Task[];
  today: string;
  days: RouteDays;
  draft: RouteDraft;
  onRoute(ids: readonly string[], route: Route): void;
}

export function RouteList({ tasks, today, days, draft, onRoute }: RouteListProps) {
  const t = useTranslations("Shutdown");
  const format = useTasksFormat();
  const reduce = useReducedMotion();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pickFor, setPickFor] = useState<readonly string[] | null>(null);
  const present = new Set(tasks.map((task) => task.id));
  const selection = [...selected].filter((id) => present.has(id));

  const choose = (ids: readonly string[], to: RouteDestination) => {
    if (to === "pick") setPickFor(ids);
    else onRoute(ids, { to });
  };
  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  /** "Wed", "Sat–Thu" … the trailing hint in the destination menu. */
  const hintFor = (to: RouteDestination): string | undefined => {
    if (to === "this-week") return `${format.weekdayShort(days.tomorrow)}–${format.weekdayShort(days.thisWeek)}`;
    const day = routeDay({ to }, days);
    return day ? format.weekdayShort(day) : undefined;
  };

  const chipLabel = (route: Route | undefined): string => {
    if (!route) return t("route.leave");
    if (route.to === "pick" && route.day) return format.dateHeader(route.day);
    return t(`destination.${route.to}`);
  };

  return (
    <ProductCard as="section" aria-labelledby="shutdown-route-title" className="gap-4 p-5 lg:p-6" id="shutdown-route">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="shutdown-route-title" className="type-title text-fg">
          {t("route.title", { count: format.number(tasks.length) })}
        </h2>
        <p className="text-xs font-semibold text-fg-muted">{t("route.hint")}</p>
      </div>

      <div role="group" aria-label={t("route.sendAll")} className="flex flex-wrap items-center gap-1.5">
        <span className="me-1 text-xs font-semibold text-fg-muted">{t("route.sendAll")}</span>
        {SEND_ALL_DESTINATIONS.map((to) => (
          <Button
            key={to}
            size="sm"
            variant="outline"
            className="min-h-8 px-3 text-xs"
            onClick={() => choose(tasks.map((task) => task.id), to)}
          >
            {t(`destination.${to}`)}
          </Button>
        ))}
      </div>

      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {tasks.map((task) => {
            const route = draft[task.id];
            const isSelected = selected.has(task.id);
            const repeat = isRepeatOffender(task);
            const overdue = task.date !== null && task.date < today;
            const meta = [overdue ? t("route.overdueMeta") : null, task.area?.name, task.project].filter(Boolean).join(" · ");
            return (
              <motion.li
                key={`${task.id}:${route?.to ?? "stay"}`}
                initial={reduce ? false : { x: 8, opacity: 0.6 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: reduce ? 0 : 0.26, ease: "easeOut" }}
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-subtle px-3.5 py-3",
                  isSelected && "bg-scope-soft inset-ring-[1.5px] inset-ring-scope-deep",
                )}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(state) => toggle(task.id, state === true)}
                  aria-label={t("route.select", { title: task.title })}
                />
                <div className="min-w-0 flex-1">
                  <p dir="auto" className="truncate text-sm font-semibold text-fg">
                    {task.title}
                  </p>
                  {meta || repeat ? (
                    <p className="truncate text-xs text-fg-muted">
                      {meta ? <bdi>{meta}</bdi> : null}
                      {repeat ? (
                        <span className="ms-1 font-semibold text-danger-text">
                          {meta ? "· " : null}
                          {t("route.repeat", { count: format.number(task.movedCount ?? 0) })}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                <EnergyBars level={task.energy} />
                {task.durationMinutes ? (
                  <span className="w-12 text-end text-xs font-semibold text-fg-secondary tabular">
                    {format.durationShort(task.durationMinutes)}
                  </span>
                ) : null}
                <DestinationMenu
                  label={t("route.destinationFor", { title: task.title })}
                  value={chipLabel(route)}
                  active={route !== undefined}
                  danger={route?.to === "drop"}
                  hintFor={hintFor}
                  onChoose={(to) => choose([task.id], to)}
                />
                {repeat ? (
                  <p className="basis-full rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger-text">
                    <strong className="font-bold">{t("route.repeatTitle")}</strong>{" "}
                    {t("route.repeatBody", { count: format.number(task.movedCount ?? 0) })}
                  </p>
                ) : null}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      {selection.length > 0 ? (
        <div
          role="toolbar"
          aria-label={t("route.bulkLabel")}
          className="flex flex-wrap items-center gap-2 rounded-full bg-surface p-1.5 ps-4 shadow-md inset-ring-[1.5px] inset-ring-scope-deep"
        >
          <span aria-live="polite" className="text-sm font-bold text-fg">
            {t("route.selected", { count: format.number(selection.length) })}
          </span>
          <Button size="sm" variant="secondary" onClick={() => choose(selection, "tomorrow")}>
            <Sun aria-hidden size={16} />
            {t("destination.tomorrow")}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => choose(selection, "pick")}>
            <CalendarDays aria-hidden size={16} />
            {t("destination.pick")}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => choose(selection, "inbox")}>
            <Inbox aria-hidden size={16} />
            {t("destination.inbox")}
          </Button>
          <DestinationMenu
            label={t("route.bulkLabel")}
            value={t("route.more")}
            active={false}
            hintFor={hintFor}
            onChoose={(to) => choose(selection, to)}
          />
          <IconButton size="sm" variant="ghost" icon={X} label={t("route.clearSelection")} className="ms-auto" onClick={() => setSelected(new Set())} />
        </div>
      ) : null}

      <Dialog open={pickFor !== null} onOpenChange={(open) => !open && setPickFor(null)}>
        <DialogContent title={t("route.pickTitle")} hideTitle size="sm" className="p-0">
          <DatePicker
            title={t("route.pickTitle")}
            confirmLabel={t("route.pickConfirm")}
            value={dayToLocalDate(days.tomorrow)}
            onConfirm={(picked) => {
              if (pickFor) onRoute(pickFor, { to: "pick", day: localDateToDay(picked) });
              setPickFor(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </ProductCard>
  );
}

function DestinationMenu({
  label,
  value,
  active,
  danger = false,
  hintFor,
  onChoose,
}: {
  label: string;
  value: string;
  active: boolean;
  danger?: boolean;
  hintFor(to: RouteDestination): string | undefined;
  onChoose(to: RouteDestination): void;
}) {
  const t = useTranslations("Shutdown");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${value}`}
          className={cn(
            "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold outline-none",
            "focus-visible:ring-2 focus-visible:ring-focus-ring",
            danger ? "bg-danger-soft text-danger-text" : active ? "bg-scope-soft text-scope-deep" : "bg-secondary text-fg-secondary",
          )}
        >
          <span dir="auto">{value}</span>
          <ChevronDown aria-hidden size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {ROUTE_DESTINATIONS.map((to) => (
          <FragmentItem key={to} to={to} hint={hintFor(to)} label={t(`destination.${to}`)} onChoose={onChoose} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FragmentItem({ to, hint, label, onChoose }: { to: RouteDestination; hint?: string; label: string; onChoose(to: RouteDestination): void }) {
  return (
    <>
      {to === "drop" ? <DropdownMenuSeparator /> : null}
      <DropdownMenuItem tone={to === "drop" ? "destructive" : "default"} hint={hint} onSelect={() => onChoose(to)}>
        {label}
      </DropdownMenuItem>
    </>
  );
}
