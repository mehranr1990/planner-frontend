import type { ApiClient } from "@/api/client";
import { ApiHttpError } from "@/api/errors";
import type { ProjectAccess, ProjectCapabilities, ProjectDirectory, ProjectLifecycle, ProjectModule, ProjectRole, ProjectSummary, ProjectTint } from "../project-domain";
import type { ProjectRepository, ProjectSettingsRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { invalid, mapErrors, pageAll, retryOnConflict, revisionTag } from "./api-shared";
import { conflictAware } from "./api-project-shared";
import { accessMe, projectRoster, projectsClient, toProjectPerson, type ApiAccessMe, type ProjectsClient, type ProjectsData } from "./api-project-shared";

/*
 * The project directory and the access gate (owner decision 2026-11-12: unknown
 * metrics stay unknown). A summary joins facts only:
 * - `/projects` (title, state, updatedAt) + `/metadata` (key, colour, dates,
 *   status note text) + `/dashboard` progress + the members roster +
 *   milestones / risk register + the caller's own assignments (`/me/work`).
 * - `health` and `expectedPercent` are null (no approved definition); the note
 *   has no author or time; undeclared dates are null.
 * - The caller's role / capabilities come from `access/me` (hints; every
 *   command is still checked). A Project-scope grant without a role is the
 *   screens' "guest". A capability is true only when the backend grants it AND
 *   the live adapter supports the action (owner decision 7: unsupported actions
 *   are disabled, not offered).
 * - Lifecycle: ACTIVE → active, ARCHIVED → archived, OWNER_EXIT_FROZEN → paused
 *   (read-only); CLOSING_GRACE / CLOSED are not available.
 */

type ApiProject = ProjectsData<"/api/v1/projects", "get">["items"][number];
type ApiMilestone = ProjectsData<"/api/v1/projects/{id}/components/{kind}", "get">["items"][number];
type ApiRegisterItem = ProjectsData<"/api/v1/projects/{projectId}/register-items", "get">["items"][number];
type ApiMyAssignment = ProjectsData<"/api/v1/me/work/assignments", "get">["items"][number];

const PAGE = 100;
const PROJECT_READS = 4;
const AVATARS = 5;
const TINTS: readonly ProjectTint[] = ["blue", "indigo", "amber", "purple"];

const dayWindow = () => {
  const now = Date.now();
  return { fromAt: new Date(now - 86_400_000).toISOString(), toAt: new Date(now).toISOString() };
};

const LIFECYCLE: Partial<Record<ApiProject["state"], ProjectLifecycle>> = { ACTIVE: "active", ARCHIVED: "archived", OWNER_EXIT_FROZEN: "paused" };

const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toLocaleUpperCase();

const roleOf = (me: ApiAccessMe): ProjectRole => (me.role ? (me.role.toLowerCase() as ProjectRole) : "guest");

/** Backend capability hints ∧ what live mode can do. */
export function capabilitiesOf(me: ApiAccessMe): ProjectCapabilities {
  const has = (capability: string) => me.capabilities.includes(capability);
  const full = me.scope === "FULL";
  const manage = has("work.manage");
  const settings = has("settings.manage") || has("policy.publish") || has("custody.archive") || has("custody.handover");
  const modules: Record<ProjectModule, boolean> = {
    timeline: full,
    gantt: full,
    calendar: full,
    milestones: full,
    risks: full,
    workload: full,
    members: full,
    files: full && has("file.read"),
    analytics: full,
    settings: full && settings,
  };
  return {
    modules,
    // Health has no approved definition: the status chip cannot be saved.
    editStatus: false,
    // Invitations need the proof-delivery flow (R4).
    invite: false,
    createTask: has("task.create"),
    editTasks: has("task.update"),
    editAnyTask: has("task.update") && manage,
    changeStatus: has("workflow.transition"),
    // No task deletion operation exists.
    deleteTasks: false,
    bulkEdit: manage,
    importCsv: manage,
    assignTasks: has("assignment.assign"),
    manageAssignments: has("assignment.assign") && manage,
    acceptAssignments: has("assignment.accept"),
    comment: has("comment.create"),
    seeTeamLoad: full,
    createMilestone: manage,
    // No WIP limits and no manual order in the API.
    exceedWip: false,
    reorderTasks: false,
    // Register writes need work.manage; creation has no approved form, close needs a reason the API has no field for.
    createRisk: false,
    editOwnRisk: manage,
    editAnyRisk: manage,
    closeRisk: false,
    // Root uploads need file.read + work.manage (backend writeCap PROJECT). Folders / versions are not served.
    uploadFile: full && has("file.read") && manage,
    manageFiles: false,
    manageMembers: has("membership.admin"),
    manageJuniorMembers: has("membership.manager"),
    editCapacity: false,
    manageGrants: false,
    seeAllWorkload: full && manage,
    exportAnalytics: has("export.visible"),
    editGeneral: has("settings.manage"),
    editWorkflow: has("workflow.publish"),
    // Access = the role-default policy (Settings › Access shows it in live mode).
    editAccess: has("policy.publish"),
    archiveProject: has("custody.archive"),
    ownProject: me.role === "OWNER",
    restore: has("custody.archive"),
    export: has("export.visible"),
  };
}

async function myOpenAssignments(api: ProjectsClient): Promise<ApiMyAssignment[]> {
  const all = await pageAll<ApiMyAssignment>(async (after) => (await api.request("get", "/api/v1/me/work/assignments", { query: { limit: PAGE, after } })).data);
  return all.filter(({ assignment }) => !assignment.endedAt && assignment.decision !== "DECLINED");
}

/** One project's summary from facts only; null when it is not available to the caller. */
async function summaryOf(api: ProjectsClient, project: ApiProject, mine: readonly ApiMyAssignment[]): Promise<{ summary: ProjectSummary; me: ApiAccessMe } | null> {
  const lifecycle = LIFECYCLE[project.state];
  if (!lifecycle) return null;
  const id = project.id;
  const [me, metadata, dashboard, roster, milestones, risks] = await Promise.all([
    accessMe(api, id),
    api.request("get", "/api/v1/projects/{id}/metadata", { path: { id } }).then((response) => response.data),
    // Only the window-independent progress is read (done over non-canceled visible tasks); the window is the last day.
    api.request("get", "/api/v1/projects/{id}/dashboard", { path: { id }, query: dayWindow() }).then((response) => response.data),
    projectRoster(api, id),
    pageAll<ApiMilestone>(async (after) => (await api.request("get", "/api/v1/projects/{id}/components/{kind}", { path: { id, kind: "milestones" }, query: { limit: PAGE, after } })).data),
    pageAll<ApiRegisterItem>(async (after) => (await api.request("get", "/api/v1/projects/{projectId}/register-items", { path: { projectId: id }, query: { kind: "RISK", limit: PAGE, after } })).data),
  ]);
  const members = roster.filter((member) => member.state === "ACTIVE" && (member.role ?? member.memberRole));
  const next = milestones
    .flatMap((milestone) => (!milestone.completed && milestone.targetDate ? [{ id: milestone.id, title: milestone.title, due: milestone.targetDate.slice(0, 10) }] : []))
    .sort((a, b) => a.due.localeCompare(b.due))[0];
  const { progress } = dashboard;
  const tint = TINTS.find((candidate) => candidate === metadata.color?.toLowerCase()) ?? "blue";
  const summary: ProjectSummary = {
    id,
    name: project.title,
    key: metadata.key ?? "",
    initials: initialsOf(project.title),
    tint,
    description: project.description ?? "",
    role: roleOf(me),
    health: null,
    lifecycle,
    statusNote: metadata.statusNote ? { text: metadata.statusNote, author: null, at: null } : null,
    progress: { done: progress.completedTasks, total: progress.eligibleTasks, percent: Math.round(progress.percent ?? 0) },
    expectedPercent: null,
    nextMilestone: next ?? null,
    startDate: metadata.startDate ?? null,
    endDate: metadata.endDate ?? null,
    members: members.slice(0, AVATARS).map(toProjectPerson),
    memberCount: members.length,
    forYou: mine.filter(({ assignment }) => assignment.projectId === id).length,
    openHighRisks: risks.filter(
      (risk) => !risk.retiredAt && (risk.status === "OPEN" || risk.status === "MITIGATING") && (risk.severity === "HIGH" || risk.severity === "CRITICAL"),
    ).length,
    updatedAt: project.updatedAt,
    ...(lifecycle === "archived" ? { restorable: me.capabilities.includes("custody.archive") } : {}),
  };
  return { summary, me };
}

const isHidden = (error: unknown) =>
  (error instanceof ApiHttpError && (error.status === 403 || error.status === 404)) ||
  (error instanceof RepositoryError && (error.code === "forbidden" || error.code === "not-found"));

export function createApiProjectDirectory(client: ApiClient): Pick<ProjectRepository, "listAccessible" | "access"> {
  const api = projectsClient(client);
  return {
    listAccessible: () =>
      mapErrors(async (): Promise<ProjectDirectory> => {
        const [projects, mine, invitations] = await Promise.all([
          pageAll<ApiProject>(async (after) => (await api.request("get", "/api/v1/projects", { query: { limit: PAGE, after } })).data),
          myOpenAssignments(api),
          pageAll<{ id: string }>(async (after) => (await api.request("get", "/api/v1/project-invitations", { query: { limit: PAGE, after } })).data),
        ]);
        const summaries: ProjectSummary[] = [];
        for (let at = 0; at < projects.length; at += PROJECT_READS) {
          const batch = await Promise.all(
            projects.slice(at, at + PROJECT_READS).map((project) =>
              summaryOf(api, project, mine).catch((error: unknown) => {
                // Access can end between the list and the reads: such a project is simply not shown.
                if (isHidden(error)) return null;
                throw error;
              }),
            ),
          );
          for (const entry of batch) if (entry) summaries.push(entry.summary);
        }
        const live = summaries.filter((project) => project.lifecycle !== "archived");
        return {
          projects: summaries,
          counts: {
            all: live.length,
            owned: live.filter((project) => project.role === "owner").length,
            member: live.filter((project) => project.role !== "owner").length,
            // The caller's own pending invitations (public-safe list, OD-4).
            invitations: invitations.length,
            archived: summaries.length - live.length,
          },
          // The API keeps no "recently opened" list.
          recentIds: [],
        };
      }),

    access: (id) =>
      mapErrors(async (): Promise<ProjectAccess> => {
        try {
          const [{ data: project }, mine] = await Promise.all([api.request("get", "/api/v1/projects/{id}", { path: { id } }), myOpenAssignments(api)]);
          const entry = await summaryOf(api, project, mine);
          if (!entry) return { status: "not-available" };
          return { status: "ok", project: entry.summary, capabilities: capabilitiesOf(entry.me) };
        } catch (error) {
          // Forbidden and not found are the same answer (no discovery).
          if (isHidden(error)) return { status: "not-available" };
          throw error;
        }
      }),
  };
}

/**
 * Writes that answer with a summary: general settings (title / description on
 * the project, key / colour / dates on its metadata), archive and restore.
 * Each re-reads the factual summary afterwards.
 */
export function createApiProjectLifecycle(client: ApiClient): Pick<ProjectRepository, "restore"> & Pick<ProjectSettingsRepository, "update" | "archive"> {
  const api = projectsClient(client);
  const directory = createApiProjectDirectory(client);
  const summary = async (id: string): Promise<ProjectSummary> => {
    const access = await directory.access(id);
    if (access.status !== "ok") throw new RepositoryError("not-found", "Not found");
    return access.project;
  };
  const project = async (id: string) => {
    const { data, etag } = await api.request("get", "/api/v1/projects/{id}", { path: { id } });
    return { data, tag: etag ?? revisionTag(data.revision) };
  };
  const metadata = async (id: string) => {
    const { data, etag } = await api.request("get", "/api/v1/projects/{id}/metadata", { path: { id } });
    return { data, tag: etag ?? revisionTag(data.revision) };
  };
  const custody = (id: string, action: "archive" | "restore") =>
    mapErrors(async () => {
      let current = await project(id);
      const send = () =>
        action === "archive"
          ? api.request("post", "/api/v1/projects/{id}/archive", { path: { id }, header: { "If-Match": current.tag }, body: {} })
          : api.request("post", "/api/v1/projects/{id}/restore", { path: { id }, header: { "If-Match": current.tag }, body: {} });
      await conflictAware(() => retryOnConflict(send, async () => (current = await project(id))));
      return summary(id);
    });

  return {
    update: (projectId, patch) =>
      mapErrors(async () => {
        if (patch.name !== undefined && !patch.name.trim()) invalid("name");
        if (patch.name !== undefined || patch.description !== undefined) {
          let current = await project(projectId);
          const body = { ...(patch.name !== undefined ? { title: patch.name.trim() } : {}), ...(patch.description !== undefined ? { description: patch.description || null } : {}) };
          const send = () => api.request("patch", "/api/v1/projects/{id}", { path: { id: projectId }, header: { "If-Match": current.tag }, body });
          await conflictAware(() => retryOnConflict(send, async () => (current = await project(projectId))));
        }
        if (patch.key !== undefined || patch.tint !== undefined || patch.startDate !== undefined || patch.endDate !== undefined) {
          let current = await metadata(projectId);
          const start = patch.startDate !== undefined ? patch.startDate : current.data.startDate;
          const end = patch.endDate !== undefined ? patch.endDate : current.data.endDate;
          if (start && end && end < start) invalid("dates");
          const body = {
            ...(patch.key !== undefined ? { key: patch.key || null } : {}),
            ...(patch.tint !== undefined ? { color: patch.tint } : {}),
            ...(patch.startDate !== undefined ? { startDate: patch.startDate } : {}),
            ...(patch.endDate !== undefined ? { endDate: patch.endDate } : {}),
          };
          const send = () => api.request("patch", "/api/v1/projects/{id}/metadata", { path: { id: projectId }, header: { "If-Match": current.tag }, body });
          await conflictAware(() => retryOnConflict(send, async () => (current = await metadata(projectId))));
        }
        return summary(projectId);
      }),
    archive: (projectId) => custody(projectId, "archive"),
    restore: (id) => custody(id, "restore"),
  };
}
