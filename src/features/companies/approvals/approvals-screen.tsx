"use client";

import { ArrowLeft, ArrowRight, Check, Clock, CornerDownRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCompanyLabels } from "../labels";
import { useState } from "react";
import { CaseFlow, type CaseFlowColumn, type CaseFlowLink, type CaseFlowPerson, type CaseFlowRow } from "@/components/context/case-flow";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Avatar, getInitials } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useIsDesktop } from "@/components/ui/use-is-desktop";
import type { Approval, ApprovalDecisionKind, ApprovalStepState } from "@/data/company-domain";
import { useApprovalHistory, useApprovals, useBudgets, useCompanyMutation } from "@/data/company-queries";
import { RepositoryError } from "@/data/repositories";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { companyHref } from "@/features/navigation/contexts";
import { cn } from "@/lib/cn";
import { useCompany, useCompanyWritable } from "../company-gate";
import { CompanyPageHeader } from "../company-page-header";
import { useCompanyFormat } from "../format";

/*
 * CO-09 · Approvals (/companies/[id]/approvals[/approvalId]). Inbox For me
 * (current step = me) · I requested · History. Detail = the Approval
 * signature card (notch Approve; Reject needs a reason, Request changes a
 * comment), the sequential chain of the item's chain version with routing
 * (requester never approves their own item — the step goes to the next
 * eligible) and escalation; the grant is checked at decision time. Below
 * it the read-only CaseFlow "approval flow": one column per chain step,
 * outcome tiles = what happens after approval. Phones: list, then a
 * full-screen detail.
 */

type Tab = "for-me" | "mine" | "history";

export function ApprovalsScreen() {
  const t = useTranslations("Company.approvals");
  const { company, capabilities } = useCompany();
  const approvals = useApprovals(company.id);
  const pathname = usePathname();
  const router = useRouter();
  const desktop = useIsDesktop();
  const approvalId = /\/approvals\/([^/?#]+)/.exec(pathname)?.[1];
  const [tab, setTab] = useState<Tab>(capabilities.approve ? "for-me" : "mine");
  const format = useCompanyFormat(company.currency);

  const all = approvals.data ?? [];
  const forMe = all.filter((item) => item.forMe && item.status === "pending");
  const mine = all.filter((item) => item.mine);
  const list = tab === "for-me" ? forMe : tab === "mine" ? mine : [];
  const selected = all.find((item) => item.id === approvalId) ?? (desktop ? list[0] : undefined);
  const base = companyHref(company.id, "approvals");

  const header = (
    <CompanyPageHeader
      module="approvals"
      title={t("title")}
      resource={!desktop && selected ? selected.title : undefined}
      actions={
        <Segmented<Tab>
          label={t("tabs.label")}
          value={tab}
          onValueChange={(value) => {
            setTab(value);
            if (approvalId) router.push(base);
          }}
          options={[
            ...(capabilities.approve ? [{ value: "for-me" as const, label: t("tabs.forMe", { n: format.number(forMe.length) }) }] : []),
            { value: "mine", label: t("tabs.mine", { n: format.number(mine.length) }) },
            { value: "history", label: t("tabs.history") },
          ]}
        />
      }
    />
  );

  if (approvals.isError) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => void approvals.refetch()} />
      </>
    );
  }
  if (!approvals.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  if (tab === "history") {
    return (
      <>
        {header}
        <History />
      </>
    );
  }

  // Phones: a full-screen detail when an item is open.
  if (!desktop && selected) {
    return (
      <>
        {header}
        <Link href={base} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5 self-start")}>
          <Icon icon={ArrowLeft} size={16} mirror />
          {t("back")}
        </Link>
        <ApprovalCard key={selected.id} approval={selected} />
        <ApprovalFlow approval={selected} />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <section aria-label={tab === "for-me" ? t("tabs.forMeLabel") : t("tabs.mineLabel")}>
          {list.length === 0 ? (
            <EmptyState icon={Check} title={tab === "for-me" ? t("empty.forMe") : t("empty.mine")} />
          ) : (
            <ul className="flex flex-col gap-3">
              {list.map((item) => (
                <InboxRow key={item.id} approval={item} selected={item.id === selected?.id} href={`${base}/${item.id}`} />
              ))}
            </ul>
          )}
        </section>
        {selected ? <ApprovalCard key={selected.id} approval={selected} /> : null}
      </div>
      {selected ? <ApprovalFlow approval={selected} /> : null}
    </>
  );
}

function InboxRow({ approval, selected, href }: { approval: Approval; selected: boolean; href: string }) {
  const t = useTranslations("Company.approvals");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const waiting = Math.max(0, -format.daysFromToday(approval.submittedAt.slice(0, 10)));
  return (
    <li>
      <Link
        href={href}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-card-sm bg-surface px-4 py-4 shadow-island transition-colors hover:bg-subtle sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]",
          selected && "inset-ring-[1.5px] inset-ring-scope-deep",
        )}
      >
        <Avatar name={approval.requesterName} size={40} tone="company" decorative />
        <span className="flex min-w-0 flex-col">
          <bdi className="truncate text-sm font-bold text-fg">{approval.title}</bdi>
          <span className="truncate text-xs text-fg-secondary">
            {t(`subject.${approval.subject}`)} · <bdi>{approval.departmentName}</bdi> · {t("waiting", { n: format.number(waiting) })}
          </span>
        </span>
        <span className="text-sm font-bold tabular text-fg max-sm:hidden">{approval.amount !== null ? format.money(approval.amount) : "—"}</span>
        <span className="rounded-pill bg-warning-soft px-2.5 py-1 text-xs font-bold text-warning-text">
          {approval.status === "pending" ? t("pendingStep", { n: format.number(approval.currentStep) }) : t(`status.${approval.status}`)}
        </span>
      </Link>
    </li>
  );
}

function ApprovalCard({ approval }: { approval: Approval }) {
  const t = useTranslations("Company.approvals.card");
  const tApprovals = useTranslations("Company.approvals");
  const labels = useCompanyLabels();
  /** A role-based step (resource approvals) names its roles. */
  const stepLabel = (step: ApprovalStepState) => step.label || (step.roles ?? []).map((role) => labels.role(role)).join(" / ");
  const { company, me, capabilities } = useCompany();
  const writable = useCompanyWritable();
  const format = useCompanyFormat(company.currency);
  const router = useRouter();
  const budgets = useBudgets(company.id, capabilities.budgetCard);
  const [comment, setComment] = useState("");
  const [needComment, setNeedComment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decide = useCompanyMutation(company.id, (repo, id, vars: { decision: ApprovalDecisionKind; note: string | null }) =>
    repo.decide(id, approval.id, vars.decision, vars.note),
  );
  const steps = approval.steps.filter((step) => step.state !== "skipped");
  const current = approval.steps[approval.currentStep - 1];
  const index = steps.findIndex((step) => step.stepId === current?.stepId) + 1;
  const canDecide = writable && approval.forMe && approval.status === "pending" && capabilities.approve;
  const own = approval.requesterId === me.id;
  const line = budgets.data?.find((item) => item.kind === "department" && item.departmentName === approval.departmentName);
  const afterUsed = line && approval.amount !== null ? Math.round(((line.approved + line.committed + approval.amount) / line.budget) * 100) : null;

  const run = (decision: ApprovalDecisionKind) => {
    setError(null);
    if (decision !== "approved" && !comment.trim()) {
      setNeedComment(true);
      return;
    }
    decide.mutate(
      { decision, note: decision === "approved" ? null : comment.trim() },
      {
        onSuccess: () => {
          toast({ title: t(`done.${decision}`) });
          setComment("");
        },
        onError: (failure) => {
          if (failure instanceof RepositoryError && failure.message === "grant-missing") setError(t("grantMissing"));
          else if (failure instanceof RepositoryError && failure.code === "forbidden") setError(t("notAllowed"));
          else setError(t("failed"));
        },
      },
    );
  };

  const subjectHref =
    approval.subject === "expenses"
      ? companyHref(company.id, "expenses")
      : approval.subject === "resources"
        ? `${companyHref(company.id, "resources")}?tab=equipment`
        : approval.subject === "budget"
          ? companyHref(company.id, "budgets")
          : companyHref(company.id, "people");

  const action = canDecide ? (
    <SignatureCardAction icon={Check} label={t("approve")} disabled={decide.isPending} onClick={() => run("approved")} />
  ) : (
    <SignatureCardAction icon={ArrowRight} mirror variant="neutral" label={t("openSubject")} onClick={() => router.push(subjectHref)} />
  );

  return (
    <SignatureCard as="section" aria-labelledby="approval-title" action={action} contentClassName="gap-3" className="self-start">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-bold tracking-wide text-warning-text uppercase">
          {approval.status !== "pending"
            ? tApprovals(`status.${approval.status}`)
            : canDecide
              ? t("yourStep", { n: format.number(index), total: format.number(steps.length), step: current?.label ?? "" })
              : t("step", { n: format.number(index), total: format.number(steps.length), step: current?.label ?? "" })}
        </p>
        <h2 id="approval-title" className="type-title text-fg">
          <bdi>{approval.title}</bdi>
        </h2>
        <p className="text-xs font-semibold text-fg-secondary">
          <bdi>{approval.requesterName}</bdi> · <bdi>{approval.departmentName}</bdi>
          {approval.amountNote ? <> · <bdi>{approval.amountNote}</bdi></> : null}
        </p>
      </div>
      {approval.amount !== null ? <p className="text-3xl font-semibold tabular text-fg">{format.money(approval.amount)}</p> : null}
      {afterUsed !== null ? (
        <p className="flex items-center justify-between gap-2 rounded-row bg-subtle px-3 py-2 text-xs font-semibold text-fg">
          <span>{t("budget", { department: approval.departmentName })}</span>
          <span className="tabular">{t("afterApproval", { percent: format.percent(afterUsed) })}</span>
        </p>
      ) : null}
      <ol
        aria-label={
          approval.chainVersion === null
            ? t("chainUnversioned", { subject: tApprovals(`subject.${approval.subject}`) })
            : t("chain", { v: approval.chainVersion, subject: tApprovals(`subject.${approval.subject}`) })
        }
        className="flex flex-col"
      >
        <li className="flex items-start gap-3 py-1.5">
          <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-text">
            <Icon icon={Check} size={14} />
          </span>
          <span className="flex flex-col">
            <span className="text-xs font-bold text-fg">{t("submitted")}</span>
            <span className="text-xs text-fg-secondary">
              <bdi>{approval.requesterName}</bdi> · {format.day(approval.submittedAt.slice(0, 10))}
            </span>
          </span>
        </li>
        {approval.steps.map((step) => (
          <li key={step.stepId} className={cn("flex items-start gap-3 py-1.5", step.state === "skipped" && "opacity-60")}>
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex size-7 shrink-0 items-center justify-center rounded-full",
                step.state === "done" ? "bg-success-soft text-success-text" : step.state === "current" ? "bg-warning-soft text-warning-text" : "bg-subtle text-fg-muted",
              )}
            >
              <Icon icon={step.state === "done" ? Check : step.state === "skipped" ? CornerDownRight : Clock} size={14} />
            </span>
            <span className="flex min-w-0 flex-col">
              <bdi className="text-xs font-bold text-fg">{stepLabel(step)}</bdi>
              <span className="text-xs text-fg-secondary">
                {step.state === "skipped"
                  ? t("skipped", { note: step.routedNote ?? "" })
                  : [
                      step.reviewerId === me.id ? t("you") : (step.reviewerName ?? t("nextEligible")),
                      step.routedNote,
                      step.decision ? `${t(`decision.${step.decision.kind}`)} ${format.day(step.decision.at.slice(0, 10))}` : null,
                      step.decision?.note ? `“${step.decision.note}”` : null,
                      step.state === "current" && step.escalatesOn ? t("escalates", { date: format.day(step.escalatesOn) }) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {own && approval.status === "pending" ? <InlineAlert tone="info" title={t("ownItem")} /> : null}
      {canDecide ? (
        <>
          <Field invalid={needComment && !comment.trim()}>
            <FieldLabel className="sr-only">{t("comment")}</FieldLabel>
            <Textarea dir="auto" value={comment} placeholder={t("comment")} onChange={(event) => setComment(event.target.value)} />
          </Field>
          {needComment && !comment.trim() ? <p className="text-xs font-semibold text-danger-text">{t("commentRequired")}</p> : null}
          {error ? <InlineAlert tone="danger" title={error} /> : null}
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" disabled={decide.isPending} onClick={() => run("rejected")}>
              {t("reject")}
            </Button>
            <Button variant="secondary" disabled={decide.isPending} onClick={() => run("changes")}>
              {t("changes")}
            </Button>
          </div>
        </>
      ) : null}
    </SignatureCard>
  );
}

/** The read-only CaseFlow board of the selected item (PEOPLE_FLOW.md §2). Decisions stay in the card. */
function ApprovalFlow({ approval }: { approval: Approval }) {
  const t = useTranslations("Company.approvals.flow");
  const tApprovals = useTranslations("Company.approvals");
  const labels = useCompanyLabels();
  /** A role-based step (resource approvals) names its roles. */
  const stepLabel = (step: ApprovalStepState) => step.label || (step.roles ?? []).map((role) => labels.role(role)).join(" / ");
  const { company, me } = useCompany();
  const format = useCompanyFormat(company.currency);
  const person = (name: string) => ({ kind: "person" as const, name, initials: getInitials(name) });
  const columns: CaseFlowColumn[] = [
    {
      id: "submitted",
      label: t("submitted"),
      rows: [
        {
          id: "submit",
          title: approval.amount !== null ? t("submitAmount", { amount: format.money(approval.amount) }) : t("submit"),
          sub: `${approval.requesterName} · ${format.day(approval.submittedAt.slice(0, 10))}`,
          state: "done",
          lead: person(approval.requesterName),
        },
      ],
    },
  ];
  const links: CaseFlowLink[] = [];
  let previous = "submit";
  for (const step of approval.steps.filter((item) => item.state !== "skipped")) {
    const decisionRow = `${step.stepId}-decide`;
    const rows: CaseFlowRow[] = [];
    if (step.routedNote) {
      rows.push({ id: `${step.stepId}-route`, title: t("routed"), sub: step.routedNote, state: "done", lead: { kind: "system" } });
    }
    rows.push({
      id: decisionRow,
      title: stepLabel(step),
      sub: step.decision
        ? `${tApprovals(`card.decision.${step.decision.kind}`)} · ${format.day(step.decision.at.slice(0, 10))}`
        : step.state === "current"
          ? t("waitingSince", { date: format.day(approval.submittedAt.slice(0, 10)) })
          : t("notYet"),
      current: step.state === "current",
      state: step.decision?.kind === "approved" ? "done" : step.decision ? "blocked" : step.state === "current" ? "active" : "none",
      lead: step.reviewerName ? person(step.reviewerId === me.id ? me.name : step.reviewerName) : { kind: "unassigned" },
    });
    if (step.state === "current" && step.escalatesOn) {
      rows.push({ id: `${step.stepId}-escalate`, title: t("escalate"), sub: t("automatic", { date: format.day(step.escalatesOn) }), state: "none", lead: { kind: "unassigned" } });
    }
    links.push({ from: previous, to: decisionRow, satisfied: step.state !== "waiting" });
    previous = decisionRow;
    columns.push({ id: step.stepId, label: stepLabel(step), rows });
  }
  const names = new Map<string, number>();
  for (const step of approval.steps) {
    if (!step.reviewerName) continue;
    names.set(step.reviewerName, (names.get(step.reviewerName) ?? 0) + (step.state === "current" ? 1 : 0));
  }
  const people: CaseFlowPerson[] = [
    { id: "requester", name: approval.requesterName, initials: getInitials(approval.requesterName), badge: { kind: "done" } },
    ...[...names.entries()].map(([name, open]) => ({
      id: name,
      name,
      initials: getInitials(name),
      badge: open > 0 ? ({ kind: "count", n: open } as const) : ({ kind: "done" } as const),
    })),
  ];
  return (
    <CaseFlow
      title={t("title", { item: approval.title })}
      scope="company"
      people={people}
      columns={columns}
      links={links}
      outcomes={approval.outcomes.map((outcome, index) => ({ id: outcome, title: outcome, highlighted: index === 0 }))}
      outcomeLabel={t("after")}
      footnote={
        approval.chainVersion === null
          ? t("footnoteUnversioned", { subject: tApprovals(`subject.${approval.subject}`) })
          : t("footnote", { subject: tApprovals(`subject.${approval.subject}`), v: approval.chainVersion })
      }
    />
  );
}

function History() {
  const t = useTranslations("Company.approvals.history");
  const tApprovals = useTranslations("Company.approvals");
  const { company, capabilities, me } = useCompany();
  const format = useCompanyFormat(company.currency);
  const history = useApprovalHistory(company.id);
  const approvals = useApprovals(company.id);
  if (!history.data || !approvals.data) return <AccessLoading />;
  const mine = new Set(approvals.data.filter((item) => item.mine).map((item) => item.id));
  // Everyone sees decisions on their own items and their own decisions; Owner / Org Admin see all.
  const rows = history.data.filter((row) => capabilities.approvalHistoryAll || row.by === me.name || mine.has(row.approvalId));
  return (
    <ProductCard as="section" aria-label={t("title")} className="gap-2 overflow-x-auto">
      {rows.length === 0 ? (
        <EmptyState title={t("empty")} size="compact" />
      ) : (
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="sr-only">{t("title")}</caption>
          <thead className="text-xs font-semibold text-fg-muted">
            <tr>
              {(["when", "item", "decision", "by", "chain"] as const).map((key) => (
                <th key={key} scope="col" className="pb-2 text-start font-semibold">
                  {t(`col.${key}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="py-2.5 pe-3 text-xs text-fg-secondary">{format.day(row.at.slice(0, 10))}</td>
                <td className="py-2.5 pe-3 font-semibold text-fg">
                  <bdi>{row.title}</bdi>
                </td>
                <td className="py-2.5 pe-3 text-fg">
                  {t(`decision.${row.decision}`, { step: format.number(row.step) })}
                  {row.note ? <> — <bdi>{row.note}</bdi></> : null}
                </td>
                <td className="py-2.5 pe-3 text-fg">
                  <bdi>{row.by}</bdi>
                </td>
                <td className="py-2.5 text-xs text-fg-secondary">{row.chainVersion === null ? tApprovals(`subject.${row.subject}`) : t("chainVersion", { subject: tApprovals(`subject.${row.subject}`), v: row.chainVersion })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ProductCard>
  );
}
