"use client";

import { ArrowRight, Check, Clock, FileText, Pencil, Plus, Undo2, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PillGroup } from "@/components/ui/pills";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import type { Approval, Expense, ExpenseStatus } from "@/data/company-domain";
import { useApprovals, useBudgets, useCompanyMutation, useExpenses } from "@/data/company-queries";
import { StatusChip } from "@/design-system/feedback/status-chip";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { companyHref } from "@/features/navigation/contexts";
import { cn } from "@/lib/cn";
import { useCompany, useCompanyWritable } from "../company-gate";
import { CompanyPageHeader } from "../company-page-header";
import { useCompanyFormat } from "../format";
import { useOpenCompanySheet } from "../sheets/company-sheet-params";

/*
 * CO-08 · Expenses (/companies/[id]/expenses). Exact integer amounts in the
 * company currency with tabular digits; statuses Draft → Pending (step n) →
 * Approved / Rejected / Changes requested (approved ≠ paid); receipt or
 * "missing"; who paid. Owner / Org Admin see all, a Dept Manager their
 * department, everyone else their own ("Mine"). Detail signature card:
 * notch Open approval for reviewers; the author gets Edit (draft / changes
 * requested → the sheet) or Withdraw (pending). Approved expenses count in
 * the department budget, pending ones never do. Nothing is written to
 * Personal Finance. Reimbursements tab = CO-11.
 */

type View = "all" | "mine";
type Filter = "all" | "pending" | "approved" | "changes" | "rejected" | "draft";

const STATUS_TONE: Record<ExpenseStatus, "success" | "warning" | "danger" | "neutral" | "info"> = {
  draft: "neutral",
  pending: "warning",
  approved: "success",
  rejected: "danger",
  changes: "warning",
  withdrawn: "neutral",
};

export function ExpensesScreen() {
  const t = useTranslations("Company.expenses");
  const { company, capabilities, me, departmentId } = useCompany();
  const writable = useCompanyWritable();
  const expenses = useExpenses(company.id);
  const openSheet = useOpenCompanySheet();
  const router = useRouter();
  const seesOthers = capabilities.seeAllExpenses || capabilities.managedDepartmentIds.length > 0;
  const [view, setView] = useState<View>(seesOthers ? "all" : "mine");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const header = (
    <CompanyPageHeader
      module="expenses"
      title={t("title")}
      scope
      actions={
        <>
          <Segmented<View | "reimbursements">
            label={t("view.label")}
            value={view}
            onValueChange={(value) => (value === "reimbursements" ? router.push(`${companyHref(company.id, "expenses")}/reimbursements`) : setView(value))}
            options={[
              ...(seesOthers ? [{ value: "all" as const, label: t("view.all") }] : []),
              { value: "mine", label: t("view.mine") },
              { value: "reimbursements", label: t("view.reimbursements") },
            ]}
          />
          {capabilities.createExpense && writable ? (
            <Button className="gap-2" onClick={() => openSheet("expense-new")}>
              <Icon icon={Plus} size={16} />
              {t("new")}
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (expenses.isError) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => void expenses.refetch()} />
      </>
    );
  }
  if (!expenses.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  // Visibility (SPEC permissions) first, then the department scope, then the view.
  const visible = expenses.data.filter(
    (item) =>
      item.authorId === me.id ||
      (item.status !== "draft" && (capabilities.seeAllExpenses || capabilities.managedDepartmentIds.includes(item.departmentId))),
  );
  const scoped = visible.filter((item) => (departmentId === null || item.departmentId === departmentId) && item.status !== "withdrawn");
  const list = view === "mine" ? scoped.filter((item) => item.authorId === me.id) : scoped;
  const matches = (item: Expense, key: Filter) => key === "all" || item.status === key;
  const shown = list.filter((item) => matches(item, filter));
  const selected = shown.find((item) => item.id === selectedId) ?? shown[0];

  return (
    <>
      {header}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <ProductCard as="section" aria-label={t("listLabel")} className="gap-3">
          <PillGroup<Filter>
            label={t("filter")}
            value={filter}
            onValueChange={setFilter}
            options={(["all", "pending", "approved", "changes", "rejected", "draft"] as const).map((key) => ({
              value: key,
              label: t(`filters.${key}`),
              count: list.filter((item) => matches(item, key)).length,
            }))}
          />
          {shown.length === 0 ? (
            <EmptyState icon={Wallet} title={t("empty.title")} description={t("empty.body")} size="compact" />
          ) : (
            <ExpenseTable expenses={shown} selectedId={selected?.id} onSelect={setSelectedId} />
          )}
          {company.currency ? <p className="text-xs text-fg-muted">{t("footnote", { currency: t(`currencyName.${company.currency}`) })}</p> : null}
        </ProductCard>
        {selected ? <ExpenseCard key={selected.id} expense={selected} /> : null}
      </div>
    </>
  );
}

function StatusLabel({ expense }: { expense: Expense }) {
  const t = useTranslations("Company.expenses.status");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const label = expense.status === "pending" ? t("pendingStep", { n: format.number(expense.step ?? 1) }) : t(expense.status);
  return <StatusChip tone={STATUS_TONE[expense.status]}>{label}</StatusChip>;
}

function ExpenseTable({ expenses, selectedId, onSelect }: { expenses: Expense[]; selectedId: string | undefined; onSelect: (id: string) => void }) {
  const t = useTranslations("Company.expenses");
  const tCategory = useTranslations("Company.expenses.category");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <table className="w-full min-w-[38rem] text-sm">
        <caption className="sr-only">{t("listLabel")}</caption>
        <thead className="text-xs font-semibold text-fg-muted">
          <tr>
            <th scope="col" className="pb-2 text-start font-semibold">
              {t("col.expense")}
            </th>
            <th scope="col" className="pb-2 text-start font-semibold">
              {t("col.by")}
            </th>
            <th scope="col" className="pb-2 text-end font-semibold">
              {t("col.amount", { unit: format.unit })}
            </th>
            <th scope="col" className="pb-2 text-start font-semibold">
              {t("col.receipt")}
            </th>
            <th scope="col" className="pb-2 text-start font-semibold">
              {t("col.status")}
            </th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((expense) => {
            const selected = expense.id === selectedId;
            return (
              <tr
                key={expense.id}
                aria-selected={selected}
                className={cn("border-t border-line", selected && "bg-scope-soft/50 outline-[1.5px] -outline-offset-[1.5px] outline-scope-deep")}
              >
                <td className="py-2.5 pe-3">
                  <button type="button" onClick={() => onSelect(expense.id)} className="flex min-h-11 flex-col justify-center text-start">
                    <bdi className="font-bold text-fg">{expense.title}</bdi>
                    <span className="text-xs text-fg-secondary">
                      <bdi>{expense.departmentName}</bdi> · {tCategory(expense.category)}
                    </span>
                  </button>
                </td>
                <td className="py-2.5 pe-3">
                  <Avatar name={expense.authorName} size={32} tone="company" />
                </td>
                <td className="py-2.5 pe-3 text-end font-bold tabular text-fg">{format.amount(expense.amount)}</td>
                <td className="py-2.5 pe-3">
                  {expense.receipt ? (
                    <>
                      <Icon icon={FileText} size={15} className="text-success-text" />
                      <span className="sr-only">{t("receiptAttached")}</span>
                    </>
                  ) : (
                    <span className="rounded-pill bg-warning-soft px-2 py-0.5 text-xs font-bold text-warning-text">{t("missing")}</span>
                  )}
                </td>
                <td className="py-2.5">
                  <StatusLabel expense={expense} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ExpenseCard({ expense }: { expense: Expense }) {
  const t = useTranslations("Company.expenses.card");
  const tCategory = useTranslations("Company.expenses.category");
  const tExpenses = useTranslations("Company.expenses");
  const { company, me, capabilities } = useCompany();
  const writable = useCompanyWritable();
  const format = useCompanyFormat(company.currency);
  const approvals = useApprovals(company.id);
  const budgets = useBudgets(company.id, capabilities.budgetCard);
  const openSheet = useOpenCompanySheet();
  const router = useRouter();
  const withdraw = useCompanyMutation(company.id, (repo, id) => repo.withdrawExpense(id, expense.id));
  const approval = approvals.data?.find((item) => item.id === expense.approvalId);
  const own = expense.authorId === me.id;
  const steps = approval?.steps.filter((step) => step.state !== "skipped") ?? [];
  const line = budgets.data?.find((item) => item.kind === "department" && item.departmentId === expense.departmentId);
  const approvalHref = approval ? `${companyHref(company.id, "approvals")}/${approval.id}` : null;

  let action;
  if (own && writable && (expense.status === "draft" || expense.status === "changes")) {
    action = <SignatureCardAction icon={Pencil} label={t("edit")} onClick={() => openSheet("expense-new", { expense: expense.id })} />;
  } else if (own && writable && expense.status === "pending") {
    action = (
      <SignatureCardAction
        icon={Undo2}
        variant="neutral"
        label={t("withdraw")}
        disabled={withdraw.isPending}
        onClick={() => withdraw.mutate(undefined, { onSuccess: () => toast({ title: t("withdrawn") }) })}
      />
    );
  } else {
    action = (
      <SignatureCardAction
        icon={ArrowRight}
        mirror
        label={t("openApproval")}
        disabled={!approvalHref}
        onClick={() => (approvalHref ? router.push(approvalHref) : undefined)}
      />
    );
  }

  const kicker =
    expense.status === "pending"
      ? t("kickerPending", { n: format.number(expense.step ?? 1), total: format.number(Math.max(1, steps.length)) })
      : tExpenses(`status.${expense.status}`);

  return (
    <SignatureCard as="section" aria-labelledby="expense-title" action={action} contentClassName="gap-3" className="self-start">
      <div className="flex flex-col gap-1">
        <p
          className={cn(
            "text-xs font-bold tracking-wide uppercase",
            expense.status === "approved" ? "text-success-text" : expense.status === "rejected" ? "text-danger-text" : "text-warning-text",
          )}
        >
          {kicker}
        </p>
        <h2 id="expense-title" className="type-title text-fg">
          <bdi>{expense.title}</bdi>
        </h2>
        <p className="text-xs font-semibold text-fg-secondary">
          <bdi>{expense.authorName}</bdi> · <bdi>{expense.departmentName}</bdi> · {format.day(expense.date)}
        </p>
      </div>
      <p className="text-3xl font-semibold tabular text-fg">{format.money(expense.amount)}</p>
      {expense.status === "changes" && expense.changesNote ? (
        <InlineAlert
          tone="warning"
          title={t("changes")}
          description={
            <>
              <bdi>{expense.changesNote.by}</bdi>: <bdi>{expense.changesNote.text}</bdi>
            </>
          }
        />
      ) : null}
      <div className="flex items-center gap-3 rounded-row bg-subtle px-3 py-2.5">
        <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-tile bg-surface">
          <Icon icon={FileText} size={16} className="text-fg-secondary" />
        </span>
        <div className="flex min-w-0 flex-col">
          <bdi className="truncate text-sm font-bold text-fg">{expense.receipt?.name ?? t("noReceipt")}</bdi>
          <span className="text-xs text-fg-secondary">{expense.payer === "card" ? t("payerCard") : t("payerMe")}</span>
        </div>
      </div>
      <dl className="flex flex-col gap-1.5">
        {[
          [t("category"), tCategory(expense.category)],
          [t("budgetLine"), line ? t("budgetLineValue", { department: expense.departmentName }) : expense.departmentName],
          [t("project"), expense.projectName ?? t("departmentCost")],
          [t("paidBy"), expense.payer === "card" ? t("paidCard") : t("paidMe")],
        ].map(([label, value]) => (
          <div key={label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 rounded-row px-3 py-2 inset-ring inset-ring-line">
            <dt className="text-xs text-fg-secondary">{label}</dt>
            <dd className="truncate text-xs font-bold text-fg">
              <bdi>{value}</bdi>
            </dd>
          </div>
        ))}
      </dl>
      {approval ? <ApprovalTimeline approval={approval} submittedBy={expense.authorName} /> : null}
      <p className="text-xs text-fg-muted">{expense.status === "approved" ? t("approvedNote") : t("pendingNote")}</p>
      {approvalHref ? (
        <Link href={approvalHref} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "self-start")}>
          {t("viewApproval")}
        </Link>
      ) : null}
    </SignatureCard>
  );
}

export function ApprovalTimeline({ approval, submittedBy }: { approval: Approval; submittedBy: string }) {
  const t = useTranslations("Company.expenses.card");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  return (
    <section aria-label={t("approval")} className="flex flex-col gap-1">
      <h3 className="text-xs font-bold tracking-wide text-fg-secondary uppercase">{t("approval")}</h3>
      <ol className="flex flex-col">
        <li className="flex items-start gap-3 py-1.5">
          <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-text">
            <Icon icon={Check} size={14} />
          </span>
          <span className="flex flex-col">
            <span className="text-xs font-bold text-fg">{t("submitted")}</span>
            <span className="text-xs text-fg-secondary">
              <bdi>{submittedBy}</bdi> · {format.day(approval.submittedAt.slice(0, 10))}
            </span>
          </span>
        </li>
        {approval.steps
          .filter((step) => step.state !== "skipped")
          .map((step) => (
            <li key={step.stepId} className="flex items-start gap-3 py-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  "inline-flex size-7 shrink-0 items-center justify-center rounded-full",
                  step.state === "done" ? "bg-success-soft text-success-text" : step.state === "current" ? "bg-warning-soft text-warning-text" : "bg-subtle text-fg-muted",
                )}
              >
                <Icon icon={step.state === "done" ? Check : Clock} size={14} />
              </span>
              <span className="flex flex-col">
                <bdi className="text-xs font-bold text-fg">{step.label}</bdi>
                <span className="text-xs text-fg-secondary">
                  <bdi>{step.reviewerName ?? t("unassigned")}</bdi>
                  {" · "}
                  {step.decision
                    ? t(`decision.${step.decision.kind}`)
                    : step.state === "current"
                      ? t("waitingDays", { n: format.number(Math.max(0, format.daysFromToday(approval.submittedAt.slice(0, 10)) * -1)) })
                      : t("notYet")}
                </span>
              </span>
            </li>
          ))}
      </ol>
    </section>
  );
}
