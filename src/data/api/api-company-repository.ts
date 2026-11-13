import { newIdempotencyKey, typedAs, type ApiClient, type ApiClientFor, type ResponseDataIn } from "@/api/client";
import { ApiHttpError } from "@/api/errors";
import type { paths } from "@/api/generated/openapi-p6-companies";
import { addDaysToDay } from "@/lib/dates/clock-time";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import { getPlannerToday } from "../clock";
import type {
  AuditRow,
  CompanyAccess,
  CompanyCapabilities,
  CompanyExport,
  CompanyModule,
  CompanyPersonRef,
  CompanyReport,
  CompanyReportId,
  CompanyResource,
  CompanyRole,
  CompanySummary,
  CorrectiveAction,
  Department,
  KbFolder,
  KbPage,
  KbPageSummary,
  KbSearchHit,
} from "../company-domain";
import type { CompanyRepository } from "../company-repositories";
import { RepositoryError } from "../repositories";
import { invalid, mapErrors, pageAll, retryOnConflict, revisionTag } from "./api-shared";
import { conflictAware, initialsOf, liveOnlyIn } from "./api-project-shared";

/*
 * Companies (Phase 4) in live mode, over the 860-op subset in
 * `src/api/generated/openapi-p6-companies.d.ts`. Live mode never serves the
 * mock Companies adapter.
 * - Scope: a company is its root context (`company.scopeId`); every department
 *   and unit is its own context (`scopeId`) with its own members and access.
 * - The caller's role / capabilities: `GET …/contexts/{scopeId}/access/me`
 *   (hints; the server checks every command). A capability is true only when
 *   the backend grants it AND live mode supports the action.
 * - People: id = member (access) id, name = member `displayName` (null → blank).
 * - Not served by the API, so left empty in live mode: legal name "", currency
 *   and fiscal month null, department manager / budget / teams null,
 *   `approvalsForMe` 0, `recentIds` [].
 * Unsupported methods are refused; `API_COVERAGE_MATRIX.md` → "Companies".
 */

type CompaniesClient = ApiClientFor<paths>;
type Data<P extends keyof paths, M extends "get" | "post" | "patch" | "put" | "delete"> = ResponseDataIn<paths, P, M>;
type ApiCompany = Data<"/api/v1/companies/{id}", "get">;
type ApiMe = Data<"/api/v1/companies/{id}/contexts/{scopeId}/access/me", "get">;
type ApiMember = Data<"/api/v1/companies/{id}/contexts/{scopeId}/members", "get">["items"][number];
type ApiDepartment = Data<"/api/v1/companies/{id}/departments", "get">["items"][number];

const PAGE = 100;
const PROOF = "accepting or declining needs the one-time invitation proof, whose delivery is an open owner decision (OD-4)";
const MONEY = "the API has no company currency (amounts carry their own currency and scale per row) and its finance model (expense versions, workflow approvals, budget adjustments, per-reimbursement acknowledgements) differs from the screen";

const refuse = (requirement: string) => () => Promise.reject(new RepositoryError("unsupported", `Companies API: ${requirement}`));

const ROLE: Record<NonNullable<ApiMe["role"]>, CompanyRole> = {
  OWNER: "owner",
  ADMIN: "admin",
  ORG_ADMIN: "admin",
  MANAGER: "manager",
  DEPT_MANAGER: "manager",
  LEAD: "lead",
  TEAM_LEAD: "lead",
  MEMBER: "member",
  VIEWER: "viewer",
};
const roleOf = (role: ApiMe["role"]): CompanyRole => (role ? ROLE[role] : "viewer");

const personOf = (member: ApiMember): CompanyPersonRef => {
  const name = member.displayName ?? "";
  return { id: member.id, name, initials: initialsOf(name) };
};

const isHidden = (error: unknown) =>
  (error instanceof ApiHttpError && (error.status === 403 || error.status === 404)) ||
  (error instanceof RepositoryError && (error.code === "forbidden" || error.code === "not-found"));

const LIVE_MODULES: readonly CompanyModule[] = ["overview", "departments"];

/** Backend capability hints ∧ what live mode can do. */
export function companyCapabilitiesOf(me: ApiMe, managedDepartmentIds: string[]): CompanyCapabilities {
  const has = (capability: string) => me.capabilities.includes(capability);
  const lifecycle = has("custody.archive") || me.role === "OWNER";
  const modules = Object.fromEntries(
    (["overview", "departments", "people", "work", "goals", "resources", "expenses", "approvals", "budgets", "knowledge", "reports", "settings"] as const).map((module) => [
      module,
      module === "settings" ? lifecycle : LIVE_MODULES.includes(module),
    ]),
  ) as Record<CompanyModule, boolean>;
  return {
    modules,
    allDepartments: me.role === "OWNER" || me.role === "ORG_ADMIN" || me.role === "ADMIN",
    managedDepartmentIds,
    budgetCard: false,
    export: false,
    manageDepartments: has("settings.manage"),
    overridePolicy: false,
    // Sending an invitation returns a proof whose delivery is undecided (OD-4).
    invite: false,
    editWorkProfile: false,
    requestFileAccess: false,
    requestAttach: false,
    createWork: false,
    seeWorkBudgets: false,
    createCompanyGoal: false,
    createDepartmentGoal: false,
    linkGoalWork: false,
    requestResource: false,
    manageResources: false,
    seeCapacity: false,
    createKbPage: false,
    manageKb: false,
    seeAllExpenses: false,
    createExpense: false,
    approve: false,
    approvalHistoryAll: false,
    companyBudgets: false,
    requestBudgetChange: false,
    settleReimbursements: false,
    companyReports: false,
    departmentReports: false,
    auditLog: false,
    openSettings: lifecycle,
    lifecycle,
    grants: [],
  };
}

function scoped(api: CompaniesClient) {
  const members = (id: string, scopeId: string) =>
    pageAll<ApiMember>(
      async (after) => (await api.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/members", { path: { id, scopeId }, query: { limit: PAGE, after } })).data,
    );
  const me = async (id: string, scopeId: string) => (await api.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/access/me", { path: { id, scopeId } })).data;
  /** Departments and their units (each unit once). */
  const structure = async (id: string): Promise<ApiDepartment[]> => {
    const departments = await pageAll<ApiDepartment>(
      async (after) => (await api.request("get", "/api/v1/companies/{id}/departments", { path: { id }, query: { limit: PAGE, after } })).data,
    );
    const units = await Promise.all(
      departments
        .filter((department) => department.kind === "DEPARTMENT")
        .map((department) =>
          pageAll<ApiDepartment>(
            async (after) =>
              (await api.request("get", "/api/v1/companies/{id}/departments/{departmentId}/units", { path: { id, departmentId: department.id }, query: { limit: PAGE, after } }))
                .data,
          ),
        ),
    );
    const all = new Map<string, ApiDepartment>();
    for (const entry of [...departments, ...units.flat()]) all.set(entry.id, entry);
    return [...all.values()];
  };
  /** My admission in each department / unit the server lets me read (others are skipped). */
  const myDepartments = async (id: string, structure: readonly ApiDepartment[]) => {
    const answers = await Promise.all(
      structure.map((department) =>
        me(id, department.scopeId).then(
          (admission) => ({ department, admission }),
          (error: unknown) => {
            if (isHidden(error)) return null;
            throw error;
          },
        ),
      ),
    );
    return answers.filter((answer): answer is NonNullable<typeof answer> => answer !== null);
  };
  return { members, me, structure, myDepartments };
}

const LIFECYCLE: Record<ApiCompany["state"], CompanySummary["lifecycle"]> = { ACTIVE: "active", ARCHIVED: "archived" };

export function createApiCompanyRepository(client: ApiClient): CompanyRepository {
  const api: CompaniesClient = typedAs<paths>(client);
  const { members, me, structure, myDepartments } = scoped(api);

  const summaryOf = async (company: ApiCompany) => {
    const [admission, roster, departments] = await Promise.all([me(company.id, company.scopeId), members(company.id, company.scopeId), structure(company.id)]);
    const mine = await myDepartments(company.id, departments);
    const primary = mine.find((entry) => entry.department.kind === "DEPARTMENT")?.department ?? null;
    const summary: CompanySummary = {
      id: company.id,
      name: company.title,
      legalName: "",
      initials: initialsOf(company.title),
      tint: "purple",
      role: roleOf(admission.role),
      departmentId: primary?.id ?? null,
      departmentName: primary?.title ?? null,
      people: roster.filter((member) => member.state === "ACTIVE").length,
      departments: departments.filter((department) => department.kind === "DEPARTMENT").length,
      approvalsForMe: 0,
      lifecycle: LIFECYCLE[company.state],
      lifecycleAt: null,
      currency: null,
      currencyLocked: false,
      fiscalStartMonth: null,
      updatedAt: company.updatedAt,
    };
    return { summary, admission, roster, mine };
  };

  const access = (id: string) =>
    mapErrors(async (): Promise<CompanyAccess> => {
      try {
        const { data: company } = await api.request("get", "/api/v1/companies/{id}", { path: { id } });
        const { summary, admission, roster, mine } = await summaryOf(company);
        const self = roster.find((member) => member.id === admission.accessId);
        const managed = mine.filter((entry) => entry.admission.role === "DEPT_MANAGER" || entry.admission.role === "MANAGER").map((entry) => entry.department.id);
        return {
          status: "ok",
          company: summary,
          capabilities: companyCapabilitiesOf(admission, managed),
          me: self ? personOf(self) : { id: admission.accessId, name: "", initials: "" },
          myDepartmentIds: mine.map((entry) => entry.department.id),
        };
      } catch (error) {
        // Forbidden and not found are the same answer (no discovery).
        if (isHidden(error)) return { status: "not-available" };
        throw error;
      }
    });

  const read = async (id: string) => {
    const { data, etag } = await api.request("get", "/api/v1/companies/{id}", { path: { id } });
    return { company: data, tag: etag ?? revisionTag(data.revision) };
  };
  const lifecycle = (id: string, path: "/api/v1/companies/{id}/archive" | "/api/v1/companies/{id}/restore") =>
    mapErrors(async () => {
      let current = await read(id);
      const send = () => api.request("post", path, { path: { id }, header: { "If-Match": current.tag }, body: {} });
      await conflictAware(() => retryOnConflict(send, async () => (current = await read(id))));
      const answer = await access(id);
      if (answer.status !== "ok") throw new RepositoryError("not-found", "Not found");
      return answer.company;
    });

  const departmentOf = async (id: string, department: ApiDepartment): Promise<Department> => {
    const people = await members(id, department.scopeId).then(
      (rows) => rows.filter((member) => member.state === "ACTIVE").length,
      (error: unknown) => {
        // A context the caller cannot read shows no count rather than an invented one.
        if (isHidden(error)) return 0;
        throw error;
      },
    );
    return {
      id: department.id,
      name: department.title,
      parentId: department.kind === "UNIT" ? department.departmentId : null,
      managerId: null,
      managerName: null,
      people,
      teams: null,
      budget: null,
      kind: department.kind === "UNIT" ? "unit" : "department",
    };
  };
  const departments = (id: string) => mapErrors(async () => Promise.all((await structure(id)).map((department) => departmentOf(id, department))));

  const supported: Partial<CompanyRepository> = {
    list: () =>
      mapErrors(async () => {
        const companies = await pageAll<ApiCompany>(async (after) => (await api.request("get", "/api/v1/companies", { query: { limit: PAGE, after } })).data);
        const summaries: CompanySummary[] = [];
        for (const company of companies) {
          // Access can end between the list and the reads: such a company is simply not shown.
          const entry = await summaryOf(company).catch((error: unknown) => {
            if (isHidden(error)) return null;
            throw error;
          });
          if (entry) summaries.push(entry.summary);
        }
        // The API keeps no "recently opened" list.
        return { companies: summaries, recentIds: [] };
      }),

    access,
    restore: (id) => lifecycle(id, "/api/v1/companies/{id}/restore"),
    archive: (id) => lifecycle(id, "/api/v1/companies/{id}/archive"),

    // The company starts its deletion grace period; the typed name is checked against the live title first.
    remove: (id, confirmName, password) =>
      mapErrors(async () => {
        let current = await read(id);
        if (confirmName.trim() !== current.company.title.trim()) invalid("name-mismatch");
        const send = () => api.request("post", "/api/v1/companies/{id}/delete", { path: { id }, header: { "If-Match": current.tag }, body: { password } });
        await conflictAware(() => retryOnConflict(send, async () => (current = await read(id))));
      }),

    departments,

    // A parent makes it a unit of that department; the API has no department manager.
    createDepartment: (id, input) =>
      mapErrors(async () => {
        if (input.managerId !== null) throw new RepositoryError("unsupported", "Companies API: departments have no manager");
        const body = { id: crypto.randomUUID(), title: input.name.trim() };
        const header = { "Idempotency-Key": newIdempotencyKey() };
        const { data } = input.parentId
          ? await api.request("post", "/api/v1/companies/{id}/departments/{departmentId}/units", { path: { id, departmentId: input.parentId }, header, body })
          : await api.request("post", "/api/v1/companies/{id}/departments", { path: { id }, header, body });
        return departmentOf(id, data);
      }),

    updateDepartment: (id, departmentId, patch) =>
      mapErrors(async () => {
        if (patch.managerId !== null) throw new RepositoryError("unsupported", "Companies API: departments have no manager");
        const readOne = async () => {
          const entry = (await structure(id)).find((department) => department.id === departmentId);
          if (!entry) throw new RepositoryError("not-found", "Not found");
          return entry;
        };
        let current = await readOne();
        const send = () =>
          current.kind === "UNIT"
            ? api.request("patch", "/api/v1/companies/{id}/units/{unitId}", { path: { id, unitId: departmentId }, header: { "If-Match": revisionTag(current.revision) }, body: { title: patch.name.trim() } })
            : api.request("patch", "/api/v1/companies/{id}/departments/{departmentId}", {
                path: { id, departmentId },
                header: { "If-Match": revisionTag(current.revision) },
                body: { title: patch.name.trim() },
              });
        const { data } = await conflictAware(() => retryOnConflict(send, async () => (current = await readOne())));
        return departmentOf(id, data);
      }),

    ...createCompanyModules(api, { structure, members, me, read: async (id) => (await read(id)).company }),

    resourceRequests: refuse("resources are allocated directly; there is no request / approval record"),
    requestResource: refuse("resources are allocated directly; there is no request / approval record"),
    withdrawResourceRequest: refuse("resources are allocated directly; there is no request / approval record"),
    addResource: refuse("resources have no asset tag, type or department field to store"),
    projects: refuse("company project rows need health, progress, spend, lead and milestones the association does not carry"),
    teams: refuse("company team rows need lead, people and plan completion the association does not carry"),
    attachRequests: refuse("associations carry no subject name, owner, department, member count or linked-project consent"),
    attachCandidates: refuse("no read lists the projects / teams the caller may attach"),
    requestAttach: refuse("the candidate's kind (project / team) and its company-side proposal are not addressable from a candidate id"),
    openCorrective: refuse("opening a case needs a reviewer, which the screen does not choose (owner policy)"),
    markNotReceived: refuse(MONEY),
    markRecordedInPersonal: refuse(MONEY),
    create: refuse("creating a company needs the operator-supplied retentionPolicyVersion (OD-1)"),
    overview: refuse("no portfolio quarters, KPIs, department progress or capacity watch; reports are window totals per context"),
    invite: refuse("sending returns a one-time proof the inviter would have to deliver (OD-4)"),
    invitations: refuse(`invitee rows carry only a label and expiry; ${PROOF}`),
    acceptInvitation: refuse(PROOF),
    declineInvitation: refuse(PROOF),
    previewMove: refuse("departments cannot be moved (fixed department → unit tree, OD-5)"),
    moveDepartment: refuse("departments cannot be moved (fixed department → unit tree, OD-5)"),
    effectivePolicies: refuse("policy rules are capability rules (key, mode, roles) without the screen's named values and levels"),
    overridePolicy: refuse("policy rules are capability rules (key, mode, roles) without the screen's named values and levels"),
    staff: refuse("staff profiles carry no location, phone, work hours, equipment or booking figures"),
    updateWorkProfile: refuse("staff profiles carry no location, phone or work hours"),
    pendingInvites: refuse("pending invitation rows carry no recipient email or department"),
    goals: refuse("no company goals (OD-2)"),
    createGoal: refuse("no company goals (OD-2)"),
    updateKeyResult: refuse("no company goals (OD-2)"),
    rooms: refuse("no room type or day schedule (OD-3)"),
    bookRoom: refuse("no room type or day schedule (OD-3)"),
    capacity: refuse("no per-person / per-day capacity heat (OD-3)"),
    kbSave: refuse("knowledge documents are file versions, not page text (OD-6)"),
    kbCreate: refuse("knowledge documents are file versions, not page text (OD-6)"),
    kbVersionBody: refuse("knowledge documents are file versions, not page text (OD-6)"),
    kbRestore: refuse("knowledge documents are file versions, not page text (OD-6)"),
    kbAck: refuse("no knowledge read acknowledgement (OD-6)"),
    kbRemind: refuse("no knowledge read acknowledgement (OD-6)"),
    paymentRuns: refuse("no batch payment runs (OD-7)"),
    createRun: refuse("no batch payment runs (OD-7)"),
    confirmRun: refuse("no batch payment runs (OD-7)"),
    employeeFile: refuse("no sealed employee file, access grant or document pack (OD-8)"),
    requestFileAccess: refuse("no sealed employee file, access grant or document pack (OD-8)"),
    addDocument: refuse("no sealed employee file, access grant or document pack (OD-8)"),
    downloadPack: refuse("no sealed employee file, access grant or document pack (OD-8)"),
    settings: refuse("no legal name, currency, fiscal month, retention or grants (OD-9)"),
    updateGeneral: refuse("no legal name, currency or fiscal month (OD-9)"),
    setPolicyLevel: refuse("policy rules have no mandatory / default / optional level"),
    setGrant: refuse("no time-boxed grants (OD-9)"),
    requestTransfer: refuse("a handover takes the successor's access id without a password and answers with the handover, not the settings read model"),
  };

  return liveOnlyIn<CompanyRepository>(
    "Companies",
    MONEY,
    supported,
  );
}

// ── Modules over existing context operations (resources, knowledge, cases, attach, reports, exports, audit) ──

type Ctx = "/api/v1/companies/{id}/contexts/{scopeId}";
type ApiResource = Data<`${Ctx}/resources`, "get">["items"][number];
type ApiAllocation = Data<`${Ctx}/resources/{resourceId}/allocations`, "get">["items"][number];
type ApiFolder = Data<`${Ctx}/knowledge/folders`, "get">["items"][number];
type ApiDocument = Data<`${Ctx}/knowledge/documents`, "get">["items"][number];
type ApiVersion = Data<`${Ctx}/knowledge/documents/{documentId}/versions`, "get">["items"][number];
type ApiCase = Data<`${Ctx}/employee-cases`, "get">["items"][number];
type ApiEntry = Data<`${Ctx}/employee-cases/{caseId}/entries`, "get">["items"][number];
type ApiAssociation = Data<`${Ctx}/associations`, "get">["items"][number];

interface ModuleDeps {
  structure: (id: string) => Promise<ApiDepartment[]>;
  members: (id: string, scopeId: string) => Promise<ApiMember[]>;
  me: (id: string, scopeId: string) => Promise<ApiMe>;
  read: (id: string) => Promise<ApiCompany>;
}

const sizeLabel = (bytes: number | null) => (bytes === null ? "" : bytes < 1024 ? `${bytes} B` : bytes < 1_048_576 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`);

/** Audit actions grouped into the screen's five filters; anything else stays unfiltered (null). */
const auditKind = (action: string): AuditRow["kind"] => {
  if (action.startsWith("company.export")) return "export";
  if (action.startsWith("company.policy")) return "policy";
  if (/^company\.(employee\.case|case\.|profile|knowledge\.file|finance\.receipt)/.test(action)) return "file";
  if (/^company\.(financial|finance|expense|reimbursement|payment|acknowledgement|budget|commitment)/.test(action)) return "approval";
  if (/^company\.(membership|ownership|custody|handover|archive|restore|delete)/.test(action)) return "ownership";
  return null;
};

/** Screen report → export dataset (the API has no PDF and no goals dataset). */
const DATASET: Partial<Record<CompanyReportId, "OPERATIONS" | "FINANCE" | "PORTFOLIO" | "AUDIT">> = {
  portfolio: "PORTFOLIO",
  capacity: "OPERATIONS",
  headcount: "OPERATIONS",
  expenses: "FINANCE",
  variance: "FINANCE",
  audit: "AUDIT",
};

/** The last 30 local days: the reports' window. */
const reportWindow = () => {
  const toDate = getPlannerToday();
  return { fromDate: addDaysToDay(toDate, -29), toDate, timezone: getPlannerTimeZone() };
};

function createCompanyModules(api: CompaniesClient, deps: ModuleDeps): Partial<CompanyRepository> {
  const ctx = async (id: string) => (await deps.read(id)).scopeId;
  const hiddenAsEmpty = <T>(error: unknown): T[] => {
    if (isHidden(error)) return [];
    throw error;
  };

  // ── Resources (read): status from the resource state and its current allocation ──
  const resources = (id: string) =>
    mapErrors(async (): Promise<CompanyResource[]> => {
      const [root, departments] = await Promise.all([ctx(id), deps.structure(id)]);
      const scopes = [{ scopeId: root, department: null as ApiDepartment | null }, ...departments.map((department) => ({ scopeId: department.scopeId, department }))];
      const rows: CompanyResource[] = [];
      for (const { scopeId, department } of scopes) {
        const list = await pageAll<ApiResource>(
          async (after) => (await api.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/resources", { path: { id, scopeId }, query: { limit: PAGE, after } })).data,
        ).catch((error: unknown) => hiddenAsEmpty<ApiResource>(error));
        if (!list.length) continue;
        const people = await deps.members(id, scopeId).catch((error: unknown) => hiddenAsEmpty<ApiMember>(error));
        for (const resource of list) {
          const allocations = await pageAll<ApiAllocation>(
            async (after) =>
              (
                await api.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/resources/{resourceId}/allocations", {
                  path: { id, scopeId, resourceId: resource.id },
                  query: { limit: PAGE, after },
                })
              ).data,
          );
          const now = Date.now();
          const current = allocations.find((allocation) => allocation.state === "ALLOCATED" && Date.parse(allocation.startAt) <= now && Date.parse(allocation.endAt) > now);
          const holder = current ? people.find((member) => member.id === current.member.accessId) : undefined;
          rows.push({
            id: resource.id,
            // The API has no asset tag or type.
            tag: "",
            name: resource.title,
            type: "other",
            assigneeId: current?.member.accessId ?? null,
            assigneeName: current ? (holder?.displayName ?? "") : null,
            departmentId: department?.id ?? null,
            departmentName: department?.title ?? null,
            status: resource.state === "RETIRED" ? "retired" : current ? "assigned" : "available",
            note: resource.description,
            since: current?.startAt ?? null,
            busy: allocations.filter((allocation) => allocation.state === "ALLOCATED").map((allocation) => ({ from: allocation.startAt, to: allocation.endAt })),
          });
        }
      }
      return rows;
    });

  // ── Knowledge base (read): documents are published file versions ──
  const folders = async (id: string, scopeId: string) =>
    pageAll<ApiFolder>(async (after) => (await api.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/knowledge/folders", { path: { id, scopeId }, query: { limit: PAGE, after } })).data);
  const documents = async (id: string, scopeId: string, query: { folderId?: string; search?: string }) =>
    pageAll<ApiDocument>(
      async (after) => (await api.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/knowledge/documents", { path: { id, scopeId }, query: { limit: PAGE, after, ...query } })).data,
    );
  const versions = async (id: string, scopeId: string, documentId: string) =>
    pageAll<ApiVersion>(
      async (after) =>
        (await api.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/knowledge/documents/{documentId}/versions", { path: { id, scopeId, documentId }, query: { limit: PAGE, after } })).data,
    );
  const published = (all: readonly ApiVersion[]) => all.filter((version) => version.publishedAt !== null).sort((a, b) => Date.parse(a.publishedAt!) - Date.parse(b.publishedAt!));
  const pageSummary = (document: ApiDocument, all: readonly ApiVersion[]): KbPageSummary => {
    const list = published(all);
    return {
      id: document.id,
      folderId: document.folderId ?? "",
      title: document.title,
      version: list.length,
      updatedAt: list.at(-1)?.publishedAt ?? document.updatedAt,
      // Versions carry no author; the API has no read acknowledgement.
      updatedBy: "",
      ackRequired: false,
      acknowledged: false,
    };
  };

  // ── Corrective actions = employee cases (+ entries) in the company context ──
  const entries = async (id: string, scopeId: string, caseId: string) =>
    pageAll<ApiEntry>(
      async (after) => (await api.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/employee-cases/{caseId}/entries", { path: { id, scopeId, caseId }, query: { limit: PAGE, after } })).data,
    );
  const latest = (list: readonly ApiEntry[], kind: ApiEntry["kind"]) =>
    [...list].filter((entry) => entry.kind === kind).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]?.body ?? null;
  const correctiveOf = (row: ApiCase, list: readonly ApiEntry[]): CorrectiveAction => {
    const response = latest(list, "RESPONSE");
    const appeal = latest(list, "APPEAL");
    return {
      id: row.id,
      reason: row.reason ?? "",
      evidence: row.evidence ?? "",
      visibleTo: row.reviewer.displayName ?? "",
      openedBy: row.author.displayName ?? "",
      openedAt: row.createdAt,
      status: row.state === "RESOLVED" ? "closed" : appeal !== null ? "appealed" : response !== null ? "responded" : "open",
      response,
      appeal,
      outcome: row.state === "RESOLVED" ? latest(list, "REVIEW") : null,
    };
  };
  const caseEntry = (kind: "RESPONSE" | "APPEAL" | "REVIEW") => (id: string, personId: string, actionId: string, text: string) =>
    mapErrors(async () => {
      const body = text.trim();
      if (!body) invalid("empty");
      const scopeId = await ctx(id);
      const read = async () => (await api.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/employee-cases/{caseId}", { path: { id, scopeId, caseId: actionId } })).data;
      let current = await read();
      // A case is addressed through its subject: another person's case is not found here.
      if (current.subject.accessId !== personId) throw new RepositoryError("not-found", "Not found");
      const send = () =>
        api.request("post", "/api/v1/companies/{id}/contexts/{scopeId}/employee-cases/{caseId}/entries", {
          path: { id, scopeId, caseId: actionId },
          header: { "If-Match": revisionTag(current.revision), "Idempotency-Key": newIdempotencyKey() },
          body: kind === "REVIEW" ? { id: crypto.randomUUID(), kind, body, state: "RESOLVED" } : { id: crypto.randomUUID(), kind, body },
        });
      const { data } = await conflictAware(() => retryOnConflict(send, async () => (current = await read())));
      return correctiveOf(data.case, await entries(id, scopeId, actionId));
    });

  // ── Attach decisions on an existing association (addressed by its id) ──
  const association = async (id: string, requestId: string) => {
    const scopeId = await ctx(id);
    const rows = await pageAll<ApiAssociation>(
      async (after) => (await api.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/associations", { path: { id, scopeId }, query: { limit: PAGE, after } })).data,
    );
    const row = rows.find((candidate) => candidate.id === requestId);
    if (!row) throw new RepositoryError("not-found", "Not found");
    return { scopeId, row };
  };
  const revoke = (side: "SOURCE" | "COMPANY") => (id: string, requestId: string) =>
    mapErrors(async () => {
      const { scopeId, row } = await association(id, requestId);
      await api.request("post", "/api/v1/companies/{id}/contexts/{scopeId}/associations/{kind}/{target}/revoke", {
        path: { id, scopeId, kind: row.kind, target: row.sourceId },
        header: { "If-Match": revisionTag(row.revision) },
        body: { side },
      });
    });

  return {
    resources,

    kbFolders: (id) =>
      mapErrors(async () => {
        const scopeId = await ctx(id);
        const [list, docs] = await Promise.all([folders(id, scopeId), documents(id, scopeId, {})]);
        return list
          .filter((folder) => !folder.archived)
          .map((folder): KbFolder => ({
            id: folder.id,
            name: folder.title,
            parentId: folder.parentId,
            // The API lists only folders the caller may read and marks none as restricted.
            restricted: false,
            pages: docs.filter((document) => document.folderId === folder.id && !document.archived).length,
          }));
      }),

    kbPages: (id, folderId) =>
      mapErrors(async () => {
        const scopeId = await ctx(id);
        const docs = (await documents(id, scopeId, { folderId })).filter((document) => !document.archived);
        return Promise.all(docs.map(async (document) => pageSummary(document, await versions(id, scopeId, document.id))));
      }),

    kbPage: (id, pageId) =>
      mapErrors(async (): Promise<KbPage | null> => {
        const scopeId = await ctx(id);
        let document: ApiDocument;
        try {
          document = (await api.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/knowledge/documents/{target}", { path: { id, scopeId, target: pageId } })).data;
        } catch (error) {
          if (isHidden(error)) return null;
          throw error;
        }
        const all = await versions(id, scopeId, pageId);
        const list = published(all);
        const current = list.find((version) => version.id === document.publishedVersionId) ?? list.at(-1);
        const text = !!current && current.mimeType.startsWith("text/");
        // A plain-text published file is the page body; any other file is listed as the page's file.
        let body = "";
        if (current && text) {
          const { data } = await api.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/knowledge/documents/{documentId}/versions/{target}/download", {
            path: { id, scopeId, documentId: pageId, target: current.id },
          });
          const raw: unknown = data;
          body = typeof raw === "string" ? raw : raw instanceof Blob ? await raw.text() : "";
        }
        return {
          ...pageSummary(document, all),
          body,
          versions: list.map((version, index) => ({ version: index + 1, at: version.publishedAt!, by: "", note: version.description ?? "" })),
          files: current && !text ? [{ id: current.id, name: current.filename, size: sizeLabel(current.actualSize) }] : [],
          ackCount: 0,
          audience: 0,
          canEdit: false,
          remindedVersion: null,
        };
      }),

    kbSearch: (id, query) =>
      mapErrors(async () => {
        const term = query.trim();
        if (!term) return [];
        const scopeId = await ctx(id);
        const [docs, list] = await Promise.all([documents(id, scopeId, { search: term }), folders(id, scopeId)]);
        return docs
          .filter((document) => !document.archived)
          .map((document): KbSearchHit => ({
            id: document.id,
            kind: "page",
            title: document.title,
            folderName: list.find((folder) => folder.id === document.folderId)?.title ?? "",
            pageId: document.id,
            snippet: document.description ?? "",
          }));
      }),

    respondCorrective: caseEntry("RESPONSE"),
    appealCorrective: caseEntry("APPEAL"),
    closeCorrective: caseEntry("REVIEW"),

    // The subject's owner accepts the attachment request (no password step and no per-project consent in the API).
    acceptAttach: (id, requestId, _password, projectConsent) =>
      mapErrors(async () => {
        if (Object.values(projectConsent).some((consent) => !consent))
          throw new RepositoryError("unsupported", "Companies API: attaching has no per-project consent; every linked project follows the team");
        const { scopeId, row } = await association(id, requestId);
        const { data } = await api.request("post", "/api/v1/companies/{id}/contexts/{scopeId}/associations/{kind}/{target}/attachment-requests/accept", {
          path: { id, scopeId, kind: row.kind, target: row.sourceId },
          header: { "If-Match": revisionTag(row.revision) },
          body: {},
        });
        // Names and counts of the screen's request row are not carried by the association (left blank).
        return {
          id: data.id,
          kind: data.kind === "TEAM" ? "team" : "project",
          subjectId: data.sourceId,
          subjectName: "",
          ownerName: "",
          departmentId: "",
          departmentName: "",
          members: 0,
          linkedProjects: [],
          status: data.state === "ATTACHED" ? "accepted" : "pending",
          requestedAt: data.createdAt,
          iAmOwner: true,
        };
      }),
    declineAttach: revoke("SOURCE"),
    cancelAttach: revoke("COMPANY"),

    // Head count and capacity (hours) per department from each department's operations report (last 30 days).
    reports: (id, departmentId) =>
      mapErrors(async (): Promise<CompanyReport[]> => {
        const window = reportWindow();
        const departments = (await deps.structure(id)).filter((department) => department.kind === "DEPARTMENT" && (!departmentId || department.id === departmentId));
        const rows = await Promise.all(
          departments.map((department) =>
            api.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/reports/operations", { path: { id, scopeId: department.scopeId }, query: window }).then(
              ({ data }) => ({ department, data }),
              (error: unknown) => {
                if (isHidden(error)) return null;
                throw error;
              },
            ),
          ),
        );
        const readable = rows.filter((row): row is NonNullable<typeof row> => row !== null);
        if (!readable.length) return [];
        const scope = departmentId ? "department" : "company";
        const source = readable[0].data.basis;
        return [
          { id: "headcount", scope, source, series: readable.map(({ department, data }) => ({ label: department.title, value: data.memberCount })) },
          { id: "capacity", scope, source, series: readable.map(({ department, data }) => ({ label: department.title, value: Math.round(data.availableMinutes / 60) })) },
        ];
      }),

    // Exports are delivered inline when requested; the history has no later download.
    exports: (id) =>
      mapErrors(async () => {
        const scopeId = await ctx(id);
        const rows = await pageAll<Data<`${Ctx}/exports`, "get">["items"][number]>(
          async (after) => (await api.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/exports", { path: { id, scopeId }, query: { limit: PAGE, after } })).data,
        );
        return rows.map(
          (row): CompanyExport => ({
            id: row.id,
            report: null,
            format: null,
            requestedAt: row.publishedAt,
            requestedBy: "",
            status: row.downloadAvailable ? "ready" : "expired",
            expiresAt: null,
            watermark: null,
          }),
        );
      }),

    requestExport: (id, report, format) =>
      mapErrors(async (): Promise<CompanyExport> => {
        const dataset = DATASET[report];
        if (format !== "csv" || !dataset)
          throw new RepositoryError("unsupported", "Companies API: exports are CSV / JSON of the operations, finance, portfolio, knowledge or audit dataset (no PDF, no goals)");
        const company = await deps.read(id);
        const [result, admission, roster] = await Promise.all([
          api.request("post", "/api/v1/companies/{id}/contexts/{scopeId}/exports", { path: { id, scopeId: company.scopeId }, body: { ...reportWindow(), dataset, format: "CSV" } }),
          deps.me(id, company.scopeId),
          deps.members(id, company.scopeId),
        ]);
        const raw: unknown = result.data;
        const blob = raw instanceof Blob ? raw : new Blob([typeof raw === "string" ? raw : JSON.stringify(raw)], { type: "text/csv" });
        const exportId = result.headers.get("X-Export-Id") ?? "";
        return {
          id: exportId,
          report,
          format: "csv",
          requestedAt: new Date().toISOString(),
          requestedBy: roster.find((member) => member.id === admission.accessId)?.displayName ?? "",
          status: "ready",
          expiresAt: null,
          watermark: null,
          file: { blob, name: `${company.title}-${report}${exportId ? `-${exportId}` : ""}.csv` },
        };
      }),

    audit: (id) =>
      mapErrors(async () => {
        const scopeId = await ctx(id);
        const rows = await pageAll<Data<`${Ctx}/audit`, "get">["items"][number]>(
          async (after) => (await api.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/audit", { path: { id, scopeId }, query: { limit: PAGE, after } })).data,
        );
        return rows.map((row): AuditRow => ({ id: row.id, at: row.occurredAt, who: row.actorDisplayName ?? "", action: row.action, subject: row.resourceId ?? "", kind: auditKind(row.action) }));
      }),
  };
}
