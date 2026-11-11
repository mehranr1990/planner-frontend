"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/design-system/surfaces/product-card";
import type { TeamEvent } from "@/data/team-domain";
import { useTeamCalendarRange } from "@/data/team-queries";
import { getPlannerToday } from "@/data/clock";
import { useProjectFormat } from "@/features/projects/format";
import { convertDigits } from "@/lib/locale/digits";
import { cn } from "@/lib/cn";

/*
 * TM-01 Team calendar (product card): this week's working days Sat … Wed
 * with team events as calendar chips — meetings and check-ins in the team
 * tint, time off neutral, deadlines red (never colour alone: the title says
 * what it is). Only team events; nothing from Personal calendars.
 */

const KIND_CLASS: Record<TeamEvent["kind"], string> = {
  meeting: "bg-scope-soft text-scope-deep",
  checkin: "bg-scope-soft text-scope-deep",
  "time-off": "bg-raised text-fg",
  deadline: "bg-danger-soft text-danger-text",
};

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function TeamCalendarCard({ teamId, week }: { teamId: string; week: string }) {
  const t = useTranslations("Team.calendar");
  const format = useProjectFormat();
  const days = Array.from({ length: 5 }, (_, index) => addDays(week, index));
  const events = useTeamCalendarRange(teamId, days[0]!, days[4]!);
  const today = getPlannerToday();

  return (
    <ProductCard as="section" aria-labelledby="team-calendar-title" className="gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="team-calendar-title" className="type-title text-fg">
          {t("title")}
        </h2>
        <span className="text-xs font-medium text-fg-secondary">{format.range(days[0]!, days[4]!)}</span>
      </div>
      {!events.data ? (
        <Skeleton className="h-20 rounded-row" />
      ) : events.data.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ol className="grid grid-cols-5 gap-1.5">
          {days.map((day) => {
            const items = events.data.filter((event) => event.day === day);
            const isToday = day === today;
            return (
              <li key={day} className="flex min-w-0 flex-col gap-1.5">
                <span
                  className={cn("text-center text-xs font-semibold", isToday ? "text-scope-deep" : "text-fg")}
                  aria-current={isToday ? "date" : undefined}
                >
                  {format.day(day, "weekdayShort")} {format.day(day, "day")}
                </span>
                <ul className="flex flex-col gap-1">
                  {items.map((event) => (
                    <li
                      key={event.id}
                      title={event.title}
                      className={cn(
                        "truncate rounded-row px-2 py-1.5 text-center text-xs font-semibold",
                        KIND_CLASS[event.kind],
                      )}
                    >
                      <bdi>{event.title}</bdi>
                      {event.time ? (
                        <>
                          {" "}
                          <span dir="ltr" className="tabular">
                            {convertDigits(event.time, format.digits)}
                          </span>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </ProductCard>
  );
}
