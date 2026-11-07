/*
 * Projects (Phase 2) domain types, shared by the mock adapters and the UI
 * (design/project SPEC "Data & backend" tabs). The Phase 2 backend does not
 * exist yet: these shapes are the UI contract the mock repositories serve.
 *
 * Transport rules as everywhere else: dates are Gregorian ISO strings
 * ("2026-11-11", instants with offset), shown in Jalali by the UI. Names and
 * notes are user content (never translated; render inside <bdi>).
 */

/** Project roles (owner documents) plus the verified external collaborator with a narrow grant. */
export type ProjectRole = "owner" | "admin" | "manager" | "member" | "viewer" | "guest";

/** Manual status set by a Manager+ (D9); never computed. */
export type ProjectHealth = "on-track" | "at-risk" | "off-track";

/** Lifecycle comes from the project settings, not from the status chip. */
export type ProjectLifecycle = "active" | "paused" | "archived";

export type ProjectTint = "blue" | "indigo" | "amber" | "purple";

export interface ProjectPerson {
  id: string;
  name: string;
  initials: string;
}

export interface ProjectStatusNote {
  text: string;
  author: ProjectPerson;
  /** Instant with offset. */
  at: string;
}

export interface ProjectMilestoneRef {
  id: string;
  title: string;
  /** Gregorian day. */
  due: string;
}

/** One card in the directory (PJ-00) and the head of every project screen. */
export interface ProjectSummary {
  id: string;
  name: string;
  /** Task prefix (e.g. WEB → WEB-12); unique, rules in `project-key.ts`. */
  key: string;
  /** Initials tile (data, may be Latin or Persian). */
  initials: string;
  /** The project colour chosen by its owner (initials tile tint). */
  tint: ProjectTint;
  description: string;
  /** The current user's role. Display only: rights come from `ProjectCapabilities`. */
  role: ProjectRole;
  health: ProjectHealth;
  lifecycle: ProjectLifecycle;
  statusNote: ProjectStatusNote | null;
  /** Tasks done / total and the server-rounded percent. */
  progress: { done: number; total: number; percent: number };
  /** Expected share done by today (0–100) for the pace marker. */
  expectedPercent: number;
  nextMilestone: ProjectMilestoneRef | null;
  startDate: string;
  endDate: string;
  /** First members for the avatar stack; `memberCount` is the server total. */
  members: readonly ProjectPerson[];
  memberCount: number;
  /** My open accepted + pending assignments. */
  forYou: number;
  /** Open high/critical risks (rail badge on Risks). */
  openHighRisks: number;
  updatedAt: string;
  /** Directory only: whether the user may restore this archived project (Owner/Admin). */
  restorable?: boolean;
  /** Verified guest only: how many tasks are shared with them. */
  sharedTaskCount?: number;
  /** Who paused / archived it and when (lifecycle lines). */
  lifecycleBy?: ProjectPerson;
  lifecycleAt?: string;
}

/**
 * What the current user may do in one project (SPEC Permissions tables).
 * Served by the repository; the UI never derives rights from the role label.
 */
export interface ProjectCapabilities {
  /** Module visibility (hidden, not disabled, when false: no discovery). */
  modules: Readonly<Record<ProjectModule, boolean>>;
  editStatus: boolean;
  invite: boolean;
  createTask: boolean;
  /** Edit tasks assigned to me. */
  editTasks: boolean;
  /** Create / edit any task (Manager+). */
  editAnyTask: boolean;
  /** Change status within the workflow rules. */
  changeStatus: boolean;
  deleteTasks: boolean;
  bulkEdit: boolean;
  importCsv: boolean;
  /** Assign / change assignee on tasks. */
  assignTasks: boolean;
  /** Remind / reassign a pending assignee (Manager+). */
  manageAssignments: boolean;
  acceptAssignments: boolean;
  comment: boolean;
  seeTeamLoad: boolean;
  createMilestone: boolean;
  /** Board: drop past a WIP limit after confirming (Manager+). */
  exceedWip: boolean;
  /** Board: manual order within a column (Manager+). */
  reorderTasks: boolean;
  createRisk: boolean;
  uploadFile: boolean;
  restore: boolean;
  export: boolean;
}

/** Project modules behind the rail (SH01 groups). Overview and Tasks are always visible. */
export type ProjectModule =
  | "timeline"
  | "gantt"
  | "calendar"
  | "milestones"
  | "risks"
  | "workload"
  | "members"
  | "files"
  | "analytics"
  | "settings";

/** A pending invitation: public-safe preview only (no tasks, members or files). */
export interface ProjectInvitation {
  id: string;
  projectId: string;
  projectName: string;
  inviter: ProjectPerson;
  role: ProjectRole;
  sentAt: string;
}

export type ProjectAccess =
  | { status: "ok"; project: ProjectSummary; capabilities: ProjectCapabilities }
  /** Forbidden and not found are the same answer (no discovery). */
  | { status: "not-available" }
  | { status: "invite-pending"; invitation: ProjectInvitation }
  | { status: "revoked" };

export type ProjectFilter = "all" | "owned" | "member" | "invitations" | "archived";

/** The directory: projects the user can see plus server counts per pill. */
export interface ProjectDirectory {
  projects: readonly ProjectSummary[];
  counts: Readonly<Record<ProjectFilter, number>>;
  /** Most recently opened first (switcher "Recent", max 3; collection rail, max 4). */
  recentIds: readonly string[];
}

// ── Work inside a project (PJ-01, PJ-02, PJ-15) ──────────────────────────

/** What a workflow status means for counts and views (never shown by itself). */
export type WorkflowCategory = "todo" | "active" | "review" | "blocked" | "done";

/** Statuses of the shipped workflow carry a key, so the UI can show its translation. */
export type DefaultStatusKey = "todo" | "in-progress" | "in-review" | "blocked" | "done";

export interface WorkflowStatus {
  id: string;
  /** As entered by the project (custom statuses are shown verbatim). */
  name: string;
  key?: DefaultStatusKey;
  category: WorkflowCategory;
}

/** The published workflow version tasks are on (D16). */
export interface ProjectWorkflow {
  version: number;
  statuses: readonly WorkflowStatus[];
  /** Allowed moves per status id, for the current user's role. */
  transitions: Readonly<Record<string, readonly string[]>>;
  /** Workflow name as entered in Settings (user content). */
  name?: string;
  /** When this version was published (instant with offset). */
  publishedAt?: string;
  publishedBy?: ProjectPerson;
  /** Who may move a task out of each status: its assignee (and Manager+) or Manager+ only. */
  transitionRoles?: Readonly<Record<string, "assignee" | "manager">>;
  /** Optional WIP limit per status id (Settings › Workflow). */
  wipLimits?: Readonly<Record<string, number>>;
}

export type ProjectPriority = "urgent" | "high" | "medium" | "low";

/** Independent from the task status (owner documents). */
export type AssignmentState = "pending" | "accepted" | "declined";

export type DeclineReason = "no-capacity" | "not-my-area" | "missing-info" | "other";

export interface TaskAssignee {
  person: ProjectPerson;
  state: AssignmentState;
  /** Who assigned it (shown on pending / declined). */
  by?: ProjectPerson;
  reason?: DeclineReason;
  note?: string;
}

export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  statusId: string;
  phaseId: string;
  milestoneId: string | null;
  assignees: readonly TaskAssignee[];
  priority: ProjectPriority;
  /** Gregorian day or null. */
  due: string | null;
  estimateHours: number | null;
  /** Tasks this one waits for (FS by default). */
  blockedBy: readonly string[];
  subtasks: { done: number; total: number };
  commentCount: number;
  /** Optimistic concurrency token (If-Match on writes). */
  revision: number;
  updatedAt: string;
  /** When the task entered a done status (instant); absent while open. */
  completedAt?: string;
  /** What the current user may do to this task (server-computed per request). */
  can?: TaskCan;
}

export interface TaskCan {
  edit: boolean;
  status: boolean;
  assign: boolean;
  delete: boolean;
}

export interface ProjectPhase {
  id: string;
  name: string;
  start: string;
  end: string;
  /** Share of the phase's tasks done (0–100). */
  progress: number;
  done: boolean;
  /** Days behind plan (current phase only), 0 when on plan. */
  behindDays: number;
}

export interface ProjectMilestone {
  id: string;
  title: string;
  due: string;
  phaseId: string;
  done: boolean;
  tasksLeft: number;
  /** Short blocker line when blocked ("API access"). */
  blockedBy?: string;
  owner?: ProjectPerson;
  /** Optimistic concurrency token (If-Match on writes). */
  revision?: number;
}

/** PJ-08 status, computed by the server (SPEC PJ-08 Rules › Status). */
export type MilestoneStatus = "reached" | "next" | "risk" | "planned";

export interface MilestoneRow {
  milestone: ProjectMilestone;
  status: MilestoneStatus;
  tasksDone: number;
  tasksTotal: number;
}

/** A phase with its task counts (server counts). */
export interface PhaseRow {
  phase: ProjectPhase;
  tasksDone: number;
  tasksTotal: number;
}

export type RiskSeverity = "low" | "medium" | "high" | "critical";

export interface ProjectRisk {
  id: string;
  kind: "risk" | "issue";
  title: string;
  severity: RiskSeverity;
  probability: "low" | "medium" | "high";
  open: boolean;
  owner: ProjectPerson;
  blocksTasks: number;
  mitigation?: string;
  /** Milestone this risk threatens (PJ-08 linked risk). */
  milestoneId?: string;
}

export type ProjectActivity =
  | { id: string; kind: "status"; actor: ProjectPerson; at: string; health: ProjectHealth; note: string }
  | { id: string; kind: "moved"; actor: ProjectPerson; at: string; task: string; status: string }
  | { id: string; kind: "completed"; actor: ProjectPerson; at: string; task: string }
  | { id: string; kind: "milestone"; actor: ProjectPerson; at: string; title: string; due: string };

/** Team load (D13): estimates of open tasks in this project only vs weekly project capacity. */
export interface WorkloadEntry {
  person: ProjectPerson;
  hours: number;
  capacity: number;
}

/** PJ-01 status-card KPIs, counted by the server. */
export interface ProjectKpis {
  milestonesDone: number;
  milestonesTotal: number;
  nextMilestone: ProjectMilestoneRef | null;
  overdueTasks: number;
  oldestOverdueDays: number;
  openRisks: number;
  highRisks: number;
  dueThisWeek: number;
  openTasks: number;
}

/** "For you" (PJ-01): my pending assignments and my accepted open tasks. */
export interface MyProjectWork {
  pending: readonly ProjectTask[];
  open: readonly ProjectTask[];
}

// ── Task detail (PJ-15) ──────────────────────────────────────────────────

export type DependencyType = "FS" | "SS" | "FF" | "SF";

/** "This task depends on {predecessor}" with a type and a lag in days. */
export interface TaskDependency {
  id: string;
  predecessorId: string;
  predecessorTitle: string;
  type: DependencyType;
  lagDays: number;
}

export interface TaskComment {
  id: string;
  author: ProjectPerson;
  at: string;
  body: string;
}

export type ProjectTaskActivity =
  | { id: string; at: string; actor: ProjectPerson; kind: "created" }
  | { id: string; at: string; actor: ProjectPerson; kind: "assigned"; person: string }
  | { id: string; at: string; actor: ProjectPerson; kind: "status"; statusId: string };

export interface ProjectTaskDetail {
  task: ProjectTask;
  start: string | null;
  section: string | null;
  customFields: readonly { label: string; value: string }[];
  loggedHours: number;
  subtasks: readonly { id: string; title: string; done: boolean }[];
  dependencies: readonly TaskDependency[];
  files: readonly { id: string; name: string }[];
  activity: readonly ProjectTaskActivity[];
  comments: readonly TaskComment[];
  unreadComments: number;
  /** My projection into My Calendar (assignee only; on after accept by default). */
  showInCalendar: boolean;
}

// ── Sheets (PJ-90) ───────────────────────────────────────────────────────

export type ProjectTemplate = "blank" | "product-launch" | "website" | "event";

/** Roles an invitation can offer (Task-only = verified guest with a task grant). */
export type InviteRole = "admin" | "manager" | "member" | "viewer" | "guest";

export interface PendingInvite {
  id: string;
  email: string;
  role: InviteRole;
  sentAt: string;
}

// ── Schedule (PJ-08 reschedule, PJ-05 Gantt) ─────────────────────────────

export type ScheduleItemKind = "task" | "milestone";

/** A dated node of the dependency graph: a task (start → end) or a milestone (start = end = due). */
export interface ScheduleItem {
  id: string;
  kind: ScheduleItemKind;
  title: string;
  /** Gregorian days. */
  start: string;
  end: string;
  revision: number;
}

/** "successor depends on predecessor" with a type and a lag (+) / lead (−) in days. */
export interface ScheduleLink {
  id: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
}

/** Open tasks of one assignee whose dates overlap (PJ-04 assignee lanes). */
export interface AssigneeOverlap {
  person: ProjectPerson;
  /** Tasks involved in at least one overlap. */
  taskIds: readonly string[];
  /** Number of overlapping pairs. */
  pairs: number;
}

export interface ScheduleGraph {
  items: readonly ScheduleItem[];
  links: readonly ScheduleLink[];
}

/** The change a user asks for: new dates of one item. */
export interface ScheduleChange {
  itemId: string;
  start: string;
  end: string;
}

/** "move dependents" (cascade) or "only this task" (dependencies become conflicts). */
export type ScheduleMode = "cascade" | "only";

export interface ScheduleMove {
  id: string;
  kind: ScheduleItemKind;
  title: string;
  from: { start: string; end: string };
  to: { start: string; end: string };
  /** Expected revision (If-Match) for the apply request. */
  revision: number;
}

export interface SchedulePreview {
  change: ScheduleChange;
  mode: ScheduleMode;
  /** Days the changed item moves (end date). */
  deltaDays: number;
  /** The changed item first, then every dependent that would move. */
  moves: readonly ScheduleMove[];
  /** Links that would be violated ("only this task"). */
  conflicts: readonly string[];
  /** Whether other items depend on the changed one at all. */
  hasDependents: boolean;
}

// ── Project calendar (PJ-07) ─────────────────────────────────────────────

/** One item of the project's single (blue) scope layer. Days are Gregorian. */
export type ProjectCalendarItem =
  | { id: string; kind: "task"; day: string; title: string; task: ProjectTask }
  | { id: string; kind: "milestone"; day: string; title: string; milestoneId: string }
  | { id: string; kind: "event"; day: string; title: string; time: string; invited: number };

/**
 * One of the current user's own busy blocks, without title or source: the
 * privacy-safe overlay (never another person's, never visible to others).
 */
export interface BusySlot {
  day: string;
  /** "HH:mm" wall-clock times (LTR). */
  start: string;
  end: string;
}

/** Project events (meeting basics; full meetings come later). */
export interface ProjectEvent {
  id: string;
  title: string;
  day: string;
  time: string;
  invited: number;
}
