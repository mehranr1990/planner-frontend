"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import type { TeamWeekPlan } from "@/data/team-domain";
import { getPlannerToday } from "@/data/clock";
import { teamHref } from "@/features/navigation/contexts";
import { useProjectFormat } from "@/features/projects/format";
import { cn } from "@/lib/cn";

/*
 * WeekCard (TM-01, the one signature card): done / planned from Planning,
 * per-day progress bars Sat … Thu (volt only on today), blocked /
 * carried-over / unplanned chips and the Lead's focus line. Notch = Open week
 * plan → /teams/[id]/planning.
 */
export function WeekCard({ teamId, plan }: { teamId: string; plan: TeamWeekPlan | undefined }) {
  const t = useTranslations("Team");
  const router = useRouter();
  const format = useProjectFormat();
  const today = getPlannerToday();

  const action = (
    <SignatureCardAction icon={ArrowRight} mirror label={t("openPlan")} onClick={() => router.push(teamHref(teamId, "planning"))} />
  );

  if (!plan) {
    return (
      <SignatureCard action={action} as="section" aria-label={t("week.title")}>
        <Skeleton className="h-40 rounded-row" />
      </SignatureCard>
    );
  }

  const list = new Intl.ListFormat(format.locale === "fa" ? "fa" : "en", { type: "conjunction" }).format(plan.focus);

  return (
    <SignatureCard action={action} as="section" aria-labelledby="team-week-title" contentClassName="gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="team-week-title" className="text-xs font-bold tracking-wide text-scope-deep uppercase">
          {t("week.label", { n: format.number(plan.weekNumber) })}
        </h2>
        <p className="flex items-baseline gap-3 text-fg">
          <span className="text-5xl font-bold tabular">
            {format.number(plan.done)}
            <span className="text-2xl font-semibold text-fg-secondary">/{format.number(plan.planned)}</span>
          </span>
          <span className="text-sm text-fg-secondary">{t("week.done")}</span>
        </p>
      </div>

      <ol aria-label={t("week.days")} className="grid grid-cols-6 gap-1.5">
        {plan.days.map((day) => {
          const isToday = day.day === today;
          const complete = day.planned > 0 && day.done >= day.planned;
          const started = day.done > 0;
          const label = format.day(day.day, "weekdayShort");
          return (
            <li key={day.day} className="flex flex-col items-center gap-1.5">
              <span className={cn("text-xs", isToday ? "font-bold text-fg" : "text-fg-secondary")}>{label}</span>
              <span
                role="img"
                aria-label={`${t("week.day", { day: label, done: format.number(day.done), planned: format.number(day.planned) })}${isToday ? ` (${t("week.today")})` : ""}`}
                className={cn(
                  "h-1.5 w-full rounded-pill",
                  isToday ? "bg-volt" : complete ? "bg-scope-deep" : started ? "bg-scope-dot" : "bg-subtle",
                )}
              />
            </li>
          );
        })}
      </ol>

      <ul className="flex flex-wrap gap-1.5 text-xs font-semibold">
        {plan.blocked > 0 ? (
          <li className="rounded-pill bg-danger-soft px-2.5 py-1 text-danger-text">
            {t("week.blocked", { n: format.number(plan.blocked) })}
          </li>
        ) : null}
        {plan.carriedOver > 0 ? (
          <li className="rounded-pill bg-warning-soft px-2.5 py-1 text-warning-text">
            {t("week.carried", { n: format.number(plan.carriedOver), week: format.number(plan.weekNumber - 1) })}
          </li>
        ) : null}
        {plan.unplanned > 0 ? (
          <li className="rounded-pill bg-raised px-2.5 py-1 text-fg">
            {t("week.unplanned", { n: format.number(plan.unplanned) })}
          </li>
        ) : null}
      </ul>

      {plan.focus.length > 0 && plan.focusBy && plan.focusAt ? (
        <p className="text-sm text-fg">
          {t.rich("week.focus", {
            items: list,
            name: plan.focusBy.name,
            day: format.day(plan.focusAt.slice(0, 10), "weekday"),
            b: (chunks) => <strong className="font-bold">{chunks}</strong>,
          })}
        </p>
      ) : null}
    </SignatureCard>
  );
}
