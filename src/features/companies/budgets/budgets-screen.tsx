"use client";

import { Pencil, Plus, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { BudgetLine } from "@/data/company-domain";
import { useBudgets, useCompanyMutation } from "@/data/company-queries";
import { RepositoryError } from "@/data/repositories";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { parseLocalizedNumber } from "@/lib/locale/digits";
import { cn } from "@/lib/cn";
import { useCompany, useCompanyWritable } from "../company-gate";
import { CompanyPageHeader } from "../company-page-header";
import { useCompanyFormat } from "../format";

/*
 * CO-10 · Budgets & variance (/companies/[id]/budgets). Company →
 * department → budget lines; project budgets (Projects tab) are allocations
 * inside department lines. Approved (final approval) · Committed (approved
 * purchase not yet billed) · Left · Variance = budget − approved −
 * committed. Pending claims are shown separately, never counted. Stored
 * exact; tables show B with one decimal and the exact value in the tooltip.
 * Budget signature card: notch Request budget change → the "Budget change"
 * chain; history of versions per line. Not accounting: no ledger, tax or
 * invoicing. Owner / Org Admin see the company; a Dept Manager their own.
 */

type View = "department" | "project";

const usedOf = (line: BudgetLine) => line.approved + line.committed;
const variance = (line: BudgetLine) => line.budget - line.approved - line.committed;

export function BudgetsScreen() {
  const t = useTranslations("Company.budgets");
  const { company, capabilities, departmentId } = useCompany();
  const writable = useCompanyWritable();
  const budgets = useBudgets(company.id);
  const [view, setView] = useState<View>("department");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [changing, setChanging] = useState<BudgetLine | "pick" | null>(null);

  const header = (
    <CompanyPageHeader
      module="budgets"
      title={t("title")}
      scope
      titleExtra={<span className="text-sm font-bold text-fg-secondary">{t("quarter")}</span>}
      actions={
        <>
          <Segmented<View>
            label={t("view.label")}
            value={view}
            onValueChange={setView}
            options={[
              { value: "department", label: t("view.departments") },
              { value: "project", label: t("view.projects") },
            ]}
          />
          {capabilities.requestBudgetChange && writable ? (
            <Button variant="secondary" className="gap-2" onClick={() => setChanging("pick")}>
              <Icon icon={Plus} size={16} />
              {t("change")}
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (budgets.isError) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => void budgets.refetch()} />
      </>
    );
  }
  if (!budgets.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  // Company budgets for Owner / Org Admin; a Dept Manager sees their own department only.
  const permitted = budgets.data.filter((line) => capabilities.companyBudgets || capabilities.managedDepartmentIds.includes(line.departmentId));
  const scoped = permitted.filter((line) => departmentId === null || line.departmentId === departmentId);
  const rows = scoped.filter((line) => line.kind === view);
  const selected = rows.find((line) => line.id === selectedId) ?? rows.find((line) => variance(line) / line.budget < 0.1) ?? rows[0];

  if (permitted.length === 0) {
    return (
      <>
        {header}
        <EmptyState title={t("empty.title")} description={t("empty.body")} />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <BudgetTable rows={rows} view={view} selectedId={selected?.id} onSelect={setSelectedId} showTotal={capabilities.companyBudgets && departmentId === null} />
        {selected ? (
          <BudgetCard key={selected.id} line={selected} childLines={view === "department" ? scoped.filter((line) => line.kind === "project" && line.departmentId === selected.departmentId) : []} onChange={() => setChanging(selected)} />
        ) : null}
      </div>
      {changing ? <ChangeDialog lines={permitted} initial={changing === "pick" ? null : changing} onClose={() => setChanging(null)} /> : null}
    </>
  );
}

function Bar({ line, label }: { line: BudgetLine; label: string }) {
  const pct = (value: number) => Math.min(100, (value / line.budget) * 100);
  return (
    <div role="img" aria-label={label} className="flex h-2.5 w-full overflow-hidden rounded-pill bg-subtle">
      <span className="h-full bg-scope-deep" style={{ width: `${pct(line.approved)}%` }} />
      <span
        className="h-full bg-[repeating-linear-gradient(135deg,var(--scope-dot)_0_4px,transparent_4px_8px)]"
        style={{ width: `${Math.max(0, Math.min(100 - pct(line.approved), pct(line.committed)))}%` }}
      />
    </div>
  );
}

function BudgetTable({
  rows,
  view,
  selectedId,
  onSelect,
  showTotal,
}: {
  rows: BudgetLine[];
  view: View;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  showTotal: boolean;
}) {
  const t = useTranslations("Company.budgets");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const sum = (pick: (line: BudgetLine) => number) => rows.reduce((total, line) => total + pick(line), 0);
  const cell = (value: number, className?: string) => (
    <td className={cn("py-3 pe-3 text-end text-xs font-bold tabular", className)} title={format.money(value)}>
      {format.short(value)}
    </td>
  );
  const varianceCell = (value: number) =>
    cell(value, value < 0 ? "text-danger-text" : value > 0 ? "text-success-text" : "text-fg");
  return (
    <ProductCard as="section" aria-label={t("tableLabel")} className="gap-3 overflow-x-auto">
      <table className="w-full min-w-[44rem] text-sm">
        <caption className="sr-only">{t("tableLabel")}</caption>
        <thead className="text-xs font-semibold text-fg-muted">
          <tr>
            <th scope="col" className="pb-2 text-start font-semibold">
              {view === "department" ? t("col.department") : t("col.project")}
            </th>
            <th scope="col" className="w-48 pb-2 text-start font-semibold">
              {t("col.bar")}
            </th>
            {(["budget", "approved", "committed", "variance", "pending"] as const).map((key) => (
              <th key={key} scope="col" className="pb-2 pe-3 text-end font-semibold">
                {t(`col.${key}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((line) => {
            const selected = line.id === selectedId;
            return (
              <tr key={line.id} aria-selected={selected} className={cn("border-t border-line", selected && "bg-scope-soft/50 outline-[1.5px] -outline-offset-[1.5px] outline-scope-deep")}>
                <th scope="row" className="py-3 pe-3 text-start">
                  <button type="button" onClick={() => onSelect(line.id)} className="flex min-h-10 flex-col justify-center text-start">
                    <bdi className="text-sm font-bold text-fg">{line.name}</bdi>
                    {line.kind === "project" ? <bdi className="text-xs font-medium text-fg-secondary">{line.departmentName}</bdi> : null}
                  </button>
                </th>
                <td className="py-3 pe-3">
                  <Bar
                    line={line}
                    label={t("barLabel", { approved: format.money(line.approved), committed: format.money(line.committed), budget: format.money(line.budget) })}
                  />
                </td>
                {cell(line.budget)}
                {cell(line.approved)}
                {cell(line.committed)}
                {varianceCell(variance(line))}
                {cell(line.pending, "text-fg-secondary font-semibold")}
              </tr>
            );
          })}
          {showTotal && view === "department" ? (
            <tr className="border-t-2 border-line">
              <th scope="row" className="py-3 pe-3 text-start text-sm font-bold text-fg">
                <bdi>{company.name}</bdi>
              </th>
              <td />
              {cell(sum((line) => line.budget))}
              {cell(sum((line) => line.approved))}
              {cell(sum((line) => line.committed))}
              {varianceCell(sum(variance))}
              {cell(sum((line) => line.pending), "text-fg-secondary font-semibold")}
            </tr>
          ) : null}
        </tbody>
      </table>
      <p className="text-xs text-fg-muted">{t("footnote")}</p>
    </ProductCard>
  );
}

function BudgetCard({ line, childLines: children, onChange }: { line: BudgetLine; childLines: BudgetLine[]; onChange: () => void }) {
  const t = useTranslations("Company.budgets.card");
  const { company, capabilities } = useCompany();
  const writable = useCompanyWritable();
  const format = useCompanyFormat(company.currency);
  const left = variance(line);
  const near = left / line.budget < 0.1;
  const over = children.filter((child) => usedOf(child) > child.budget);
  const action = (
    <SignatureCardAction
      icon={Pencil}
      label={t("request")}
      disabled={!writable || !capabilities.requestBudgetChange || line.changeRequest !== null}
      onClick={onChange}
    />
  );
  return (
    <SignatureCard as="section" aria-labelledby="budget-card-title" action={action} contentClassName="gap-3" className="self-start">
      <div className="flex flex-col gap-1">
        <p className={cn("text-xs font-bold tracking-wide uppercase", near || left < 0 ? "text-danger-text" : "text-scope-deep")}>
          {t("kicker", { name: line.name })}
          {left < 0 ? ` · ${t("over")}` : near ? ` · ${t("nearLimit")}` : null}
        </p>
        <h2 id="budget-card-title" className="type-title text-fg">
          {left < 0 ? t("overBy", { amount: format.short(-left) }) : t("leftOf", { left: format.short(left), budget: format.short(line.budget) })}
        </h2>
        <p className="text-xs font-semibold text-fg-secondary">
          {line.kind === "department" ? t("lines", { n: format.number(children.length) }) : t("allocation", { department: line.departmentName })}
        </p>
      </div>
      {children.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {children.map((child) => {
            const isOver = usedOf(child) > child.budget;
            return (
              <li key={child.id} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-3">
                <bdi className="truncate text-xs font-semibold text-fg">{child.name}</bdi>
                <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-pill bg-subtle">
                  <span className={cn("block h-full rounded-pill", isOver ? "bg-danger" : "bg-scope-deep")} style={{ width: `${Math.min(100, (usedOf(child) / child.budget) * 100)}%` }} />
                </span>
                <span className={cn("text-xs font-bold tabular", isOver ? "text-danger-text" : "text-fg")}>
                  {format.short(usedOf(child))} / {format.short(child.budget)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <Bar line={line} label={t("used", { used: format.money(usedOf(line)), budget: format.money(line.budget) })} />
      )}
      {over.map((child) => (
        <p key={child.id} className="flex items-center gap-2 rounded-row bg-danger-soft px-3 py-2 text-xs font-semibold text-danger-text">
          <Icon icon={Zap} size={14} className="shrink-0" />
          {t("lineOver", { name: child.name, amount: format.short(usedOf(child) - child.budget) })}
        </p>
      ))}
      {line.changeRequest ? <InlineAlert tone="info" title={t("pendingChange", { amount: format.money(line.changeRequest.amount) })} /> : null}
      <p className="text-xs text-fg-secondary">{t("pendingNote", { amount: format.money(line.pending) })}</p>
      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-bold tracking-wide text-fg-secondary uppercase">{t("versions")}</h3>
        <ul className="flex flex-col gap-1">
          {line.versions.map((version) => (
            <li key={version.version} className="flex items-center gap-2 text-xs text-fg">
              <span className="rounded-pill px-2 py-0.5 font-bold inset-ring inset-ring-outline">v{version.version}</span>
              <span className="tabular">{format.money(version.budget)}</span>
              <span className="min-w-0 flex-1 truncate text-fg-secondary">
                <bdi>{version.note}</bdi> · {format.day(version.at.slice(0, 10))}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-fg-muted">{t("overNote")}</p>
    </SignatureCard>
  );
}

function ChangeDialog({ lines, initial, onClose }: { lines: BudgetLine[]; initial: BudgetLine | null; onClose: () => void }) {
  const t = useTranslations("Company.budgets.dialog");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const [lineId, setLineId] = useState(initial?.id ?? "");
  const [amount, setAmount] = useState(initial ? format.amount(initial.budget) : "");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const request = useCompanyMutation(company.id, (repo, id, vars: { lineId: string; amount: number; reason: string }) =>
    repo.requestBudgetChange(id, vars.lineId, vars.amount, vars.reason),
  );
  const parsed = parseLocalizedNumber(amount.replace(/[\s٬,]/g, ""));
  const valid = parsed !== null && Number.isInteger(parsed) && parsed > 0;
  const line = lines.find((item) => item.id === lineId);
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("title")} description={t("description")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (!lineId || !valid || !reason.trim()) return;
            request.mutate(
              { lineId, amount: parsed!, reason },
              {
                onSuccess: () => {
                  toast({ title: t("sent"), description: t("sentBody") });
                  onClose();
                },
              },
            );
          }}
        >
          <Field invalid={touched && !lineId}>
            <FieldLabel>{t("line")}</FieldLabel>
            <Select value={lineId} onValueChange={setLineId} placeholder={t("choose")}>
              {lines
                .filter((item) => item.changeRequest === null)
                .map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
            </Select>
            {touched && !lineId ? <FieldError>{t("lineRequired")}</FieldError> : null}
          </Field>
          {line ? <p className="-mt-2 text-xs text-fg-secondary">{t("current", { amount: format.money(line.budget) })}</p> : null}
          <Field invalid={touched && !valid}>
            <FieldLabel>{t("amount", { unit: format.unit })}</FieldLabel>
            <Input dir="ltr" inputMode="numeric" className="tabular" value={amount} onChange={(event) => setAmount(event.target.value)} />
            {touched && !valid ? <FieldError>{t("amountInvalid")}</FieldError> : null}
          </Field>
          <Field invalid={touched && !reason.trim()}>
            <FieldLabel>{t("reason")}</FieldLabel>
            <Textarea dir="auto" value={reason} onChange={(event) => setReason(event.target.value)} />
            {touched && !reason.trim() ? <FieldError>{t("reasonRequired")}</FieldError> : null}
          </Field>
          {request.isError ? (
            <InlineAlert tone="danger" title={request.error instanceof RepositoryError && request.error.code === "conflict" ? t("alreadyPending") : t("failed")} />
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={request.isPending}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
