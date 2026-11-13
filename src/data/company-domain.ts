import type { ProjectHealth, ProjectTint } from "./project-domain";
import type { ManualStatus } from "@/components/context/presence-dot";

/*
 * Companies (Phase 4) domain. Backend Phase 4 is not built: the shapes follow
 * design/company (SPEC "Data & backend" tabs) and only the mock adapters
 * produce them. Each company is one custody boundary: nothing here ever
 * references another company or Personal data.
 *
 * Money: one currency per company, exact integer amounts in that currency
 * (never rounded; short forms only in tiles). Days are Gregorian
 * "YYYY-MM-DD" (Jalali is display only), instants ISO strings.
 */

export type CompanyRole = "owner" | "admin" | "manager" | "lead" | "member" | "viewer";
export const companyRoles: readonly CompanyRole[] = ["owner", "admin", "manager", "lead", "member", "viewer"];

/** One currency per company (owner decision); locked after the first approved expense. */
export type CompanyCurrency = "toman" | "rial" | "usd" | "eur";

/** Special grants: explicit, separate from roles, time-limited where sensitive. */
export type CompanyGrantKind = "finance" | "hr" | "security";

export interface CompanyGrant {
  kind: CompanyGrantKind;
  personId: string;
  /** Last day of a time-limited grant; null = until revoked. */
  until: string | null;
}

export type CompanyLifecycle = "active" | "archived";

/** Rail modules inside a company (CS-01 C2). */
export type CompanyModule =
  | "overview"
  | "departments"
  | "people"
  | "work"
  | "goals"
  | "resources"
  | "expenses"
  | "approvals"
  | "budgets"
  | "knowledge"
  | "reports"
  | "settings";

export interface CompanySummary {
  id: string;
  name: string;
  legalName: string;
  initials: string;
  tint: ProjectTint;
  role: CompanyRole;
  /** My primary department (directory line "Member · Design"). */
  departmentId: string | null;
  departmentName: string | null;
  people: number;
  departments: number;
  /** Approvals where I am the current step's reviewer. */
  approvalsForMe: number;
  lifecycle: CompanyLifecycle;
  lifecycleAt: string | null;
  /** Not served by the API: null in live mode (amounts then show without a unit). */
  currency: CompanyCurrency | null;
  /** Locked after the first approved expense (C5). */
  currencyLocked: boolean;
  /** Jalali month (1–12) the fiscal year starts in. */
  fiscalStartMonth: number | null;
  /** Last activity in the company (card "updated 5 min ago"). */
  updatedAt: string;
}

export interface CompanyDirectory {
  companies: CompanySummary[];
  recentIds: string[];
}

export interface CompanyInvitation {
  id: string;
  companyId: string;
  companyName: string;
  initials: string;
  role: CompanyRole;
  departmentName: string | null;
  inviterName: string;
}

/** What the viewer may do in one company (mock `capabilities`, SPEC permission tables). */
export interface CompanyCapabilities {
  modules: Record<CompanyModule, boolean>;
  /** See every department (Owner / Org Admin); others are department-scoped. */
  allDepartments: boolean;
  /** Departments the viewer manages. */
  managedDepartmentIds: string[];
  budgetCard: boolean;
  export: boolean;
  manageDepartments: boolean;
  overridePolicy: boolean;
  invite: boolean;
  editWorkProfile: boolean;
  requestFileAccess: boolean;
  requestAttach: boolean;
  createWork: boolean;
  seeWorkBudgets: boolean;
  createCompanyGoal: boolean;
  createDepartmentGoal: boolean;
  linkGoalWork: boolean;
  requestResource: boolean;
  manageResources: boolean;
  seeCapacity: boolean;
  createKbPage: boolean;
  manageKb: boolean;
  seeAllExpenses: boolean;
  createExpense: boolean;
  approve: boolean;
  approvalHistoryAll: boolean;
  companyBudgets: boolean;
  requestBudgetChange: boolean;
  settleReimbursements: boolean;
  companyReports: boolean;
  departmentReports: boolean;
  auditLog: boolean;
  openSettings: boolean;
  lifecycle: boolean;
  grants: CompanyGrantKind[];
}

export type CompanyAccess =
  | { status: "ok"; company: CompanySummary; capabilities: CompanyCapabilities; me: CompanyPersonRef; myDepartmentIds: string[] }
  | { status: "not-available" }
  | { status: "invite-pending"; invitation: CompanyInvitation }
  | { status: "left" };

export interface CompanyPersonRef {
  id: string;
  name: string;
  initials: string;
}

/* ── Overview (CO-01) ─────────────────────────────────────────────── */

export interface PortfolioQuarter {
  label: string;
  onTrack: number;
  active: number;
}

export interface PortfolioSummary {
  quarter: string;
  onTrack: number;
  active: number;
  atRisk: number;
  offTrack: number;
  history: PortfolioQuarter[];
}

export interface CompanyKpis {
  teams: number;
  teamsSentPlan: number;
  people: number;
  joinedThisQuarter: number;
  onLeave: number;
  goalsOnPace: number;
  goals: number;
  approvalsForMe: number;
  oldestWaitingDays: number;
}

export interface DepartmentProgressRow {
  departmentId: string;
  name: string;
  progress: number;
  status: ProjectHealth | "watch";
  capacity: number;
}

export interface CapacityWatch {
  departmentId: string;
  departmentName: string;
  percent: number;
  /** Jalali month (1–12). */
  month: number;
  overlaps: number;
}

export interface BudgetSummary {
  quarter: string;
  budget: number;
  approved: number;
  committed: number;
  left: number;
  pending: number;
}

export interface CompanyOverview {
  portfolio: PortfolioSummary;
  kpis: CompanyKpis;
  departments: DepartmentProgressRow[];
  watch: CapacityWatch | null;
  /** null when the viewer may not see budgets. */
  budget: BudgetSummary | null;
}

/* ── Departments & policies (CO-02) ───────────────────────────────── */

export interface Department {
  id: string;
  name: string;
  parentId: string | null;
  managerId: string | null;
  managerName: string | null;
  people: number;
  /** Not served by the API (null in live mode). */
  teams: string[] | null;
  budget: number | null;
  /** Units are departments with a parent; the tree nests them. */
  kind: "department" | "unit";
}

export type PolicyLevel = "mandatory" | "default" | "optional";

export interface PolicyDefinition {
  id: string;
  name: string;
  value: string;
  level: PolicyLevel;
  security: boolean;
}

export interface EffectivePolicy extends PolicyDefinition {
  /** A Default overridden for this department (reason audited). */
  override: { value: string; reason: string; by: string; at: string } | null;
}

export interface MovePreview {
  departmentId: string;
  newParentId: string | null;
  people: number;
  budget: number;
  teams: number;
}

/* ── People (CO-03) ───────────────────────────────────────────────── */

export type StaffStatus = "active" | "leave" | "left";

export interface WorkProfile {
  id: string;
  name: string;
  initials: string;
  position: string;
  departmentIds: string[];
  departmentNames: string[];
  supervisorId: string | null;
  supervisorName: string | null;
  role: CompanyRole;
  status: StaffStatus;
  manualStatus: ManualStatus | null;
  workingOn: string | null;
  email: string;
  phone: string | null;
  hoursPerWeek: number;
  /** Display line, e.g. "Sat – Wed · 9:00 – 17:00" (user content). */
  workHours: string;
  startedOn: string | null;
  location: string;
  equipment: string[];
  bookedPercent: number;
  /** Viewer sees only name + department (outside their department scope). */
  limited: boolean;
}

/* ── Projects & teams (CO-04) ─────────────────────────────────────── */

export type Custody = "company" | "attached";

export interface CompanyProjectRow {
  id: string;
  name: string;
  initials: string;
  departmentId: string;
  departmentName: string;
  health: ProjectHealth;
  progress: number;
  /** Approved spend vs project budget; null when the viewer may not see budgets. */
  spent: number | null;
  budget: number | null;
  custody: Custody;
  lead: string;
  lifecycle: "active" | "paused";
  nextMilestone: { title: string; due: string } | null;
  openRisks: number;
  /** When an attached project joined the company. */
  attachedAt: string | null;
}

export interface CompanyTeamRow {
  id: string;
  name: string;
  initials: string;
  departmentId: string;
  departmentName: string;
  lead: string;
  people: number;
  planCompletion: number;
  custody: Custody;
}

export interface AttachRequest {
  id: string;
  kind: "team" | "project";
  subjectId: string;
  subjectName: string;
  ownerName: string;
  departmentId: string;
  departmentName: string;
  members: number;
  linkedProjects: { id: string; name: string; consent: "pending" | "accepted" | "declined" }[];
  status: "pending" | "accepted" | "declined" | "cancelled";
  requestedAt: string;
  /** The viewer is the subject's owner (sees the custody & privacy preview). */
  iAmOwner: boolean;
}

export interface AttachCandidate {
  id: string;
  kind: "team" | "project";
  name: string;
  ownerName: string;
}

/* ── Goals (CO-05) ────────────────────────────────────────────────── */

export type CompanyGoalLevel = "company" | "department";

export interface CompanyKeyResult {
  id: string;
  title: string;
  current: number;
  target: number;
  unit: string;
  source: { kind: "auto"; children: number; onPace: number } | { kind: "manual"; by: string; at: string };
}

export interface CompanyGoalLink {
  id: string;
  kind: "team-goal" | "project";
  name: string;
  progress: number;
  /** Only links the viewer can open are listed. */
  href: string;
}

export interface CompanyGoal {
  id: string;
  level: CompanyGoalLevel;
  parentId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  title: string;
  ownerId: string;
  ownerName: string;
  quarter: string;
  progress: number;
  onPace: boolean;
  keyResults: CompanyKeyResult[];
  links: CompanyGoalLink[];
}

/* ── Resources (CO-06) ────────────────────────────────────────────── */

export type ResourceStatus = "assigned" | "available" | "requested" | "repair" | "retired";

export interface CompanyResource {
  id: string;
  tag: string;
  name: string;
  type: "laptop" | "monitor" | "phone" | "license" | "vehicle" | "other";
  assigneeId: string | null;
  assigneeName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  status: ResourceStatus;
  /** Short status note (user content): "IT shelf", "back 25 Mehr"… */
  note: string | null;
  /** When the current assignment started. */
  since: string | null;
  /** Busy windows (requests / assignments) used for conflict suggestions. */
  busy: { from: string; to: string }[];
}

export interface ResourceRequest {
  id: string;
  resourceId: string;
  resourceName: string;
  tag: string;
  requesterId: string;
  requesterName: string;
  departmentName: string;
  from: string;
  to: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  approvalId: string | null;
  createdAt: string;
}

export interface CompanyRoom {
  id: string;
  name: string;
  seats: number;
  floor: string;
  bookings: { id: string; from: string; to: string; title: string | null; mine: boolean }[];
}

export interface CapacityHeat {
  /** Jalali months (1–12). */
  months: number[];
  rows: { departmentId: string; name: string; values: number[] }[];
}

/* ── Knowledge (CO-07) ────────────────────────────────────────────── */

export interface KbFolder {
  id: string;
  name: string;
  parentId: string | null;
  restricted: boolean;
  pages: number;
}

export interface KbPageSummary {
  id: string;
  folderId: string;
  title: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
  ackRequired: boolean;
  acknowledged: boolean;
}

export interface KbVersion {
  version: number;
  at: string;
  by: string;
  note: string;
}

export interface KbPage extends KbPageSummary {
  body: string;
  versions: KbVersion[];
  files: { id: string; name: string; size: string }[];
  ackCount: number;
  audience: number;
  canEdit: boolean;
  remindedVersion: number | null;
}

export interface KbSearchHit {
  id: string;
  kind: "page" | "file";
  title: string;
  folderName: string;
  pageId: string;
  snippet: string;
}

/* ── Expenses (CO-08) ─────────────────────────────────────────────── */

export type ExpenseStatus = "draft" | "pending" | "approved" | "rejected" | "changes" | "withdrawn";
export type ExpensePayer = "me" | "card";
export type ExpenseCategory = "meals" | "travel" | "software" | "equipment" | "training" | "other";

export interface Expense {
  id: string;
  title: string;
  amount: number;
  date: string;
  category: ExpenseCategory;
  departmentId: string;
  departmentName: string;
  projectId: string | null;
  projectName: string | null;
  payer: ExpensePayer;
  receipt: { name: string } | null;
  authorId: string;
  authorName: string;
  status: ExpenseStatus;
  /** Current step (1-based) while pending. */
  step: number | null;
  approvalId: string | null;
  revision: number;
  changesNote: { by: string; text: string } | null;
  createdAt: string;
}

export interface ExpenseInput {
  title: string;
  amount: number;
  date: string;
  category: ExpenseCategory;
  departmentId: string;
  projectId: string | null;
  payer: ExpensePayer;
  receipt: { name: string } | null;
}

/* ── Approvals (CO-09) + chains (CO-14) ───────────────────────────── */

export type ApprovalSubject = "expenses" | "resources" | "headcount" | "budget";

export interface ChainStep {
  id: string;
  label: string;
  /** Who decides: a role in the subject's department, or a grant. */
  approver: "dept-manager" | "finance" | "owner" | "hr" | "admin";
  /** Step applies only above this amount (null = always). */
  minAmount: number | null;
  escalateAfterDays: number;
  escalateTo: "admin" | "owner";
}

export interface ApprovalChain {
  id: string;
  subject: ApprovalSubject;
  version: number;
  status: "published" | "draft";
  steps: ChainStep[];
  publishedAt: string | null;
}

export type ApprovalDecisionKind = "approved" | "rejected" | "changes";

export interface ApprovalStepState {
  stepId: string;
  label: string;
  reviewerId: string | null;
  reviewerName: string | null;
  /** Routed past the requester (C7) or reassigned after a revoked grant. */
  routedNote: string | null;
  state: "done" | "current" | "waiting" | "skipped";
  decision: { kind: ApprovalDecisionKind; by: string; at: string; note: string | null } | null;
  escalatesOn: string | null;
}

export interface Approval {
  id: string;
  subject: ApprovalSubject;
  subjectId: string;
  title: string;
  departmentName: string;
  amount: number | null;
  amountNote: string | null;
  requesterId: string;
  requesterName: string;
  chainVersion: number;
  status: "pending" | "approved" | "rejected" | "changes";
  currentStep: number;
  steps: ApprovalStepState[];
  submittedAt: string;
  /** After approval: reimbursement, budget commit, notification, audit. */
  outcomes: string[];
  forMe: boolean;
  mine: boolean;
}

export interface ApprovalHistoryRow {
  id: string;
  approvalId: string;
  at: string;
  title: string;
  decision: ApprovalDecisionKind;
  step: number;
  note: string | null;
  by: string;
  subject: ApprovalSubject;
  chainVersion: number;
}

/* ── Budgets (CO-10) ──────────────────────────────────────────────── */

export interface BudgetLine {
  id: string;
  kind: "department" | "project";
  name: string;
  departmentId: string;
  departmentName: string;
  budget: number;
  approved: number;
  committed: number;
  pending: number;
  versions: { version: number; at: string; budget: number; note: string }[];
  changeRequest: { id: string; amount: number; status: "pending" } | null;
}

/* ── Reimbursements (CO-11) ───────────────────────────────────────── */

export type ReimbursementStatus = "to-settle" | "in-run" | "settled" | "disputed";

export interface Reimbursement {
  id: string;
  expenseId: string;
  title: string;
  amount: number;
  recipientId: string;
  recipientName: string;
  departmentName: string;
  approvedAt: string;
  status: ReimbursementStatus;
  runId: string | null;
  settledAt: string | null;
  disputeNote: string | null;
  recordedInPersonal: boolean;
}

export interface PaymentRun {
  id: string;
  label: string;
  itemIds: string[];
  total: number;
  status: "open" | "confirmed";
  reference: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
}

/* ── Employee file (CO-12) ────────────────────────────────────────── */

export interface FileDocument {
  id: string;
  name: string;
  kind: "contract" | "id" | "certificate" | "review" | "other";
  addedAt: string;
  /** Per-document grants beyond the HR reviewer. */
  grantedTo: string[];
  readable: boolean;
}

export interface FileAccessLogRow {
  id: string;
  at: string;
  who: string;
  what: string;
}

export type CorrectiveStatus = "open" | "responded" | "appealed" | "closed";

export interface CorrectiveAction {
  id: string;
  reason: string;
  evidence: string;
  visibleTo: string;
  openedBy: string;
  openedAt: string;
  status: CorrectiveStatus;
  response: string | null;
  appeal: string | null;
  outcome: string | null;
}

export type EmployeeFileAccess =
  | { status: "sealed"; person: CompanyPersonRef; requested: boolean }
  | {
      status: "open";
      person: CompanyPersonRef;
      own: boolean;
      grant: { kind: "hr" | "supervisor" | "self"; until: string | null };
      canAddDocument: boolean;
      canOpenCorrective: boolean;
      documents: FileDocument[];
      log: FileAccessLogRow[];
      corrective: CorrectiveAction[];
    };

/* ── Reports & audit (CO-13) ──────────────────────────────────────── */

export type CompanyReportId = "portfolio" | "capacity" | "expenses" | "variance" | "goals" | "headcount" | "audit";

export interface CompanyReport {
  id: CompanyReportId;
  scope: "department" | "company";
  source: string;
  series: { label: string; value: number }[];
}

export interface CompanyExport {
  id: string;
  /** Null when the API does not say (live history rows carry no dataset or format). */
  report: CompanyReportId | null;
  format: "csv" | "pdf" | null;
  requestedAt: string;
  requestedBy: string;
  status: "ready" | "expired";
  expiresAt: string | null;
  watermark: string | null;
  /** Live mode: the export content returned by the (synchronous) request, saved by the caller once. */
  file?: { blob: Blob; name: string };
}

export interface AuditRow {
  id: string;
  at: string;
  who: string;
  action: string;
  subject: string;
  /** Null for actions outside the five filter groups (live mode). */
  kind: "file" | "approval" | "policy" | "export" | "ownership" | null;
}

/* ── Settings (CO-14) ─────────────────────────────────────────────── */

export interface CompanySettings {
  name: string;
  legalName: string;
  currency: CompanyCurrency;
  currencyLocked: boolean;
  fiscalStartMonth: number;
  policies: PolicyDefinition[];
  grants: (CompanyGrant & { personName: string })[];
  eligibleOwners: CompanyPersonRef[];
  transfer: { toName: string; status: "pending" } | null;
  retentionYears: number;
}
