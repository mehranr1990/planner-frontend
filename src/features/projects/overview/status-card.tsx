"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricGroup, MetricTile } from "@/design-system/surfaces/metric-tile";
import { SignatureCard, SignatureCardAction, SignatureCardHeader } from "@/design-system/surfaces/signature-card";
import type { ProjectKpis, ProjectSummary } from "@/data/project-domain";
import { projectHref } from "@/features/navigation/contexts";
import { useProjectFormat } from "../format";

/*
 * PJ-01 status card — the screen's one signature card. Notch = Open tasks
 * (→ /projects/[id]/tasks). Progress is the number + a linear bar with the
 * expected-pace marker (no ring); the status note is written by a Manager
 * (author + time shown, no AI); four KPI tiles: Milestones · Overdue tasks ·
 * Open risks · Due this week (server counts). Budget is not a Project feature.
 */
export function ProjectStatusCard({ project, kpis }: { project: ProjectSummary; kpis: ProjectKpis | undefined }) {
  const t = useTranslations("Project");
  const router = useRouter();
  const format = useProjectFormat();
  const percent = project.progress.percent;
  const daysLeft = format.daysFromToday(project.endDate);
  const note = project.statusNote;

  return (
    <SignatureCard
      as="section"
      aria-label={t("hero.label")}
      action={
        <SignatureCardAction
          icon={ArrowRight}
          mirror
          label={t("hero.openTasks")}
          onClick={() => router.push(projectHref(project.id, "tasks"))}
        />
      }
      contentClassName="flex flex-col gap-4"
    >
      <SignatureCardHeader className="flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="font-bold tracking-wide text-scope-deep uppercase">{t("hero.label")}</span>
        {note ? (
          <span className="flex min-w-0 items-center gap-1.5 text-fg-secondary">
            <Avatar
              name={note.author.name}
              initials={note.author.initials}
              size={32}
              className="size-6 text-[0.625rem]"
            />
            <span className="truncate">
              {t("hero.noteBy", { name: note.author.name, time: format.relative(note.at) })}
            </span>
          </span>
        ) : null}
      </SignatureCardHeader>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex shrink-0 flex-col">
          <span className="text-[3.25rem] leading-none font-semibold tabular text-fg">{format.percent(percent)}</span>
          <span className="pt-1 text-xs font-semibold text-fg-secondary">
            {t("hero.done", {
              done: format.number(project.progress.done),
              total: format.number(project.progress.total),
            })}
          </span>
        </div>
        <p dir="auto" className="type-title text-fg sm:text-xl">
          {note ? note.text : <span className="text-fg-muted">{t("hero.noNote")}</span>}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="relative">
          <div
            role="progressbar"
            aria-label={t("hero.progress")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={`${format.percent(percent)} · ${t("hero.expected", { pct: format.percent(project.expectedPercent) })}`}
            className="h-2 w-full overflow-hidden rounded-pill bg-scope-soft"
          >
            {/* Dynamic geometry: widths are data. Logical inset mirrors the bar in RTL. */}
            <div className="h-full rounded-pill bg-primary" style={{ width: `${percent}%` }} />
          </div>
          <span
            aria-hidden="true"
            data-slot="pace-marker"
            className="absolute -top-1 h-4 w-0.5 rounded-pill bg-fg"
            style={{ insetInlineStart: `${project.expectedPercent}%` }}
          />
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-xs font-semibold text-fg-secondary">
          <span>{t("hero.expected", { pct: format.percent(project.expectedPercent) })}</span>
          <span>
            {daysLeft >= 0
              ? t("hero.ends", { date: format.day(project.endDate), days: format.number(daysLeft) })
              : t("hero.ended", { date: format.day(project.endDate) })}
          </span>
        </div>
      </div>

      {kpis ? (
        <MetricGroup aria-label={t("kpi.label")} columns={4}>
          <MetricTile
            label={t("kpi.milestones")}
            value={`${format.number(kpis.milestonesDone)}/${format.number(kpis.milestonesTotal)}`}
            hint={
              kpis.nextMilestone
                ? t("kpi.milestonesHint", { title: kpis.nextMilestone.title, date: format.day(kpis.nextMilestone.due) })
                : t("kpi.milestonesNone")
            }
          />
          <MetricTile
            label={t("kpi.overdue")}
            value={format.number(kpis.overdueTasks)}
            hint={
              kpis.overdueTasks > 0
                ? t("kpi.overdueHint", { days: format.number(kpis.oldestOverdueDays) })
                : t("kpi.overdueNone")
            }
          />
          <MetricTile
            label={t("kpi.risks")}
            value={format.number(kpis.openRisks)}
            hint={t("kpi.risksHint", { n: format.number(kpis.highRisks) })}
          />
          <MetricTile
            label={t("kpi.dueWeek")}
            value={format.number(kpis.dueThisWeek)}
            hint={t("kpi.dueWeekHint", { n: format.number(kpis.openTasks) })}
          />
        </MetricGroup>
      ) : (
        <Skeleton className="h-20 rounded-metric" />
      )}
    </SignatureCard>
  );
}
