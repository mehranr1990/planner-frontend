"use client";

import { Download, FileChartColumn, FolderKanban, Gauge, Target, UserRound, Wallet, CreditCard, type LucideIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PillGroup } from "@/components/ui/pills";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import type { AuditRow, CompanyExport, CompanyReport, CompanyReportId } from "@/data/company-domain";
import { useAuditLog, useCompanyExports, useCompanyMutation, useCompanyReports } from "@/data/company-queries";
import { StatusChip } from "@/design-system/feedback/status-chip";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { cn } from "@/lib/cn";
import { useCompany } from "../company-gate";
import { CompanyPageHeader } from "../company-page-header";
import { useCompanyFormat } from "../format";

/*
 * CO-13 · Reports, exports, audit (/companies/[id]/reports?tab=reports ·
 * exports · audit). A fixed report set (portfolio, capacity, expenses,
 * budget variance, goals, headcount) with source captions and plain bars
 * with a "View as table" toggle. No people ranking: department aggregates
 * only. Members see their department's portfolio and goals; company
 * reports (expenses, variance, headcount) are Owner / Org Admin. Exports
 * are generated server-side from what the requester may see, watermarked,
 * logged, and expire in 24 h. The audit log (Owner / Org Admin / Security
 * reviewer) is read-only, filterable and exportable. The department scope
 * narrows, never widens.
 */

type Tab = "reports" | "exports" | "audit";
/** Live mode: a synchronous export arrives with its content; save it once (Mock Mode has none). */
function saveExportFile(item: CompanyExport) {
  if (!item.file) return;
  const url = URL.createObjectURL(item.file.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = item.file.name;
  link.click();
  URL.revokeObjectURL(url);
}

type AuditFilter = "all" | NonNullable<AuditRow["kind"]>;

const REPORT_ICON: Record<Exclude<CompanyReportId, "audit">, LucideIcon> = {
  portfolio: FolderKanban,
  capacity: UserRound,
  expenses: Wallet,
  variance: CreditCard,
  goals: Target,
  headcount: Gauge,
};

export function ReportsScreen() {
  const t = useTranslations("Company.reports");
  const { capabilities } = useCompany();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // Exports: Owner, Org Admin and Dept Manager (SPEC permissions).
  const canExport = capabilities.export || capabilities.managedDepartmentIds.length > 0;
  const raw = params.get("tab");
  const tab: Tab = raw === "exports" && canExport ? "exports" : raw === "audit" && capabilities.auditLog ? "audit" : "reports";
  const setTab = (next: Tab) => {
    const search = new URLSearchParams(params.toString());
    search.set("tab", next);
    router.replace(`${pathname}?${search.toString()}`, { scroll: false });
  };
  return (
    <>
      <CompanyPageHeader
        module="reports"
        title={t("title")}
        scope
        actions={
          <Segmented<Tab>
            label={t("tabs.label")}
            value={tab}
            onValueChange={setTab}
            options={[
              { value: "reports", label: t("tabs.reports") },
              ...(canExport ? [{ value: "exports" as const, label: t("tabs.exports") }] : []),
              ...(capabilities.auditLog ? [{ value: "audit" as const, label: t("tabs.audit") }] : []),
            ]}
          />
        }
      />
      {tab === "reports" ? <Reports canExport={canExport} /> : null}
      {tab === "exports" ? <Exports /> : null}
      {tab === "audit" ? <Audit /> : null}
    </>
  );
}

function Reports({ canExport }: { canExport: boolean }) {
  const t = useTranslations("Company.reports");
  const { company, capabilities, departmentId, myDepartmentIds } = useCompany();
  // Dept-scoped roles: their own department only (narrows, never widens).
  const scope = capabilities.allDepartments ? departmentId : (departmentId ?? myDepartmentIds[0] ?? null);
  const reports = useCompanyReports(company.id, scope);
  const exportReport = useCompanyMutation(company.id, (repo, id, report: CompanyReportId) => repo.requestExport(id, report, "csv"));
  const [openId, setOpenId] = useState<CompanyReportId>("portfolio");
  if (reports.isError) return <ErrorState onRetry={() => void reports.refetch()} />;
  if (!reports.data) return <AccessLoading />;
  // Members: portfolio + goals of their department; Team Lead+: department reports; Owner / Org Admin: company reports too.
  const allowed = reports.data.filter((report) =>
    report.scope === "company" ? capabilities.companyReports : capabilities.departmentReports || report.id === "portfolio" || report.id === "goals",
  );
  if (allowed.length === 0 || allowed.every((report) => report.series.every((point) => point.value === 0))) {
    return <EmptyState icon={FileChartColumn} title={t("empty.title")} description={t("empty.body")} />;
  }
  const open = allowed.find((report) => report.id === openId) ?? allowed[0]!;
  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {allowed.map((report) => {
          const id = report.id as Exclude<CompanyReportId, "audit">;
          return (
            <li key={report.id}>
              <ProductCard
                as="article"
                aria-labelledby={`report-${report.id}`}
                className={cn("h-full gap-3", open.id === report.id && "inset-ring-[1.5px] inset-ring-scope-deep")}
              >
                <span aria-hidden="true" className="inline-flex size-10 items-center justify-center rounded-full bg-scope-soft text-scope-deep">
                  <Icon icon={REPORT_ICON[id]} size={18} />
                </span>
                <div className="flex flex-col gap-0.5">
                  <h2 id={`report-${report.id}`} className="type-title text-fg">
                    {t(`report.${id}.title`)}
                  </h2>
                  <p className="text-xs text-fg-secondary">{t(`report.${id}.body`)}</p>
                </div>
                <div className="mt-auto flex gap-2">
                  <Button size="sm" variant="ghost" aria-pressed={open.id === report.id} onClick={() => setOpenId(report.id)}>
                    {t("open")}
                  </Button>
                  {canExport ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={exportReport.isPending}
                      aria-label={t("csvLabel", { report: t(`report.${id}.title`) })}
                      onClick={() =>
                        exportReport.mutate(report.id, {
                          onSuccess: (result) => {
                            saveExportFile(result);
                            toast({ title: t("exported"), description: t("exportedBody") });
                          },
                        })
                      }
                    >
                      <Icon icon={Download} size={14} />
                      {t("csv")}
                    </Button>
                  ) : null}
                </div>
              </ProductCard>
            </li>
          );
        })}
      </ul>
      <ReportView key={open.id} report={open} />
    </>
  );
}

function ReportView({ report }: { report: CompanyReport }) {
  const t = useTranslations("Company.reports");
  const tCategory = useTranslations("Company.expenses.category");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const [table, setTable] = useState(false);
  const id = report.id as Exclude<CompanyReportId, "audit">;
  const money = id === "expenses";
  const percent = id === "capacity" || id === "variance" || id === "goals";
  const label = (value: string) => (id === "expenses" ? tCategory(value as "travel") : id === "portfolio" ? t(`portfolio.${value === "On track" ? "onTrack" : value === "At risk" ? "atRisk" : "offTrack"}`) : value);
  const show = (value: number) => (money ? format.short(value) : percent ? format.percent(value) : format.number(value));
  const max = Math.max(1, ...report.series.map((point) => point.value));
  const total = report.series.reduce((sum, point) => sum + point.value, 0);
  return (
    <ProductCard as="section" aria-labelledby="report-view" className="gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="report-view" className="type-title text-fg">
          {t(`report.${id}.title`)} · Q4
        </h2>
        <span className="text-xs font-semibold text-fg-secondary">
          {money ? `${format.money(total)} · ` : null}
          {t("source", { source: report.source })}
        </span>
      </div>
      <Switch checked={table} onCheckedChange={setTable} label={t("viewTable")} />
      {table ? (
        <table className="w-full text-sm">
          <caption className="sr-only">{t(`report.${id}.title`)}</caption>
          <thead className="text-xs font-semibold text-fg-muted">
            <tr>
              <th scope="col" className="pb-2 text-start font-semibold">
                {t("item")}
              </th>
              <th scope="col" className="pb-2 text-end font-semibold">
                {t("value")}
              </th>
            </tr>
          </thead>
          <tbody>
            {report.series.map((point) => (
              <tr key={point.label} className="border-t border-line">
                <th scope="row" className="py-2 text-start font-semibold text-fg">
                  <bdi>{label(point.label)}</bdi>
                </th>
                <td className="py-2 text-end tabular text-fg">{money ? format.money(point.value) : show(point.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="flex flex-col gap-2" aria-label={t(`report.${id}.title`)}>
          {report.series.map((point) => (
            <li key={point.label} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_4rem] items-center gap-3">
              <bdi className="truncate text-xs font-semibold text-fg">{label(point.label)}</bdi>
              <span aria-hidden="true" className="h-2.5 overflow-hidden rounded-pill bg-subtle">
                <span className="block h-full rounded-pill bg-scope-deep" style={{ width: `${Math.min(100, (point.value / (percent ? 100 : max)) * 100)}%` }} />
              </span>
              <span className="text-end text-xs font-bold tabular text-fg">{show(point.value)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-fg-muted">{t("scopeNote")}</p>
    </ProductCard>
  );
}

function Exports() {
  const t = useTranslations("Company.reports.exports");
  const tReports = useTranslations("Company.reports");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const exportsQuery = useCompanyExports(company.id, true);
  if (!exportsQuery.data) return <AccessLoading />;
  return (
    <ProductCard as="section" aria-label={t("title")} className="gap-3">
      <p className="rounded-row bg-subtle px-3 py-2 text-xs text-fg">{t("rules")}</p>
      {exportsQuery.data.length === 0 ? (
        <EmptyState title={t("empty")} size="compact" />
      ) : (
        <ul className="flex flex-col gap-2">
          {exportsQuery.data.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-row px-3 py-2.5 inset-ring inset-ring-line">
              <Icon icon={Download} size={15} className="shrink-0 text-fg-secondary" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-bold text-fg">
                  {item.report === null ? format.day(item.requestedAt.slice(0, 10)) : item.report === "audit" ? t("auditName") : tReports(`report.${item.report}.title`)}
                  {item.format ? ` · ${item.format.toUpperCase()}` : null}
                </span>
                {item.watermark ? <span className="text-xs text-fg-secondary">{t("watermark", { watermark: item.watermark })}</span> : null}
              </div>
              <StatusChip tone={item.status === "ready" ? "success" : "neutral"}>{t(`status.${item.status}`)}</StatusChip>
              {item.status === "ready" && item.expiresAt ? (
                <Button size="sm" variant="secondary" onClick={() => toast({ title: t("downloaded"), description: t("expires", { date: format.day(item.expiresAt!.slice(0, 10)) }) })}>
                  {t("download")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </ProductCard>
  );
}

function Audit() {
  const t = useTranslations("Company.reports.audit");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const audit = useAuditLog(company.id, true);
  const exportAudit = useCompanyMutation(company.id, (repo, id) => repo.requestExport(id, "audit", "csv"));
  const [filter, setFilter] = useState<AuditFilter>("all");
  if (!audit.data) return <AccessLoading />;
  const rows = audit.data.filter((row) => filter === "all" || row.kind === filter);
  return (
    <ProductCard as="section" aria-label={t("title")} className="gap-3 overflow-x-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PillGroup<AuditFilter>
          label={t("filter")}
          value={filter}
          onValueChange={setFilter}
          options={(["all", "file", "approval", "policy", "export", "ownership"] as const).map((key) => ({
            value: key,
            label: t(`kind.${key}`),
            count: key === "all" ? audit.data!.length : audit.data!.filter((row) => row.kind === key).length,
          }))}
        />
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={exportAudit.isPending}
          onClick={() =>
            exportAudit.mutate(undefined, {
              onSuccess: (result) => {
                saveExportFile(result);
                toast({ title: t("exported") });
              },
            })
          }
        >
          <Icon icon={Download} size={14} />
          {t("export")}
        </Button>
      </div>
      <table className="w-full min-w-[36rem] text-sm">
        <caption className="sr-only">{t("title")}</caption>
        <thead className="text-xs font-semibold text-fg-muted">
          <tr>
            {(["when", "who", "action", "subject"] as const).map((key) => (
              <th key={key} scope="col" className="pb-2 text-start font-semibold">
                {t(`col.${key}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-line">
              <td className="py-2.5 pe-3 text-xs text-fg-secondary">
                {format.day(row.at.slice(0, 10))}{" "}
                <span dir="ltr" className="tabular">
                  {format.number(Number(row.at.slice(11, 13)))}:{row.at.slice(14, 16).replace(/\d/g, (digit) => format.number(Number(digit)))}
                </span>
              </td>
              <td className="py-2.5 pe-3 text-fg">
                <bdi>{row.who}</bdi>
              </td>
              <td className="py-2.5 pe-3 text-fg">
                <bdi>{row.action}</bdi>
              </td>
              <td className="py-2.5 text-fg">
                <bdi>{row.subject}</bdi>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-fg-muted">{t("note")}</p>
    </ProductCard>
  );
}
