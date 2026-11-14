"use client";

import { ArrowRight, Check, Download, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { Button, buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { toast } from "@/components/ui/toast";
import type { Approval, BudgetSummary, CompanyOverview, DepartmentProgressRow, PortfolioSummary } from "@/data/company-domain";
import { useApprovals, useCapacity, useCompanyGoals, useCompanyMutation, useCompanyOverview, useCompanyProjects } from "@/data/company-queries";
import { Progress } from "@/design-system/feedback/progress";
import { StatusChip } from "@/design-system/feedback/status-chip";
import { FolderTabsCard } from "@/design-system/surfaces/folder-tabs-card";
import { MetricGroup, MetricTile } from "@/design-system/surfaces/metric-tile";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { companyHref } from "@/features/navigation/contexts";
import { ProjectStatusChip } from "@/features/projects/project-visuals";
import { cn } from "@/lib/cn";
import { useCompany } from "../company-gate";
import { CompanyPageHeader } from "../company-page-header";
import { useCompanyFormat } from "../format";

/*
 * CO-01 · Company overview (/companies/[id]): an executive glance. Every
 * number names its source and denominator — no composite score, no AI, no
 * prediction (S6 reconciliation). Portfolio signature card (projects on
 * track / active + quarter history, notch Open portfolio → CO-04), KPI tiles
 * with source captions, a Watch banner only with a source (capacity),
 * FolderTabs Departments · Portfolio · Goals · Capacity, the budget card
 * (approved / committed / left; pending only as text) and approvals waiting
 * for me (Review opens the detail; approve only after seeing it). Members
 * see no budget and no approvals. The department scope narrows everything.
 */
export function CompanyOverviewScreen() {
  const t = useTranslations("Company.overview");
  const tMonths = useTranslations("Company.months");
  const { company, capabilities, departmentId } = useCompany();
  const overview = useCompanyOverview(company.id, departmentId, company.role);
  const exportReport = useCompanyMutation(company.id, (repo, id) => repo.requestExport(id, "portfolio", "pdf"));
  const format = useCompanyFormat(company.currency);
  const waiting = overview.data?.kpis.approvalsForMe ?? 0;

  const header = (
    <CompanyPageHeader
      module="overview"
      title={company.name}
      scope
      titleExtra={<span className="text-sm font-bold text-fg-secondary">{overview.data?.portfolio.quarter}</span>}
      actions={
        <>
          {capabilities.export ? (
            <Button
              variant="secondary"
              className="gap-2"
              disabled={exportReport.isPending}
              onClick={() =>
                exportReport.mutate(undefined, {
                  onSuccess: () => toast({ title: t("exported"), description: t("exportedBody") }),
                })
              }
            >
              <Icon icon={Download} size={16} />
              {t("export")}
            </Button>
          ) : null}
          {capabilities.modules.approvals && waiting > 0 ? (
            <Link href={companyHref(company.id, "approvals")} className={cn(buttonVariants(), "gap-2")}>
              <Icon icon={Check} size={16} />
              {t("reviewApprovals", { n: format.number(waiting) })}
            </Link>
          ) : null}
        </>
      }
    />
  );

  if (overview.isError) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => void overview.refetch()} />
      </>
    );
  }
  if (!overview.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }
  const data = overview.data;
  return (
    <>
      {header}
      <div className="grid gap-4 lg:grid-cols-2">
        <PortfolioCard portfolio={data.portfolio} />
        <div className="flex flex-col gap-4">
          <Kpis data={data} />
          {data.watch ? (
            <section
              aria-label={t("watch.label")}
              className="flex items-center gap-3 rounded-card-sm bg-warning-soft px-4 py-3 text-warning-text"
            >
              <span aria-hidden="true" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface">
                <Icon icon={Zap} size={16} />
              </span>
              <p className="min-w-0 flex-1 text-xs font-semibold">
                <strong className="font-bold">{t("watch.label")}</strong> ·{" "}
                {t("watch.body", { department: data.watch.departmentName, percent: data.watch.percent, month: tMonths(String(data.watch.month) as "1"), n: data.watch.overlaps })}
                <span className="block font-medium">{t("watch.source")}</span>
              </p>
              <Link
                href={`${companyHref(company.id, "resources")}?tab=capacity`}
                className="shrink-0 text-xs font-bold underline underline-offset-2"
              >
                {t("watch.view")}
              </Link>
            </section>
          ) : null}
        </div>
      </div>
      <OverviewTabs data={data} />
      <div className="grid gap-4 lg:grid-cols-2">
        {capabilities.budgetCard && data.budget ? <BudgetCard budget={data.budget} /> : null}
        {capabilities.modules.approvals ? <ApprovalsForMe /> : null}
      </div>
    </>
  );
}

function PortfolioCard({ portfolio }: { portfolio: PortfolioSummary }) {
  const t = useTranslations("Company.overview");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const router = useRouter();
  const ratio = portfolio.active > 0 && portfolio.onTrack !== null ? (portfolio.onTrack / portfolio.active) * 100 : 0;
  return (
    <SignatureCard
      as="section"
      aria-labelledby="portfolio-title"
      contentClassName="gap-4"
      action={
        <SignatureCardAction
          icon={ArrowRight}
          mirror
          label={t("openPortfolio")}
          onClick={() => router.push(companyHref(company.id, "work"))}
        />
      }
    >
      <p id="portfolio-title" className="text-xs font-bold tracking-wide text-scope-deep uppercase">
        {t("portfolio.kicker", { quarter: portfolio.quarter })}
      </p>
      {portfolio.active === 0 ? (
        <p className="text-sm text-fg-secondary">{t("portfolio.none")}</p>
      ) : portfolio.onTrack === null ? (
        // The health split is not served: the active count only, never an invented split.
        <>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="type-display tabular text-fg">{format.number(portfolio.active)}</span>
            <span className="text-sm font-semibold text-fg-secondary">{t("portfolio.active")}</span>
          </p>
          <p className="text-xs text-fg-muted">{t("portfolio.healthUnavailable")}</p>
        </>
      ) : (
        <>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="type-display tabular text-fg">{format.number(portfolio.onTrack)}</span>
            <span className="text-2xl font-semibold text-fg-muted tabular">/{format.number(portfolio.active)}</span>
            <span className="text-sm font-semibold text-fg-secondary">{t("portfolio.onTrack")}</span>
          </p>
          <Progress value={ratio} label={t("portfolio.onTrack")} valueText={format.percent(ratio)} />
          <p className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-pill bg-warning-soft px-2.5 py-1 text-warning-text">{t("portfolio.atRisk", { n: format.number(portfolio.atRisk ?? 0) })}</span>
            <span className="rounded-pill bg-subtle px-2.5 py-1 text-fg-secondary">{t("portfolio.offTrack", { n: format.number(portfolio.offTrack ?? 0) })}</span>
            <span className="text-fg-muted">{t("portfolio.source")}</span>
          </p>
          {portfolio.history.length > 0 ? (
            <ol aria-label={t("portfolio.history")} className="grid grid-cols-4 gap-2">
              {portfolio.history.map((quarter, index) => (
                <li
                  key={quarter.label}
                  aria-current={index === portfolio.history.length - 1 ? "true" : undefined}
                  className="flex flex-col items-center rounded-tile bg-subtle py-2 aria-[current]:bg-surface aria-[current]:inset-ring aria-[current]:inset-ring-line"
                >
                  <span className="text-base font-bold tabular text-fg">
                    {format.number(quarter.onTrack)}/{format.number(quarter.active)}
                  </span>
                  <span className="text-xs text-fg-secondary">{quarter.label}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      )}
    </SignatureCard>
  );
}

function Kpis({ data }: { data: CompanyOverview }) {
  const t = useTranslations("Company.overview.kpi");
  const { company, capabilities } = useCompany();
  const format = useCompanyFormat(company.currency);
  const { kpis } = data;
  return (
    <MetricGroup columns={2} aria-label={t("label")}>
      <MetricTile label={t("teams")} value={format.number(kpis.teams)} hint={kpis.teamsSentPlan === null ? undefined : t("teamsHint", { n: format.number(kpis.teamsSentPlan) })} />
      <MetricTile
        label={t("people")}
        value={format.number(kpis.people)}
        hint={kpis.joinedThisQuarter === null || kpis.onLeave === null ? undefined : t("peopleHint", { joined: format.number(kpis.joinedThisQuarter), leave: format.number(kpis.onLeave) })}
      />
      <MetricTile
        label={t("goals")}
        value={kpis.goals === null ? "—" : kpis.goalsOnPace === null ? format.number(kpis.goals) : `${format.number(kpis.goalsOnPace)}/${format.number(kpis.goals)}`}
        hint={
          kpis.goals === null
            ? t("notAvailable")
            : kpis.goalsOnPace !== null
              ? t("goalsHint", { quarter: data.portfolio.quarter.split(" ")[0] ?? "" })
              : kpis.goalsProgress != null
                ? t("goalsProgress", { percent: format.percent(kpis.goalsProgress) })
                : undefined
        }
      />
      {capabilities.modules.approvals ? (
        <MetricTile
          label={t("approvals")}
          value={format.number(kpis.approvalsForMe)}
          hint={kpis.approvalsForMe > 0 ? t("approvalsHint", { n: format.number(kpis.oldestWaitingDays ?? 0) }) : t("approvalsNone")}
        />
      ) : null}
    </MetricGroup>
  );
}

function OverviewTabs({ data }: { data: CompanyOverview }) {
  const t = useTranslations("Company.overview.tabs");
  const tMonths = useTranslations("Company.months");
  const { company, departmentId } = useCompany();
  const format = useCompanyFormat(company.currency);
  const projects = useCompanyProjects(company.id, company.role);
  const goals = useCompanyGoals(company.id);
  const capacity = useCapacity(company.id, true);
  const scopedProjects = (projects.data ?? []).filter((item) => departmentId === null || item.departmentId === departmentId);
  const scopedGoals = (goals.data ?? []).filter((goal) => departmentId === null || goal.departmentId === departmentId || goal.level === "company");
  const capacityRows = (capacity.data?.rows ?? []).filter((row) => departmentId === null || row.departmentId === departmentId);

  return (
    <FolderTabsCard
      label={t("label")}
      defaultValue="departments"
      tabs={[
        {
          value: "departments",
          label: t("departments"),
          count: format.number(data.departments.length),
          content: (
            <div className="flex flex-col gap-1">
              <ul className="flex flex-col divide-y divide-line">
                {data.departments.map((row) => (
                  <DepartmentRow key={row.departmentId} row={row} />
                ))}
              </ul>
              <p className="pt-2 text-xs text-fg-muted">{t("departmentsSource")}</p>
            </div>
          ),
        },
        {
          value: "portfolio",
          label: t("portfolio"),
          count: format.number(scopedProjects.length),
          content: (
            <ul className="flex flex-col divide-y divide-line">
              {scopedProjects.map((project) => (
                <li key={project.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_3rem_auto]">
                  <Link href={`/projects/${project.id}`} className="truncate text-sm font-bold text-fg hover:underline">
                    <bdi>{project.name}</bdi>
                  </Link>
                  <Progress value={project.progress ?? 0} label={project.name} size="sm" className="max-sm:hidden" />
                  <span className="text-xs font-semibold tabular text-fg-secondary max-sm:hidden">{project.progress === null ? "—" : format.percent(project.progress)}</span>
                  <ProjectStatusChip health={project.health} lifecycle="active" />
                </li>
              ))}
            </ul>
          ),
        },
        {
          value: "goals",
          label: t("goals"),
          count: format.number(scopedGoals.length),
          content: (
            <ul className="flex flex-col divide-y divide-line">
              {scopedGoals.map((goal) => (
                <li key={goal.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_3rem_auto]">
                  <Link href={`${companyHref(company.id, "goals")}?goal=${goal.id}`} className="truncate text-sm font-bold text-fg hover:underline">
                    <bdi>{goal.title}</bdi>
                  </Link>
                  <Progress value={goal.progress} label={goal.title} size="sm" className="max-sm:hidden" />
                  <span className="text-xs font-semibold tabular text-fg-secondary max-sm:hidden">{format.percent(goal.progress)}</span>
                  <StatusChip tone={goal.onPace ? "success" : "warning"}>{goal.onPace ? t("onPace") : t("behind")}</StatusChip>
                </li>
              ))}
            </ul>
          ),
        },
        {
          value: "capacity",
          label: t("capacity"),
          count: format.number(data.kpis.people),
          content: (
            <div className="flex flex-col gap-1">
              <ul className="flex flex-col divide-y divide-line">
                {capacityRows.map((row) => {
                  const value = row.values[0] ?? 0;
                  return (
                    <li key={row.departmentId} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_3.5rem] items-center gap-3 py-2.5">
                      <bdi className="truncate text-sm font-bold text-fg">{row.name}</bdi>
                      <Progress value={Math.min(100, value)} label={row.name} size="sm" indicatorClassName={value > 100 ? "bg-danger" : undefined} />
                      <span className={cn("text-xs font-bold tabular", value > 90 ? "text-danger-text" : "text-fg-secondary")}>{format.percent(value)}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="pt-2 text-xs text-fg-muted">{t("capacitySource", { month: capacity.data ? tMonths(String(capacity.data.months[0]) as "1") : "" })}</p>
            </div>
          ),
        },
      ]}
    />
  );
}

function DepartmentRow({ row }: { row: DepartmentProgressRow }) {
  const t = useTranslations("Company.overview.tabs");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const tone = row.status === "on-track" ? "success" : row.status === "off-track" ? "danger" : row.status === null ? "neutral" : "warning";
  const label = row.status === null ? null : row.status === "watch" ? t("watch") : row.status === "on-track" ? t("onTrack") : row.status === "at-risk" ? t("atRisk") : t("offTrack");
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)_3rem_auto_5rem]">
      <bdi className="truncate text-sm font-bold text-fg">{row.name}</bdi>
      <Progress value={row.progress ?? 0} label={row.name} size="sm" className="max-sm:order-last max-sm:col-span-2" />
      <span className="text-xs font-semibold tabular text-fg-secondary max-sm:hidden">{row.progress === null ? "—" : format.percent(row.progress)}</span>
      {label === null ? <span aria-hidden="true" /> : <StatusChip tone={tone}>{label}</StatusChip>}
      <span className={cn("text-xs font-bold tabular max-sm:hidden", row.capacity !== null && row.capacity > 90 ? "text-danger-text" : "text-fg-secondary")}>
        {row.capacity === null ? "—" : t("cap", { percent: format.percent(row.capacity) })}
      </span>
    </li>
  );
}

function BudgetCard({ budget }: { budget: BudgetSummary }) {
  const t = useTranslations("Company.overview.budget");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const pct = (value: number) => (budget.budget > 0 ? Math.min(100, (value / budget.budget) * 100) : 0);
  return (
    <ProductCard as="section" aria-labelledby="budget-title" className="gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="budget-title" className="type-title text-fg">
          {t("title", { quarter: budget.quarter })}
        </h2>
        <span className="text-xs font-semibold text-fg-secondary">{t("unit", { currency: format.unit })}</span>
      </div>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-4xl font-semibold tabular text-fg">{format.short(budget.approved)}</span>
        <span className="text-sm text-fg-secondary">
          {t("of", { budget: format.short(budget.budget), committed: format.short(budget.committed) })}
        </span>
      </p>
      <div
        role="img"
        aria-label={t("bar", { approved: format.money(budget.approved), committed: format.money(budget.committed), left: format.money(budget.left) })}
        className="flex h-2.5 w-full overflow-hidden rounded-pill bg-subtle"
      >
        <span className="h-full bg-scope-deep" style={{ width: `${pct(budget.approved)}%` }} />
        <span
          className="h-full bg-[repeating-linear-gradient(135deg,var(--scope-dot)_0_4px,transparent_4px_8px)]"
          style={{ width: `${pct(budget.committed)}%` }}
        />
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-fg">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-sm bg-scope-deep" />
          {t("approved", { amount: format.short(budget.approved) })}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-sm bg-scope-dot" />
          {t("committed", { amount: format.short(budget.committed) })}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-sm bg-subtle inset-ring inset-ring-line" />
          {t("left", { amount: format.short(budget.left) })}
        </li>
      </ul>
      {budget.pending === null ? null : <p className="text-xs text-fg-secondary">{t("pendingNote", { amount: format.short(budget.pending) })}</p>}
    </ProductCard>
  );
}

function ApprovalsForMe() {
  const t = useTranslations("Company.overview.approvals");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const approvals = useApprovals(company.id);
  const mine = (approvals.data ?? []).filter((item) => item.forMe && item.status === "pending");
  return (
    <ProductCard as="section" aria-labelledby="approvals-title" className="gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="approvals-title" className="type-title text-fg">
          {t("title")}
        </h2>
        <Link href={companyHref(company.id, "approvals")} className="text-xs font-bold text-scope-deep hover:underline">
          {t("pending", { n: format.number(mine.length) })}
        </Link>
      </div>
      {mine.length === 0 ? (
        <EmptyState title={t("empty")} size="compact" />
      ) : (
        <ul className="flex flex-col gap-2">
          {mine.slice(0, 3).map((item) => (
            <ApprovalRow key={item.id} item={item} money={format.money} />
          ))}
        </ul>
      )}
    </ProductCard>
  );
}

function ApprovalRow({ item, money }: { item: Approval; money: (value: number) => string }) {
  const t = useTranslations("Company.overview.approvals");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  return (
    <li className="flex items-center gap-3 rounded-row bg-subtle px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col">
        <bdi className="truncate text-sm font-bold text-fg">{item.title}</bdi>
        <span className="truncate text-xs text-fg-secondary">
          <bdi>{item.departmentName}</bdi> · {item.amount !== null ? <span className="tabular">{money(item.amount)}</span> : item.amountNote}
          {item.amount !== null && item.amountNote ? ` · ${item.amountNote}` : null}
        </span>
      </div>
      <span className="shrink-0 rounded-pill bg-warning-soft px-2.5 py-1 text-xs font-bold text-warning-text">
        {t("step", { n: format.number(item.currentStep) })}
      </span>
      <Link
        href={`${companyHref(company.id, "approvals")}/${item.id}`}
        className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "bg-surface")}
        aria-label={t("reviewItem", { item: item.title })}
      >
        {t("review")}
      </Link>
    </li>
  );
}
