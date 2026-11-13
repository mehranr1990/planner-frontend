import type {
  Approval,
  ApprovalChain,
  ApprovalDecisionKind,
  ApprovalHistoryRow,
  ApprovalSubject,
  AttachCandidate,
  AttachRequest,
  AuditRow,
  BudgetLine,
  CapacityHeat,
  ChainStep,
  CompanyAccess,
  CompanyCurrency,
  CompanyDirectory,
  CompanyExport,
  CompanyGoal,
  CompanyGrantKind,
  CompanyInvitation,
  CompanyOverview,
  CompanyProjectRow,
  CompanyReport,
  CompanyReportId,
  CompanyResource,
  CompanyRole,
  CompanyRoom,
  CompanySettings,
  CompanySummary,
  CompanyTeamRow,
  CorrectiveAction,
  Department,
  EffectivePolicy,
  EmployeeFileAccess,
  Expense,
  ExpenseInput,
  KbFolder,
  KbPage,
  KbPageSummary,
  KbSearchHit,
  MovePreview,
  PaymentRun,
  PolicyLevel,
  Reimbursement,
  ResourceRequest,
  WorkProfile,
} from "./company-domain";

/*
 * Companies (Phase 4) repository interfaces: the mock adapter
 * (src/data/mock/mock-companies.ts) in Mock Mode, the HTTP adapter
 * (api/api-company-repository.ts) in live mode. Names
 * follow each SPEC "Data & backend" tab (companyRepo, deptRepo, approvalRepo…).
 * Every call is scoped to one company id (custody boundary). Errors use
 * RepositoryError. Nothing here can reach Personal Finance: "Record in my
 * finance" only marks the reimbursement; the Personal write is the caller's
 * explicit, separate action.
 */

export interface CompanyAccessOptions {
  /** Demo harness only (?state=as-…): answer as if the viewer held this role. */
  previewRole?: CompanyRole;
  previewArchived?: boolean;
}

export interface NewCompanyInput {
  name: string;
  legalName: string;
  currency: CompanyCurrency;
  fiscalStartMonth: number;
  /** First departments (optional). */
  departments: string[];
}

export interface CompanyInviteInput {
  email: string;
  role: Exclude<CompanyRole, "owner">;
  departmentId: string;
  position: string;
  supervisorId: string | null;
}

export interface NewDepartmentInput {
  name: string;
  parentId: string | null;
  managerId: string | null;
}

export interface CompanyRepository {
  /** companyRepo.list — companies I belong to. */
  list(): Promise<CompanyDirectory>;
  access(id: string, options?: CompanyAccessOptions): Promise<CompanyAccess>;
  create(input: NewCompanyInput): Promise<CompanySummary>;
  restore(id: string): Promise<CompanySummary>;
  /** companyRepo.summary + companyReportRepo.portfolio + budgetRepo.summary (dept narrows only). */
  overview(id: string, departmentId: string | null, role: CompanyRole): Promise<CompanyOverview>;
  invite(id: string, input: CompanyInviteInput): Promise<void>;
  /** companyInvitationRepo */
  invitations(): Promise<CompanyInvitation[]>;
  acceptInvitation(invitationId: string): Promise<{ companyId: string }>;
  declineInvitation(invitationId: string): Promise<void>;

  /** deptRepo */
  departments(id: string): Promise<Department[]>;
  createDepartment(id: string, input: NewDepartmentInput): Promise<Department>;
  updateDepartment(id: string, departmentId: string, patch: { name: string; managerId: string | null }): Promise<Department>;
  previewMove(id: string, departmentId: string, newParentId: string | null): Promise<MovePreview>;
  moveDepartment(id: string, departmentId: string, newParentId: string | null): Promise<Department[]>;
  /** policyRepo.effective */
  effectivePolicies(id: string, departmentId: string): Promise<EffectivePolicy[]>;
  overridePolicy(id: string, departmentId: string, policyId: string, value: string, reason: string): Promise<EffectivePolicy[]>;

  /** staffRepo (work profiles only — never the sealed file). */
  staff(id: string, role: CompanyRole): Promise<WorkProfile[]>;
  updateWorkProfile(id: string, personId: string, patch: { position: string; location: string; workHours: string; phone: string | null }): Promise<WorkProfile>;
  pendingInvites(id: string): Promise<{ id: string; email: string; role: CompanyRole; departmentName: string }[]>;

  /** companyWorkRepo + attachRepo */
  projects(id: string, role: CompanyRole): Promise<CompanyProjectRow[]>;
  teams(id: string): Promise<CompanyTeamRow[]>;
  attachRequests(id: string): Promise<AttachRequest[]>;
  attachCandidates(id: string): Promise<AttachCandidate[]>;
  requestAttach(id: string, candidateId: string, departmentId: string): Promise<AttachRequest>;
  /** Owner side: accept with re-auth (mock checks a non-empty password). */
  acceptAttach(id: string, requestId: string, password: string, projectConsent: Record<string, boolean>): Promise<AttachRequest>;
  declineAttach(id: string, requestId: string): Promise<void>;
  cancelAttach(id: string, requestId: string): Promise<void>;

  /** companyGoalRepo */
  goals(id: string): Promise<CompanyGoal[]>;
  createGoal(id: string, input: { level: "company" | "department"; title: string; departmentId: string | null; parentId: string | null; krTitle: string; krTarget: number }): Promise<CompanyGoal>;
  updateKeyResult(id: string, goalId: string, krId: string, current: number): Promise<CompanyGoal>;

  /** resourceRepo + capacityRepo */
  resources(id: string): Promise<CompanyResource[]>;
  resourceRequests(id: string): Promise<ResourceRequest[]>;
  requestResource(id: string, input: { resourceId: string; from: string; to: string; reason: string }): Promise<ResourceRequest>;
  withdrawResourceRequest(id: string, requestId: string): Promise<void>;
  addResource(id: string, input: { name: string; tag: string; type: CompanyResource["type"]; departmentId: string | null }): Promise<CompanyResource>;
  bookRoom(id: string, input: { roomId: string; day: string; from: string; to: string; title: string }): Promise<CompanyRoom>;
  rooms(id: string, day: string): Promise<CompanyRoom[]>;
  capacity(id: string): Promise<CapacityHeat>;

  /** kbRepo */
  kbFolders(id: string): Promise<KbFolder[]>;
  kbPages(id: string, folderId: string): Promise<KbPageSummary[]>;
  kbPage(id: string, pageId: string): Promise<KbPage | null>;
  kbSearch(id: string, query: string): Promise<KbSearchHit[]>;
  kbSave(id: string, pageId: string, body: string, note: string): Promise<KbPage>;
  kbCreate(id: string, input: { folderId: string; title: string; body: string }): Promise<KbPage>;
  /** One version's text (diff / restore preview). */
  kbVersionBody(id: string, pageId: string, version: number): Promise<string>;
  kbRestore(id: string, pageId: string, version: number): Promise<KbPage>;
  kbAck(id: string, pageId: string): Promise<KbPage>;
  kbRemind(id: string, pageId: string): Promise<KbPage>;

  /** expenseRepo */
  expenses(id: string): Promise<Expense[]>;
  saveExpense(id: string, input: ExpenseInput, submit: boolean, expenseId?: string): Promise<Expense>;
  withdrawExpense(id: string, expenseId: string): Promise<Expense>;

  /** approvalRepo + approvalChainRepo */
  approvals(id: string): Promise<Approval[]>;
  approvalHistory(id: string): Promise<ApprovalHistoryRow[]>;
  decide(id: string, approvalId: string, decision: ApprovalDecisionKind, note: string | null): Promise<Approval>;
  chains(id: string): Promise<ApprovalChain[]>;
  saveChainDraft(id: string, subject: ApprovalSubject, steps: ChainStep[]): Promise<ApprovalChain[]>;
  publishChain(id: string, subject: ApprovalSubject): Promise<ApprovalChain[]>;

  /** budgetRepo */
  budgets(id: string): Promise<BudgetLine[]>;
  requestBudgetChange(id: string, lineId: string, amount: number, reason: string): Promise<BudgetLine>;

  /** reimbursementRepo */
  reimbursements(id: string): Promise<Reimbursement[]>;
  paymentRuns(id: string): Promise<PaymentRun[]>;
  createRun(id: string, itemIds: string[]): Promise<PaymentRun>;
  confirmRun(id: string, runId: string, reference: string): Promise<PaymentRun>;
  markNotReceived(id: string, itemId: string, note: string): Promise<Reimbursement>;
  /** Marks the item recorded (idempotent). The Personal entry is a separate explicit write by the caller. */
  markRecordedInPersonal(id: string, itemId: string): Promise<{ item: Reimbursement; alreadyRecorded: boolean }>;

  /** employeeFileRepo + caseRepo + auditRepo.forSubject — every open is audited. */
  employeeFile(id: string, personId: string): Promise<EmployeeFileAccess>;
  requestFileAccess(id: string, personId: string): Promise<void>;
  addDocument(id: string, personId: string, name: string): Promise<EmployeeFileAccess>;
  /** Read grant: a server-side file pack; the download is logged and visible to the employee. */
  downloadPack(id: string, personId: string): Promise<{ name: string }>;
  openCorrective(id: string, personId: string, input: { reason: string; evidence: string }): Promise<CorrectiveAction>;
  respondCorrective(id: string, personId: string, actionId: string, text: string): Promise<CorrectiveAction>;
  appealCorrective(id: string, personId: string, actionId: string, text: string): Promise<CorrectiveAction>;
  closeCorrective(id: string, personId: string, actionId: string, outcome: string): Promise<CorrectiveAction>;

  /** companyReportRepo + exportRepo + auditRepo */
  reports(id: string, departmentId: string | null): Promise<CompanyReport[]>;
  exports(id: string): Promise<CompanyExport[]>;
  requestExport(id: string, report: CompanyReportId, format: "csv" | "pdf"): Promise<CompanyExport>;
  audit(id: string): Promise<AuditRow[]>;

  /** policyRepo.list / set · companyRepo lifecycle */
  settings(id: string): Promise<CompanySettings>;
  updateGeneral(id: string, patch: { name: string; legalName: string; currency: CompanyCurrency; fiscalStartMonth: number }): Promise<CompanySettings>;
  setPolicyLevel(id: string, policyId: string, level: PolicyLevel): Promise<CompanySettings>;
  setGrant(id: string, personId: string, kind: CompanyGrantKind, until: string | null, on: boolean): Promise<CompanySettings>;
  requestTransfer(id: string, toPersonId: string, password: string): Promise<CompanySettings>;
  archive(id: string): Promise<CompanySummary>;
  remove(id: string, confirmName: string, password: string): Promise<void>;
}
