"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, IconButton } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { ToggleChip } from "@/components/ui/chip";
import type { Scope } from "@/data/domain";
import { useOpenSheet } from "@/features/sheets/sheet-params";
import type { CalendarSystem } from "@/lib/dates/format";
import { cn } from "@/lib/cn";
import { useCalendar } from "./calendar-context";
import type { CalendarView } from "./domain/calendar-params";
import { LAYER_SCOPES } from "./domain/layers";
import { AGENDA_DAYS } from "./domain/navigation";
import { useCalendarFormat } from "./use-calendar-format";

/*
 * The page header: the other calendar's range as a kicker, the range in the
 * primary calendar as the title, then prev / Today / next, the view switch
 * (Segmented: a view mode), the Shamsi / Gregorian switch and "+ New"
 * (Universal Quick Add). Chevrons mirror in RTL.
 */

export function CalendarHeader({ days }: { days: readonly string[] }) {
  const t = useTranslations("Calendar");
  const format = useCalendarFormat();
  const { view, anchor, today, calendar, setView, setCalendar, shift, goToToday } = useCalendar();
  const openSheet = useOpenSheet();
  const first = days[0] ?? anchor;
  const last = days.at(-1) ?? anchor;

  let kicker: string;
  let title: string;
  if (view === "day") {
    kicker = format.altDate(anchor, "full");
    title = format.date(anchor, "full");
  } else if (view === "month") {
    kicker = format.altRange(first, last);
    title = format.date(anchor, "monthYear");
  } else {
    kicker = view === "agenda" ? t("title.agenda", { count: format.number(AGENDA_DAYS) }) : format.altRange(first, last);
    title = format.range(first, last);
  }

  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-fg-muted">{kicker}</p>
        <h1 className="text-[1.75rem] leading-tight font-semibold lg:text-[2.25rem] [&:lang(fa)]:font-bold [&:lang(fa)]:leading-snug">
          {title}
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t("toolbar.nav")} className="flex items-center gap-1 rounded-pill bg-surface p-1">
          <IconButton icon={ChevronLeft} mirror label={t("toolbar.previous")} variant="ghost" onClick={() => shift(-1)} />
          <Button variant="ghost" size="sm" onClick={goToToday} aria-pressed={anchor === today}>
            {t("toolbar.today")}
          </Button>
          <IconButton icon={ChevronRight} mirror label={t("toolbar.next")} variant="ghost" onClick={() => shift(1)} />
        </div>
        <Segmented<CalendarView>
          label={t("toolbar.view")}
          value={view}
          onValueChange={setView}
          options={[
            { value: "day", label: t("toolbar.day") },
            { value: "week", label: t("toolbar.week") },
            { value: "month", label: t("toolbar.month") },
            { value: "agenda", label: t("toolbar.agenda") },
          ]}
        />
        <Segmented<CalendarSystem>
          label={t("toolbar.system")}
          variant="neutral"
          value={calendar}
          onValueChange={setCalendar}
          options={[
            { value: "jalali", label: t("toolbar.shamsi") },
            { value: "gregorian", label: t("toolbar.gregorian") },
          ]}
        />
        <Button className="max-lg:hidden" onClick={() => openSheet("quick-add")}>
          <Plus aria-hidden className="size-4.5" />
          {t("toolbar.new")}
        </Button>
      </div>
    </header>
  );
}

/** "Show · Personal 7 · Projects 4 …": Personal is always on; the rest are toggles that persist. */
export function LayerChips({ counts, className }: { counts: Record<Scope, number>; className?: string }) {
  const t = useTranslations("Calendar.layers");
  const format = useCalendarFormat();
  const { hidden, toggleLayer } = useCalendar();
  return (
    <div role="group" aria-label={t("group")} className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span aria-hidden className="pe-1 text-sm font-semibold text-fg-muted">
        {t("label")}
      </span>
      {LAYER_SCOPES.map((scope) => {
        const name = t(`names.${scope}`);
        const locked = scope === "personal";
        return (
          <ToggleChip
            key={scope}
            scope={scope}
            size="md"
            selected={!hidden.has(scope)}
            onSelectedChange={() => toggleLayer(scope)}
            disabled={locked}
            aria-label={t("count", { name, count: format.number(counts[scope]) })}
            title={locked ? t("alwaysOn") : undefined}
            className={cn(locked && "disabled:opacity-100")}
          >
            {name} <span className="tabular font-bold opacity-70 dark:opacity-90">{format.number(counts[scope])}</span>
          </ToggleChip>
        );
      })}
    </div>
  );
}
