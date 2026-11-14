"use client";

import { ArrowUpDown, Filter, Plus, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { EmptyState, NoResultsState } from "@/components/feedback/state-views";
import { ComingSoonBadge } from "@/components/navigation/coming-soon-badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { PillGroup } from "@/components/ui/pills";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import type { ProjectMilestone, ProjectRisk } from "@/data/project-domain";
import { useProjectMilestones, useRiskRegister } from "@/data/project-queries";
import { projectHref } from "@/features/navigation/contexts";
import { cn } from "@/lib/cn";
import { useProjectFormat } from "../format";
import { useProject } from "../project-gate";
import { ProjectPageHeader } from "../project-page-header";
import { FilterChip, FilterSection } from "../tasks/task-view-shared";
import { useMediaQuery } from "../use-media";
import { ProbabilityChip, RiskStatusChip, SeverityChip } from "./risk-chips";
import { RiskHeatMap } from "./risk-heat-map";
import {
  filterRisks,
  pillCounts,
  severitySummary,
  sortRisks,
  type HeatCell,
  type RiskPill,
  type RiskSort,
} from "./risk-model";

/*
 * PJ-09 · Risks & issues (/projects/[id]/risks). Header: segmented Risks /
 * Issues (?view=issues, D12 one register) + New risk (hidden for Viewers).
 * Register = product card with compact pills Open · Mine · High+ · Closed,
 * Owner · Milestone filter, sort (score default · updated · due) and rows
 * that open the PJ-16 drawer. Right column: RiskHeatMap (D11, cell = filter)
 * and Open issues; it drops under the register below 1180px. Phones
 * (PJM03): segmented, a 3-tile summary (High+ · Medium · Low) and the open
 * list only. Creating a risk is not in this step's spec (coming soon).
 */

type View = "risks" | "issues";

export function RisksScreen() {
  const t = useTranslations("Risks");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const format = useProjectFormat();
  const { project, capabilities, demo } = useProject();
  const phone = useMediaQuery("(max-width: 39.99rem)");
  const view: View = params.get("view") === "issues" ? "issues" : "risks";
  const risks = useRiskRegister(project.id, "risk");
  const issues = useRiskRegister(project.id, "issue");
  const milestones = useProjectMilestones(project.id);
  const [pill, setPill] = useState<RiskPill>("open");
  const [cell, setCell] = useState<HeatCell | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [milestoneId, setMilestoneId] = useState<string | null>(null);
  const [sort, setSort] = useState<RiskSort>("score");

  const empty = demo === "empty";
  const riskList = empty ? [] : (risks.data ?? []);
  const issueList = empty ? [] : (issues.data ?? []);

  const setView = (next: View) => {
    const query = new URLSearchParams(params.toString());
    if (next === "issues") query.set("view", "issues");
    else query.delete("view");
    setCell(null);
    router.replace(`${pathname}${query.size ? `?${query.toString()}` : ""}`, { scroll: false });
  };

  const header = (
    <ProjectPageHeader
      module="risks"
      title={t("title")}
      actions={
        <>
          <Segmented
            label={t("view.label")}
            value={view}
            onValueChange={setView}
            options={[
              { value: "risks", label: <ViewLabel label={t("view.risks")} n={riskList.length} /> },
              { value: "issues", label: <ViewLabel label={t("view.issues")} n={issueList.length} /> },
            ]}
          />
          {capabilities.createRisk && !empty ? <NewRiskButton /> : null}
        </>
      }
    />
  );

  // Live: the register is not mapped (no code, 3-level probability, close reason…), so it is not available.
  if (risks.isError || issues.isError) return <AccessState kind="not-available" titleAs="h1" />;

  if (!risks.data || !issues.data || !milestones.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  const list = view === "risks" ? riskList : issueList;
  const counts = pillCounts(list);
  const shown = sortRisks(
    filterRisks(list, { pill: phone ? "open" : pill, cell: view === "risks" ? cell : null, ownerId, milestoneId }),
    sort,
  );
  const owners = [...new Map(list.map((risk) => [risk.owner.id, risk.owner])).values()];
  const filterCount = (ownerId ? 1 : 0) + (milestoneId ? 1 : 0);
  const openIssues = issueList.filter((issue) => issue.open);

  if (list.length === 0 && view === "risks") {
    return (
      <>
        {header}
        {demo === "pending" || demo === "quota" ? <AccessState kind={demo} titleAs="h2" /> : null}
        <EmptyState
          variant="card"
          icon={Zap}
          title={t("empty")}
          description={t("emptyBody")}
          titleAs="h2"
          primaryAction={capabilities.createRisk ? <NewRiskButton /> : undefined}
        />
      </>
    );
  }

  const register = (
    <section
      aria-labelledby="risk-register"
      className="flex min-w-0 flex-col gap-3 sm:rounded-[28px] sm:bg-surface sm:p-4"
    >
      <h2 id="risk-register" className="sr-only">
        {view === "risks" ? t("view.risks") : t("view.issues")}
      </h2>
      {!phone ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PillGroup
            label={t("pills.label")}
            value={pill}
            onValueChange={setPill}
            options={(["open", "mine", "high", "closed"] as const).map((value) => ({
              value,
              label: t(`pills.${value}`),
              count: counts[value],
            }))}
          />
          <div className="flex flex-wrap items-center gap-2">
            <OwnerMilestoneFilter
              owners={owners}
              milestones={milestones.data}
              ownerId={ownerId}
              milestoneId={milestoneId}
              count={filterCount}
              onOwner={setOwnerId}
              onMilestone={setMilestoneId}
            />
            <SortMenu sort={sort} onSort={setSort} />
          </div>
        </div>
      ) : null}
      {cell && view === "risks" ? (
        <p className="flex flex-wrap items-center gap-2 px-1 text-xs font-semibold text-fg-secondary">
          <span className="rounded-pill bg-scope-soft px-2.5 py-0.5 text-scope-deep">
            {t("filters.cell", { probability: t(`level.${cell.probability}`), severity: t(`level.${cell.severity}`) })}
          </span>
          <button type="button" onClick={() => setCell(null)} className="font-bold text-fg underline underline-offset-2">
            {t("filters.clearCell")}
          </button>
        </p>
      ) : null}
      {shown.length === 0 ? (
        list.length === 0 ? (
          <EmptyState variant="dashed" title={t("emptyIssues")} titleAs="h3" />
        ) : (
          <NoResultsState variant="dashed" title={t("noMatch")} titleAs="h3" />
        )
      ) : (
        <div className="flex flex-col gap-2">
          <div
            aria-hidden="true"
            className={cn(ROW_GRID, "px-3 text-xs font-semibold text-fg-secondary max-lg:hidden")}
          >
            <span>{t("columns.id")}</span>
            <span>{view === "risks" ? t("columns.risk") : t("columns.issue")}</span>
            <span>{t("severity")}</span>
            <span>{view === "risks" ? t("probability") : ""}</span>
            <span>{t("columns.owner")}</span>
            <span>{t("columns.status")}</span>
            <span>{t("columns.milestone")}</span>
            <span className="text-end">{t("columns.updated")}</span>
          </div>
          <ul className="flex flex-col gap-2">
            {shown.map((risk) => (
              <RiskRow
                key={risk.id}
                risk={risk}
                projectId={project.id}
                milestone={milestones.data.find((candidate) => candidate.id === risk.milestoneId)}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );

  return (
    <>
      {header}
      {demo === "pending" || demo === "quota" ? <AccessState kind={demo} titleAs="h2" /> : null}
      {phone && view === "risks" ? <SeveritySummary risks={riskList} /> : null}
      <div className="grid gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
        {register}
        {!phone ? (
          <div className="grid content-start gap-4 sm:grid-cols-2 min-[1180px]:grid-cols-1">
            {view === "risks" ? (
              <section aria-labelledby="risk-heat" className="flex flex-col gap-3 rounded-[28px] bg-surface p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 id="risk-heat" className="type-title text-fg">
                    {t("heat.title")}
                  </h2>
                  <span className="text-xs font-semibold text-fg-secondary">{t("heat.caption")}</span>
                </div>
                <RiskHeatMap risks={riskList} selected={cell} onSelect={setCell} />
              </section>
            ) : (
              <p className="rounded-[24px] bg-subtle p-4 text-xs font-medium text-fg-secondary">{t("issuesNote")}</p>
            )}
            <section aria-labelledby="open-issues" className="flex flex-col gap-3 rounded-[28px] bg-surface p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 id="open-issues" className="type-title text-fg">
                  {t("openIssues")}
                </h2>
                <span className="text-xs font-semibold text-fg-secondary">{format.number(openIssues.length)}</span>
              </div>
              {openIssues.length === 0 ? (
                <p className="text-sm text-fg-muted">{t("emptyIssues")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {openIssues.map((issue) => (
                    <li key={issue.id}>
                      <Link
                        href={`${projectHref(project.id, "risks")}/${encodeURIComponent(issue.id)}`}
                        className="flex items-center gap-2.5 rounded-row bg-subtle px-3 py-2.5 focus-visible:focus-ring"
                      >
                        <SeverityChip severity={issue.severity} />
                        <bdi className="min-w-0 flex-1 truncate text-sm font-bold text-fg">{issue.title}</bdi>
                        <Avatar
                          name={issue.owner.name}
                          initials={issue.owner.initials}
                          size={32}
                          decorative
                          className="size-7 text-[0.625rem]"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </>
  );
}

const ROW_GRID =
  "lg:grid lg:grid-cols-[3.25rem_minmax(0,1fr)_5.5rem_5rem_3rem_6.5rem_8rem_2.5rem] lg:items-center lg:gap-2";

function ViewLabel({ label, n }: { label: string; n: number }) {
  const format = useProjectFormat();
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      <span className="tabular opacity-80">{format.number(n)}</span>
    </span>
  );
}

function NewRiskButton() {
  const t = useTranslations("Risks");
  // Creating a risk has no form in the PJ-09 spec yet: shown as coming soon (like PJ-08 New milestone).
  return (
    <Button size="lg" aria-disabled className="gap-2 opacity-70">
      <Icon icon={Plus} size={18} />
      {t("new")}
      <ComingSoonBadge />
    </Button>
  );
}

function RiskRow({
  risk,
  projectId,
  milestone,
}: {
  risk: ProjectRisk;
  projectId: string;
  milestone: ProjectMilestone | undefined;
}) {
  const t = useTranslations("Risks");
  const format = useProjectFormat();
  const updated = format.relative(risk.updatedAt);
  return (
    <li>
      <Link
        href={`${projectHref(projectId, "risks")}/${encodeURIComponent(risk.id)}`}
        className={cn(
          ROW_GRID,
          "flex flex-wrap items-center gap-x-2 gap-y-2 rounded-[22px] bg-surface p-3 inset-ring inset-ring-outline hover:inset-ring-scope-deep focus-visible:focus-ring lg:min-h-14",
        )}
      >
        <span className="text-xs font-semibold text-fg-secondary tabular">
          <bdi>{risk.code}</bdi>
        </span>
        <bdi className="min-w-0 basis-[calc(100%-4rem)] truncate text-sm font-bold text-fg lg:basis-auto">
          {risk.title}
        </bdi>
        <SeverityChip severity={risk.severity} />
        <span className="text-xs font-semibold text-fg max-lg:hidden">
          {risk.probability ? t(`level.${risk.probability}`) : null}
        </span>
        <span className="lg:hidden">
          <ProbabilityChip risk={risk} />
        </span>
        <Avatar
          name={risk.owner.name}
          initials={risk.owner.initials}
          size={32}
          decorative
          className="size-7 text-[0.625rem] max-lg:order-last max-lg:ms-auto"
        />
        <RiskStatusChip status={risk.status} className="justify-self-start" />
        <span className="truncate text-xs font-semibold text-fg max-lg:hidden">
          {milestone ? <bdi>{milestone.title}</bdi> : t("none")}
        </span>
        <span className="text-end text-xs font-medium text-fg-secondary max-lg:hidden">{updated}</span>
        {risk.kind === "issue" ? (
          <span className="text-xs font-medium text-fg-secondary lg:hidden">
            {risk.fromRiskCode ? t("from", { code: risk.fromRiskCode }) : t("raised", { when: format.relative(risk.raisedAt) })}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function SeveritySummary({ risks }: { risks: readonly ProjectRisk[] }) {
  const t = useTranslations("Risks.summary");
  const format = useProjectFormat();
  const summary = severitySummary(risks);
  const tiles = [
    { key: "high", n: summary.high, className: "bg-danger-soft text-danger-text" },
    { key: "medium", n: summary.medium, className: "bg-warning-soft text-warning-text" },
    { key: "low", n: summary.low, className: "bg-subtle text-fg" },
  ] as const;
  return (
    <ul aria-label={t("label")} className="grid grid-cols-3 gap-2">
      {tiles.map((tile) => (
        <li key={tile.key} className={cn("flex flex-col rounded-[18px] px-3 py-2.5", tile.className)}>
          <span className="text-xl font-bold tabular">{format.number(tile.n)}</span>
          <span className="text-xs font-semibold">{t(tile.key)}</span>
        </li>
      ))}
    </ul>
  );
}

function OwnerMilestoneFilter({
  owners,
  milestones,
  ownerId,
  milestoneId,
  count,
  onOwner,
  onMilestone,
}: {
  owners: readonly ProjectRisk["owner"][];
  milestones: readonly ProjectMilestone[];
  ownerId: string | null;
  milestoneId: string | null;
  count: number;
  onOwner: (id: string | null) => void;
  onMilestone: (id: string | null) => void;
}) {
  const t = useTranslations("Risks.filters");
  const format = useProjectFormat();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-2 bg-surface">
          <Icon icon={Filter} size={16} />
          {t("button")}
          {count > 0 ? (
            <span className="rounded-pill bg-scope-soft px-1.5 text-xs font-bold text-scope-deep">
              {format.number(count)}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label={t("button")} className="w-80" data-scope="project">
        <div className="flex flex-col gap-3">
          <FilterSection label={t("owner")}>
            <FilterChip pressed={ownerId === null} onClick={() => onOwner(null)}>
              {t("any")}
            </FilterChip>
            {owners.map((person) => (
              <FilterChip key={person.id} pressed={ownerId === person.id} onClick={() => onOwner(person.id)}>
                {person.name}
              </FilterChip>
            ))}
          </FilterSection>
          <FilterSection label={t("milestone")}>
            <FilterChip pressed={milestoneId === null} onClick={() => onMilestone(null)}>
              {t("any")}
            </FilterChip>
            {milestones.map((milestone) => (
              <FilterChip
                key={milestone.id}
                pressed={milestoneId === milestone.id}
                onClick={() => onMilestone(milestone.id)}
              >
                {milestone.title}
              </FilterChip>
            ))}
          </FilterSection>
          {count > 0 ? (
            <button
              type="button"
              onClick={() => {
                onOwner(null);
                onMilestone(null);
              }}
              className="self-start text-xs font-bold text-fg underline underline-offset-2"
            >
              {t("clear")}
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SortMenu({ sort, onSort }: { sort: RiskSort; onSort: (sort: RiskSort) => void }) {
  const t = useTranslations("Risks.sort");
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-2 bg-surface" aria-label={`${t("label")}: ${t(sort)}`}>
          <Icon icon={ArrowUpDown} size={16} />
          {t(sort)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-scope="project">
        <DropdownMenuRadioGroup value={sort} onValueChange={(value) => onSort(value as RiskSort)}>
          {(["score", "updated", "due"] as const).map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {t(value)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
