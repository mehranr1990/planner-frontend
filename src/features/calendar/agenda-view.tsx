"use client";

import { CalendarCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/state-views";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/design-system/surfaces/product-card";
import type { DayBlock } from "@/features/my-day/domain/day-blocks";
import { useMyDay, usePlannerNow } from "@/features/my-day/my-day-context";
import { useMarkDone } from "@/features/my-day/rail/use-mark-done";
import { ClockText } from "@/features/my-day/timeline/clock-text";
import { blockStyle } from "@/features/my-day/ui/scope-style";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { cn } from "@/lib/cn";
import { weekdayOfDay } from "@/lib/dates/clock-time";
import { LayerChips } from "./calendar-toolbar";
import { agendaDays } from "./domain/month-cells";
import { AGENDA_DAYS } from "./domain/navigation";
import type { CalendarData } from "./use-calendar-data";
import { useCalendarFormat } from "./use-calendar-format";

/*
 * Agenda (P04): a chronological list over 14 days, only days with something
 * on them; weekend days in red (with the word, never colour alone). Timed
 * Personal tasks are rows with "task" meta and a checkbox that shows on
 * hover / focus. Rows are never notched. The same list renders one day in
 * the Month view's side panel.
 */

export function AgendaView({ days, data }: { days: readonly string[]; data: CalendarData }) {
  const t = useTranslations("Calendar");
  const format = useCalendarFormat();
  const headingId = useId();
  return (
    <ProductCard as="section" aria-labelledby={headingId} className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-[1.1875rem] font-semibold [&:lang(fa)]:font-bold">
          {t("title.agenda", { count: format.number(AGENDA_DAYS) })}
        </h2>
        <LayerChips counts={data.counts} />
      </div>
      <AgendaList
        days={days}
        data={data}
        empty={<EmptyState icon={CalendarCheck} title={t("agenda.emptyTitle")} description={t("agenda.empty", { count: format.number(AGENDA_DAYS) })} />}
      />
    </ProductCard>
  );
}

export function AgendaList({ days, data, empty }: { days: readonly string[]; data: CalendarData; empty: React.ReactNode }) {
  const t = useTranslations("Calendar");
  const format = useCalendarFormat();
  const now = usePlannerNow();
  const { week } = usePlannerSettings();

  if (data.status === "error") return <ErrorState onRetry={data.refetch} />;
  if (data.status === "pending")
    return (
      <LoadingState label={t("week.loading")}>
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} shape="tile" className="h-14 rounded-[16px]" />
          ))}
        </div>
      </LoadingState>
    );

  const entries = agendaDays(days, data.byDay);
  if (entries.length === 0) return <>{empty}</>;

  return (
    <div className="flex flex-col gap-4">
      {entries.map(({ day, blocks }) => {
        const weekend = week.weekendDays.includes(weekdayOfDay(day));
        const label = `${format.date(day, "weekdayShort")} ${format.dayMonth(day)}`;
        return (
          <section key={day} aria-label={format.kicker(day)} className="flex flex-col gap-2">
            <h3 className={cn("text-base font-semibold [&:lang(fa)]:font-bold", weekend && "text-weekend-text")}>
              {day === now.day ? `${t("agenda.today")} · ${label}` : label}
              {weekend ? ` · ${t("agenda.weekend")}` : null}{" "}
              <span className="text-xs font-semibold text-fg-muted">{format.altDate(day, "dayMonth")}</span>
            </h3>
            <ul className="flex flex-col gap-1.5">
              {blocks.map((block) => (
                <AgendaRow key={block.id} block={block} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function AgendaRow({ block }: { block: DayBlock }) {
  const t = useTranslations("Calendar");
  const format = useCalendarFormat();
  const { selectedBlockId, selectBlock } = useMyDay();
  const markDone = useMarkDone();
  const style = blockStyle({ scope: block.scope, kind: block.kind, done: block.done });
  const isTask = block.kind === "task" && block.scope === "personal";
  const meta = [t(`layers.names.${block.scope}`), isTask ? t("agenda.task") : null].filter(Boolean).join(" · ");

  return (
    <li className="group relative flex items-center gap-3 rounded-[16px] bg-raised/60 px-3 py-2 hover:bg-raised">
      <ClockText className="flex w-12 shrink-0 flex-col text-xs leading-4 font-bold">
        <span>{format.clock(block.startMinutes)}</span>
        <span className="font-semibold text-fg-muted">{format.clock(block.endMinutes)}</span>
      </ClockText>
      <span aria-hidden className={cn("w-1 self-stretch rounded-full", style.dot)} />
      <button
        type="button"
        aria-pressed={selectedBlockId === block.id}
        onClick={() => selectBlock(selectedBlockId === block.id ? null : block.id)}
        className="flex min-h-10 min-w-0 flex-1 flex-col items-start text-start after:absolute after:inset-0"
      >
        <bdi dir="auto" className={cn("max-w-full truncate text-sm font-semibold", style.title)}>
          {block.title}
        </bdi>
        <span className="text-xs font-semibold text-fg-muted">{meta}</span>
      </button>
      {isTask ? (
        <Checkbox
          checked={block.done}
          disabled={block.done}
          aria-label={t("agenda.markDone", { title: block.title })}
          onCheckedChange={() => void markDone({ id: block.id, title: block.title })}
          className="relative z-10 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=checked]:opacity-100 max-lg:opacity-100"
        />
      ) : null}
    </li>
  );
}
