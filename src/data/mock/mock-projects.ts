import {
  invitationFixtures,
  invitedProjectFixtures,
  projectFixtures,
  recentProjectIds,
  revokedProjectIds,
} from "@/fixtures/projects";
import type {
  ProjectAccess,
  ProjectCapabilities,
  ProjectDirectory,
  ProjectFilter,
  ProjectInvitation,
  ProjectLifecycle,
  ProjectModule,
  ProjectRole,
  ProjectSummary,
  ProjectTask,
} from "../project-domain";
import type {
  CommentRepository,
  DependencyRepository,
  InvitationRepository,
  TaskDetailRepository,
  ProjectRepositories,
  ProjectRepository,
  ProjectTaskRepository,
} from "../project-repositories";
import { createMockProjectTasks } from "./mock-project-tasks";
import { createMockTaskDetail } from "./mock-project-task-detail";
import { RepositoryError } from "../repositories";
import { computeKpis, createMockProjectWork, createProjectWorkStore, type ProjectWorkStore } from "./mock-project-work";

/*
 * Projects mock adapter (SH-01/SH-02, PJ-00): the directory, per-project
 * access with a capabilities object, invitations. The capability matrix is
 * the SPEC Permissions tables (DECISIONS: exact matrix is OPEN; adjust when
 * the backend publishes capabilities). Only this adapter derives rights from
 * a role; the UI reads `ProjectCapabilities`.
 */

const ALL_MODULES: readonly ProjectModule[] = [
  "timeline",
  "gantt",
  "calendar",
  "milestones",
  "risks",
  "workload",
  "members",
  "files",
  "analytics",
  "settings",
];

const RANK: Record<ProjectRole, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  member: 2,
  viewer: 1,
  guest: 0,
};

/** The mock's capability matrix (SPEC Permissions tabs + SH01 rail rules). */
export function mockCapabilities(role: ProjectRole, lifecycle: ProjectLifecycle): ProjectCapabilities {
  const rank = RANK[role];
  const editable = lifecycle !== "archived";
  const guest = role === "guest";
  const modules = Object.fromEntries(
    ALL_MODULES.map((module) => {
      if (guest) return [module, false];
      if (module === "settings") return [module, rank >= RANK.admin];
      // Viewer: no Workload unless granted (not granted in the mock).
      if (module === "workload") return [module, rank >= RANK.member];
      return [module, true];
    }),
  ) as Record<ProjectModule, boolean>;
  return {
    modules,
    editStatus: editable && rank >= RANK.manager,
    invite: editable && rank >= RANK.admin,
    createTask: editable && rank >= RANK.member,
    editTasks: editable && (rank >= RANK.member || guest),
    editAnyTask: editable && rank >= RANK.manager,
    changeStatus: editable && (rank >= RANK.member || guest),
    deleteTasks: editable && rank >= RANK.admin,
    bulkEdit: editable && rank >= RANK.manager,
    importCsv: editable && rank >= RANK.manager,
    assignTasks: editable && rank >= RANK.manager,
    manageAssignments: editable && rank >= RANK.manager,
    acceptAssignments: editable && (rank >= RANK.member || guest),
    comment: editable && (rank >= RANK.member || guest),
    seeTeamLoad: rank >= RANK.member,
    createMilestone: editable && rank >= RANK.manager,
    createRisk: editable && rank >= RANK.member,
    uploadFile: editable && rank >= RANK.member,
    restore: lifecycle === "archived" && rank >= RANK.admin,
    export: !guest,
  };
}

export interface MockProjectsOptions {
  respond<T>(value: T): Promise<T>;
  /** Mock "today" ("YYYY-MM-DD") and now (instant) for counts and writes. */
  today?: string;
  now?: string;
  /**
   * The accepted-assignment bridge into Personal (README #8): called with the
   * projection when one of my tasks is accepted (or its calendar setting
   * changes) and with null when it leaves (Undo of Accept).
   */
  onProjection?: (taskId: string, projection: PersonalProjection | null) => void;
}

/** What Personal shows for an accepted project task: a projection, never an editable copy. */
export interface PersonalProjection {
  title: string;
  projectName: string;
  due: string | null;
  priority: ProjectTask["priority"];
  estimateHours: number | null;
  showInCalendar: boolean;
}

export interface MockProjectsStore extends ReturnType<typeof createMockProjectWork> {
  projectTasks: ProjectTaskRepository;
  taskDetails: TaskDetailRepository;
  comments: CommentRepository;
  dependencies: DependencyRepository;
  projects: ProjectRepository;
  invitations: InvitationRepository;
  /** Mock-only: the shared task store (PJ-02 / PJ-15 mocks). */
  work: ProjectWorkStore;
  /** Mock-only: the live store, for other project mocks (tasks, assignments). */
  findProject(id: string): ProjectSummary | undefined;
}

export function createMockProjects({
  respond,
  today = "2026-10-13",
  now = "2026-10-13T14:35:00+03:30",
  onProjection,
}: MockProjectsOptions): MockProjectsStore {
  const projects: ProjectSummary[] = structuredClone([...projectFixtures]);
  const invitations: ProjectInvitation[] = structuredClone([...invitationFixtures]);
  const recent: string[] = [...recentProjectIds];

  const find = (id: string) => projects.find((project) => project.id === id);
  const work = createProjectWorkStore();
  const workRepos = createMockProjectWork({
    store: work,
    now,
    respond,
    canSeeTeamLoad: (id) => {
      const project = find(id);
      return project ? mockCapabilities(project.role, project.lifecycle).seeTeamLoad : false;
    },
    // "n for you" = my open accepted + pending assignments (server-side count): a decline drops one.
    onAcceptance: (task, accepted) => project(task, accepted),
    onAssignmentsChanged: (id, delta) => {
      const project = find(id);
      if (project) project.forYou = Math.max(0, project.forYou + delta);
    },
  });

  function project(task: ProjectTask, present: boolean) {
    const name = find(task.projectId)?.name ?? "";
    onProjection?.(
      task.id,
      present
        ? {
            title: task.title,
            projectName: name,
            due: task.due,
            priority: task.priority,
            estimateHours: task.estimateHours,
            showInCalendar: taskDetail.showInCalendar(task.id),
          }
        : null,
    );
  }

  const tasksMock = createMockProjectTasks({
    store: work,
    today,
    now,
    respond,
    roleOf: (id) => {
      const project = find(id);
      return project ? { role: project.role, archived: project.lifecycle === "archived" } : undefined;
    },
    membersOf: (id) => find(id)?.members ?? [],
  });
  const projectTasks = tasksMock.repo;
  const taskDetail = createMockTaskDetail({
    store: work,
    now,
    respond,
    withCan: tasksMock.withCan,
    onCalendarChanged: (task) => {
      const mine = task.assignees.find((assignee) => assignee.person.id === "me");
      if (mine?.state === "accepted") project(task, true);
    },
  });

  function counts(): Record<ProjectFilter, number> {
    const live = projects.filter((project) => project.lifecycle !== "archived");
    return {
      all: live.length,
      owned: live.filter((project) => project.role === "owner").length,
      member: live.filter((project) => project.role !== "owner").length,
      invitations: invitations.length,
      archived: projects.length - live.length,
    };
  }

  const projectRepo: ProjectRepository = {
    listAccessible() {
      const directory: ProjectDirectory = {
        projects: projects.map((project) => ({
          ...project,
          restorable: mockCapabilities(project.role, project.lifecycle).restore,
        })),
        counts: counts(),
        recentIds: recent.filter((id) => find(id)?.lifecycle !== "archived"),
      };
      return respond(structuredClone(directory));
    },
    access(id, options = {}) {
      const project = find(id);
      let answer: ProjectAccess;
      if (project) {
        const role = options.previewRole ?? project.role;
        const lifecycle = options.previewArchived ? "archived" : project.lifecycle;
        const shown: ProjectSummary = options.previewArchived
          ? {
              ...project,
              role,
              lifecycle,
              lifecycleAt: "2026-09-03T10:00:00+03:30",
              lifecycleBy: project.members[0],
            }
          : { ...project, role };
        if (role === "guest") shown.sharedTaskCount = 3;
        answer = {
          status: "ok",
          project: shown,
          capabilities: mockCapabilities(role, lifecycle),
        };
        recent.splice(0, recent.length, id, ...recent.filter((other) => other !== id));
      } else if (revokedProjectIds.includes(id)) {
        answer = { status: "revoked" };
      } else {
        const invitation = invitations.find((candidate) => candidate.projectId === id);
        answer = invitation ? { status: "invite-pending", invitation } : { status: "not-available" };
      }
      return respond(structuredClone(answer));
    },
    async setStatus(id, { health, note }) {
      const project = find(id);
      if (!project) throw new RepositoryError("not-found", `No project ${id}`);
      if (!mockCapabilities(project.role, project.lifecycle).editStatus)
        throw new RepositoryError("forbidden", "Manager+ only");
      const text = note.trim();
      if (text.length > 280) throw new RepositoryError("invalid", "Status note is at most 280 characters");
      project.health = health;
      project.statusNote = text
        ? {
            text,
            author: { id: "me", name: "Mehran R.", initials: "MR" },
            at: new Date().toISOString(),
          }
        : null;
      return respond(structuredClone(project));
    },
    async summary(id) {
      if (!find(id)) throw new RepositoryError("not-found", `No project ${id}`);
      return respond(computeKpis(work, id, today));
    },
    async restore(id) {
      const project = find(id);
      if (!project) throw new RepositoryError("not-found", `No project ${id}`);
      if (!mockCapabilities(project.role, project.lifecycle).restore)
        throw new RepositoryError("forbidden", "Owner/Admin only");
      project.lifecycle = "active";
      delete project.lifecycleAt;
      delete project.lifecycleBy;
      return respond(structuredClone(project));
    },
  };

  const invitationRepo: InvitationRepository = {
    listMine() {
      return respond(structuredClone(invitations));
    },
    async accept(id) {
      const index = invitations.findIndex((invitation) => invitation.id === id);
      if (index < 0) throw new RepositoryError("not-found", `No invitation ${id}`);
      const [invitation] = invitations.splice(index, 1);
      const added = invitedProjectFixtures[invitation!.projectId];
      if (added && !find(added.id)) {
        projects.unshift({ ...structuredClone(added), role: invitation!.role });
        recent.unshift(added.id);
      }
      return respond({ projectId: invitation!.projectId });
    },
    async decline(id) {
      const index = invitations.findIndex((invitation) => invitation.id === id);
      if (index < 0) throw new RepositoryError("not-found", `No invitation ${id}`);
      invitations.splice(index, 1);
      return respond(undefined);
    },
  };

  return {
    ...workRepos,
    projectTasks,
    taskDetails: taskDetail.taskDetails,
    comments: taskDetail.comments,
    dependencies: taskDetail.dependencies,
    projects: projectRepo,
    invitations: invitationRepo,
    work,
    findProject: find,
  };
}

/** The aggregate slice (drops the mock-only helpers). */
export function projectRepositories(store: MockProjectsStore): ProjectRepositories {
  return {
    projects: store.projects,
    invitations: store.invitations,
    milestones: store.milestones,
    workflows: store.workflows,
    activity: store.activity,
    risks: store.risks,
    workload: store.workload,
    assignments: store.assignments,
    projectTasks: store.projectTasks,
    taskDetails: store.taskDetails,
    comments: store.comments,
    dependencies: store.dependencies,
  };
}
