import { newIdempotencyKey, type ApiClientFor, type ResponseDataIn } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-companies";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import type { Approval, ApprovalHistoryRow, ApprovalStepState, BudgetLine, CompanyRole, Expense, ExpenseCategory, ExpenseInput, ExpenseStatus, PaymentRun, Reimbursement } from "../company-domain";
import type { CompanyRepository } from "../company-repositories";
import { RepositoryError } from "../repositories";
import { conflictAware } from "./api-project-shared";
import { invalid, mapErrors, pageAll, retryOnConflict, revisionTag } from "./api-shared";

/*
 * Company finance over the 1,045-op contract, per context (root + every
 * department / unit the caller can open):
 * - Approvals: workflow approvals with their published workflow version's
 *   steps and decision history. APPROVE / REJECT only — a rejection REQUIRES a
 *   reason (400 otherwise); "request changes" has no API decision.
 * - Budgets: limit / spent / reserved per budget; amounts change only through
 *   the versioned change-request workflow (a direct amount adjustment answers
 *   409 BUDGET_CHANGE_APPROVAL_REQUIRED).
 * - Payment runs: an internal accounting record only (no money moves); the
 *   beneficiaries still acknowledge each payment.
 * Amounts are the API's exact decimal strings read as numbers in the company
 * currency. Not served for the screens: per-step escalation dates, budget
 * version history, pending expense totals (0).
 * - Expenses (Session 4): versioned expenses per context. Category = the
 *   context's finance category whose title is the screen's key (never created
 *   here); project = the context's project reference; payer "me" = the caller,
 *   "card" = none. Submit = `workflow-submit` with the context's PUBLISHED
 *   EXPENSE workflow version (the screen picks no reviewer). Receipt = real
 *   bytes (create → complete). A draft saved but not submitted / without its
 *   receipt answers "saved-as-draft" (never a full success).
 */

type Client = ApiClientFor<paths>;
type X = "/api/v1/companies/{id}/contexts/{scopeId}";
type Data<P extends keyof paths, M extends "get" | "post"> = ResponseDataIn<paths, P, M>;
type ApiApproval = Data<`${X}/finance/approvals`, "get">["items"][number];
type ApiHistory = Data<`${X}/finance/approvals/{target}/history`, "get">["items"][number];
type ApiVersion = Data<`${X}/finance/approval-workflow-versions/{target}`, "get">;
type ApiExpense = Data<`${X}/expenses`, "get">["items"][number];
type ApiBudget = Data<`${X}/finance/budgets`, "get">["items"][number];
type ApiChange = Data<`${X}/finance/budgets/{budgetId}/change-requests`, "get">["items"][number];
type ApiRun = Data<`${X}/finance/payment-runs`, "get">["items"][number];
type ApiCategory = Data<`${X}/finance/categories`, "get">["items"][number];
type ApiReference = Data<`${X}/finance/project-references`, "get">["items"][number];
type ApiWorkflow = Data<`${X}/finance/approval-workflows`, "get">["items"][number];
type ApiWorkflowVersion = Data<`${X}/finance/approval-workflows/{target}/versions`, "get">["items"][number];
type ApiReceipt = Data<`${X}/expenses/{expenseId}/revisions/{versionId}/receipts`, "get">["items"][number];
type ApiResourceRequest = Data<`${X}/resource-requests`, "get">["items"][number];
type ApiResourceWorkflow = Data<`${X}/resource-workflows/{versionId}`, "get">;
type ApiResourceHistory = Data<`${X}/resource-requests/{requestId}/history`, "get">["items"][number];
type ApiResourceItem = Data<`${X}/resources`, "get">["items"][number];

const APPROVER_ROLE: Record<ApiResourceWorkflow["steps"][number]["roles"][number], CompanyRole> = { OWNER: "owner", ORG_ADMIN: "admin", DEPT_MANAGER: "manager" };
const RESOURCE_STATUS: Partial<Record<ApiResourceRequest["state"], Approval["status"]>> = { PENDING: "pending", APPROVED: "approved", REJECTED: "rejected" };

export interface FinanceScope {
  scopeId: string;
  /** The department / unit id, or null for the company root. */
  departmentId: string | null;
  name: string;
  meAccessId: string;
  meGeneration: number;
  /** The caller's approver roles here: the context role + the root role of an Owner / Org Admin. */
  meRoles: string[];
}

export interface FinanceDeps {
  /** The company's fixed ISO currency (null = not chosen yet). */
  currencyOf: (id: string) => Promise<string | null>;
}

const PAGE = 100;
const STATUS: Partial<Record<ApiApproval["state"], Approval["status"]>> = { ACTIVE: "pending", APPROVED: "approved", REJECTED: "rejected" };
const EXPENSE_STATUS: Record<ApiExpense["current"]["state"], ExpenseStatus> = { DRAFT: "draft", SUBMITTED: "pending", APPROVED: "approved", REJECTED: "rejected", CANCELED: "withdrawn" };
const CATEGORIES: readonly ExpenseCategory[] = ["meals", "travel", "software", "equipment", "training", "other"];
const RECEIPT_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
const categoryKey = (title: string | undefined): ExpenseCategory => CATEGORIES.find((key) => key === title?.trim().toLowerCase()) ?? "other";

export function createCompanyFinance(api: Client, scopesOf: (id: string) => Promise<FinanceScope[]>, deps?: FinanceDeps): Partial<CompanyRepository> {
  const approvalScope = new Map<string, string>();
  const expenseScope = new Map<string, string>();
  const budgetScope = new Map<string, string>();
  const runScope = new Map<string, string>();
  const versions = new Map<string, ApiVersion>();

  const list = <T>(fetch: (after: string | undefined) => Promise<{ items: T[]; nextCursor: string | null }>) => pageAll<T>(fetch).catch(() => [] as T[]);

  async function versionOf(id: string, scopeId: string, versionId: string): Promise<ApiVersion> {
    if (!versions.has(versionId)) {
      versions.set(versionId, (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/finance/approval-workflow-versions/{target}`, { path: { id, scopeId, target: versionId } })).data);
    }
    return versions.get(versionId)!;
  }
  const historyOf = (id: string, scopeId: string, target: string) =>
    pageAll<ApiHistory>(async (after) => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/finance/approvals/{target}/history`, { path: { id, scopeId, target }, query: { limit: PAGE, after } })).data);

  async function approvalsIn(id: string, scope: FinanceScope): Promise<Approval[]> {
    const path = { id, scopeId: scope.scopeId };
    const [items, expenses] = await Promise.all([
      list<ApiApproval>(async (after) => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/finance/approvals`, { path, query: { limit: PAGE, after } })).data),
      list<ApiExpense>(async (after) => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/expenses`, { path, query: { limit: PAGE, after } })).data),
    ]);
    const rows: Approval[] = [];
    for (const item of items) {
      const status = STATUS[item.state];
      if (!status) continue;
      approvalScope.set(item.id, scope.scopeId);
      const [version, history] = await Promise.all([versionOf(id, scope.scopeId, item.workflowVersionId), historyOf(id, scope.scopeId, item.id)]);
      const expense = expenses.find((entry) => entry.current.id === item.expenseVersionId || entry.effectiveVersionId === item.expenseVersionId) ?? null;
      const steps: ApprovalStepState[] = [...version.steps]
        .sort((a, b) => a.position - b.position)
        .map((step, index) => {
          const decided = history.filter((entry) => entry.stepId === step.id && (entry.action === "APPROVE" || entry.action === "REJECT")).at(-1);
          const state: ApprovalStepState["state"] = index < item.stepIndex || (decided && item.state !== "ACTIVE") ? "done" : index === item.stepIndex && item.state === "ACTIVE" ? "current" : "waiting";
          return {
            stepId: step.id,
            label: step.label,
            reviewerId: step.primary.accessId,
            reviewerName: step.primary.displayName ?? null,
            routedNote: null,
            state,
            decision: decided
              ? { kind: decided.action === "APPROVE" ? "approved" : "rejected", by: decided.createdByDisplayName ?? "", at: decided.createdAt, note: decided.reason ?? null }
              : null,
            escalatesOn: null,
          };
        });
      const current = version.steps.find((step) => step.position === item.stepIndex) ?? [...version.steps].sort((a, b) => a.position - b.position)[item.stepIndex];
      rows.push({
        id: item.id,
        subject: "expenses",
        subjectId: expense?.id ?? item.reimbursementId ?? item.id,
        title: expense?.current.vendor ?? version.title,
        departmentName: scope.name,
        amount: expense ? Number(expense.current.amount) : null,
        amountNote: null,
        requesterId: item.requester.accessId,
        requesterName: item.requester.displayName ?? "",
        chainVersion: version.number,
        status,
        currentStep: item.stepIndex + 1,
        steps,
        submittedAt: item.createdAt,
        outcomes: [],
        forMe: item.state === "ACTIVE" && !!current && (current.primary.accessId === scope.meAccessId || current.alternate?.accessId === scope.meAccessId),
        mine: item.requester.accessId === scope.meAccessId,
      });
    }
    return rows;
  }

  // ── Resource requests: role-based steps of a resource workflow version (no version number); decided with the request's own revision ──
  const resourceRequestScope = new Map<string, string>();
  const resourceWorkflows = new Map<string, ApiResourceWorkflow>();
  async function resourceWorkflowOf(id: string, scopeId: string, versionId: string) {
    if (!resourceWorkflows.has(versionId)) {
      resourceWorkflows.set(versionId, (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/resource-workflows/{versionId}`, { path: { id, scopeId, versionId } })).data);
    }
    return resourceWorkflows.get(versionId)!;
  }

  async function resourceApprovalsIn(id: string, scope: FinanceScope): Promise<Approval[]> {
    const path = { id, scopeId: scope.scopeId };
    const requests = (await list<ApiResourceRequest>(async (after) => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/resource-requests`, { path, query: { limit: PAGE, after } })).data)).filter(
      (request) => RESOURCE_STATUS[request.state],
    );
    if (!requests.length) return [];
    const resources = await list<ApiResourceItem>(async (after) => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/resources`, { path, query: { limit: PAGE, after } })).data);
    const rows: Approval[] = [];
    for (const request of requests) {
      resourceRequestScope.set(request.id, scope.scopeId);
      const [workflow, history] = await Promise.all([
        resourceWorkflowOf(id, scope.scopeId, request.workflowVersionId),
        api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/resource-requests/{requestId}/history`, { path: { ...path, requestId: request.id } }).then(
          (response) => response.data.items,
          () => [] as ApiResourceHistory[],
        ),
      ]);
      const pending = request.state === "PENDING";
      const steps: ApprovalStepState[] = workflow.steps.map((step, index) => {
        const decided = history.filter((entry) => entry.step === index && (entry.kind === "APPROVE" || entry.kind === "REJECT")).at(-1);
        return {
          stepId: `${request.id}:${index}`,
          label: "",
          roles: step.roles.map((role) => APPROVER_ROLE[role]),
          reviewerId: null,
          reviewerName: decided ? (decided.actorDisplayName ?? "") : null,
          routedNote: null,
          state: decided || index < request.step ? "done" : pending && index === request.step ? "current" : "waiting",
          decision: decided ? { kind: decided.kind === "APPROVE" ? "approved" : "rejected", by: decided.actorDisplayName ?? "", at: decided.createdAt, note: decided.reason ?? null } : null,
          escalatesOn: null,
        };
      });
      const mine = request.requester.accessId === scope.meAccessId;
      rows.push({
        id: request.id,
        subject: "resources",
        subjectId: request.resourceId,
        title: resources.find((resource) => resource.id === request.resourceId)?.title ?? "",
        departmentName: scope.name,
        amount: null,
        amountNote: null,
        requesterId: request.requester.accessId,
        requesterName: request.requester.displayName ?? "",
        chainVersion: null,
        status: RESOURCE_STATUS[request.state]!,
        currentStep: Math.min(request.step, request.stepCount - 1) + 1,
        steps,
        submittedAt: request.createdAt,
        outcomes: [],
        // Same rule as the server: a pending step whose roles include one of mine, never my own request.
        forMe: pending && !mine && request.pendingRoles.some((role) => scope.meRoles.includes(role)),
        mine,
      });
    }
    return rows;
  }

  async function decideResource(id: string, scopeId: string, requestId: string, decision: "approved" | "rejected", reason: string) {
    const path = { id, scopeId, requestId };
    const { data: current } = await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/resource-requests/{requestId}`, { path });
    if (current.state !== "PENDING") throw new RepositoryError("conflict", "Changed elsewhere");
    // The If-Match revision guards a repeated decision; a 409 is never retried automatically.
    await conflictAware(() =>
      api.request("post", `/api/v1/companies/{id}/contexts/{scopeId}/resource-requests/{requestId}/decision`, {
        path,
        header: { "If-Match": revisionTag(current.revision) },
        body: { decision: decision === "approved" ? "APPROVE" : "REJECT", ...(reason ? { reason: reason.slice(0, 2000) } : {}) },
      }),
    );
  }

  const allApprovals = async (id: string) =>
    (await Promise.all((await scopesOf(id)).flatMap((scope) => [approvalsIn(id, scope), resourceApprovalsIn(id, scope)]))).flat().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  async function budgetsIn(id: string, scope: FinanceScope): Promise<BudgetLine[]> {
    const path = { id, scopeId: scope.scopeId };
    const items = await list<ApiBudget>(async (after) => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/finance/budgets`, { path, query: { limit: PAGE, after } })).data);
    const lines: BudgetLine[] = [];
    for (const budget of items.filter((entry) => !entry.archived)) {
      budgetScope.set(budget.id, scope.scopeId);
      const changes = await list<ApiChange>(
        async (after) => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/finance/budgets/{budgetId}/change-requests`, { path: { ...path, budgetId: budget.id }, query: { limit: PAGE, after } })).data,
      );
      const pending = changes.find((change) => change.state === "PENDING");
      const limit = Number(budget.limit);
      lines.push({
        id: budget.id,
        kind: budget.projectReferenceId ? "project" : "department",
        name: budget.title,
        departmentId: scope.departmentId ?? "",
        departmentName: scope.name,
        budget: limit,
        approved: Number(budget.spent),
        committed: Number(budget.reserved),
        pending: 0,
        versions: [],
        // The screen shows the requested new total.
        changeRequest: pending ? { id: pending.id, amount: limit + (pending.direction === "INCREASE" ? 1 : -1) * Number(pending.amount), status: "pending" } : null,
      });
    }
    return lines;
  }

  const toRun = (run: ApiRun): PaymentRun => ({
    id: run.id,
    label: run.label,
    itemIds: run.items.map((item) => item.reimbursementId),
    total: Number(run.total),
    status: run.state === "CONFIRMED" ? "confirmed" : "open",
    reference: run.reference,
    confirmedAt: run.state === "CONFIRMED" ? run.closedAt : null,
    confirmedBy: null,
  });

  const budgets = async (id: string) => (await Promise.all((await scopesOf(id)).map((scope) => budgetsIn(id, scope)))).flat();

  async function paymentRuns(id: string): Promise<PaymentRun[]> {
    const runs: PaymentRun[] = [];
    for (const scope of await scopesOf(id)) {
      const items = await list<ApiRun>(async (after) => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/finance/payment-runs`, { path: { id, scopeId: scope.scopeId }, query: { limit: PAGE, after } })).data);
      for (const run of items.filter((entry) => entry.state !== "CANCELED")) {
        runScope.set(run.id, scope.scopeId);
        runs.push(toRun(run));
      }
    }
    return runs;
  }

  // ── Expenses ──
  const categoriesIn = (id: string, scopeId: string) =>
    list<ApiCategory>(async (after) => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/finance/categories`, { path: { id, scopeId }, query: { limit: PAGE, after } })).data).then((rows) =>
      rows.filter((row) => !row.archived),
    );
  const referencesIn = (id: string, scopeId: string) =>
    list<ApiReference>(async (after) => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/finance/project-references`, { path: { id, scopeId }, query: { limit: PAGE, after } })).data);
  const receiptsOf = (id: string, scopeId: string, expense: ApiExpense) =>
    list<ApiReceipt>(
      async (after) =>
        (
          await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/expenses/{expenseId}/revisions/{versionId}/receipts`, {
            path: { id, scopeId, expenseId: expense.id, versionId: expense.current.id },
            query: { limit: PAGE, after },
          })
        ).data,
    );

  async function expensesIn(id: string, scope: FinanceScope): Promise<Expense[]> {
    const path = { id, scopeId: scope.scopeId };
    const items = await list<ApiExpense>(async (after) => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/expenses`, { path, query: { limit: PAGE, after } })).data);
    if (!items.length) return [];
    const [categories, references, approvals] = await Promise.all([
      categoriesIn(id, scope.scopeId),
      referencesIn(id, scope.scopeId),
      list<ApiApproval>(async (after) => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/finance/approvals`, { path, query: { limit: PAGE, after } })).data),
    ]);
    const rows: Expense[] = [];
    for (const expense of items) {
      expenseScope.set(expense.id, scope.scopeId);
      const current = expense.current;
      const reference = references.find((row) => row.id === current.projectReferenceId);
      const approval = approvals.filter((row) => row.expenseVersionId === current.id).at(-1);
      const receipt = (await receiptsOf(id, scope.scopeId, expense)).find((row) => row.status === "READY") ?? null;
      const status = EXPENSE_STATUS[current.state];
      rows.push({
        id: expense.id,
        title: current.vendor ?? "",
        amount: Number(current.amount),
        date: current.occurredDate,
        category: categoryKey(categories.find((row) => row.id === current.categoryId)?.title),
        departmentId: scope.departmentId ?? "",
        departmentName: scope.name,
        projectId: reference?.project?.id ?? null,
        projectName: reference?.project?.title ?? null,
        payer: current.payer && current.payer.accessId === current.requester.accessId ? "me" : "card",
        receipt: receipt ? { name: receipt.filename } : null,
        authorId: current.requester.accessId,
        authorName: current.requester.displayName ?? "",
        status,
        step: status === "pending" && approval?.state === "ACTIVE" ? approval.stepIndex + 1 : null,
        approvalId: approval?.id ?? null,
        revision: expense.revision,
        // An approval is approved or rejected; there is no "request changes" note.
        changesNote: null,
        createdAt: expense.createdAt,
      });
    }
    return rows;
  }
  const allExpenses = async (id: string) => (await Promise.all((await scopesOf(id)).map((scope) => expensesIn(id, scope)))).flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function expenseIn(id: string, expenseId: string) {
    if (!expenseScope.has(expenseId)) await allExpenses(id);
    const scopeId = expenseScope.get(expenseId);
    if (!scopeId) throw new RepositoryError("not-found", "Expense not found");
    const { data, etag } = await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/expenses/{target}`, { path: { id, scopeId, target: expenseId } });
    return { scopeId, expense: data, tag: etag ?? revisionTag(data.revision) };
  }

  /** The context's PUBLISHED expense workflow version (null = no published chain). */
  async function publishedExpenseVersion(id: string, scopeId: string): Promise<string | null> {
    const workflows = await list<ApiWorkflow>(async (after) => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/finance/approval-workflows`, { path: { id, scopeId }, query: { limit: PAGE, after } })).data);
    for (const workflow of workflows.filter((row) => row.kind === "EXPENSE")) {
      const versions = await list<ApiWorkflowVersion>(
        async (after) =>
          (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/finance/approval-workflows/{target}/versions`, { path: { id, scopeId, target: workflow.id }, query: { limit: PAGE, after } })).data,
      );
      const published = versions.filter((version) => version.state === "PUBLISHED").sort((a, b) => b.number - a.number)[0];
      if (published) return published.id;
    }
    return null;
  }

  async function saveExpense(id: string, input: ExpenseInput, submit: boolean, expenseId?: string): Promise<Expense> {
    const title = input.title.trim();
    if (!title || !Number.isFinite(input.amount) || input.amount <= 0 || !input.date) invalid("Title, amount and date are required");
    const scope = (await scopesOf(id)).find((entry) => entry.departmentId === (input.departmentId || null));
    if (!scope) throw new RepositoryError("forbidden", "Forbidden");
    const currency = await deps?.currencyOf(id);
    // One fixed company currency: nothing is recorded before it is chosen.
    if (!currency) invalid("currency-not-set");
    const [categories, references] = await Promise.all([categoriesIn(id, scope.scopeId), input.projectId ? referencesIn(id, scope.scopeId) : Promise.resolve([] as ApiReference[])]);
    const category = categories.find((row) => row.title.trim().toLowerCase() === input.category);
    if (!category) invalid("category-unavailable");
    const reference = input.projectId ? references.find((row) => row.project?.id === input.projectId) : null;
    if (input.projectId && !reference) invalid("project-unavailable");
    const file = input.receipt?.file;
    if (file && !(RECEIPT_TYPES as readonly string[]).includes(file.type)) invalid("receipt-type");
    const body = {
      amount: String(input.amount),
      currency: currency!,
      categoryId: category!.id,
      occurredDate: input.date,
      timezone: getPlannerTimeZone(),
      vendor: title.slice(0, 300),
      payer: input.payer === "me" ? { accessId: scope.meAccessId, generation: scope.meGeneration } : null,
      projectReferenceId: reference?.id ?? null,
    };
    let saved: ApiExpense;
    if (expenseId) {
      let current = await expenseIn(id, expenseId);
      const send = () => api.request("patch", `/api/v1/companies/{id}/contexts/{scopeId}/expenses/{target}`, { path: { id, scopeId: current.scopeId, target: expenseId }, header: { "If-Match": current.tag }, body });
      saved = (await conflictAware(() => retryOnConflict(send, async () => (current = await expenseIn(id, expenseId))))).data;
    } else {
      saved = (
        await api.request("post", `/api/v1/companies/{id}/contexts/{scopeId}/expenses`, {
          path: { id, scopeId: scope.scopeId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { ...body, id: crypto.randomUUID() },
        })
      ).data;
    }
    expenseScope.set(saved.id, scope.scopeId);
    // From here the draft exists: a later failure is reported as a saved draft, never as a full success.
    try {
      if (file) {
        const path = { id, scopeId: scope.scopeId, expenseId: saved.id, versionId: saved.current.id };
        const { data: receipt } = await api.request("post", `/api/v1/companies/{id}/contexts/{scopeId}/expenses/{expenseId}/revisions/{versionId}/receipts`, {
          path,
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { id: crypto.randomUUID(), filename: (input.receipt!.name || "receipt").slice(0, 180), mimeType: file.type as (typeof RECEIPT_TYPES)[number], expectedSize: file.size },
        });
        await api.request("post", `/api/v1/companies/{id}/contexts/{scopeId}/expenses/{expenseId}/revisions/{versionId}/receipts/{receiptId}/complete`, {
          path: { ...path, receiptId: receipt.id },
          header: { "If-Match": revisionTag(receipt.revision) },
          body: file,
        });
      }
      if (submit) {
        const versionId = await publishedExpenseVersion(id, scope.scopeId);
        if (!versionId) throw new RepositoryError("invalid", "no-approval-chain");
        const { tag } = await expenseIn(id, saved.id);
        await api.request("post", `/api/v1/companies/{id}/contexts/{scopeId}/expenses/{target}/workflow-submit`, {
          path: { id, scopeId: scope.scopeId, target: saved.id },
          header: { "If-Match": tag },
          body: { workflowVersionId: versionId },
        });
      }
    } catch {
      throw new RepositoryError("invalid", "saved-as-draft");
    }
    const row = (await expensesIn(id, scope)).find((entry) => entry.id === saved.id);
    if (!row) throw new RepositoryError("not-found", "Expense not found");
    return row;
  }

  async function runScopeFor(id: string, runId: string): Promise<string> {
    if (!runScope.has(runId)) await paymentRuns(id);
    const scopeId = runScope.get(runId);
    if (!scopeId) throw new RepositoryError("not-found", "Not found");
    return scopeId;
  }

  return {
    expenses: (id) => mapErrors(() => allExpenses(id)),

    saveExpense: (id, input, submit, expenseId) => mapErrors(() => saveExpense(id, input, submit, expenseId)),

    withdrawExpense: (id, expenseId) =>
      mapErrors(async () => {
        let current = await expenseIn(id, expenseId);
        const send = () => api.request("post", `/api/v1/companies/{id}/contexts/{scopeId}/expenses/{target}/cancel`, { path: { id, scopeId: current.scopeId, target: expenseId }, header: { "If-Match": current.tag }, body: {} });
        await conflictAware(() => retryOnConflict(send, async () => (current = await expenseIn(id, expenseId))));
        const scope = (await scopesOf(id)).find((entry) => entry.scopeId === current.scopeId);
        const row = scope ? (await expensesIn(id, scope)).find((entry) => entry.id === expenseId) : undefined;
        if (!row) throw new RepositoryError("not-found", "Expense not found");
        return row;
      }),

    approvals: (id) => mapErrors(() => allApprovals(id)),

    approvalHistory: (id) =>
      mapErrors(async () => {
        const rows: ApprovalHistoryRow[] = [];
        for (const approval of await allApprovals(id)) {
          for (const step of approval.steps) {
            if (step.decision) rows.push({ id: `${approval.id}:${step.stepId}`, approvalId: approval.id, at: step.decision.at, title: approval.title, decision: step.decision.kind, step: approval.steps.indexOf(step) + 1, note: step.decision.note, by: step.decision.by, subject: approval.subject, chainVersion: approval.chainVersion });
          }
        }
        return rows.sort((a, b) => b.at.localeCompare(a.at));
      }),

    decide: (id, approvalId, decision, note) =>
      mapErrors(async () => {
        if (decision === "changes") throw new RepositoryError("unsupported", "Companies API: an approval is approved or rejected; there is no request-changes decision");
        const reason = note?.trim() ?? "";
        // A rejection must carry a reason (the server answers 400 otherwise).
        if (decision === "rejected" && !reason) invalid("reason-required");
        if (!approvalScope.has(approvalId) && !resourceRequestScope.has(approvalId)) await allApprovals(id);
        const resourceScopeId = resourceRequestScope.get(approvalId);
        if (resourceScopeId) {
          await decideResource(id, resourceScopeId, approvalId, decision, reason);
          const decided = (await allApprovals(id)).find((approval) => approval.id === approvalId);
          if (!decided) throw new RepositoryError("not-found", "Not found");
          return decided;
        }
        const scopeId = approvalScope.get(approvalId);
        if (!scopeId) throw new RepositoryError("not-found", "Not found");
        const { data: current } = await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/finance/approvals/{target}`, { path: { id, scopeId, target: approvalId } });
        await conflictAware(() =>
          api.request("post", `/api/v1/companies/{id}/contexts/{scopeId}/finance/approvals/{target}/decision`, {
            path: { id, scopeId, target: approvalId },
            header: { "If-Match": revisionTag(current.revision) },
            body: { decision: decision === "approved" ? "APPROVE" : "REJECT", ...(reason ? { reason: reason.slice(0, 1000) } : {}) },
          }),
        );
        const updated = (await allApprovals(id)).find((approval) => approval.id === approvalId);
        if (!updated) throw new RepositoryError("not-found", "Not found");
        return updated;
      }),

    budgets: (id) => mapErrors(() => budgets(id)),

    // The versioned workflow: the screen's new total becomes an INCREASE / DECREASE request (never a direct amount edit).
    requestBudgetChange: (id, lineId, amount, reason) =>
      mapErrors(async () => {
        if (!Number.isFinite(amount) || amount <= 0 || !reason.trim()) invalid("Amount and reason are required");
        if (!budgetScope.has(lineId)) await budgets(id);
        const scopeId = budgetScope.get(lineId);
        if (!scopeId) throw new RepositoryError("not-found", "Budget line not found");
        const { data: budget } = await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/finance/budgets/{target}`, { path: { id, scopeId, target: lineId } });
        const delta = amount - Number(budget.limit);
        if (delta === 0) invalid("The new budget equals the current one");
        await conflictAware(() =>
          api.request("post", `/api/v1/companies/{id}/contexts/{scopeId}/finance/budgets/{budgetId}/change-requests`, {
            path: { id, scopeId, budgetId: lineId },
            header: { "Idempotency-Key": newIdempotencyKey() },
            body: { id: newIdempotencyKey(), amount: Math.abs(delta).toFixed(budget.scale), direction: delta > 0 ? "INCREASE" : "DECREASE", reason: reason.trim().slice(0, 1000) },
          }),
        );
        const scope = (await scopesOf(id)).find((entry) => entry.scopeId === scopeId)!;
        const line = (await budgetsIn(id, scope)).find((entry) => entry.id === lineId);
        if (!line) throw new RepositoryError("not-found", "Budget line not found");
        return line;
      }),

    // Reimbursements ready for a run (approved, unpaid), per context; settled / disputed states come from acknowledgements (not read here).
    reimbursements: (id) =>
      mapErrors(async () => {
        const rows: Reimbursement[] = [];
        for (const scope of await scopesOf(id)) {
          const path = { id, scopeId: scope.scopeId };
          const [eligible, runs] = await Promise.all([
            api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/finance/payment-runs/eligible`, { path }).then((response) => response.data.items, () => []),
            list<ApiRun>(async (after) => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/finance/payment-runs`, { path, query: { limit: PAGE, after } })).data),
          ]);
          const inRun = new Map(runs.filter((run) => run.state !== "CANCELED").flatMap((run) => run.items.map((item) => [item.reimbursementId, run] as const)));
          for (const item of eligible) {
            rows.push({ id: item.reimbursementId, expenseId: "", title: "", amount: Number(item.amount), recipientId: item.beneficiary.accessId, recipientName: item.beneficiary.displayName ?? "", departmentName: scope.name, approvedAt: "", status: "to-settle", runId: null, settledAt: null, disputeNote: null, recordedInPersonal: false });
          }
          for (const [reimbursementId, run] of inRun) {
            const item = run.items.find((entry) => entry.reimbursementId === reimbursementId)!;
            rows.push({ id: reimbursementId, expenseId: "", title: "", amount: Number(item.amount), recipientId: "", recipientName: "", departmentName: scope.name, approvedAt: "", status: run.state === "CONFIRMED" ? "settled" : "in-run", runId: run.id, settledAt: run.state === "CONFIRMED" ? run.closedAt : null, disputeNote: null, recordedInPersonal: false });
          }
        }
        return rows;
      }),

    paymentRuns: (id) => mapErrors(() => paymentRuns(id)),

    // One run per context: the eligible items of the first context that holds them.
    createRun: (id, itemIds) =>
      mapErrors(async () => {
        if (itemIds.length === 0) invalid("Choose at least one reimbursement");
        for (const scope of await scopesOf(id)) {
          const path = { id, scopeId: scope.scopeId };
          const eligible = await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/finance/payment-runs/eligible`, { path }).then((response) => response.data.items, () => []);
          const chosen = eligible.filter((item) => itemIds.includes(item.reimbursementId)).map((item) => item.reimbursementId);
          if (chosen.length === 0) continue;
          const { data } = await api.request("post", `/api/v1/companies/{id}/contexts/{scopeId}/finance/payment-runs`, {
            path,
            header: { "Idempotency-Key": newIdempotencyKey() },
            body: { id: newIdempotencyKey(), label: `${scope.name} · ${new Date().toISOString().slice(0, 10)}`.slice(0, 200), reimbursementIds: chosen },
          });
          runScope.set(data.id, scope.scopeId);
          return toRun(data);
        }
        throw new RepositoryError("not-found", "No eligible reimbursements");
      }),

    confirmRun: (id, runId, reference) =>
      mapErrors(async () => {
        if (!reference.trim()) invalid("A payment reference is required");
        const scopeId = await runScopeFor(id, runId);
        const { data: run } = await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/finance/payment-runs/{runId}`, { path: { id, scopeId, runId } });
        const { data } = await conflictAware(() =>
          api.request("post", `/api/v1/companies/{id}/contexts/{scopeId}/finance/payment-runs/{runId}/confirm`, {
            path: { id, scopeId, runId },
            header: { "If-Match": revisionTag(run.revision) },
            body: { reference: reference.trim().slice(0, 300) },
          }),
        );
        return toRun(data);
      }),
  };
}
