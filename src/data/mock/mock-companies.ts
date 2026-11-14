import { getPlannerNow, getPlannerToday } from "../clock";
import type {
  Approval,
  ApprovalChain,
  ApprovalHistoryRow,
  ApprovalStepState,
  ApprovalSubject,
  AttachCandidate,
  AttachRequest,
  AuditRow,
  BudgetLine,
  CapacityHeat,
  ChainStep,
  CompanyAccess,
  CompanyCapabilities,
  CompanyExport,
  CompanyGoal,
  CompanyGrant,
  CompanyGrantKind,
  CompanyInvitation,
  CompanyNotification,
  CompanyModule,
  CompanyProjectRow,
  CompanyReport,
  CompanyResource,
  CompanyRole,
  CompanyRoom,
  CompanySummary,
  CompanyTeamRow,
  CorrectiveAction,
  Department,
  EmployeeFileAccess,
  Expense,
  FileAccessLogRow,
  FileDocument,
  KbFolder,
  KbPage,
  PaymentRun,
  PolicyDefinition,
  Reimbursement,
  ResourceRequest,
  WorkProfile,
} from "../company-domain";
import type { CompanyRepository } from "../company-repositories";
import { RepositoryError } from "../repositories";
import {
  ME_ID,
  approvalFixtures,
  approvalHistoryFixtures,
  attachCandidateFixtures,
  attachRequestFixtures,
  auditFixtures,
  budgetFixtures,
  capacityFixture,
  chainFixtures,
  companyFixtures,
  companyGoalFixtures,
  companyInvitationFixtures,
  correctiveFixtures,
  departmentFixtures,
  departmentProgressFixtures,
  expenseFixtures,
  exportFixtures,
  fileDocumentFixtures,
  fileGrantFixtures,
  fileLogFixtures,
  grantFixtures,
  kbFolderFixtures,
  kbGrantedFolderIds,
  kbPageFixtures,
  newThisQuarterIds,
  novaLabs,
  paymentRunFixtures,
  pendingInviteFixtures,
  policyFixtures,
  policyOverrideFixtures,
  portfolioFixture,
  projectRowFixtures,
  reimbursementFixtures,
  resourceFixtures,
  resourceRequestFixtures,
  roomBookingFixtures,
  roomFixtures,
  staffFixtures,
  teamRowFixtures,
} from "@/fixtures/companies";

/*
 * In-memory Companies adapter (Phase 4 mock, design/company). One state per
 * company: no call ever reads another company's state (custody boundary).
 * Sensitive actions (file opens, decisions, overrides, exports, ownership)
 * append to that company's audit log. Nothing here touches Personal data.
 */

const clone = <T>(value: T): T => structuredClone(value);
const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const ADMIN_ROLES: readonly CompanyRole[] = ["owner", "admin"];
const isAdmin = (role: CompanyRole) => ADMIN_ROLES.includes(role);

/** SPEC permission tables → capabilities. Special grants never come from the role. */
export function companyCapabilities(
  role: CompanyRole,
  managedDepartmentIds: string[],
  grants: CompanyGrantKind[],
): CompanyCapabilities {
  const admin = isAdmin(role);
  const manager = admin || role === "manager";
  const lead = manager || role === "lead";
  const contributor = role !== "viewer";
  const modules: Record<CompanyModule, boolean> = {
    overview: true,
    departments: true,
    people: true,
    work: true,
    goals: true,
    resources: true,
    expenses: contributor,
    approvals: lead,
    budgets: manager,
    knowledge: true,
    reports: contributor,
    settings: admin,
  };
  return {
    modules,
    allDepartments: admin,
    managedDepartmentIds: role === "manager" ? managedDepartmentIds : [],
    budgetCard: manager,
    export: admin,
    manageDepartments: admin,
    transferStaff: manager,
    overridePolicy: manager,
    invite: admin,
    editWorkProfile: admin || grants.includes("hr"),
    requestFileAccess: manager,
    requestAttach: admin,
    createWork: lead,
    seeWorkBudgets: manager,
    createCompanyGoal: admin,
    createDepartmentGoal: manager,
    linkGoalWork: lead,
    requestResource: contributor,
    manageResources: admin,
    seeCapacity: lead,
    createKbPage: contributor,
    manageKb: admin,
    seeAllExpenses: admin,
    createExpense: contributor,
    approve: manager || role === "lead",
    approvalHistoryAll: admin,
    companyBudgets: admin,
    requestBudgetChange: manager,
    settleReimbursements: admin,
    companyReports: admin,
    departmentReports: lead,
    auditLog: admin || grants.includes("security"),
    openSettings: admin,
    lifecycle: role === "owner",
    grants,
  };
}

interface KbPageState extends KbPage {
  bodies: Record<number, string>;
}

interface CompanyState {
  company: CompanySummary;
  departments: Department[];
  overrides: Record<string, Record<string, { value: string; reason: string; by: string; at: string }>>;
  policies: PolicyDefinition[];
  staff: WorkProfile[];
  invites: { id: string; email: string; role: CompanyRole; departmentName: string }[];
  projects: CompanyProjectRow[];
  teams: CompanyTeamRow[];
  attach: AttachRequest[];
  candidates: AttachCandidate[];
  goals: CompanyGoal[];
  resources: CompanyResource[];
  requests: ResourceRequest[];
  folders: KbFolder[];
  grantedFolders: string[];
  pages: KbPageState[];
  expenses: Expense[];
  approvals: Approval[];
  history: ApprovalHistoryRow[];
  chains: ApprovalChain[];
  budgets: BudgetLine[];
  reimbursements: Reimbursement[];
  runs: PaymentRun[];
  fileGrants: Record<string, { kind: "hr" | "supervisor"; until: string | null }>;
  fileRequests: Set<string>;
  documents: Record<string, FileDocument[]>;
  fileLog: Record<string, FileAccessLogRow[]>;
  corrective: Record<string, CorrectiveAction[]>;
  exports: CompanyExport[];
  audit: AuditRow[];
  grants: (CompanyGrant & { personName: string })[];
  transfer: { toName: string; status: "pending" } | null;
  capacity: CapacityHeat;
  rooms: CompanyRoom[];
  /** The viewer's notifications here (server-created in live mode; none are seeded). */
  notifications: CompanyNotification[];
}

/** A page without its stored version bodies. */
function publicPage(page: KbPageState): KbPage {
  const copy: Partial<KbPageState> = clone(page);
  delete copy.bodies;
  return copy as KbPage;
}

function withBodies(page: KbPage): KbPageState {
  const paragraphs = page.body.split("\n\n");
  const bodies: Record<number, string> = {};
  for (const version of page.versions) {
    // Older versions: one paragraph fewer per version (sample history for the diff).
    const drop = page.version - version.version;
    bodies[version.version] = paragraphs.slice(0, Math.max(1, paragraphs.length - drop)).join("\n\n");
  }
  return { ...clone(page), bodies };
}

function eurolyState(): CompanyState {
  return {
    company: clone(companyFixtures[0]!),
    departments: clone(departmentFixtures),
    overrides: clone(policyOverrideFixtures),
    policies: clone(policyFixtures),
    staff: clone(staffFixtures),
    invites: clone(pendingInviteFixtures),
    projects: clone(projectRowFixtures),
    teams: clone(teamRowFixtures),
    attach: clone(attachRequestFixtures),
    candidates: clone(attachCandidateFixtures),
    goals: clone(companyGoalFixtures),
    resources: clone(resourceFixtures),
    requests: clone(resourceRequestFixtures),
    folders: clone(kbFolderFixtures),
    grantedFolders: [...kbGrantedFolderIds],
    pages: kbPageFixtures.map(withBodies),
    expenses: clone(expenseFixtures),
    approvals: clone(approvalFixtures),
    history: clone(approvalHistoryFixtures),
    chains: clone(chainFixtures),
    budgets: clone(budgetFixtures),
    reimbursements: clone(reimbursementFixtures),
    runs: clone(paymentRunFixtures),
    fileGrants: clone(fileGrantFixtures),
    fileRequests: new Set(),
    documents: clone(fileDocumentFixtures),
    fileLog: clone(fileLogFixtures),
    corrective: clone(correctiveFixtures),
    exports: clone(exportFixtures),
    audit: clone(auditFixtures),
    grants: clone(grantFixtures),
    transfer: null,
    capacity: clone(capacityFixture),
    rooms: roomFixtures.map((room) => ({ ...clone(room), bookings: clone(roomBookingFixtures[room.id] ?? []) })),
    notifications: [],
  };
}

/** A company with little data yet (Araxitis, new companies): empty states everywhere. */
function smallState(company: CompanySummary, departments: [string, string][]): CompanyState {
  const me: WorkProfile = {
    ...clone(staffFixtures.find((person) => person.id === ME_ID)!),
    role: company.role,
    position: company.role === "owner" ? "Founder" : "Product Designer",
    departmentIds: company.departmentId ? [company.departmentId] : [],
    departmentNames: company.departmentName ? [company.departmentName] : [],
    supervisorId: null,
    supervisorName: null,
    email: `mehran@${company.name.toLowerCase().replace(/\W+/g, "")}.com`,
    equipment: [],
  };
  return {
    company,
    departments: departments.map(([id, name]) => ({
      id,
      name,
      parentId: null,
      managerId: null,
      managerName: null,
      people: id === company.departmentId ? 1 : 0,
      teams: [],
      budget: 0,
      kind: "department",
    })),
    overrides: {},
    policies: clone(policyFixtures.slice(0, 2)),
    staff: [me],
    invites: [],
    projects: [],
    teams: [],
    attach: [],
    candidates: [],
    goals: [],
    resources: [],
    requests: [],
    folders: [],
    grantedFolders: [],
    pages: [],
    expenses: [],
    approvals: [],
    history: [],
    chains: clone(chainFixtures),
    budgets: [],
    reimbursements: [],
    runs: [],
    fileGrants: {},
    fileRequests: new Set(),
    documents: { [ME_ID]: [] },
    fileLog: { [ME_ID]: [] },
    corrective: {},
    exports: [],
    audit: [],
    grants: company.role === "owner" ? [] : [],
    transfer: null,
    capacity: { months: [7, 8, 9], rows: [] },
    rooms: [],
    notifications: [],
  };
}

export interface MockCompaniesOptions {
  /** Tests: start with no companies (CO-00 empty state). */
  empty?: boolean;
}

export function createMockCompanies({ empty = false }: MockCompaniesOptions = {}): CompanyRepository {
  const states = new Map<string, CompanyState>();
  if (!empty) {
    states.set("euroly", eurolyState());
    const araxitis = clone(companyFixtures[1]!);
    states.set(
      "araxitis",
      smallState(araxitis, [
        ["ax-design", "Design"],
        ["ax-eng", "Engineering"],
        ["ax-product", "Product"],
      ]),
    );
  }
  let invitations: CompanyInvitation[] = empty ? [] : clone(companyInvitationFixtures);
  let recentIds = empty ? [] : ["euroly", "araxitis"];
  const left = new Set<string>(["old-co"]);
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}-${(sequence += 1)}`;

  const get = (id: string): CompanyState => {
    const state = states.get(id);
    if (!state) throw new RepositoryError("not-found", `Company ${id} is not available`);
    return state;
  };
  const meIn = (state: CompanyState) => state.staff.find((person) => person.id === ME_ID);
  /** Department transfers stay inside one company; the caller never moves their own seat. */
  const transferSeat = (state: CompanyState, personId: string, fromDepartmentId: string, toDepartmentId: string) => {
    const person = state.staff.find((candidate) => candidate.id === personId && candidate.status !== "left");
    if (!person || !person.departmentIds.includes(fromDepartmentId)) throw new RepositoryError("not-found", "Person not found");
    const to = state.departments.find((department) => department.id === toDepartmentId);
    if (!to) throw new RepositoryError("not-found", "Department not found");
    if (person.id === ME_ID) throw new RepositoryError("forbidden", "You can't move your own seat");
    if (fromDepartmentId === toDepartmentId || person.departmentIds.includes(toDepartmentId)) throw new RepositoryError("invalid", "Already in that department");
    return { person, to };
  };
  const myGrants = (state: CompanyState): CompanyGrantKind[] => {
    const today = getPlannerToday();
    return state.grants
      .filter((grant) => grant.personId === ME_ID && (grant.until === null || grant.until >= today))
      .map((grant) => grant.kind);
  };
  const managed = (state: CompanyState) =>
    state.departments.filter((dept) => dept.managerId === ME_ID).map((dept) => dept.id).concat(
      // Preview as Dept Manager: my own department.
      meIn(state)?.departmentIds.slice(0, 1) ?? [],
    );
  const audit = (state: CompanyState, action: string, subject: string, kind: AuditRow["kind"]) => {
    state.audit.unshift({ id: nextId("a"), at: getPlannerNow(), who: "Mehran R.", action, subject, kind });
  };
  const forMeCount = (state: CompanyState) => state.approvals.filter((item) => item.forMe && item.status === "pending").length;
  const summary = (state: CompanyState): CompanySummary => ({
    ...clone(state.company),
    approvalsForMe: forMeCount(state),
    departments: state.departments.filter((dept) => dept.kind === "department").length,
  });

  /* ── approval routing (sequential chain, amount conditions, C7) ── */
  const publishedChain = (state: CompanyState, subject: ApprovalSubject) =>
    state.chains.find((chain) => chain.subject === subject && chain.status === "published")!;

  const reviewerFor = (
    state: CompanyState,
    stepDef: ChainStep,
    departmentId: string | null,
    requesterId: string,
  ): { id: string; name: string; note: string | null } | null => {
    const person = (id: string | null | undefined) => state.staff.find((candidate) => candidate.id === id);
    const owner = state.staff.find((candidate) => candidate.role === "owner");
    const admin = state.staff.find((candidate) => candidate.role === "admin");
    let primary: WorkProfile | undefined;
    if (stepDef.approver === "dept-manager") primary = person(state.departments.find((dept) => dept.id === departmentId)?.managerId);
    if (stepDef.approver === "owner") primary = owner;
    if (stepDef.approver === "admin") primary = admin;
    const grantKind = stepDef.approver === "finance" ? "finance" : stepDef.approver === "hr" ? "hr" : null;
    const holders = grantKind ? state.grants.filter((grant) => grant.kind === grantKind).map((grant) => person(grant.personId)) : [];
    if (grantKind) primary = holders[0];
    if (!primary) return null;
    if (primary.id !== requesterId) return { id: primary.id, name: primary.name, note: null };
    // C7: the requester never approves their own item → next eligible.
    const next =
      holders.find((holder) => holder && holder.id !== requesterId) ??
      (admin && admin.id !== requesterId ? admin : owner && owner.id !== requesterId ? owner : undefined);
    if (!next) return null;
    return { id: next.id, name: next.name, note: `Requester is the ${stepDef.label.toLowerCase()} → next eligible (${next.name})` };
  };

  const buildSteps = (
    state: CompanyState,
    subject: ApprovalSubject,
    amount: number | null,
    departmentId: string | null,
    requesterId: string,
  ): { chain: ApprovalChain; steps: ApprovalStepState[] } => {
    const chain = publishedChain(state, subject);
    let current = false;
    const steps = chain.steps.map((stepDef): ApprovalStepState => {
      const applies = stepDef.minAmount === null || (amount !== null && amount > stepDef.minAmount);
      if (!applies) {
        return {
          stepId: stepDef.id,
          label: stepDef.label,
          reviewerId: null,
          reviewerName: null,
          routedNote: `Below ${stepDef.minAmount?.toLocaleString("en-US")}`,
          state: "skipped",
          decision: null,
          escalatesOn: null,
        };
      }
      const reviewer = reviewerFor(state, stepDef, departmentId, requesterId);
      const isCurrent = !current;
      current = true;
      return {
        stepId: stepDef.id,
        label: stepDef.label,
        reviewerId: reviewer?.id ?? null,
        reviewerName: reviewer?.name ?? null,
        routedNote: reviewer?.note ?? null,
        state: isCurrent ? "current" : "waiting",
        decision: null,
        escalatesOn: isCurrent ? addDays(getPlannerToday(), stepDef.escalateAfterDays) : null,
      };
    });
    return { chain, steps };
  };

  const refreshForMe = (approval: Approval) => {
    const current = approval.steps[approval.currentStep - 1];
    approval.forMe = approval.status === "pending" && current?.reviewerId === ME_ID && approval.requesterId !== ME_ID;
  };

  const adjustPending = (state: CompanyState, departmentId: string, delta: number) => {
    const line = state.budgets.find((item) => item.kind === "department" && item.departmentId === departmentId);
    if (line) line.pending = Math.max(0, line.pending + delta);
  };

  const fileAccess = (state: CompanyState, personId: string): EmployeeFileAccess => {
    const person = state.staff.find((candidate) => candidate.id === personId);
    if (!person) throw new RepositoryError("not-found", "Person not found");
    const ref = { id: person.id, name: person.name, initials: person.initials };
    const own = personId === ME_ID;
    const grant = state.fileGrants[personId];
    const today = getPlannerToday();
    // Owner / Org Admin get NO access by role (C9): only an explicit, unexpired grant opens it.
    if (!own && (!grant || (grant.until !== null && grant.until < today))) {
      return { status: "sealed", person: ref, requested: state.fileRequests.has(personId) };
    }
    if (!own) {
      const what = `opened file (grant: ${grant!.kind === "hr" ? "HR reviewer" : "supervisor"})`;
      const log = (state.fileLog[personId] ??= []);
      if (!(log[0]?.who === "Mehran R." && log[0]?.what === what && log[0]?.at === getPlannerNow())) {
        log.unshift({ id: nextId("fl"), at: getPlannerNow(), who: "Mehran R.", what });
        audit(state, `opened sealed file (grant ${grant!.kind === "hr" ? "HR reviewer" : "supervisor"})`, `${person.name} · employee file`, "file");
      }
    }
    const supervisor = person.supervisorId === ME_ID;
    return {
      status: "open",
      person: ref,
      own,
      grant: own ? { kind: "self", until: null } : { kind: grant!.kind, until: grant!.until },
      canAddDocument: !own && grant?.kind === "hr",
      canOpenCorrective: !own && (grant?.kind === "hr" || supervisor),
      documents: clone(state.documents[personId] ?? []),
      log: clone(state.fileLog[personId] ?? []),
      corrective: clone(state.corrective[personId] ?? []),
    };
  };

  const findCorrective = (state: CompanyState, personId: string, actionId: string) => {
    const action = state.corrective[personId]?.find((item) => item.id === actionId);
    if (!action) throw new RepositoryError("not-found", "Corrective action not found");
    return action;
  };

  const settingsOf = (state: CompanyState) => ({
    name: state.company.name,
    legalName: state.company.legalName,
    currency: state.company.currency ?? "toman", // mock fixtures always carry one
    currencyLocked: state.company.currencyLocked,
    fiscalStartMonth: state.company.fiscalStartMonth ?? 1,
    policies: clone(state.policies),
    grants: clone(state.grants),
    eligibleOwners: state.staff
      .filter((person) => person.role === "admin" && person.id !== ME_ID)
      .concat(state.staff.filter((person) => person.role === "admin" && person.id === ME_ID))
      .map((person) => ({ id: person.id, name: person.name, initials: person.initials })),
    transfer: clone(state.transfer),
    transferReauth: true,
    retentionYears: 7,
  });

  const repo: CompanyRepository = {
    async list() {
      await wait();
      return {
        companies: [...states.values()].map(summary),
        recentIds: recentIds.filter((id) => states.has(id)),
      };
    },

    async access(id, options = {}) {
      await wait();
      if (left.has(id)) return { status: "left" };
      const invitation = invitations.find((item) => item.companyId === id);
      if (invitation) return { status: "invite-pending", invitation: clone(invitation) };
      const state = states.get(id);
      if (!state) return { status: "not-available" };
      recentIds = [id, ...recentIds.filter((other) => other !== id)];
      const role = options.previewRole ?? state.company.role;
      const company = summary(state);
      company.role = role;
      if (options.previewArchived) {
        company.lifecycle = "archived";
        company.lifecycleAt = "2026-10-01";
      }
      const me = meIn(state)!;
      const answer: CompanyAccess = {
        status: "ok",
        company,
        capabilities: companyCapabilities(role, managed(state), options.previewRole ? [] : myGrants(state)),
        me: { id: me.id, name: me.name, initials: me.initials },
        myDepartmentIds: [...me.departmentIds],
      };
      return answer;
    },

    async create(input) {
      await wait();
      const id = nextId("co");
      const company: CompanySummary = {
        id,
        name: input.name.trim(),
        legalName: input.legalName.trim() || input.name.trim(),
        initials: input.name.trim().slice(0, 2).toUpperCase(),
        tint: "purple",
        role: "owner",
        departmentId: null,
        departmentName: null,
        people: 1,
        departments: 0,
        approvalsForMe: 0,
        lifecycle: "active",
        lifecycleAt: null,
        currency: input.currency,
        currencyLocked: false,
        fiscalStartMonth: input.fiscalStartMonth,
        updatedAt: getPlannerNow(),
      };
      const state = smallState(
        company,
        input.departments.map((name) => name.trim()).filter(Boolean).map((name) => [nextId("d"), name] as [string, string]),
      );
      state.staff[0]!.role = "owner";
      state.staff[0]!.position = "Founder";
      states.set(id, state);
      recentIds = [id, ...recentIds];
      return clone(company);
    },

    async restore(id) {
      await wait();
      const state = get(id);
      state.company.lifecycle = "active";
      state.company.lifecycleAt = null;
      return summary(state);
    },

    async overview(id, departmentId, role) {
      await wait();
      const state = get(id);
      const inScope = <T extends { departmentId: string | null }>(item: T) =>
        departmentId === null || item.departmentId === departmentId;
      const projects = state.projects.filter(inScope);
      const portfolio =
        departmentId === null && id === "euroly"
          ? clone(portfolioFixture)
          : {
              quarter: "Q4 1405",
              onTrack: projects.filter((item) => item.health === "on-track").length,
              active: projects.length,
              atRisk: projects.filter((item) => item.health === "at-risk").length,
              offTrack: projects.filter((item) => item.health === "off-track").length,
              history: [],
            };
      const people = state.staff.filter((person) => departmentId === null || person.departmentIds.includes(departmentId));
      const goals = state.goals.filter((goal) => departmentId === null || goal.departmentId === departmentId || goal.level === "company");
      const lines = state.budgets.filter((line) => line.kind === "department" && inScope(line));
      const sum = (pick: (line: BudgetLine) => number) => lines.reduce((total, line) => total + pick(line), 0);
      const pendingForMe = state.approvals.filter((item) => item.forMe && item.status === "pending");
      const watchRow = state.capacity.rows
        .filter((row) => departmentId === null || row.departmentId === departmentId)
        .find((row) => (row.values[1] ?? 0) >= 90);
      const dept = (deptId: string) => state.departments.find((item) => item.id === deptId);
      return {
        portfolio,
        kpis: {
          teams: state.teams.filter(inScope).length,
          teamsSentPlan: Math.max(0, state.teams.filter(inScope).length - 1),
          people: departmentId === null ? state.company.people : (dept(departmentId)?.people ?? people.length),
          joinedThisQuarter: departmentId === null ? newThisQuarterIds.length : people.filter((p) => newThisQuarterIds.includes(p.id)).length,
          onLeave: people.filter((person) => person.status === "leave").length + (departmentId === null && id === "euroly" ? 1 : 0),
          goalsOnPace: goals.filter((goal) => goal.onPace).length + (departmentId === null && id === "euroly" ? 2 : 0),
          goals: goals.length + (departmentId === null && id === "euroly" ? 4 : 0),
          approvalsForMe: pendingForMe.length,
          oldestWaitingDays: pendingForMe.length
            ? Math.max(...pendingForMe.map((item) => daysBetween(item.submittedAt.slice(0, 10), getPlannerToday())))
            : 0,
        },
        departments: departmentProgressFixtures
          .filter((row) => state.departments.some((item) => item.id === row.departmentId))
          .filter((row) => departmentId === null || row.departmentId === departmentId)
          .map((row) => ({ ...row, name: dept(row.departmentId)!.name })),
        watch: watchRow
          ? {
              departmentId: watchRow.departmentId,
              departmentName: watchRow.name,
              percent: watchRow.values[1]!,
              month: state.capacity.months[1]!,
              overlaps: 2,
            }
          : null,
        budget:
          ["owner", "admin", "manager"].includes(role) && lines.length > 0
            ? {
                quarter: "Q4",
                budget: sum((line) => line.budget),
                approved: sum((line) => line.approved),
                committed: sum((line) => line.committed),
                left: sum((line) => line.budget - line.approved - line.committed),
                pending: sum((line) => line.pending),
              }
            : null,
      };
    },

    async invite(id, input) {
      await wait();
      const state = get(id);
      if (!/^\S+@\S+\.\S+$/.test(input.email)) throw new RepositoryError("invalid", "Email is not valid");
      const dept = state.departments.find((item) => item.id === input.departmentId);
      state.invites.push({ id: nextId("ci"), email: input.email, role: input.role, departmentName: dept?.name ?? "" });
    },

    async invitations() {
      await wait();
      return clone(invitations);
    },

    async acceptInvitation(invitationId) {
      await wait();
      const invitation = invitations.find((item) => item.id === invitationId);
      if (!invitation) throw new RepositoryError("not-found", "Invitation not found");
      invitations = invitations.filter((item) => item.id !== invitationId);
      // Accepting creates a work profile only; personal data is never shared.
      states.set(invitation.companyId!, smallState(clone(novaLabs), [["nl-eng", "Engineering"], ["nl-ops", "Operations"]]));
      return { companyId: invitation.companyId! };
    },

    async declineInvitation(invitationId) {
      await wait();
      invitations = invitations.filter((item) => item.id !== invitationId);
    },

    async departments(id) {
      await wait();
      return clone(get(id).departments);
    },

    async createDepartment(id, input) {
      await wait();
      const state = get(id);
      if (!input.name.trim()) throw new RepositoryError("invalid", "Name is required");
      const manager = state.staff.find((person) => person.id === input.managerId);
      const department: Department = {
        id: nextId("d"),
        name: input.name.trim(),
        parentId: input.parentId,
        managerId: manager?.id ?? null,
        managerName: manager?.name ?? null,
        people: 0,
        teams: [],
        budget: 0,
        kind: input.parentId ? "unit" : "department",
      };
      state.departments.push(department);
      return clone(department);
    },

    async updateDepartment(id, departmentId, patch) {
      await wait();
      const state = get(id);
      const dept = state.departments.find((item) => item.id === departmentId);
      if (!dept) throw new RepositoryError("not-found", "Department not found");
      if (!patch.name.trim()) throw new RepositoryError("invalid", "Name is required");
      const manager = state.staff.find((person) => person.id === patch.managerId);
      dept.name = patch.name.trim();
      dept.managerId = manager?.id ?? null;
      dept.managerName = manager?.name ?? null;
      return clone(dept);
    },

    async previewMove(id, departmentId, newParentId) {
      await wait();
      const state = get(id);
      const ids = descendants(state.departments, departmentId);
      if (newParentId && ids.includes(newParentId)) throw new RepositoryError("invalid", "Cannot move into itself");
      const moved = state.departments.filter((dept) => ids.includes(dept.id));
      return {
        departmentId,
        newParentId,
        people: moved.reduce((total, dept) => total + dept.people, 0),
        budget: moved.reduce((total, dept) => total + (dept.budget ?? 0), 0),
        teams: moved.reduce((total, dept) => total + (dept.teams?.length ?? 0), 0),
      };
    },

    async moveDepartment(id, departmentId, newParentId) {
      await wait();
      const state = get(id);
      if (newParentId && descendants(state.departments, departmentId).includes(newParentId)) {
        throw new RepositoryError("invalid", "Cannot move into itself");
      }
      const dept = state.departments.find((item) => item.id === departmentId);
      if (!dept) throw new RepositoryError("not-found", "Department not found");
      dept.parentId = newParentId;
      dept.kind = newParentId ? "unit" : "department";
      audit(state, `moved department under ${state.departments.find((item) => item.id === newParentId)?.name ?? state.company.name}`, dept.name, "policy");
      return clone(state.departments);
    },

    async effectivePolicies(id, departmentId) {
      await wait();
      const state = get(id);
      return state.policies.map((policy) => ({
        ...clone(policy),
        override: policy.level === "default" ? clone(state.overrides[departmentId]?.[policy.id] ?? null) : null,
      }));
    },

    async overridePolicy(id, departmentId, policyId, value, reason) {
      await wait();
      const state = get(id);
      const policy = state.policies.find((item) => item.id === policyId);
      if (!policy) throw new RepositoryError("not-found", "Policy not found");
      // Mandatory can never be overridden; Optional is each team's choice.
      if (policy.level !== "default") throw new RepositoryError("forbidden", "Only Default policies can be overridden");
      if (!reason.trim()) throw new RepositoryError("invalid", "A reason is required");
      (state.overrides[departmentId] ??= {})[policyId] = { value, reason: reason.trim(), by: "Mehran R.", at: getPlannerToday() };
      const dept = state.departments.find((item) => item.id === departmentId);
      audit(state, `overrode default policy (reason: ${reason.trim()})`, `${dept?.name ?? ""} · ${policy.name.toLowerCase()}`, "policy");
      return repo.effectivePolicies(id, departmentId);
    },

    async staff(id, role) {
      await wait();
      const state = get(id);
      const mine = meIn(state)?.departmentIds ?? [];
      return state.staff
        .filter((person) => person.status !== "left")
        .map((person) => {
          const full = isAdmin(role) || person.id === ME_ID || person.departmentIds.some((dept) => mine.includes(dept));
          if (full) return clone(person);
          // Outside your department: names + department only.
          return {
            ...clone(person),
            limited: true,
            email: "",
            phone: null,
            supervisorId: null,
            supervisorName: null,
            location: "",
            equipment: [],
            workingOn: null,
            hoursPerWeek: 0,
            workHours: "",
            startedOn: null,
          };
        });
    },

    async updateWorkProfile(id, personId, patch) {
      await wait();
      const state = get(id);
      const person = state.staff.find((candidate) => candidate.id === personId);
      if (!person) throw new RepositoryError("not-found", "Person not found");
      if (!patch.position.trim()) throw new RepositoryError("invalid", "Position is required");
      Object.assign(person, {
        position: patch.position.trim(),
        location: patch.location.trim(),
        workHours: patch.workHours.trim(),
        phone: patch.phone?.trim() || null,
      });
      return clone(person);
    },

    async previewTransfer(id, personId, fromDepartmentId, toDepartmentId) {
      await wait();
      const state = get(id);
      const { person } = transferSeat(state, personId, fromDepartmentId, toDepartmentId);
      const pendingResourceRequests = state.requests.filter((request) => request.requesterId === person.id && request.status === "pending").length;
      const pendingExpenseReviews = state.approvals.filter((approval) => approval.subject === "expenses" && approval.requesterId === person.id && approval.status === "pending").length;
      return {
        role: person.role,
        activeAllocations: 0,
        pendingResourceRequests,
        pendingExpenseReviews,
        allowed: person.role !== "manager" && pendingResourceRequests + pendingExpenseReviews === 0,
      };
    },

    async transferEmployee(id, personId, fromDepartmentId, toDepartmentId) {
      const preview = await repo.previewTransfer(id, personId, fromDepartmentId, toDepartmentId);
      // Same server answers as live: open work blocks the move; managers change role first.
      if (!preview.allowed) throw new RepositoryError("conflict", "Transfer blocked");
      const state = get(id);
      const { person, to } = transferSeat(state, personId, fromDepartmentId, toDepartmentId);
      const index = person.departmentIds.indexOf(fromDepartmentId);
      person.departmentIds[index] = to.id;
      person.departmentNames[index] = to.name;
      audit(state, `moved to ${to.name}`, person.name, "policy");
    },

    async pendingInvites(id) {
      await wait();
      return clone(get(id).invites);
    },

    async projects(id, role) {
      await wait();
      const state = get(id);
      const seeBudget = ["owner", "admin", "manager"].includes(role);
      return state.projects.map((project) => ({
        ...clone(project),
        spent: seeBudget ? project.spent : null,
        budget: seeBudget ? project.budget : null,
      }));
    },

    async teams(id) {
      await wait();
      return clone(get(id).teams);
    },

    async attachRequests(id) {
      await wait();
      return clone(get(id).attach.filter((request) => request.status === "pending"));
    },

    async attachCandidates(id) {
      await wait();
      return clone(get(id).candidates);
    },

    async requestAttach(id, candidateId, departmentId) {
      await wait();
      const state = get(id);
      const candidate = state.candidates.find((item) => item.id === candidateId);
      const dept = state.departments.find((item) => item.id === departmentId);
      if (!candidate || !dept) throw new RepositoryError("not-found", "Not found");
      state.candidates = state.candidates.filter((item) => item.id !== candidateId);
      const request: AttachRequest = {
        id: nextId("att"),
        kind: candidate.kind,
        subjectId: candidate.id,
        subjectName: candidate.name,
        ownerName: candidate.ownerName,
        departmentId,
        departmentName: dept.name,
        members: 5,
        linkedProjects: [],
        status: "pending",
        requestedAt: getPlannerNow(),
        iAmOwner: false,
      };
      state.attach.push(request);
      return clone(request);
    },

    async acceptAttach(id, requestId, password, projectConsent) {
      await wait();
      const state = get(id);
      const request = state.attach.find((item) => item.id === requestId);
      if (!request) throw new RepositoryError("not-found", "Request not found");
      if (!request.iAmOwner) throw new RepositoryError("forbidden", "Only the owner can accept");
      if (!password.trim()) throw new RepositoryError("forbidden", "Re-authentication failed");
      request.status = "accepted";
      for (const project of request.linkedProjects) {
        project.consent = projectConsent[project.id] ? "accepted" : "declined";
        if (project.consent === "accepted") {
          state.projects.push({
            id: project.id,
            name: project.name,
            initials: project.name.slice(0, 2).toUpperCase(),
            departmentId: request.departmentId,
            departmentName: request.departmentName,
            health: "on-track",
            progress: 0,
            spent: 0,
            budget: 0,
            custody: "attached",
            lead: request.ownerName,
            lifecycle: "active",
            nextMilestone: null,
            openRisks: 0,
            attachedAt: getPlannerToday(),
          });
        }
      }
      if (request.kind === "team") {
        state.teams.push({
          id: request.subjectId,
          name: request.subjectName,
          initials: request.subjectName.slice(0, 2).toUpperCase(),
          departmentId: request.departmentId,
          departmentName: request.departmentName,
          lead: request.ownerName,
          people: request.members,
          planCompletion: 0,
          custody: "attached",
        });
      }
      audit(state, "accepted attach (re-authenticated)", request.subjectName, "ownership");
      return clone(request);
    },

    async declineAttach(id, requestId) {
      await wait();
      const state = get(id);
      const request = state.attach.find((item) => item.id === requestId);
      if (request) request.status = "declined";
    },

    async cancelAttach(id, requestId) {
      await wait();
      const state = get(id);
      const request = state.attach.find((item) => item.id === requestId);
      if (request) request.status = "cancelled";
    },

    async goals(id) {
      await wait();
      return clone(get(id).goals);
    },

    async createGoal(id, input) {
      await wait();
      const state = get(id);
      if (!input.title.trim() || !input.krTitle.trim() || !(input.krTarget > 0)) throw new RepositoryError("invalid", "Title and a key result are required");
      const dept = state.departments.find((item) => item.id === input.departmentId);
      if (input.level === "department" && !dept) throw new RepositoryError("invalid", "Choose a department");
      const goal: CompanyGoal = {
        id: nextId("g"),
        level: input.level,
        parentId: input.level === "department" ? input.parentId : null,
        departmentId: input.level === "department" ? dept!.id : null,
        departmentName: input.level === "department" ? dept!.name : null,
        title: input.title.trim(),
        ownerId: ME_ID,
        ownerName: "Mehran R.",
        quarter: "Q4 1405",
        progress: 0,
        onPace: true,
        keyResults: [{ id: nextId("kr"), title: input.krTitle.trim(), current: 0, target: input.krTarget, unit: "", source: { kind: "manual", by: "Mehran R.", at: getPlannerToday() } }],
        links: [],
      };
      state.goals.push(goal);
      return clone(goal);
    },

    async updateKeyResult(id, goalId, krId, current) {
      await wait();
      const state = get(id);
      const goal = state.goals.find((item) => item.id === goalId);
      const kr = goal?.keyResults.find((item) => item.id === krId);
      if (!goal || !kr) throw new RepositoryError("not-found", "Key result not found");
      if (kr.source.kind !== "manual") throw new RepositoryError("invalid", "Automatic key results roll up from child goals");
      if (!Number.isFinite(current) || current < 0) throw new RepositoryError("invalid", "Enter a number");
      kr.current = current;
      kr.source = { kind: "manual", by: "Mehran R.", at: getPlannerToday() };
      goal.progress = Math.round(
        (goal.keyResults.reduce((total, item) => total + Math.min(1, item.current / item.target), 0) / goal.keyResults.length) * 100,
      );
      return clone(goal);
    },

    async resources(id) {
      await wait();
      return clone(get(id).resources);
    },

    async resourceRequests(id) {
      await wait();
      return clone(get(id).requests);
    },

    async requestResource(id, input) {
      await wait();
      const state = get(id);
      const resource = state.resources.find((item) => item.id === input.resourceId);
      if (!resource) throw new RepositoryError("not-found", "Resource not found");
      if (!input.reason.trim() || input.from > input.to) throw new RepositoryError("invalid", "Dates and reason are required");
      if (resource.status === "retired" || resource.status === "repair") throw new RepositoryError("conflict", "Not available");
      if (resource.busy.some((range) => range.from <= input.to && input.from <= range.to)) {
        throw new RepositoryError("conflict", "Already booked for these dates");
      }
      const me = meIn(state)!;
      const { chain, steps } = buildSteps(state, "resources", null, me.departmentIds[0] ?? null, ME_ID);
      const approvalId = nextId("ap");
      const request: ResourceRequest = {
        id: nextId("rr"),
        resourceId: resource.id,
        resourceName: resource.name,
        tag: resource.tag,
        requesterId: ME_ID,
        requesterName: me.name,
        departmentName: me.departmentNames[0] ?? "",
        from: input.from,
        to: input.to,
        reason: input.reason.trim(),
        status: "pending",
        approvalId,
        createdAt: getPlannerNow(),
      };
      state.requests.unshift(request);
      resource.busy.push({ from: input.from, to: input.to });
      if (resource.status === "available") resource.status = "requested";
      const approval: Approval = {
        id: approvalId,
        subject: "resources",
        subjectId: request.id,
        title: `${resource.name} for ${me.name}`,
        departmentName: request.departmentName,
        amount: null,
        amountNote: `${input.from} – ${input.to}`,
        requesterId: ME_ID,
        requesterName: me.name,
        chainVersion: chain.version,
        status: "pending",
        currentStep: 1,
        steps,
        submittedAt: getPlannerNow(),
        outcomes: ["Assign resource", "Notify requester", "Audit entry"],
        forMe: false,
        mine: true,
      };
      refreshForMe(approval);
      state.approvals.unshift(approval);
      return clone(request);
    },

    async withdrawResourceRequest(id, requestId) {
      await wait();
      const state = get(id);
      const request = state.requests.find((item) => item.id === requestId);
      if (!request || request.requesterId !== ME_ID) throw new RepositoryError("forbidden", "Only your own request");
      request.status = "withdrawn";
      state.approvals = state.approvals.filter((item) => item.id !== request.approvalId);
      const resource = state.resources.find((item) => item.id === request.resourceId);
      if (resource) {
        resource.busy = resource.busy.filter((range) => !(range.from === request.from && range.to === request.to));
        if (resource.status === "requested") resource.status = "available";
      }
    },

    async addResource(id, input) {
      await wait();
      const state = get(id);
      if (!input.name.trim() || !input.tag.trim()) throw new RepositoryError("invalid", "Name and tag are required");
      if (state.resources.some((item) => item.tag === input.tag.trim())) throw new RepositoryError("conflict", "Tag already used");
      const dept = state.departments.find((item) => item.id === input.departmentId);
      const resource: CompanyResource = {
        id: nextId("r"),
        tag: input.tag.trim(),
        name: input.name.trim(),
        type: input.type,
        assigneeId: null,
        assigneeName: null,
        departmentId: dept?.id ?? null,
        departmentName: dept?.name ?? null,
        status: "available",
        note: null,
        since: null,
        busy: [],
      };
      state.resources.unshift(resource);
      return clone(resource);
    },

    async rooms(id) {
      await wait();
      const state = get(id);
      return clone(state.rooms);
    },

    async bookRoom(id, input) {
      await wait();
      const state = get(id);
      const room = state.rooms.find((item) => item.id === input.roomId);
      if (!room) throw new RepositoryError("not-found", "Room not found");
      if (!(input.from < input.to)) throw new RepositoryError("invalid", "End after start");
      if (room.bookings.some((booking) => booking.from < input.to && input.from < booking.to)) throw new RepositoryError("conflict", "Room is busy then");
      room.bookings.push({ id: nextId("b"), from: input.from, to: input.to, title: input.title.trim() || null, mine: true });
      room.bookings.sort((a, b) => a.from.localeCompare(b.from));
      return clone(room);
    },

    async capacity(id) {
      await wait();
      return clone(get(id).capacity);
    },

    async kbFolders(id) {
      await wait();
      const state = get(id);
      // Restricted folders are listed only for people with a grant.
      return clone(state.folders.filter((folder) => !folder.restricted || state.grantedFolders.includes(folder.id)));
    },

    async kbPages(id, folderId) {
      await wait();
      const state = get(id);
      const folder = state.folders.find((item) => item.id === folderId);
      if (!folder || (folder.restricted && !state.grantedFolders.includes(folderId))) return [];
      return state.pages
        .filter((page) => page.folderId === folderId)
        .map(({ id: pageId, folderId: f, title, version, updatedAt, updatedBy, ackRequired, acknowledged }) => ({
          id: pageId,
          folderId: f,
          title,
          version,
          updatedAt,
          updatedBy,
          ackRequired,
          acknowledged,
        }));
    },

    async kbPage(id, pageId) {
      await wait();
      const state = get(id);
      const page = state.pages.find((item) => item.id === pageId);
      if (!page) return null;
      const folder = state.folders.find((item) => item.id === page.folderId);
      if (folder?.restricted && !state.grantedFolders.includes(folder.id)) return null;
      return publicPage(page);
    },

    async kbSearch(id, query) {
      await wait();
      const state = get(id);
      const needle = query.trim().toLocaleLowerCase();
      if (!needle) return [];
      const readable = state.pages.filter((page) => {
        const folder = state.folders.find((item) => item.id === page.folderId);
        return folder && (!folder.restricted || state.grantedFolders.includes(folder.id));
      });
      const folderName = (folderId: string) => state.folders.find((item) => item.id === folderId)?.name ?? "";
      const hits = readable.flatMap((page) => {
        const results = [];
        const bodyIndex = page.body.toLocaleLowerCase().indexOf(needle);
        if (page.title.toLocaleLowerCase().includes(needle) || bodyIndex >= 0) {
          const start = Math.max(0, bodyIndex - 30);
          results.push({
            id: page.id,
            kind: "page" as const,
            title: page.title,
            folderName: folderName(page.folderId),
            pageId: page.id,
            snippet: bodyIndex >= 0 ? page.body.slice(start, start + 90).replace(/\n+/g, " ") : page.body.slice(0, 90).replace(/\n+/g, " "),
          });
        }
        for (const file of page.files) {
          if (file.name.toLocaleLowerCase().includes(needle)) {
            results.push({ id: file.id, kind: "file" as const, title: file.name, folderName: folderName(page.folderId), pageId: page.id, snippet: page.title });
          }
        }
        return results;
      });
      return hits;
    },

    async kbSave(id, pageId, body, note) {
      await wait();
      const state = get(id);
      const page = state.pages.find((item) => item.id === pageId);
      if (!page || !page.canEdit) throw new RepositoryError("forbidden", "Cannot edit this page");
      page.version += 1;
      page.body = body;
      page.bodies[page.version] = body;
      page.updatedAt = getPlannerNow();
      page.updatedBy = "Mehran R.";
      page.versions.unshift({ version: page.version, at: page.updatedAt, by: "Mehran R.", note: note.trim() || "Edited" });
      // A new version needs a new acknowledgement.
      if (page.ackRequired) {
        page.acknowledged = false;
        page.ackCount = 0;
      }
      return publicPage(page);
    },

    async kbCreate(id, input) {
      await wait();
      const state = get(id);
      const folder = state.folders.find((item) => item.id === input.folderId);
      if (!folder || (folder.restricted && !state.grantedFolders.includes(folder.id))) throw new RepositoryError("forbidden", "Folder not available");
      if (!input.title.trim()) throw new RepositoryError("invalid", "Title is required");
      const at = getPlannerNow();
      const page: KbPageState = {
        id: nextId("kp"),
        folderId: folder.id,
        title: input.title.trim(),
        version: 1,
        updatedAt: at,
        updatedBy: "Mehran R.",
        ackRequired: false,
        acknowledged: false,
        body: input.body,
        versions: [{ version: 1, at, by: "Mehran R.", note: "First version" }],
        files: [],
        ackCount: 0,
        audience: state.company.people,
        canEdit: true,
        remindedVersion: null,
        bodies: { 1: input.body },
      };
      state.pages.push(page);
      folder.pages += 1;
      return publicPage(page);
    },

    async kbVersionBody(id, pageId, version) {
      await wait();
      const page = get(id).pages.find((item) => item.id === pageId);
      const body = page?.bodies[version];
      if (body === undefined) throw new RepositoryError("not-found", "Version not found");
      return body;
    },

    async kbRestore(id, pageId, version) {
      await wait();
      const state = get(id);
      const page = state.pages.find((item) => item.id === pageId);
      const body = page?.bodies[version];
      if (!page || body === undefined) throw new RepositoryError("not-found", "Version not found");
      // Restore = a new version with the old content.
      return repo.kbSave(id, pageId, body, `Restored v${version}`);
    },

    async kbAck(id, pageId) {
      await wait();
      const state = get(id);
      const page = state.pages.find((item) => item.id === pageId);
      if (!page) throw new RepositoryError("not-found", "Page not found");
      if (!page.acknowledged) {
        page.acknowledged = true;
        page.ackCount += 1;
      }
      return publicPage(page);
    },

    async kbRemind(id, pageId) {
      await wait();
      const state = get(id);
      const page = state.pages.find((item) => item.id === pageId);
      if (!page) throw new RepositoryError("not-found", "Page not found");
      if (page.remindedVersion === page.version) throw new RepositoryError("conflict", "Already reminded for this version");
      page.remindedVersion = page.version;
      return publicPage(page);
    },

    async expenses(id) {
      await wait();
      return clone(get(id).expenses);
    },

    async saveExpense(id, input, submit, expenseId) {
      await wait();
      const state = get(id);
      if (!input.title.trim()) throw new RepositoryError("invalid", "Title is required");
      if (!Number.isInteger(input.amount) || input.amount <= 0) throw new RepositoryError("invalid", "Amount must be a whole number");
      const dept = state.departments.find((item) => item.id === input.departmentId);
      if (!dept) throw new RepositoryError("invalid", "Department is required");
      // Policy (Default): a receipt is required to submit above 1,000,000.
      if (submit && !input.receipt && input.amount > 1_000_000) throw new RepositoryError("invalid", "receipt-required");
      const project = state.projects.find((item) => item.id === input.projectId);
      let expense = expenseId ? state.expenses.find((item) => item.id === expenseId) : undefined;
      if (expense && (expense.authorId !== ME_ID || !["draft", "changes"].includes(expense.status))) {
        throw new RepositoryError("forbidden", "Only your own draft or changes-requested expense");
      }
      const previous = expense ? { ...expense } : null;
      if (!expense) {
        const me = meIn(state)!;
        expense = {
          id: nextId("ex"),
          title: "",
          amount: 0,
          date: input.date,
          category: input.category,
          departmentId: dept.id,
          departmentName: dept.name,
          projectId: null,
          projectName: null,
          payer: input.payer,
          receipt: null,
          authorId: ME_ID,
          authorName: me.name,
          status: "draft",
          step: null,
          approvalId: null,
          revision: 1,
          changesNote: null,
          createdAt: getPlannerNow(),
        };
        state.expenses.unshift(expense);
      }
      Object.assign(expense, {
        title: input.title.trim(),
        amount: input.amount,
        date: input.date,
        category: input.category,
        departmentId: dept.id,
        departmentName: dept.name,
        projectId: project?.id ?? null,
        projectName: project?.name ?? null,
        payer: input.payer,
        receipt: input.receipt,
      });
      if (!submit) return clone(expense);

      const existing = state.approvals.find((item) => item.id === expense.approvalId);
      if (previous?.status === "changes" && existing) {
        // Resubmit: new revision, the chain restarts at the step that asked (history kept).
        expense.revision += 1;
        expense.changesNote = null;
        existing.status = "pending";
        existing.amount = expense.amount;
        const step = existing.steps[existing.currentStep - 1]!;
        step.decision = null;
        step.state = "current";
        step.escalatesOn = addDays(getPlannerToday(), 3);
        refreshForMe(existing);
        expense.status = "pending";
        expense.step = existing.currentStep;
      } else {
        const { chain, steps } = buildSteps(state, "expenses", expense.amount, dept.id, ME_ID);
        const approval: Approval = {
          id: nextId("ap"),
          subject: "expenses",
          subjectId: expense.id,
          title: expense.title,
          departmentName: dept.name,
          amount: expense.amount,
          amountNote: null,
          requesterId: ME_ID,
          requesterName: expense.authorName,
          chainVersion: chain.version,
          status: "pending",
          currentStep: Math.max(1, steps.findIndex((step) => step.state === "current") + 1),
          steps,
          submittedAt: getPlannerNow(),
          outcomes: ["Budget commit", ...(expense.payer === "me" ? ["Reimbursement"] : []), "Notify requester", "Audit entry"],
          forMe: false,
          mine: true,
        };
        refreshForMe(approval);
        state.approvals.unshift(approval);
        expense.approvalId = approval.id;
        expense.status = "pending";
        expense.step = approval.currentStep;
      }
      adjustPending(state, dept.id, expense.amount);
      return clone(expense);
    },

    async withdrawExpense(id, expenseId) {
      await wait();
      const state = get(id);
      const expense = state.expenses.find((item) => item.id === expenseId);
      if (!expense || expense.authorId !== ME_ID || expense.status !== "pending") {
        throw new RepositoryError("forbidden", "Only your own pending expense");
      }
      expense.status = "withdrawn";
      expense.step = null;
      state.approvals = state.approvals.filter((item) => item.id !== expense.approvalId);
      adjustPending(state, expense.departmentId, -expense.amount);
      return clone(expense);
    },

    async approvals(id) {
      await wait();
      return clone(get(id).approvals);
    },

    async approvalHistory(id) {
      await wait();
      return clone(get(id).history);
    },

    async decide(id, approvalId, decision, note) {
      await wait();
      const state = get(id);
      const approval = state.approvals.find((item) => item.id === approvalId);
      if (!approval || approval.status !== "pending") throw new RepositoryError("not-found", "Approval not pending");
      if (approval.requesterId === ME_ID) throw new RepositoryError("forbidden", "You can't approve your own request");
      const step = approval.steps[approval.currentStep - 1];
      if (!step || step.reviewerId !== ME_ID) throw new RepositoryError("forbidden", "You are not the current reviewer");
      // Grant check at decision time (server-side in the real engine).
      const stepDef = state.chains.find((chain) => chain.subject === approval.subject && chain.version === approval.chainVersion)
        ?.steps.find((item) => item.id === step.stepId) ?? publishedChain(state, approval.subject).steps.find((item) => item.id === step.stepId);
      const needed = stepDef?.approver === "finance" ? "finance" : stepDef?.approver === "hr" ? "hr" : null;
      if (needed && !myGrants(state).includes(needed)) {
        throw new RepositoryError("forbidden", "grant-missing");
      }
      if ((decision === "rejected" || decision === "changes") && !note?.trim()) {
        throw new RepositoryError("invalid", "A reason or comment is required");
      }
      const at = getPlannerNow();
      step.decision = { kind: decision, by: "Mehran R.", at, note: note?.trim() || null };
      step.escalatesOn = null;
      state.history.unshift({
        id: nextId("h"),
        approvalId,
        at,
        title: approval.title,
        decision,
        step: approval.currentStep,
        note: note?.trim() || null,
        by: "Mehran R.",
        subject: approval.subject,
        chainVersion: approval.chainVersion,
      });
      audit(state, `${decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : "requested changes on"} step ${approval.currentStep}`, approval.title, "approval");
      const expense = approval.subject === "expenses" ? state.expenses.find((item) => item.id === approval.subjectId) : undefined;
      const request = approval.subject === "resources" ? state.requests.find((item) => item.id === approval.subjectId) : undefined;

      if (decision === "approved") {
        step.state = "done";
        const nextIndex = approval.steps.findIndex((item, index) => index >= approval.currentStep && item.state === "waiting");
        if (nextIndex >= 0) {
          approval.currentStep = nextIndex + 1;
          const next = approval.steps[nextIndex]!;
          next.state = "current";
          next.escalatesOn = addDays(getPlannerToday(), 3);
          if (expense) expense.step = approval.currentStep;
        } else {
          approval.status = "approved";
          if (expense) {
            expense.status = "approved";
            expense.step = null;
            adjustPending(state, expense.departmentId, -expense.amount);
            const line = state.budgets.find((item) => item.kind === "department" && item.departmentId === expense.departmentId);
            if (line) line.approved += expense.amount;
            state.company.currencyLocked = true;
            if (expense.payer === "me") {
              state.reimbursements.unshift({
                id: nextId("rb"),
                expenseId: expense.id,
                title: expense.title,
                amount: expense.amount,
                recipientId: expense.authorId,
                recipientName: expense.authorName,
                departmentName: expense.departmentName,
                approvedAt: at,
                status: "to-settle",
                runId: null,
                settledAt: null,
                disputeNote: null,
                recordedInPersonal: false,
              });
            }
          }
          if (request) {
            request.status = "approved";
            const resource = state.resources.find((item) => item.id === request.resourceId);
            if (resource) {
              resource.status = "assigned";
              resource.assigneeId = request.requesterId;
              resource.assigneeName = request.requesterName;
            }
          }
          if (approval.subject === "budget") {
            const line = state.budgets.find((item) => item.changeRequest?.id === approval.subjectId);
            if (line?.changeRequest) {
              line.budget = line.changeRequest.amount;
              line.versions.unshift({ version: line.versions.length + 1, at, budget: line.budget, note: "Budget change approved" });
              line.changeRequest = null;
            }
          }
        }
      } else if (decision === "rejected") {
        approval.status = "rejected";
        step.state = "done";
        if (expense) {
          expense.status = "rejected";
          expense.step = null;
          adjustPending(state, expense.departmentId, -expense.amount);
        }
        if (request) {
          request.status = "rejected";
          const resource = state.resources.find((item) => item.id === request.resourceId);
          if (resource?.status === "requested") resource.status = "available";
        }
        if (approval.subject === "budget") {
          const line = state.budgets.find((item) => item.changeRequest?.id === approval.subjectId);
          if (line) line.changeRequest = null;
        }
      } else {
        approval.status = "changes";
        if (expense) {
          expense.status = "changes";
          expense.changesNote = { by: "Mehran R.", text: note!.trim() };
          adjustPending(state, expense.departmentId, -expense.amount);
        }
      }
      refreshForMe(approval);
      return clone(approval);
    },

    async chains(id) {
      await wait();
      return clone(get(id).chains);
    },

    async saveChainDraft(id, subject, steps) {
      await wait();
      const state = get(id);
      if (steps.length === 0) throw new RepositoryError("invalid", "A chain needs at least one step");
      const published = publishedChain(state, subject);
      const draft = state.chains.find((chain) => chain.subject === subject && chain.status === "draft");
      if (draft) draft.steps = clone(steps);
      else {
        state.chains.push({
          id: nextId("ch"),
          subject,
          version: published.version + 1,
          status: "draft",
          steps: clone(steps),
          publishedAt: null,
        });
      }
      return clone(state.chains);
    },

    async publishChain(id, subject) {
      await wait();
      const state = get(id);
      const draft = state.chains.find((chain) => chain.subject === subject && chain.status === "draft");
      if (!draft) throw new RepositoryError("not-found", "No draft");
      // Publishing affects new requests only: open approvals keep their chain version.
      state.chains = state.chains.filter((chain) => !(chain.subject === subject && chain.status === "published"));
      draft.status = "published";
      draft.publishedAt = getPlannerNow();
      audit(state, `published ${subject} chain v${draft.version}`, "Approval chains", "policy");
      return clone(state.chains);
    },

    async budgets(id) {
      await wait();
      return clone(get(id).budgets);
    },

    async requestBudgetChange(id, lineId, amount, reason) {
      await wait();
      const state = get(id);
      const line = state.budgets.find((item) => item.id === lineId);
      if (!line) throw new RepositoryError("not-found", "Budget line not found");
      if (!Number.isInteger(amount) || amount <= 0 || !reason.trim()) throw new RepositoryError("invalid", "Amount and reason are required");
      if (line.changeRequest) throw new RepositoryError("conflict", "A change is already pending");
      const changeId = nextId("bc");
      line.changeRequest = { id: changeId, amount, status: "pending" };
      const { chain, steps } = buildSteps(state, "budget", amount, line.departmentId, ME_ID);
      const approval: Approval = {
        id: nextId("ap"),
        subject: "budget",
        subjectId: changeId,
        title: `Budget change · ${line.name}`,
        departmentName: line.departmentName,
        amount,
        amountNote: reason.trim(),
        requesterId: ME_ID,
        requesterName: "Mehran R.",
        chainVersion: chain.version,
        status: "pending",
        currentStep: 1,
        steps,
        submittedAt: getPlannerNow(),
        outcomes: ["New budget version", "Notify requester", "Audit entry"],
        forMe: false,
        mine: true,
      };
      refreshForMe(approval);
      state.approvals.unshift(approval);
      return clone(line);
    },

    async reimbursements(id) {
      await wait();
      return clone(get(id).reimbursements);
    },

    async paymentRuns(id) {
      await wait();
      return clone(get(id).runs);
    },

    async createRun(id, itemIds) {
      await wait();
      const state = get(id);
      const items = state.reimbursements.filter((item) => itemIds.includes(item.id) && item.status === "to-settle");
      if (items.length === 0) throw new RepositoryError("invalid", "Choose items to settle");
      const run: PaymentRun = {
        id: nextId("run"),
        label: `Run ${state.runs.length + 13} · Mehr`,
        itemIds: items.map((item) => item.id),
        total: items.reduce((total, item) => total + item.amount, 0),
        status: "open",
        reference: null,
        confirmedAt: null,
        confirmedBy: null,
      };
      for (const item of items) {
        item.status = "in-run";
        item.runId = run.id;
      }
      state.runs.unshift(run);
      return clone(run);
    },

    async confirmRun(id, runId, reference) {
      await wait();
      const state = get(id);
      const run = state.runs.find((item) => item.id === runId);
      if (!run || run.status !== "open") throw new RepositoryError("not-found", "Open run not found");
      if (!reference.trim()) throw new RepositoryError("invalid", "A payment reference is required");
      // Paid outside the app: this only acknowledges it. No money moves here.
      run.status = "confirmed";
      run.reference = reference.trim();
      run.confirmedAt = getPlannerNow();
      run.confirmedBy = "Mehran R.";
      for (const item of state.reimbursements.filter((candidate) => run.itemIds.includes(candidate.id))) {
        item.status = "settled";
        item.settledAt = run.confirmedAt;
        item.disputeNote = null;
      }
      audit(state, `confirmed payment (${run.reference})`, run.label, "approval");
      return clone(run);
    },

    async markNotReceived(id, itemId, note) {
      await wait();
      const state = get(id);
      const item = state.reimbursements.find((candidate) => candidate.id === itemId);
      if (!item || item.recipientId !== ME_ID || item.status !== "settled" || !item.settledAt) {
        throw new RepositoryError("forbidden", "Only your own settled item");
      }
      if (daysBetween(item.settledAt.slice(0, 10), getPlannerToday()) > 14) throw new RepositoryError("invalid", "window-closed");
      if (!note.trim()) throw new RepositoryError("invalid", "Add a note");
      item.status = "to-settle";
      item.runId = null;
      item.settledAt = null;
      item.disputeNote = note.trim();
      return clone(item);
    },

    async markRecordedInPersonal(id, itemId) {
      await wait();
      const state = get(id);
      const item = state.reimbursements.find((candidate) => candidate.id === itemId);
      if (!item || item.recipientId !== ME_ID || item.status !== "settled") {
        throw new RepositoryError("forbidden", "Only your own settled item");
      }
      const alreadyRecorded = item.recordedInPersonal;
      item.recordedInPersonal = true;
      return { item: clone(item), alreadyRecorded };
    },

    async notifications(id) {
      await wait();
      return clone(get(id).notifications).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async readNotification(id, notificationId) {
      await wait();
      const item = get(id).notifications.find((entry) => entry.id === notificationId);
      if (!item) throw new RepositoryError("not-found", "Notification not found");
      item.read = true;
      return clone(item);
    },

    async employeeFile(id, personId) {
      await wait();
      return fileAccess(get(id), personId);
    },

    async requestFileAccess(id, personId) {
      await wait();
      const state = get(id);
      const person = state.staff.find((candidate) => candidate.id === personId);
      if (!person) throw new RepositoryError("not-found", "Person not found");
      if (!state.fileRequests.has(personId)) {
        state.fileRequests.add(personId);
        // The employee is told who asked.
        (state.fileLog[personId] ??= []).unshift({ id: nextId("fl"), at: getPlannerNow(), who: "Mehran R.", what: "requested access" });
        audit(state, "requested employee file access", `${person.name} · employee file`, "file");
      }
    },

    async addDocument(id, personId, name) {
      await wait();
      const state = get(id);
      const access = fileAccess(state, personId);
      if (access.status !== "open" || !access.canAddDocument) throw new RepositoryError("forbidden", "HR reviewer grant required");
      if (!name.trim()) throw new RepositoryError("invalid", "Choose a file");
      (state.documents[personId] ??= []).unshift({
        id: nextId("fd"),
        name: name.trim(),
        kind: "other",
        addedAt: getPlannerToday(),
        grantedTo: [],
        readable: true,
      });
      state.fileLog[personId]!.unshift({ id: nextId("fl"), at: getPlannerNow(), who: "Mehran R.", what: `added document ${name.trim()}` });
      return fileAccess(state, personId);
    },

    async downloadPack(id, personId) {
      await wait();
      const state = get(id);
      const access = fileAccess(state, personId);
      if (access.status !== "open") throw new RepositoryError("forbidden", "Grant required");
      (state.fileLog[personId] ??= []).unshift({ id: nextId("fl"), at: getPlannerNow(), who: "Mehran R.", what: "downloaded file pack" });
      audit(state, "downloaded employee file pack", `${access.person.name} · employee file`, "file");
      return { name: `${access.person.name.replace(/W+/g, "-").toLowerCase()}-file-pack.zip` };
    },

    async caseReviewers(id, personId) {
      await wait();
      return get(id)
        .staff.filter((person) => (person.role === "owner" || person.role === "admin") && person.status !== "left" && person.id !== ME_ID && person.id !== personId)
        .map((person) => ({ id: person.id, name: person.name }));
    },

    async openCorrective(id, personId, input) {
      await wait();
      const state = get(id);
      if (!(await repo.caseReviewers(id, personId)).some((reviewer) => reviewer.id === input.reviewerId)) throw new RepositoryError("invalid", "Choose a reviewer");
      const access = fileAccess(state, personId);
      if (access.status !== "open" || !access.canOpenCorrective) throw new RepositoryError("forbidden", "Grant required");
      if (!input.reason.trim() || !input.evidence.trim()) throw new RepositoryError("invalid", "Reason and evidence are required");
      const action: CorrectiveAction = {
        id: nextId("ca"),
        reason: input.reason.trim(),
        evidence: input.evidence.trim(),
        visibleTo: "HR, supervisor, employee",
        openedBy: "Mehran R.",
        openedAt: getPlannerNow(),
        status: "open",
        response: null,
        appeal: null,
        outcome: null,
      };
      (state.corrective[personId] ??= []).unshift(action);
      state.fileLog[personId]!.unshift({ id: nextId("fl"), at: getPlannerNow(), who: "Mehran R.", what: "opened corrective action" });
      return clone(action);
    },

    async respondCorrective(id, personId, actionId, text) {
      await wait();
      const state = get(id);
      if (personId !== ME_ID) throw new RepositoryError("forbidden", "Only the employee can respond");
      const action = findCorrective(state, personId, actionId);
      if (!text.trim() || action.status !== "open") throw new RepositoryError("invalid", "Write a response");
      action.response = text.trim();
      action.status = "responded";
      return clone(action);
    },

    async appealCorrective(id, personId, actionId, text) {
      await wait();
      const state = get(id);
      if (personId !== ME_ID) throw new RepositoryError("forbidden", "Only the employee can appeal");
      const action = findCorrective(state, personId, actionId);
      if (!text.trim() || action.status === "closed" || action.status === "appealed") throw new RepositoryError("invalid", "Write the appeal");
      action.appeal = text.trim();
      action.status = "appealed";
      return clone(action);
    },

    async closeCorrective(id, personId, actionId, outcome) {
      await wait();
      const state = get(id);
      const access = fileAccess(state, personId);
      if (access.status !== "open" || access.grant.kind !== "hr") throw new RepositoryError("forbidden", "HR reviewer grant required");
      const action = findCorrective(state, personId, actionId);
      if (!outcome.trim()) throw new RepositoryError("invalid", "Outcome is required");
      action.outcome = outcome.trim();
      action.status = "closed";
      return clone(action);
    },

    async reports(id, departmentId) {
      await wait();
      const state = get(id);
      if (state.expenses.every((item) => item.status !== "approved") && state.projects.length === 0) return [];
      const inScope = <T extends { departmentId: string | null }>(item: T) => departmentId === null || item.departmentId === departmentId;
      const depts = state.departments.filter((dept) => dept.kind === "department" && (departmentId === null || dept.id === departmentId));
      const lines = state.budgets.filter((line) => line.kind === "department" && inScope(line));
      const reports: CompanyReport[] = [
        {
          id: "portfolio",
          scope: "department",
          source: "Projects · status set by each project's managers",
          series: [
            { label: "On track", value: state.projects.filter((item) => inScope(item) && item.health === "on-track").length },
            { label: "At risk", value: state.projects.filter((item) => inScope(item) && item.health === "at-risk").length },
            { label: "Off track", value: state.projects.filter((item) => inScope(item) && item.health === "off-track").length },
          ],
        },
        {
          id: "goals",
          scope: "department",
          source: "Goals · key results with their sources",
          series: state.goals.filter((goal) => departmentId === null || goal.departmentId === departmentId).map((goal) => ({ label: goal.title, value: goal.progress })),
        },
        {
          id: "capacity",
          scope: "department",
          source: "Resources › Capacity · booked ÷ capacity, this month",
          series: state.capacity.rows.filter((row) => departmentId === null || row.departmentId === departmentId).map((row) => ({ label: row.name, value: row.values[0] ?? 0 })),
        },
        {
          id: "expenses",
          scope: "company",
          source: "Expenses · approved only",
          series: (["travel", "software", "equipment", "meals", "training", "other"] as const).map((category) => ({
            label: category,
            value: state.expenses
              .filter((item) => item.status === "approved" && item.category === category && inScope(item))
              .reduce((total, item) => total + item.amount, 0),
          })),
        },
        {
          id: "variance",
          scope: "company",
          source: "Budgets · approved + committed vs budget",
          series: lines.map((line) => ({ label: line.name, value: Math.round(((line.approved + line.committed) / line.budget) * 100) })),
        },
        {
          id: "headcount",
          scope: "company",
          source: "Directory · department aggregates",
          series: depts.map((dept) => ({ label: dept.name, value: dept.people })),
        },
      ];
      return reports;
    },

    async exports(id) {
      await wait();
      return clone(get(id).exports);
    },

    async requestExport(id, report, format) {
      await wait();
      const state = get(id);
      const at = getPlannerNow();
      const item: CompanyExport = {
        id: nextId("x"),
        report,
        format,
        requestedAt: at,
        requestedBy: "Mehran R.",
        status: "ready",
        expiresAt: new Date(new Date(at).getTime() + 24 * 3_600_000).toISOString(),
        watermark: `Mehran R. · ${at.slice(0, 16).replace("T", " ")}`,
      };
      state.exports.unshift(item);
      audit(state, `exported ${format.toUpperCase()}`, report, "export");
      return clone(item);
    },

    async audit(id) {
      await wait();
      return clone(get(id).audit);
    },

    async settings(id) {
      await wait();
      return settingsOf(get(id));
    },

    async updateGeneral(id, patch) {
      await wait();
      const state = get(id);
      if (!patch.name.trim()) throw new RepositoryError("invalid", "Name is required");
      if (state.company.currencyLocked && patch.currency !== state.company.currency) {
        throw new RepositoryError("forbidden", "Currency is locked after the first approved expense");
      }
      Object.assign(state.company, {
        name: patch.name.trim(),
        legalName: patch.legalName.trim(),
        currency: patch.currency,
        fiscalStartMonth: patch.fiscalStartMonth,
      });
      return settingsOf(state);
    },

    async setPolicyLevel(id, policyId, level) {
      await wait();
      const state = get(id);
      const policy = state.policies.find((item) => item.id === policyId);
      if (!policy) throw new RepositoryError("not-found", "Policy not found");
      // Mandatory security can never be relaxed.
      if (policy.security && level !== "mandatory") throw new RepositoryError("forbidden", "Security policies stay mandatory");
      policy.level = level;
      audit(state, `set policy to ${level}`, policy.name, "policy");
      return settingsOf(state);
    },

    async setGrant(id, personId, kind, until, on) {
      await wait();
      const state = get(id);
      const person = state.staff.find((candidate) => candidate.id === personId);
      if (!person) throw new RepositoryError("not-found", "Person not found");
      state.grants = state.grants.filter((grant) => !(grant.personId === personId && grant.kind === kind));
      if (on) state.grants.push({ kind, personId, personName: person.name, until });
      audit(state, `${on ? "granted" : "revoked"} ${kind} reviewer`, person.name, "ownership");
      return settingsOf(state);
    },

    async requestTransfer(id, toPersonId, password) {
      await wait();
      const state = get(id);
      const person = state.staff.find((candidate) => candidate.id === toPersonId && candidate.role === "admin");
      if (!person) throw new RepositoryError("invalid", "Choose an eligible Org Admin");
      if (!password.trim()) throw new RepositoryError("forbidden", "Re-authentication failed");
      state.transfer = { toName: person.name, status: "pending" };
      audit(state, "requested ownership transfer", person.name, "ownership");
      return settingsOf(state);
    },

    async archive(id) {
      await wait();
      const state = get(id);
      state.company.lifecycle = "archived";
      state.company.lifecycleAt = getPlannerToday();
      audit(state, "archived the company", state.company.name, "ownership");
      return summary(state);
    },

    async remove(id, confirmName, password) {
      await wait();
      const state = get(id);
      if (confirmName.trim() !== state.company.name) throw new RepositoryError("invalid", "Type the company name");
      if (!password.trim()) throw new RepositoryError("forbidden", "Re-authentication failed");
      // Retention holds keep records the policy requires; the company leaves every list.
      states.delete(id);
      recentIds = recentIds.filter((other) => other !== id);
    },
  };
  return repo;
}

function descendants(departments: readonly Department[], id: string): string[] {
  const result = [id];
  for (let index = 0; index < result.length; index += 1) {
    for (const dept of departments) if (dept.parentId === result[index]) result.push(dept.id);
  }
  return result;
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}
