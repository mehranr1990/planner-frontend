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
  editTasks: boolean;
  /** Assign / change assignee on tasks. */
  assignTasks: boolean;
  /** Remind / reassign a pending assignee (Manager+). */
  manageAssignments: boolean;
  acceptAssignments: boolean;
  comment: boolean;
  seeTeamLoad: boolean;
  createMilestone: boolean;
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
