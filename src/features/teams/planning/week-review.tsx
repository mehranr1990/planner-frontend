"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { AccessLoading } from "@/components/feedback/access-state";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { MetricGroup, MetricTile } from "@/design-system/surfaces/metric-tile";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { carryOverDecisions, type CarryOverDecision } from "@/data/team-domain";
import { useTeamPlanActions, useTeamWeekReview } from "@/data/team-queries";
import { useProjectFormat } from "@/features/projects/format";
import { useTeam } from "../team-gate";

/*
 * TM-04 Review last week: the read-only summary of last week (task counts,
 * never per-person scores) and one decision per unfinished task — move to
 * this week (a carry-over in To plan), back to To plan, or close. Lead+
 * decide; everyone else reads the decisions.
 */

export function WeekReview({
  week,
  weekNumber,
  thisWeekNumber,
}: {
  week: string;
  weekNumber: number;
  thisWeekNumber: number;
}) {
  const t = useTranslations("Planning.review");
  const tToast = useTranslations("Planning.toast");
  const format = useProjectFormat();
  const { team, capabilities } = useTeam();
  const review = useTeamWeekReview(team.id, week);
  const { decide } = useTeamPlanActions(team.id);

  if (review.isError) return <p className="rounded-[28px] bg-surface p-5 text-sm text-fg-muted">{t("missing")}</p>;
  if (!review.data) return <AccessLoading />;
  const data = review.data;
  const label = (decision: CarryOverDecision | null) =>
    t(`decision.${decision ?? "none"}`, { n: format.number(thisWeekNumber) });

  return (
    <ProductCard as="section" aria-label={t("unfinished")} className="gap-4">
      <MetricGroup columns={4} aria-label={t("planned", { n: format.number(weekNumber) })}>
        <MetricTile
          label={t("planned", { n: format.number(weekNumber) })}
          value={`${format.number(data.plannedDone)}/${format.number(data.planned)}`}
        />
        <MetricTile label={t("carried")} value={format.number(data.carriedOver)} />
        <MetricTile label={t("unplanned")} value={format.number(data.unplannedAdded)} />
        <MetricTile label={t("accuracy")} value={format.percent(data.estimateAccuracy)} />
      </MetricGroup>
      <h2 className="type-title text-fg">{t("unfinished")}</h2>
      {data.unfinished.length ? (
        <ul className="flex flex-col gap-1.5">
          {data.unfinished.map((row) => (
            <li key={row.taskId} className="flex min-h-12 items-center gap-3 rounded-row bg-subtle px-3">
              <bdi className="min-w-0 flex-1 truncate text-sm font-bold text-fg">{row.title}</bdi>
              {capabilities.editWeekFocus ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="gap-1"
                      aria-label={`${t("decide", { title: row.title })}: ${label(row.decision)}`}
                    >
                      {label(row.decision)}
                      <ChevronDown aria-hidden size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {carryOverDecisions.map((decision) => (
                      <DropdownMenuItem
                        key={decision}
                        onSelect={() =>
                          decide.mutate(
                            { week, taskId: row.taskId, decision },
                            { onError: () => toast({ tone: "danger", title: tToast("failed") }) },
                          )
                        }
                      >
                        {t(`options.${decision}`)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span className="rounded-pill bg-surface px-3 py-1 text-xs font-bold text-fg inset-ring inset-ring-outline">
                  {label(row.decision)}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">{t("allDone")}</p>
      )}
      <p className="text-xs text-fg-secondary">{t("note")}</p>
    </ProductCard>
  );
}
