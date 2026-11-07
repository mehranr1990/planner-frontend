import type {
  DeclineReason,
  InviteRole,
  PendingInvite,
  ProjectTemplate,
  DependencyType,
  ProjectTaskDetail,
  TaskComment,
  TaskDependency,
  MyProjectWork,
  MilestoneRow,
  AssigneeOverlap,
  BusySlot,
  ProjectCalendarItem,
  PhaseRow,
  ScheduleChange,
  ScheduleGraph,
  ScheduleLink,
  ScheduleMode,
  ScheduleMove,
  SchedulePreview,
  ProjectAccess,
  ProjectActivity,
  ProjectKpis,
  ProjectMilestone,
  ProjectPerson,
  ProjectPhase,
  ProjectPriority,
  ProjectRisk,
  GuestGrant,
  ProjectMember,
  FileLibrary,
  FileServerConfig,
  ProjectFile,
  RiskCloseReason,
  RiskHistoryEntry,
  RiskProbability,
  RiskSeverity,
  RiskStatus,
  ProjectTask,
  ProjectWorkflow,
  WorkloadEntry,
  ProjectDirectory,
  ProjectHealth,
  ProjectInvitation,
  ProjectRole,
  ProjectSummary,
} from "./project-domain";

/*
 * Projects (Phase 2) repository interfaces. Backend Phase 2 is not built:
 * only mock adapters implement these (src/data/mock/mock-projects.ts); never
 * add an API adapter with guessed endpoints. Errors use RepositoryError.
 */

export interface ProjectAccessOptions {
  /**
   * Demo harness only (SH-02 demo-state switch): answer as if the current
   * user held this role. Mock adapters honour it; a live adapter ignores it.
   */
  previewRole?: ProjectRole;
  /** Demo harness only: answer as if the project were archived. */
  previewArchived?: boolean;
}

export interface ProjectStatusInput {
  health: ProjectHealth;
  note: string;
}

export interface ProjectRepository {
  /** Projects the user can see, server counts per filter, and the recent list. */
  listAccessible(): Promise<ProjectDirectory>;
  /** One project with the user's capabilities, or an access answer (not available / invite / revoked). */
  access(id: string, options?: ProjectAccessOptions): Promise<ProjectAccess>;
  /** Manager+: status chip + short note (D9). */
  setStatus(id: string, input: ProjectStatusInput): Promise<ProjectSummary>;
  /** PJ-01 status-card KPIs (server counts). */
  summary(id: string): Promise<ProjectKpis>;
  /** Owner/Admin: archived → active. */
  restore(id: string): Promise<ProjectSummary>;
}

export interface InvitationRepository {
  /** Pending invitations for the current user (public-safe preview only). */
  listMine(): Promise<readonly ProjectInvitation[]>;
  /** Accepts and returns the project id to open. */
  accept(id: string): Promise<{ projectId: string }>;
  decline(id: string, note?: string): Promise<void>;
}

export interface MilestoneRepository {
  listPhases(projectId: string): Promise<readonly ProjectPhase[]>;
  listMilestones(projectId: string): Promise<readonly ProjectMilestone[]>;
  /** PJ-08: phases with task counts, in project order. */
  phaseRows(projectId: string): Promise<readonly PhaseRow[]>;
  /** PJ-08: milestones with the server-computed status and linked-task counts. */
  milestoneRows(projectId: string): Promise<readonly MilestoneRow[]>;
  /** Manager+: new phase order (all phase ids). */
  reorderPhases(projectId: string, phaseIds: readonly string[]): Promise<readonly ProjectPhase[]>;
  /** Manager+: rename (dates change through ScheduleRepository). Rejects "conflict" on a stale revision. */
  updateMilestone(milestoneId: string, patch: { title: string }, revision: number): Promise<ProjectMilestone>;
}

export interface ProjectCalendarRepository {
  /** Task due dates, milestones and project events between two days (inclusive). No other sources. */
  range(projectId: string, from: string, to: string, options?: ProjectAccessOptions): Promise<readonly ProjectCalendarItem[]>;
  /** The current user's own busy blocks only, untitled (A07 projection). */
  myBusy(from: string, to: string): Promise<readonly BusySlot[]>;
}

export interface ScheduleRepository {
  /** Dated tasks, milestones and their dependency links. */
  graph(projectId: string): Promise<ScheduleGraph>;
  /** What a date change would do (nothing is saved). */
  preview(projectId: string, change: ScheduleChange, mode: ScheduleMode): Promise<SchedulePreview>;
  /**
   * One request for every move of a preview, each with its expected revision.
   * All or nothing: a stale revision rejects with "conflict"; the cascade
   * needs Manager+ ("forbidden").
   */
  apply(projectId: string, moves: readonly ScheduleMove[]): Promise<void>;
  /** Overlapping open assignments per person (derived by the server). */
  overlaps(projectId: string): Promise<readonly AssigneeOverlap[]>;
  /** Longest dependency chain to the final milestone (item ids, in order). */
  criticalPath(projectId: string): Promise<readonly string[]>;
  /**
   * Manager+: "successor depends on predecessor". Rejects "invalid" with
   * message "cycle" when the predecessor already depends on the successor,
   * "duplicate" for an existing pair, "forbidden" without the right.
   */
  addLink(projectId: string, input: Omit<ScheduleLink, "id">): Promise<ScheduleLink>;
  updateLink(projectId: string, linkId: string, patch: Pick<ScheduleLink, "type" | "lagDays">): Promise<ScheduleLink>;
  removeLink(projectId: string, linkId: string): Promise<void>;
}

export interface WorkflowRepository {
  /** The published workflow version tasks are on (D16), transitions for my role. */
  published(projectId: string): Promise<ProjectWorkflow>;
}

export interface ActivityRepository {
  list(projectId: string, options?: { limit?: number }): Promise<readonly ProjectActivity[]>;
}

export interface RiskPatch {
  title?: string;
  severity?: RiskSeverity;
  probability?: RiskProbability;
  status?: Exclude<RiskStatus, "closed">;
  ownerId?: string;
  mitigation?: string;
}

export interface RiskRepository {
  /**
   * The register. `kind` filters risks / issues; a risk that became an issue
   * leaves the risk list (the issue links back). `open` filters by status.
   */
  list(projectId: string, options?: { open?: boolean; kind?: ProjectRisk["kind"] }): Promise<readonly ProjectRisk[]>;
  /** The open risk linked to a milestone, if any. */
  byMilestone(projectId: string, milestoneId: string): Promise<ProjectRisk | null>;
  get(riskId: string): Promise<ProjectRisk>;
  history(riskId: string): Promise<readonly RiskHistoryEntry[]>;
  comments(riskId: string): Promise<readonly TaskComment[]>;
  addComment(riskId: string, body: string): Promise<TaskComment>;
  /** If-Match: rejects "conflict" when `revision` is stale. */
  update(riskId: string, patch: RiskPatch, revision: number): Promise<ProjectRisk>;
  setChecklistItem(
    riskId: string,
    itemId: string,
    patch: { done?: boolean; taskId?: string },
    revision: number,
  ): Promise<ProjectRisk>;
  /** Close a risk with a reason (optional note). */
  close(riskId: string, input: { reason: RiskCloseReason; note?: string }, revision: number): Promise<ProjectRisk>;
  /** Resolve an issue (resolution note required, else "invalid"). */
  resolve(riskId: string, resolution: string, revision: number): Promise<ProjectRisk>;
  /** Creates the issue (same title / severity, links back) and closes the risk as "became-issue"; returns the issue. */
  convert(riskId: string, revision: number): Promise<ProjectRisk>;
}

export interface FileUploadInput {
  name: string;
  sizeBytes: number;
  folderId: string | null;
  /** Same name as an existing file: upload as its next version. */
  asNewVersionOf?: string;
}

/** PJ-10 (D14): one folder level, versions by re-upload, scan before download, limits from the server. */
export interface FileRepository {
  /** Guests get only guest-shared folders and files linked to their tasks. */
  list(projectId: string, options?: ProjectAccessOptions): Promise<FileLibrary>;
  /** Technical limits from the server (never hard-coded in the UI). */
  config(projectId: string): Promise<FileServerConfig>;
  /** Starts the signed upload; blocked at once when the type / size is not allowed. */
  upload(projectId: string, input: FileUploadInput): Promise<ProjectFile>;
  cancel(fileId: string): Promise<void>;
  retry(fileId: string): Promise<ProjectFile>;
  /** Restoring an older version creates a new version. */
  restoreVersion(fileId: string, version: number): Promise<ProjectFile>;
  /** Rejects "invalid" until the file is scanned and ready. */
  download(fileId: string): Promise<Blob>;
}

/**
 * PJ-13 membership. Role changes apply at once (the UI offers Undo by
 * setting the previous role back). The Owner is changed only by transfer:
 * setRole / remove on the Owner reject "invalid" ("last-owner").
 */
export interface MemberRepository {
  list(projectId: string): Promise<readonly ProjectMember[]>;
  setRole(projectId: string, personId: string, role: Exclude<ProjectRole, "owner" | "guest">): Promise<ProjectMember>;
  /** What removing someone does: their open tasks become Unassigned. */
  removalPreview(projectId: string, personId: string): Promise<{ openTasks: number }>;
  remove(projectId: string, personId: string): Promise<void>;
  /** The current user leaves (same task rule); the project leaves their directory. */
  leave(projectId: string): Promise<void>;
  setCapacity(projectId: string, personId: string, hours: number | null): Promise<ProjectMember>;
}

/** PJ-13 guest task grants (verified external collaborators). */
export interface GrantRepository {
  list(projectId: string): Promise<readonly GuestGrant[]>;
  set(projectId: string, grant: GuestGrant): Promise<GuestGrant>;
}

export interface WorkloadRepository {
  /** This week's estimates per member (D13); empty without the capability. */
  week(projectId: string): Promise<readonly WorkloadEntry[]>;
}

export interface AssignmentDeclineInput {
  reason: DeclineReason;
  note?: string;
  /** If-Match: the task revision the user saw. */
  revision: number;
}

export interface AssignmentRepository {
  /** My pending assignments and accepted open tasks in one project. */
  listMine(projectId: string): Promise<MyProjectWork>;
  accept(taskId: string, revision: number): Promise<ProjectTask>;
  decline(taskId: string, input: AssignmentDeclineInput): Promise<ProjectTask>;
  /** Undo of Accept: back to pending (the projection leaves Personal). */
  revertAccept(taskId: string, revision: number): Promise<ProjectTask>;
  /** Manager+: nudge a pending assignee. */
  remind(taskId: string): Promise<void>;
}

/** The Projects part of the `Repositories` aggregate (mock adapters only). */
export interface ProjectRepositories {
  projects: ProjectRepository;
  invitations: InvitationRepository;
  milestones: MilestoneRepository;
  workflows: WorkflowRepository;
  activity: ActivityRepository;
  risks: RiskRepository;
  files: FileRepository;
  members: MemberRepository;
  grants: GrantRepository;
  workload: WorkloadRepository;
  assignments: AssignmentRepository;
  projectTasks: ProjectTaskRepository;
  taskDetails: TaskDetailRepository;
  comments: CommentRepository;
  dependencies: DependencyRepository;
  projectCreate: ProjectCreateRepository;
  memberInvites: MemberInviteRepository;
  reassign: ReassignRepository;
  schedule: ScheduleRepository;
  calendar: ProjectCalendarRepository;
}

// ── Project tasks (PJ-02) ────────────────────────────────────────────────

export type ProjectTaskView = "all" | "mine" | "unassigned" | "overdue" | "completed";

export interface ProjectTaskFilters {
  statusIds?: readonly string[];
  assigneeIds?: readonly string[];
  priorities?: readonly ProjectPriority[];
  milestoneIds?: readonly string[];
}

export interface ProjectTaskQuery {
  view?: ProjectTaskView;
  filters?: ProjectTaskFilters;
  search?: string;
}

export interface ProjectTaskList {
  tasks: readonly ProjectTask[];
  /** Server counts per view pill (after filters and search, only what the user can see). */
  counts: Readonly<Record<ProjectTaskView, number>>;
}

export interface NewProjectTaskInput {
  title: string;
  phaseId: string;
  assigneeId?: string;
  priority?: ProjectPriority;
  due?: string;
  estimateHours?: number;
}

export interface ProjectTaskPatch {
  title?: string;
  statusId?: string;
  phaseId?: string;
  milestoneId?: string | null;
  priority?: ProjectPriority;
  due?: string | null;
  estimateHours?: number | null;
  /** Replaces the assignees; new people get a pending assignment. */
  assigneeIds?: readonly string[];
}

export interface BulkUpdateResult {
  updated: readonly ProjectTask[];
  /** Tasks the user cannot change with this patch (nothing applied to them). */
  failedIds: readonly string[];
}

export interface ProjectTaskRepository {
  list(projectId: string, query?: ProjectTaskQuery, options?: ProjectAccessOptions): Promise<ProjectTaskList>;
  get(taskId: string, options?: ProjectAccessOptions): Promise<ProjectTask>;
  /** People who can hold tasks in the project (assignee picker, @mentions). */
  members(projectId: string): Promise<readonly ProjectPerson[]>;
  create(projectId: string, input: NewProjectTaskInput): Promise<ProjectTask>;
  /** If-Match: rejects with code "conflict" when `revision` is stale. */
  update(taskId: string, patch: ProjectTaskPatch, revision: number): Promise<ProjectTask>;
  /** All-or-nothing per task: tasks the user cannot change come back in failedIds. */
  bulkUpdate(projectId: string, taskIds: readonly string[], patch: ProjectTaskPatch): Promise<BulkUpdateResult>;
  remove(taskIds: readonly string[]): Promise<void>;
  /**
   * Board drop = workflow transition with If-Match. Rejects "conflict" (stale
   * revision), "forbidden" (not your card / role), or "invalid" with message
   * "transition" (not allowed by the workflow) or "wip-limit" (over the
   * status limit without `exceedWip`, or without the capability).
   */
  transition(
    taskId: string,
    toStatusId: string,
    revision: number,
    options?: { exceedWip?: boolean },
  ): Promise<ProjectTask>;
  /** Manager+: per-project manual order of these tasks (board column order). */
  reorder(projectId: string, orderedIds: readonly string[]): Promise<void>;
  /** Tasks per status id among the tasks the user can see (Flow counts). */
  countByStatus(projectId: string, options?: ProjectAccessOptions): Promise<Readonly<Record<string, number>>>;
}

// ── Task detail (PJ-15) ──────────────────────────────────────────────────

export interface TaskDetailRepository {
  get(taskId: string, options?: ProjectAccessOptions): Promise<ProjectTaskDetail>;
  toggleSubtask(taskId: string, subtaskId: string): Promise<ProjectTaskDetail>;
  /** My own projection setting (never visible to the project). */
  setShowInCalendar(taskId: string, on: boolean): Promise<ProjectTaskDetail>;
}

export interface CommentRepository {
  add(taskId: string, body: string): Promise<TaskComment>;
}

export interface DependencyRepository {
  /** Rejects with code "invalid" + message "cycle" when it would create a loop. */
  add(taskId: string, input: { predecessorId: string; type: DependencyType; lagDays: number }): Promise<TaskDependency>;
  remove(taskId: string, dependencyId: string): Promise<void>;
}

// ── Sheets (PJ-90) ───────────────────────────────────────────────────────

export interface NewProjectInput {
  name: string;
  /** Project key (task prefix). Rejected with "invalid" + message "key-format" / "key-taken". */
  key: string;
  description?: string;
  startDate: string;
  endDate: string;
  template: ProjectTemplate;
}

export interface ProjectCreateRepository {
  /** Independent project owned by the current user (no Team/Company association in P2). */
  create(input: NewProjectInput): Promise<ProjectSummary>;
  /** Uniqueness check for a project key (mock now; the backend stays authoritative). */
  isKeyAvailable(key: string): Promise<boolean>;
  /** Undo of create (Owner, right after creating). */
  discard(projectId: string): Promise<void>;
}

export interface MemberInviteRepository {
  listPending(projectId: string): Promise<readonly PendingInvite[]>;
  /**
   * Sends invitations. The answer never says whether an account exists for
   * an email (verified-only: unknown emails get a sign-up invitation).
   */
  send(projectId: string, emails: readonly string[], role: InviteRole): Promise<readonly PendingInvite[]>;
  resend(projectId: string, inviteId: string): Promise<PendingInvite>;
  cancel(projectId: string, inviteId: string): Promise<void>;
  /** Undo of cancel. */
  restore(projectId: string, invite: PendingInvite): Promise<void>;
}

export interface ReassignInput {
  personId: string;
  note?: string;
}

export interface ReassignRepository {
  /** Manager+: replaces the pending / declined assignee; the new person gets a pending assignment. */
  reassign(taskId: string, input: ReassignInput): Promise<ProjectTask>;
}
