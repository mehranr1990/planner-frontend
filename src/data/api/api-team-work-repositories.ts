import { newIdempotencyKey, type ResponseDataIn } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-teams";
import { addDaysToDay, dayOfInstant } from "@/lib/dates/clock-time";
import { IRAN_WEEK, type Weekday } from "@/lib/dates/week";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import { getJalaliParts } from "@/lib/dates/jalali";
import { newDate as jalaliDate } from "date-fns-jalali";
import type { FileLibrary, ProjectFile, ProjectFileVersion, ProjectPerson } from "../project-domain";
import type { FileUploadInput } from "../project-repositories";
import { RepositoryError } from "../repositories";
import type {
  BacklogItem,
  CheckinReply,
  CheckinSchedule,
  CheckinWeek,
  ClearAfter,
  FeedbackNote,
  FeedbackRequest,
  PresenceStatus,
  TeamActivity,
  TeamActivityKind,
  TeamAnalyticsSummary,
  TeamAnalyticsWeek,
  TeamAssignmentState,
  TeamGoal,
  TeamGoalPeriod,
  TeamPerson,
  TeamPresence,
  TeamTask,
  TeamTaskActivity,
  TeamTaskDetail,
  TeamTaskPriority,
  TeamTaskStatus,
  TeamThanks,
  TeamWeekPlan,
  TeamWeekReview,
  ThanksLink,
} from "../team-domain";
import type {
  PresenceRepository,
  TeamActivityRepository,
  TeamBacklogRepository,
  TeamCapacityRepository,
  TeamCheckinRepository,
  TeamFeedbackRepository,
  TeamFileRepository,
  TeamGoalRepository,
  TeamInvitationRepository,
  TeamPlanRepository,
  TeamRecognitionRepository,
  TeamReportRepository,
  TeamTaskRepository,
} from "../team-repositories";
import { conflictAware } from "./api-project-shared";
import { invalid, mapErrors, pageAll, retryOnConflict, revisionTag } from "./api-shared";
import { accessMe, roster, teamPerson, type TeamsClient } from "./api-team-repositories";
import { localInstant } from "./api-tasks-repository";

/*
 * Teams modules connected over the 1,045-op contract (TM-11 files first).
 * People are membership (access) ids named by the roster `displayName`; an
 * access id that left the roster reads as a blank name (never invented).
 */

type Data<P extends keyof paths, M extends "get" | "post" | "patch" | "put" | "delete"> = ResponseDataIn<paths, P, M>;
type ApiFolder = Data<"/api/v1/teams/{id}/file-folders", "get">["items"][number];
type ApiFile = Data<"/api/v1/teams/{id}/files", "get">["items"][number];
type ApiVersion = Data<"/api/v1/teams/{id}/files/{fileId}/versions", "get">["items"][number];
type Mime = ApiVersion["mimeType"];

const PAGE = 100;

/** People lookup by access id from the team roster (one read per call site). */
export async function teamPeople(api: TeamsClient, teamId: string): Promise<(accessId: string | null | undefined) => ProjectPerson> {
  const byId = new Map((await roster(api, teamId)).map((member) => [member.id, teamPerson(member)]));
  return (accessId) => (accessId && byId.get(accessId)) || { id: accessId ?? "", name: "", initials: "" };
}

// ── TM-11 Team files ────────────────────────────────────────────────────

/** The contract's limits: an allow-list of four media types and `expectedSize` ≤ 100 MiB. */
const MAX_BYTES = 104_857_600;
const MIME_BY_EXTENSION: Readonly<Record<string, Mime>> = { txt: "text/plain", pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };
const ALLOWED = new Set<string>(Object.values(MIME_BY_EXTENSION));

function mimeOf(name: string, blob: Blob): Mime | null {
  if (ALLOWED.has(blob.type)) return blob.type as Mime;
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? null;
}

const mediaOf = (mime: Mime | undefined): ProjectFile["media"] => (mime?.startsWith("image/") ? "image" : mime === "application/pdf" ? "pdf" : mime === "text/plain" ? "doc" : "other");

/**
 * Team files (TM-11) over /teams/{id}/file-folders and /files: private
 * versioned files, upload = create (or new version) → stream the bytes to
 * `complete` (If-Match = version revision), download streams the current
 * READY version. Restoring an older version uploads its bytes as a new version.
 * Not served: task links (none for team files), a block reason for a REJECTED
 * version. Bytes of an upload that failed are kept for this page only (Retry).
 */
export function createApiTeamFiles(api: TeamsClient): TeamFileRepository {
  const pending = new Map<string, { versionId: string; blob: Blob }>();
  const inFlight = new Set<string>();

  const getFile = async (teamId: string, fileId: string) => (await api.request("get", "/api/v1/teams/{id}/files/{fileId}", { path: { id: teamId, fileId } })).data;
  const versionsOf = (teamId: string, fileId: string) =>
    pageAll<ApiVersion>(async (after) => (await api.request("get", "/api/v1/teams/{id}/files/{fileId}/versions", { path: { id: teamId, fileId }, query: { limit: PAGE, after } })).data);

  function toFile(file: ApiFile, versions: readonly ApiVersion[], person: (id: string | null | undefined) => ProjectPerson): ProjectFile {
    const shown = file.current ?? file.latest;
    const latest = file.latest;
    const uploading = latest !== null && latest.status === "INITIATED";
    let state: ProjectFile["state"] = "ready";
    if (!file.current && uploading) state = inFlight.has(file.id) ? "uploading" : "failed";
    else if (!file.current && latest?.status === "REJECTED") state = "blocked";
    else if (file.current?.status === "REJECTED") state = "blocked";
    const history: ProjectFileVersion[] = versions
      .filter((version) => version.status === "READY")
      .map((version) => ({ version: version.number, by: person(version.uploader.accessId), at: version.createdAt }))
      .sort((a, b) => b.version - a.version);
    const mapped: ProjectFile = {
      id: file.id,
      name: file.title,
      folderId: file.folderId,
      sizeBytes: shown?.size ?? shown?.expectedSize ?? 0,
      media: mediaOf(shown?.mimeType),
      state,
      version: shown?.number ?? 0,
      versions: history,
      uploadedBy: person(file.owner.accessId),
      updatedAt: file.updatedAt,
      taskIds: [],
    };
    if (state === "failed") mapped.failReason = "connection";
    return mapped;
  }

  async function complete(teamId: string, fileId: string, version: ApiVersion, blob: Blob): Promise<void> {
    pending.set(fileId, { versionId: version.id, blob });
    inFlight.add(fileId);
    try {
      await api.request("post", "/api/v1/teams/{id}/files/{fileId}/versions/{versionId}/complete", {
        path: { id: teamId, fileId, versionId: version.id },
        header: { "If-Match": revisionTag(version.revision) },
        body: blob,
      });
      pending.delete(fileId);
    } finally {
      inFlight.delete(fileId);
    }
  }

  async function single(teamId: string, fileId: string): Promise<ProjectFile> {
    const [file, person] = await Promise.all([getFile(teamId, fileId), teamPeople(api, teamId)]);
    return toFile(file, await versionsOf(teamId, fileId), person);
  }

  async function readyBytes(teamId: string, fileId: string, number?: number): Promise<{ version: ApiVersion; blob: Blob }> {
    const versions = await versionsOf(teamId, fileId);
    const file = await getFile(teamId, fileId);
    const version = number === undefined ? file.current : versions.find((entry) => entry.number === number);
    if (!version || version.status !== "READY") invalid("The file is not ready to download");
    const { data } = await api.request("get", "/api/v1/teams/{id}/files/{fileId}/versions/{versionId}/download", { path: { id: teamId, fileId, versionId: version.id } });
    return { version, blob: data as Blob };
  }

  return {
    list: (teamId) =>
      mapErrors(async (): Promise<FileLibrary> => {
        const [folders, person] = await Promise.all([
          pageAll<ApiFolder>(async (after) => (await api.request("get", "/api/v1/teams/{id}/file-folders", { path: { id: teamId }, query: { limit: PAGE, after } })).data),
          teamPeople(api, teamId),
        ]);
        const files: ProjectFile[] = [];
        for (const folderId of ["root", ...folders.map((folder) => folder.id)]) {
          const items = await pageAll<ApiFile>(async (after) => (await api.request("get", "/api/v1/teams/{id}/files", { path: { id: teamId }, query: { limit: PAGE, after, folderId } })).data);
          for (const file of items.filter((item) => !item.removed)) files.push(toFile(file, file.versionCount > 1 ? await versionsOf(teamId, file.id) : [file.current, file.latest].filter((v): v is ApiVersion => v !== null), person));
        }
        return {
          folders: folders.map((folder) => ({ id: folder.id, name: folder.title, count: files.filter((file) => file.folderId === folder.id).length })),
          files,
          total: files.length,
        };
      }),

    config: async () => ({ maxBytes: MAX_BYTES, blockedExtensions: [] }),

    upload: (teamId, input: FileUploadInput) =>
      mapErrors(async () => {
        const blob = input.file;
        if (!blob) invalid("The file's bytes are needed to upload");
        const mimeType = mimeOf(input.name, blob);
        if (!mimeType) invalid("This file type is not allowed (text, PDF, PNG or JPEG only)");
        if (blob.size < 1 || blob.size > MAX_BYTES) invalid("This file is empty or larger than the server allows");
        const upload = { filename: input.name.slice(0, 180), mimeType, expectedSize: blob.size };
        let fileId: string;
        let version: ApiVersion;
        if (input.asNewVersionOf) {
          fileId = input.asNewVersionOf;
          ({ data: version } = await api.request("post", "/api/v1/teams/{id}/files/{fileId}/versions", {
            path: { id: teamId, fileId },
            header: { "Idempotency-Key": newIdempotencyKey() },
            body: { id: newIdempotencyKey(), upload },
          }));
        } else {
          const { data: file } = await api.request("post", "/api/v1/teams/{id}/files", {
            path: { id: teamId },
            header: { "Idempotency-Key": newIdempotencyKey() },
            body: { id: newIdempotencyKey(), versionId: newIdempotencyKey(), folderId: input.folderId, title: input.name.slice(0, 300), upload },
          });
          fileId = file.id;
          version = file.latest!;
        }
        // A failed byte transfer leaves the version INITIATED: shown as failed, Retry resends.
        await complete(teamId, fileId, version, blob).catch(() => undefined);
        return single(teamId, fileId);
      }),

    cancel: (teamId, fileId) =>
      mapErrors(async () => {
        pending.delete(fileId);
        let file = await getFile(teamId, fileId);
        // Only a file whose only version never completed is removed; an unfinished new version simply stays unused.
        if (file.current) return;
        await retryOnConflict(
          () => api.request("post", "/api/v1/teams/{id}/files/{fileId}/remove", { path: { id: teamId, fileId }, header: { "If-Match": revisionTag(file.revision) }, body: {} }),
          async () => (file = await getFile(teamId, fileId)),
        );
      }),

    retry: (teamId, fileId) =>
      mapErrors(async () => {
        const entry = pending.get(fileId);
        if (!entry) invalid("Choose the file again to retry");
        const version = (await versionsOf(teamId, fileId)).find((item) => item.id === entry.versionId);
        if (!version) throw new RepositoryError("not-found", "Not found");
        if (version.status === "INITIATED") await complete(teamId, fileId, version, entry.blob);
        return single(teamId, fileId);
      }),

    restoreVersion: (teamId, fileId, number) =>
      mapErrors(async () => {
        const { version, blob } = await readyBytes(teamId, fileId, number);
        const { data: next } = await api.request("post", "/api/v1/teams/{id}/files/{fileId}/versions", {
          path: { id: teamId, fileId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { id: newIdempotencyKey(), upload: { filename: version.filename, mimeType: version.mimeType, expectedSize: blob.size } },
        });
        await complete(teamId, fileId, next, blob);
        return single(teamId, fileId);
      }),

    download: (teamId, fileId) => mapErrors(async () => (await readyBytes(teamId, fileId)).blob),
  };
}

// ── TM-02 / TM-15 Team tasks + assignments ───────────────────────────────

type ApiPlanning = Data<"/api/v1/teams/{id}/task-planning", "get">["items"][number];
type ApiAssignment = Data<"/api/v1/teams/{id}/assignments", "get">["items"][number];
type ApiPlan = Data<"/api/v1/teams/{id}/plans", "get">["items"][number];
type ApiMe = Data<"/api/v1/teams/{id}/access/me", "get">;
type ApiMember = Data<"/api/v1/teams/{id}/memberships", "get">["items"][number];
type ApiBoard = Exclude<ApiPlanning["boardState"], "CANCELED">;

const BOARD: Record<ApiBoard, TeamTaskStatus> = { TODO: "todo", IN_PROGRESS: "in-progress", REVIEW: "review", BLOCKED: "blocked", DONE: "done" };
const BOARD_TO_API: Record<TeamTaskStatus, ApiBoard> = { todo: "TODO", "in-progress": "IN_PROGRESS", review: "REVIEW", blocked: "BLOCKED", done: "DONE" };
const PRIORITY: Record<ApiPlanning["task"]["priority"], TeamTaskPriority | null> = { NONE: null, LOW: "low", MEDIUM: "medium", HIGH: "high", URGENT: "urgent" };
const PRIORITY_TO_API: Record<TeamTaskPriority, ApiPlanning["task"]["priority"]> = { low: "LOW", medium: "MEDIUM", high: "HIGH", urgent: "URGENT" };
const ASSIGNMENT: Partial<Record<ApiAssignment["state"], TeamAssignmentState>> = { PENDING: "pending", ACCEPTED: "accepted", DECLINED: "declined" };
const ACTIVITY: Partial<Record<string, TeamTaskActivity["kind"]>> = { ASSIGNED: "assigned", REASSIGNED: "assigned", ACCEPTED: "accepted", DECLINED: "declined" };

export interface TeamWorkSnapshot {
  me: ApiMe;
  members: ApiMember[];
  person: (accessId: string | null | undefined) => TeamPerson;
  rows: ApiPlanning[];
  plans: ApiPlan[];
  assignments: ApiAssignment[];
  edges: Data<"/api/v1/teams/{id}/dependencies", "get">["edges"];
  checklists: Map<string, { done: number; total: number }>;
}

/** Everything the team work surfaces read, in one pass (tasks, plans, open assignments, dependencies, checklist progress). */
export async function teamWork(api: TeamsClient, teamId: string, options: { checklists?: boolean } = {}): Promise<TeamWorkSnapshot> {
  const path = { id: teamId };
  const [me, members, rows, plans, assignments, deps] = await Promise.all([
    accessMe(api, teamId),
    roster(api, teamId),
    pageAll<ApiPlanning>(async (after) => (await api.request("get", "/api/v1/teams/{id}/task-planning", { path, query: { limit: PAGE, after } })).data),
    pageAll<ApiPlan>(async (after) => (await api.request("get", "/api/v1/teams/{id}/plans", { path, query: { limit: PAGE, after } })).data),
    pageAll<ApiAssignment>(async (after) => (await api.request("get", "/api/v1/teams/{id}/assignments", { path, query: { limit: PAGE, after, open: "true" } })).data),
    api.request("get", "/api/v1/teams/{id}/dependencies", { path }).then((response) => response.data),
  ]);
  const live = rows.filter((row) => row.task.deletedAt === null && row.boardState !== "CANCELED");
  const checklists = new Map<string, { done: number; total: number }>();
  if (options.checklists !== false) {
    for (let index = 0; index < live.length; index += 8) {
      await Promise.all(
        live.slice(index, index + 8).map(async (row) => {
          const { data } = await api.request("get", "/api/v1/teams/{id}/tasks/{sourceId}/checklist", { path: { id: teamId, sourceId: row.task.id } });
          checklists.set(row.task.id, { done: data.done, total: data.total });
        }),
      );
    }
  }
  const byId = new Map(members.map((member) => [member.id, teamPerson(member)]));
  const person = (accessId: string | null | undefined): TeamPerson => (accessId && byId.get(accessId)) || { id: accessId ?? "", name: "", initials: "" };
  return { me, members, person, rows: live, plans, assignments, edges: deps.edges, checklists };
}

export function toTeamTask(teamId: string, snap: TeamWorkSnapshot, row: ApiPlanning): TeamTask {
  const weekOf = new Map(snap.plans.filter((plan) => plan.kind === "WEEK").map((plan) => [plan.id, plan.startDate]));
  const item = row.items.find((entry) => entry.planId && weekOf.has(entry.planId));
  const carried = row.items.find((entry) => entry.planId === null && entry.carriedFromPlanId);
  const mine = snap.assignments.filter((assignment) => assignment.taskId === row.task.id);
  const manage = snap.me.capabilities.includes("work.manage");
  const assignedToMe = mine.some((assignment) => assignment.assignee.accessId === snap.me.accessId && assignment.state === "ACCEPTED");
  const list = snap.checklists.get(row.task.id);
  const task: TeamTask = {
    id: row.task.id,
    teamId,
    title: row.task.title,
    status: BOARD[row.boardState as ApiBoard],
    priority: PRIORITY[row.task.priority],
    due: row.dueAt ? dayOfInstant(row.dueAt) : null,
    estimateHours: row.estimatedMinutes === null ? null : Math.round((row.estimatedMinutes / 60) * 100) / 100,
    assignees: mine.flatMap((assignment) => {
      const state = ASSIGNMENT[assignment.state];
      return state ? [{ person: snap.person(assignment.assignee.accessId), state, by: snap.person(assignment.issuer.accessId) }] : [];
    }),
    source: { kind: "team" },
    planWeek: item ? weekOf.get(item.planId!)! : null,
    progress: list && list.total > 0 ? Math.round((list.done / list.total) * 100) : 0,
    blockedBy: snap.edges.filter((edge) => edge.retiredAt === null && edge.kind === "FS" && edge.successorId === row.task.id).map((edge) => edge.predecessorId),
    // Goal ⇄ task links are write-only in the contract (no read): not shown.
    goal: null,
    revision: row.task.revision,
    updatedAt: row.task.completedAt ?? "",
    can: { edit: manage, status: manage || assignedToMe },
  };
  if (row.task.completedAt) task.completedAt = row.task.completedAt;
  if (carried) task.carriedFrom = snap.plans.find((plan) => plan.id === carried.carriedFromPlanId)?.startDate ?? null;
  return task;
}

/**
 * Team tasks (TM-02 / TM-15) over task-planning (board state, estimate, due,
 * plan items), assignments (accept / decline / remind, history), checklist
 * progress and FS dependencies. Not served, so refused by rule: project task
 * read-through for team members (T5), team task comments (not approved for
 * Team), "revert accept" (an accepted assignment can only be removed or
 * reassigned by a manager), goal links (write-only). Removing a task (Undo of
 * create) cancels it: the contract has no delete.
 */
export function createApiTeamTasks(api: TeamsClient): TeamTaskRepository {
  const teamOf = new Map<string, string>();

  const listOf = async (teamId: string) => {
    const snap = await teamWork(api, teamId);
    const tasks = snap.rows.map((row) => toTeamTask(teamId, snap, row));
    for (const task of tasks) teamOf.set(task.id, teamId);
    return { snap, tasks };
  };

  const team = (taskId: string): string => {
    const teamId = teamOf.get(taskId);
    if (!teamId) throw new RepositoryError("not-found", "Not found");
    return teamId;
  };

  async function one(taskId: string): Promise<TeamTask> {
    const { tasks } = await listOf(team(taskId));
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task) throw new RepositoryError("not-found", "Not found");
    return task;
  }

  const readTask = async (teamId: string, sourceId: string) => (await api.request("get", "/api/v1/teams/{id}/tasks/{sourceId}", { path: { id: teamId, sourceId } })).data;

  /** The open PENDING assignment on a task (mine to answer, or one I may remind). */
  async function pendingOn(taskId: string): Promise<{ teamId: string; assignment: ApiAssignment }> {
    const teamId = team(taskId);
    const items = await pageAll<ApiAssignment>(async (after) => (await api.request("get", "/api/v1/teams/{id}/assignments", { path: { id: teamId }, query: { limit: PAGE, after, taskId, open: "true" } })).data);
    const me = await accessMe(api, teamId);
    const assignment = items.find((entry) => entry.state === "PENDING" && (entry.assignee.accessId === me.accessId || entry.can.remind));
    if (!assignment) throw new RepositoryError("not-found", "No pending assignment");
    return { teamId, assignment };
  }

  async function assign(teamId: string, taskId: string, accessId: string): Promise<void> {
    const member = (await roster(api, teamId)).find((entry) => entry.id === accessId && entry.state === "ACTIVE");
    if (!member) invalid("Not a member of this team");
    await api.request("post", "/api/v1/teams/{id}/tasks/{sourceId}/assignments", {
      path: { id: teamId, sourceId: taskId },
      header: { "Idempotency-Key": newIdempotencyKey() },
      body: { id: newIdempotencyKey(), assignee: { accessId: member.id, generation: member.generation } },
    });
  }

  return {
    list: (teamId, query = {}) =>
      mapErrors(async () => {
        const { tasks } = await listOf(teamId);
        return query.status ? tasks.filter((task) => task.status === query.status) : tasks;
      }),

    projectRefs: () => Promise.reject(new RepositoryError("unsupported", "Teams API: no read of team members' project tasks (T5 read-through)")),

    doneByMe: (teamId, week) =>
      mapErrors(async () => {
        const { snap, tasks } = await listOf(teamId);
        const mine = new Set(snap.assignments.filter((a) => a.assignee.accessId === snap.me.accessId && a.state === "ACCEPTED").map((a) => a.taskId));
        const end = addDaysToDay(week, 7);
        return tasks.filter((task) => mine.has(task.id) && task.completedAt && dayOfInstant(task.completedAt) >= week && dayOfInstant(task.completedAt) < end);
      }),

    unplanned: (teamId) => mapErrors(async () => (await listOf(teamId)).tasks.filter((task) => task.planWeek === null && task.status !== "done")),

    create: (teamId, input) =>
      mapErrors(async () => {
        const title = input.title.trim();
        if (!title) invalid("A task needs a title");
        const { data: created } = await api.request("post", "/api/v1/teams/{id}/tasks", {
          path: { id: teamId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { id: newIdempotencyKey(), title, priority: input.priority ? PRIORITY_TO_API[input.priority] : "NONE" },
        });
        teamOf.set(created.id, teamId);
        if (input.due) {
          const { data: schedule } = await api.request("get", "/api/v1/teams/{id}/tasks/{sourceId}/schedule", { path: { id: teamId, sourceId: created.id } });
          await api.request("put", "/api/v1/teams/{id}/tasks/{sourceId}/schedule", {
            path: { id: teamId, sourceId: created.id },
            header: { "If-Match": revisionTag(schedule.revision) },
            body: { plannedStartAt: schedule.plannedStartAt, dueAt: localInstant(input.due, "23:59"), scheduledDate: schedule.scheduledDate },
          });
        }
        if (input.estimateHours !== undefined) {
          const task = await readTask(teamId, created.id);
          await api.request("put", "/api/v1/teams/{id}/tasks/{sourceId}/estimate", {
            path: { id: teamId, sourceId: created.id },
            header: { "If-Match": revisionTag(task.revision) },
            body: { estimatedMinutes: Math.round(input.estimateHours * 60) },
          });
        }
        if (input.assigneeId) await assign(teamId, created.id, input.assigneeId);
        if (input.planned !== false) {
          // Into the open WEEK plan covering today, when a Lead created one (plans are never created here).
          const today = dayOfInstant(new Date().toISOString());
          const plans = await pageAll<ApiPlan>(async (after) => (await api.request("get", "/api/v1/teams/{id}/plans", { path: { id: teamId }, query: { limit: PAGE, after } })).data);
          const week = plans.find((plan) => plan.kind === "WEEK" && plan.state !== "CLOSED" && plan.startDate <= today && today <= plan.endDate);
          if (week) {
            const task = await readTask(teamId, created.id);
            await api.request("post", "/api/v1/teams/{id}/work-items", {
              path: { id: teamId },
              header: { "Idempotency-Key": newIdempotencyKey() },
              body: { id: newIdempotencyKey(), target: { kind: "TASK", spaceId: task.spaceId, id: task.id }, sourceRevision: task.revision, planId: week.id },
            });
          }
        }
        return one(created.id);
      }),

    setStatus: (taskId, status, revision) =>
      mapErrors(async () => {
        const teamId = team(taskId);
        await conflictAware(() =>
          api.request("put", "/api/v1/teams/{id}/tasks/{sourceId}/board-state", { path: { id: teamId, sourceId: taskId }, header: { "If-Match": revisionTag(revision) }, body: { state: BOARD_TO_API[status] } }),
        );
        return one(taskId);
      }),

    remove: (taskId) =>
      mapErrors(async () => {
        const teamId = team(taskId);
        let task = await readTask(teamId, taskId);
        await retryOnConflict(
          () =>
            api.request("patch", "/api/v1/teams/{id}/tasks/{sourceId}", {
              path: { id: teamId, sourceId: taskId },
              header: { "Idempotency-Key": newIdempotencyKey(), "If-Match": revisionTag(task.revision) },
              body: { status: "CANCELED" },
            }),
          async () => (task = await readTask(teamId, taskId)),
        );
      }),

    get: (taskId) =>
      mapErrors(async (): Promise<TeamTaskDetail> => {
        const teamId = team(taskId);
        const [{ tasks, snap }, teamData] = await Promise.all([listOf(teamId), api.request("get", "/api/v1/teams/{id}", { path: { id: teamId } })]);
        const task = tasks.find((entry) => entry.id === taskId);
        if (!task) throw new RepositoryError("not-found", "Not found");
        const current = snap.assignments.filter((assignment) => assignment.taskId === taskId);
        const activity: TeamTaskActivity[] = [];
        for (const assignment of current) {
          const history = await pageAll<Data<"/api/v1/teams/{id}/assignments/{assignmentId}/history", "get">["items"][number]>(
            async (after) => (await api.request("get", "/api/v1/teams/{id}/assignments/{assignmentId}/history", { path: { id: teamId, assignmentId: assignment.id }, query: { limit: PAGE, after } })).data,
          );
          for (const entry of history) {
            const kind = ACTIVITY[entry.action];
            if (kind) activity.push({ id: entry.id, kind, actor: snap.person(entry.by?.accessId), at: entry.createdAt });
          }
        }
        activity.sort((a, b) => b.at.localeCompare(a.at));
        return {
          task,
          teamName: teamData.data.title,
          assignedAt: current[0]?.createdAt ?? null,
          related: null,
          comments: [],
          activity,
          canManageAssignments: snap.me.capabilities.includes("work.manage"),
        };
      }),

    addComment: () => Promise.reject(new RepositoryError("unsupported", "Teams API: team task comments are not part of the approved Team contract")),

    accept: (taskId) =>
      mapErrors(async () => {
        const { teamId, assignment } = await pendingOn(taskId);
        await conflictAware(() =>
          api.request("post", "/api/v1/teams/{id}/assignments/{assignmentId}/accept", { path: { id: teamId, assignmentId: assignment.id }, header: { "If-Match": revisionTag(assignment.revision) }, body: {} }),
        );
        return one(taskId);
      }),

    decline: (taskId, input) =>
      mapErrors(async () => {
        const { teamId, assignment } = await pendingOn(taskId);
        const reason = input.note?.trim() ? `${input.reason}: ${input.note.trim()}` : input.reason;
        await conflictAware(() =>
          api.request("post", "/api/v1/teams/{id}/assignments/{assignmentId}/decline", {
            path: { id: teamId, assignmentId: assignment.id },
            header: { "If-Match": revisionTag(assignment.revision) },
            body: { reason: reason.slice(0, 1000) },
          }),
        );
        return one(taskId);
      }),

    revertAccept: () => Promise.reject(new RepositoryError("unsupported", "Teams API: an accepted assignment cannot go back to pending (a manager removes or reassigns it)")),

    remind: (taskId) =>
      mapErrors(async () => {
        const { teamId, assignment } = await pendingOn(taskId);
        await api.request("post", "/api/v1/teams/{id}/assignments/{assignmentId}/remind", { path: { id: teamId, assignmentId: assignment.id }, body: {} });
      }),
  };
}

// ── TM-01 Presence (manual only) + activity ──────────────────────────────

type ApiPresence = Data<"/api/v1/teams/{id}/presence/me", "get">;
const PRESENCE: Record<NonNullable<ApiPresence["status"]>, PresenceStatus> = { AVAILABLE: "available", BUSY: "busy", AWAY: "away", OFFLINE: "off" };
const PRESENCE_TO_API: Record<PresenceStatus, NonNullable<ApiPresence["status"]>> = { available: "AVAILABLE", busy: "BUSY", away: "AWAY", off: "OFFLINE" };

/** When a status clears, inside the server's bounds (hour ≤ 61 min, today ≤ 25 h, week ≤ 7 days). */
function clearInstant(clearAfter: ClearAfter, now = Date.now()): string | null {
  if (clearAfter === "never") return null;
  if (clearAfter === "hour") return new Date(now + 60 * 60 * 1000).toISOString();
  const today = dayOfInstant(new Date(now).toISOString());
  if (clearAfter === "today") return localInstant(today, "23:59");
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const end = localInstant(addDaysToDay(today, 6 - ((weekday - IRAN_WEEK.weekStartsOn + 7) % 7)), "23:59");
  return new Date(Math.min(Date.parse(end), now + 7 * 24 * 60 * 60 * 1000 - 60 * 1000)).toISOString();
}

/**
 * Presence (manual status only; nothing inferred) over /teams/{id}/presence.
 * Stored per team: "all my teams" writes the same status to each of my active
 * teams. "What I'm working on" comes from the server's now-working-on read (its
 * own visibility rule); the share switch itself is not stored by the API.
 */
export function createApiPresence(api: TeamsClient): PresenceRepository {
  async function workingOn(teamId: string): Promise<Map<string, string>> {
    const { data } = await api.request("get", "/api/v1/teams/{id}/now-working-on", { path: { id: teamId } });
    return new Map(data.items.filter((item) => item.tasks.length > 0).map((item) => [item.member.accessId, item.tasks.map((task) => task.title).join(" · ")]));
  }
  const toPresence = (row: ApiPresence, working: Map<string, string>): TeamPresence => {
    const doing = working.get(row.member.accessId) ?? null;
    return {
      personId: row.member.accessId,
      status: row.status ? PRESENCE[row.status] : null,
      note: row.note,
      until: row.until,
      clearAfter: row.clearAfter.toLowerCase() as ClearAfter,
      allTeams: false,
      shareWorkingOn: doing !== null,
      workingOn: doing,
    };
  };
  const mine = async (teamId: string) => (await api.request("get", "/api/v1/teams/{id}/presence/me", { path: { id: teamId } })).data;
  async function put(teamId: string, body: { status: ApiPresence["status"]; note: string; clearAfter: ApiPresence["clearAfter"]; until: string | null }) {
    let row = await mine(teamId);
    await retryOnConflict(
      () => conflictAware(() => api.request("put", "/api/v1/teams/{id}/presence/me", { path: { id: teamId }, header: { "If-Match": revisionTag(row.revision) }, body })),
      async () => (row = await mine(teamId)),
    );
  }
  return {
    list: (teamId) =>
      mapErrors(async () => {
        const [rows, working] = await Promise.all([
          pageAll<ApiPresence>(async (after) => (await api.request("get", "/api/v1/teams/{id}/presence", { path: { id: teamId }, query: { limit: PAGE, after } })).data),
          workingOn(teamId),
        ]);
        return rows.map((row) => toPresence(row, working));
      }),
    mine: (teamId) => mapErrors(async () => toPresence(await mine(teamId), await workingOn(teamId))),
    set: (teamId, input) =>
      mapErrors(async () => {
        if (input.note.length > 200) invalid("A status note holds at most 200 characters");
        const body = { status: PRESENCE_TO_API[input.status], note: input.note, clearAfter: input.clearAfter.toUpperCase() as ApiPresence["clearAfter"], until: clearInstant(input.clearAfter) };
        const teams = input.allTeams
          ? (await pageAll<{ id: string; state: string }>(async (after) => (await api.request("get", "/api/v1/teams", { query: { limit: PAGE, after } })).data)).filter((team) => team.state === "ACTIVE").map((team) => team.id)
          : [teamId];
        for (const id of teams) await put(id, body);
        return { ...toPresence(await mine(teamId), await workingOn(teamId)), allTeams: input.allTeams };
      }),
    clear: (teamId) =>
      mapErrors(async () => {
        await put(teamId, { status: null, note: "", clearAfter: "NEVER", until: null });
        return toPresence(await mine(teamId), await workingOn(teamId));
      }),
  };
}

const ACTIVITY_KIND: Record<string, TeamActivityKind> = { CREATED: "created", MOVED: "moved", COMPLETED: "completed" };
const TASK_STATUS: Partial<Record<string, TeamTaskStatus>> = { OPEN: "todo", IN_PROGRESS: "in-progress", DONE: "done" };

/** Team activity (task created / moved / completed); the actor is matched by actor id through the roster. */
export function createApiTeamActivity(api: TeamsClient): TeamActivityRepository {
  return {
    list: (teamId, limit = 20) =>
      mapErrors(async () => {
        const [{ data }, members] = await Promise.all([api.request("get", "/api/v1/teams/{id}/activity", { path: { id: teamId }, query: { limit } }), roster(api, teamId)]);
        const byActor = new Map(members.map((member) => [member.actorId, teamPerson(member)]));
        return data.items.map((item): TeamActivity => {
          const entry: TeamActivity = { id: item.id, actor: (item.actorId && byActor.get(item.actorId)) || { id: item.actorId ?? "", name: "", initials: "" }, kind: ACTIVITY_KIND[item.kind]!, subject: item.title, at: item.at };
          const status = item.kind === "MOVED" ? TASK_STATUS[item.status] : undefined;
          if (status) entry.status = status;
          return entry;
        });
      }),
  };
}

// ── TM-10 Recognition (thanks) + private feedback ────────────────────────

type ApiThanks = Data<"/api/v1/teams/{id}/thanks", "get">["items"][number];

async function memberRefs(api: TeamsClient, teamId: string, ids: readonly string[]) {
  const members = await roster(api, teamId);
  return ids.map((id) => {
    const member = members.find((entry) => entry.id === id && entry.state === "ACTIVE");
    if (!member) invalid("Not a member of this team");
    return { accessId: member.id, generation: member.generation };
  });
}

/** Thanks over /teams/{id}/thanks (team or private; recipients hide; author deletes; Owner/Admin remove). No per-person counts. */
export function createApiTeamRecognition(api: TeamsClient): TeamRecognitionRepository {
  async function all(teamId: string): Promise<TeamThanks[]> {
    const [items, person] = await Promise.all([
      pageAll<ApiThanks>(async (after) => (await api.request("get", "/api/v1/teams/{id}/thanks", { path: { id: teamId }, query: { limit: PAGE, after } })).data),
      teamPeople(api, teamId),
    ]);
    return items.map((item) => toThanks(item, person)).sort((a, b) => b.at.localeCompare(a.at));
  }
  function toThanks(item: ApiThanks, person: (id: string) => ProjectPerson): TeamThanks {
    let link: ThanksLink | null = null;
    if (item.project) link = { kind: "project", id: item.project.projectId, title: item.project.title };
    else if (item.link) link = { kind: item.link.kind === "TASK" ? "task" : "goal", id: item.link.id, title: item.link.title ?? "" };
    return {
      id: item.id,
      from: person(item.author.accessId),
      to: item.recipients.map((recipient) => person(recipient.accessId)),
      text: item.body,
      visibility: item.visibility === "PRIVATE" ? "private" : "team",
      link,
      hidden: item.hidden,
      at: item.createdAt,
      can: item.can,
    };
  }
  return {
    recent: (teamId, limit = 5) => mapErrors(async () => (await all(teamId)).filter((item) => item.visibility === "team" && !item.hidden).slice(0, limit)),
    list: (teamId) => mapErrors(() => all(teamId)),
    give: (teamId, input) =>
      mapErrors(async () => {
        const text = input.text.trim();
        if (!text || input.toIds.length === 0) invalid("Thanks need a recipient and text");
        const link = input.link && input.link.kind !== "project" ? { kind: input.link.kind === "task" ? ("TASK" as const) : ("GOAL" as const), id: input.link.id } : null;
        const { data } = await api.request("post", "/api/v1/teams/{id}/thanks", {
          path: { id: teamId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: {
            id: newIdempotencyKey(),
            recipients: await memberRefs(api, teamId, input.toIds),
            body: text.slice(0, 1000),
            visibility: input.visibility === "private" ? "PRIVATE" : "TEAM",
            link,
            projectId: input.link?.kind === "project" ? input.link.id : null,
          },
        });
        return toThanks(data, await teamPeople(api, teamId));
      }),
    hide: (teamId, thanksId, hidden) =>
      mapErrors(async () => toThanks((await api.request("put", "/api/v1/teams/{id}/thanks/{thanksId}/hidden", { path: { id: teamId, thanksId }, body: { hidden } })).data, await teamPeople(api, teamId))),
    remove: (teamId, thanksId) =>
      mapErrors(async () => {
        await api.request("post", "/api/v1/teams/{id}/thanks/{thanksId}/remove", { path: { id: teamId, thanksId }, body: {} });
      }),
  };
}

/** Private 1:1 feedback (only writer and recipient; the server never shows anyone else's). No request due date is served. */
export function createApiTeamFeedback(api: TeamsClient): TeamFeedbackRepository {
  type ApiInbox = Data<"/api/v1/teams/{id}/feedback", "get">;
  const request = (item: ApiInbox["asked"][number], person: (id: string) => ProjectPerson): FeedbackRequest => ({
    id: item.id,
    from: person(item.requester.accessId),
    to: person(item.asked.accessId),
    about: item.about,
    question: item.question,
    due: null,
    at: item.createdAt,
    status: item.status === "ANSWERED" ? "answered" : "open",
  });
  const note = (item: ApiInbox["received"][number], person: (id: string) => ProjectPerson): FeedbackNote => ({
    id: item.id,
    author: person(item.author.accessId),
    recipient: person(item.recipient.accessId),
    about: item.about,
    body: item.body,
    at: item.createdAt,
    requestId: item.requestId,
  });
  return {
    inbox: (teamId) =>
      mapErrors(async () => {
        const [{ data }, person] = await Promise.all([api.request("get", "/api/v1/teams/{id}/feedback", { path: { id: teamId } }), teamPeople(api, teamId)]);
        return {
          asked: data.asked.map((item) => request(item, person)),
          requested: data.requested.map((item) => request(item, person)),
          received: data.received.map((item) => note(item, person)),
          sent: data.sent.map((item) => note(item, person)),
        };
      }),
    request: (teamId, input) =>
      mapErrors(async () => {
        if (!input.question.trim()) invalid("A request needs a question");
        const [asked] = await memberRefs(api, teamId, [input.toId]);
        const { data } = await api.request("post", "/api/v1/teams/{id}/feedback/requests", {
          path: { id: teamId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { id: newIdempotencyKey(), asked: asked!, about: input.about.slice(0, 300), question: input.question.trim().slice(0, 2000) },
        });
        return request(data, await teamPeople(api, teamId));
      }),
    write: (teamId, input) =>
      mapErrors(async () => {
        if (!input.body.trim()) invalid("Feedback needs text");
        const [recipient] = await memberRefs(api, teamId, [input.toId]);
        const { data } = await api.request("post", "/api/v1/teams/{id}/feedback/notes", {
          path: { id: teamId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { id: newIdempotencyKey(), recipient: recipient!, about: input.about.slice(0, 300), body: input.body.trim().slice(0, 4000), requestId: input.requestId ?? null },
        });
        return note(data, await teamPeople(api, teamId));
      }),
  };
}

// ── TM-09 Check-ins ──────────────────────────────────────────────────────

type ApiCheckin = Data<"/api/v1/teams/{id}/checkins/{period}", "get">;
type ApiReply = ApiCheckin["replies"][number];

/** The planner week (Saturday start) containing a day, and its week-of-year label. */
const weekOf = (day: string) => addDaysToDay(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() - IRAN_WEEK.weekStartsOn + 7) % 7));
const weekNumberOf = (week: string) => Math.floor((Date.parse(`${week}T00:00:00Z`) - Date.parse(`${week.slice(0, 4)}-01-01T00:00:00Z`)) / 86_400_000 / 7) + 1;
const PREVIOUS_WEEKS = 8;

/**
 * Check-ins over /teams/{id}/checkins/{period} (period = the week's Saturday).
 * Status UPCOMING reads as open (the server decides whether replying is allowed).
 * A DAILY schedule is shown on the period's weekday. Not served: the last
 * reminder time; previous weeks are the eight before this one (any period can
 * be read). The schedule is stored on the team settings row.
 */
export function createApiTeamCheckins(api: TeamsClient): TeamCheckinRepository {
  const periodOf = new Map<string, string>();
  const read = async (teamId: string, period: string) => (await api.request("get", "/api/v1/teams/{id}/checkins/{period}", { path: { id: teamId, period } })).data;

  function scheduleOf(api: ApiCheckin["schedule"], period: string): CheckinSchedule {
    if (api.cadence === "WEEKLY") return { opensDay: api.opensDay as Weekday, opensTime: api.opensTime, closesDay: api.closesDay as Weekday, closesTime: api.closesTime };
    const day = new Date(`${period}T12:00:00Z`).getUTCDay() as Weekday;
    return { opensDay: day, opensTime: api.opensTime, closesDay: day, closesTime: api.closesTime };
  }

  async function weekFor(teamId: string, week?: string): Promise<CheckinWeek> {
    const current = weekOf(dayOfInstant(new Date().toISOString()));
    const period = week ? weekOf(week) : current;
    const [data, person, me] = await Promise.all([read(teamId, period), teamPeople(api, teamId), accessMe(api, teamId)]);
    const reply = (item: ApiReply): CheckinReply => {
      periodOf.set(item.id, data.period);
      const mapped: CheckinReply = {
        id: item.id,
        person: person(item.member.accessId),
        answers: { did: item.did ?? "", next: item.next ?? "", blocked: item.blocked ?? "" },
        sentAt: item.sentAt,
        comments: item.comments.map((comment) => ({ id: comment.id, author: person(comment.author.accessId), body: comment.body, at: comment.createdAt })),
      };
      if (item.late) mapped.late = true;
      return mapped;
    };
    const others = data.replies.filter((item) => item.member.accessId !== me.accessId && item.state === "SENT");
    const notYet = data.notYet.map((entry) => ({ person: person(entry.member.accessId), off: entry.offline }));
    return {
      week: data.period,
      weekNumber: weekNumberOf(data.period),
      status: data.status === "CLOSED" ? "closed" : data.status === "LATE" ? "late" : "open",
      closesAt: data.closesAt,
      schedule: scheduleOf(data.schedule, data.period),
      current: { week: current, weekNumber: weekNumberOf(current) },
      previous: Array.from({ length: PREVIOUS_WEEKS }, (_, index) => addDaysToDay(current, -7 * (index + 1))).map((day) => ({ week: day, weekNumber: weekNumberOf(day) })),
      replies: others.map(reply).sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
      mine: { state: data.mine.state === "SENT" ? "sent" : data.mine.state === "SKIPPED" ? "skipped" : "missing", reply: data.mine.reply ? reply(data.mine.reply) : null },
      replied: data.replies.map((item) => person(item.member.accessId)),
      notYet,
      remindable: data.notYet.filter((entry) => !entry.offline && entry.member.accessId !== me.accessId).length,
      remindedAt: null,
      can: { ...data.can, remind: me.capabilities.includes("work.manage"), makeTask: me.capabilities.includes("task.create") },
    };
  }

  return {
    summary: (teamId) =>
      mapErrors(async () => {
        const week = await weekFor(teamId);
        return { week: week.week, replied: week.replied.length, total: week.replied.length + week.notYet.length, closesAt: week.closesAt, mine: week.mine.state === "missing" ? "missing" : "sent" };
      }),
    week: (teamId, week) => mapErrors(() => weekFor(teamId, week)),
    reply: (teamId, week, input) =>
      mapErrors(async () => {
        const period = weekOf(week);
        const body = "skip" in input ? { kind: "SKIP" as const } : { kind: "ANSWER" as const, did: input.did.trim(), next: input.next.trim(), blocked: input.blocked.trim() };
        if (body.kind === "ANSWER" && !body.did && !body.next) invalid("Did and Next can't both be empty");
        const data = await read(teamId, period);
        // A missing reply is revision 1 for the server.
        await conflictAware(() =>
          api.request("put", "/api/v1/teams/{id}/checkins/{period}/reply", { path: { id: teamId, period }, header: { "If-Match": revisionTag(data.mine.reply?.revision ?? 1) }, body }),
        );
        return weekFor(teamId, period);
      }),
    comment: (teamId, replyId, body) =>
      mapErrors(async () => {
        const period = periodOf.get(replyId);
        if (!period) throw new RepositoryError("not-found", "Not found");
        if (!body.trim()) invalid("A comment needs text");
        const [{ data }, person] = await Promise.all([
          api.request("post", "/api/v1/teams/{id}/checkins/{period}/replies/{replyId}/comments", {
            path: { id: teamId, period, replyId },
            header: { "Idempotency-Key": newIdempotencyKey() },
            body: { id: newIdempotencyKey(), body: body.trim().slice(0, 2000) },
          }),
          teamPeople(api, teamId),
        ]);
        return { id: data.id, author: person(data.author.accessId), body: data.body, at: data.createdAt };
      }),
    remind: (teamId, week) =>
      mapErrors(async () => ({ reminded: (await api.request("post", "/api/v1/teams/{id}/checkins/{period}/remind", { path: { id: teamId, period: weekOf(week) }, body: {} })).data.delivered })),
    schedule: (teamId) =>
      mapErrors(async () => {
        const { data } = await api.request("get", "/api/v1/teams/{id}/settings", { path: { id: teamId } });
        if (!data.checkinSchedule) throw new RepositoryError("not-found", "No check-in schedule yet");
        return scheduleOf(data.checkinSchedule, weekOf(dayOfInstant(new Date().toISOString())));
      }),
    setSchedule: (teamId, schedule) =>
      mapErrors(async () => {
        const { data } = await api.request("get", "/api/v1/teams/{id}/settings", { path: { id: teamId } });
        const timezone = data.checkinSchedule?.timezone ?? getPlannerTimeZone();
        const body = { checkinSchedule: { cadence: "WEEKLY" as const, opensDay: schedule.opensDay, opensTime: schedule.opensTime, closesDay: schedule.closesDay, closesTime: schedule.closesTime, timezone } };
        const { data: saved } = await conflictAware(() => api.request("patch", "/api/v1/teams/{id}/settings", { path: { id: teamId }, header: { "If-Match": revisionTag(data.revision) }, body }));
        return scheduleOf(saved.checkinSchedule!, weekOf(dayOfInstant(new Date().toISOString())));
      }),
  };
}

// ── TM-07 Goals + key results ────────────────────────────────────────────

type ApiGoal = Data<"/api/v1/teams/{id}/goals", "get">["items"][number];
type ApiKrs = Data<"/api/v1/teams/{id}/goals/{goalId}/key-results", "get">;

/** A Jalali quarter as a goal period ("q4-1405") with its Gregorian bounds. */
function quarterOf(day: string): TeamGoalPeriod & { start: string; end: string } {
  const { year, month } = getJalaliParts(new Date(`${day}T12:00:00`));
  return quarter(year, Math.ceil(month / 3));
}
function quarter(year: number, q: number): TeamGoalPeriod & { start: string; end: string } {
  const first = jalaliDate(year, (q - 1) * 3, 1);
  const next = q === 4 ? jalaliDate(year + 1, 0, 1) : jalaliDate(year, q * 3, 1);
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { id: `q${q}-${year}`, quarter: q, year, start: iso(first), end: addDaysToDay(iso(next), -1) };
}
function parsePeriod(id: string): TeamGoalPeriod & { start: string; end: string } {
  const match = /^q([1-4])-(\d{4})$/.exec(id);
  if (!match) invalid(`Unknown period "${id}"`);
  return quarter(Number(match[2]), Number(match[1]));
}

/**
 * Team goals (TM-07) over /teams/{id}/goals + key results (period, progress,
 * expected pace, check-ins). Periods are Jalali quarters derived from each
 * goal's start date (a goal without a period sits in the current quarter).
 * Manual KR values are recorded as check-ins; task-sourced KRs are computed by
 * the server. Not served: goal ⇄ task link counts (the linked line stays hidden).
 */
export function createApiTeamGoals(api: TeamsClient): TeamGoalRepository {
  const teamOf = new Map<string, string>();

  async function toGoal(teamId: string, goal: ApiGoal, me: ApiMe, person: (actorId: string) => TeamPerson): Promise<TeamGoal> {
    const { data: krs } = await api.request("get", "/api/v1/teams/{id}/goals/{goalId}/key-results", { path: { id: teamId, goalId: goal.id } });
    const owner = person(goal.createdByActorId);
    const manage = me.capabilities.includes("work.manage");
    const mine = owner.id === me.accessId;
    const period = krs.startDate ? quarterOf(krs.startDate) : quarterOf(dayOfInstant(new Date().toISOString()));
    return {
      id: goal.id,
      title: goal.title,
      owner,
      period: { id: period.id, quarter: period.quarter, year: period.year },
      dueDay: krs.targetDate ?? period.end,
      // No measurable key results yet → 0 and on pace (nothing is behind).
      progress: (krs.progress ?? 0) / 100,
      expected: (krs.expectedProgress ?? 0) / 100,
      pace: krs.pace === "BEHIND" ? "behind" : "on-pace",
      keyResults: krs.items.filter((kr) => !kr.archived).map((kr) => krOf(kr, owner, manage || mine)),
      linked: { team: 0, projects: [] },
      lifecycle: goal.status === "ABANDONED" || goal.status === "COMPLETED" ? "archived" : "active",
    };
  }
  const krOf = (kr: ApiKrs["items"][number], owner: TeamPerson, canUpdate: boolean): TeamGoal["keyResults"][number] => ({
    id: kr.id,
    title: kr.title,
    current: Number(kr.currentValue ?? kr.startValue),
    target: Number(kr.targetValue),
    source: kr.source === "TASKS" ? { kind: "auto", tag: "" } : { kind: "manual", owner, updatedBy: null, updatedAt: kr.updatedAt },
    canUpdate: kr.source === "MANUAL" && canUpdate,
  });

  async function context(teamId: string) {
    const [me, members] = await Promise.all([accessMe(api, teamId), roster(api, teamId)]);
    const byActor = new Map(members.map((member) => [member.actorId, teamPerson(member)]));
    return { me, person: (actorId: string) => byActor.get(actorId) ?? { id: "", name: "", initials: "" } };
  }

  async function one(teamId: string, goalId: string): Promise<TeamGoal> {
    const [{ data: goal }, { me, person }] = await Promise.all([api.request("get", "/api/v1/teams/{id}/goals/{sourceId}", { path: { id: teamId, sourceId: goalId } }), context(teamId)]);
    return toGoal(teamId, goal, me, person);
  }

  const teamFor = (goalId: string) => {
    const teamId = teamOf.get(goalId);
    if (!teamId) throw new RepositoryError("not-found", "Not found");
    return teamId;
  };

  return {
    list: (teamId) =>
      mapErrors(async () => {
        const [items, { me, person }] = await Promise.all([
          pageAll<ApiGoal>(async (after) => (await api.request("get", "/api/v1/teams/{id}/goals", { path: { id: teamId }, query: { limit: PAGE, after } })).data),
          context(teamId),
        ]);
        const goals: TeamGoal[] = [];
        for (const item of items) {
          teamOf.set(item.id, teamId);
          goals.push(await toGoal(teamId, item, me, person));
        }
        const current = quarterOf(dayOfInstant(new Date().toISOString()));
        const periods = new Map<string, TeamGoalPeriod>([[current.id, { id: current.id, quarter: current.quarter, year: current.year }]]);
        for (const goal of goals) periods.set(goal.period.id, goal.period);
        return { goals, periods: [...periods.values()].sort((a, b) => a.year - b.year || a.quarter - b.quarter), current: current.id };
      }),

    get: (goalId) => mapErrors(() => one(teamFor(goalId), goalId)),

    create: (teamId, input) =>
      mapErrors(async () => {
        const title = input.title.trim();
        if (!title) invalid("A goal needs a title");
        const period = parsePeriod(input.periodId);
        const { data: goal } = await api.request("post", "/api/v1/teams/{id}/goals", {
          path: { id: teamId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { id: newIdempotencyKey(), title, horizon: "SHORT_TERM", timezone: getPlannerTimeZone() },
        });
        teamOf.set(goal.id, teamId);
        await api.request("put", "/api/v1/teams/{id}/goals/{goalId}/period", {
          path: { id: teamId, goalId: goal.id },
          header: { "If-Match": revisionTag(goal.revision) },
          body: { startDate: period.start, targetDate: input.dueDay || period.end },
        });
        return one(teamId, goal.id);
      }),

    update: (goalId, values) =>
      mapErrors(async () => {
        const teamId = teamFor(goalId);
        const { data: krs } = await api.request("get", "/api/v1/teams/{id}/goals/{goalId}/key-results", { path: { id: teamId, goalId } });
        for (const [keyResultId, value] of Object.entries(values)) {
          const kr = krs.items.find((item) => item.id === keyResultId);
          if (!kr) throw new RepositoryError("not-found", "No such key result");
          if (kr.source !== "MANUAL") invalid("Task-based key results are computed");
          if (!Number.isFinite(value)) invalid("A key result value must be a number");
          await api.request("post", "/api/v1/teams/{id}/goals/{goalId}/key-results/{keyResultId}/checkins", {
            path: { id: teamId, goalId, keyResultId },
            header: { "Idempotency-Key": newIdempotencyKey() },
            body: { id: newIdempotencyKey(), value: String(value) },
          });
        }
        return one(teamId, goalId);
      }),
  };
}

// ── TM-08 Capacity (per-day minutes) ─────────────────────────────────────

/**
 * Capacity over /teams/{id}/capacity/summary (net available after time off,
 * reserved and booked). The API stores explicit minutes per member per day; a
 * day without a value is unknown (never assumed). The weekly-hours editor has
 * no template to write to, so `set` is refused; `get` reads the week's days.
 */
export function createApiTeamCapacity(api: TeamsClient): TeamCapacityRepository {
  const weekRange = (week?: string) => {
    const from = weekOf(week ?? dayOfInstant(new Date().toISOString()));
    return { from, to: addDaysToDay(from, 6), timezone: getPlannerTimeZone() };
  };
  return {
    week: (teamId, week) =>
      mapErrors(async () => {
        const { data } = await api.request("get", "/api/v1/teams/{id}/capacity/summary", { path: { id: teamId }, query: weekRange(week) });
        return data.members.map((row) => ({ personId: row.member.accessId, bookedHours: row.totals.reservedMinutes / 60, capacityHours: row.totals.netAvailableMinutes / 60 }));
      }),
    get: (teamId, personId) =>
      mapErrors(async () => {
        const { data } = await api.request("get", "/api/v1/teams/{id}/capacity/summary", { path: { id: teamId }, query: weekRange() });
        const row = data.members.find((entry) => entry.member.accessId === personId);
        if (!row) throw new RepositoryError("not-found", "Not found");
        const days = row.days.filter((day) => (day.availableMinutes ?? 0) > 0);
        return { personId, hours: days.reduce((sum, day) => sum + (day.availableMinutes ?? 0), 0) / 60, days: days.map((day) => new Date(`${day.date}T12:00:00Z`).getUTCDay() as Weekday) };
      }),
    set: () => Promise.reject(new RepositoryError("unsupported", "Teams API: capacity is explicit minutes per day; there is no weekly-hours template to save")),
  };
}

// ── TM-12 Analytics ──────────────────────────────────────────────────────

/**
 * Team analytics: weeks = the team's WEEK plans in range (plan summaries:
 * planned / done / carried to the next plan), cycle time median, booked % from
 * the capacity summary, work mix from the dashboard (team vs projects by
 * completed-in-window). Not served: done tasks of projects the viewer cannot
 * open (`other` = null).
 */
export function createApiTeamReports(api: TeamsClient): TeamReportRepository {
  return {
    summary: (teamId, range) =>
      mapErrors(async (): Promise<TeamAnalyticsSummary> => {
        const today = dayOfInstant(new Date().toISOString());
        const from = range === "4w" ? addDaysToDay(weekOf(today), -21) : range === "12w" ? addDaysToDay(weekOf(today), -77) : quarterOf(today).start;
        const timezone = getPlannerTimeZone();
        const path = { id: teamId };
        const [plans, cycle, capacity, dashboard, projects] = await Promise.all([
          pageAll<ApiPlan>(async (after) => (await api.request("get", "/api/v1/teams/{id}/plans", { path, query: { limit: PAGE, after } })).data),
          api.request("get", "/api/v1/teams/{id}/analytics/cycle-time", { path, query: { from: localInstant(from, "00:00"), to: new Date().toISOString() } }).then((r) => r.data),
          api.request("get", "/api/v1/teams/{id}/capacity/summary", { path, query: { from: weekOf(today), to: addDaysToDay(weekOf(today), 6), timezone } }).then((r) => r.data),
          api.request("get", "/api/v1/teams/{id}/dashboard", { path, query: { fromDate: from, toDate: today, timezone } }).then((r) => r.data),
          pageAll<Data<"/api/v1/teams/{id}/project-summaries", "get">["items"][number]>(async (after) => (await api.request("get", "/api/v1/teams/{id}/project-summaries", { path, query: { limit: PAGE, after } })).data),
        ]);
        const weekPlans = plans.filter((plan) => plan.kind === "WEEK" && plan.startDate >= from && plan.startDate <= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
        const weeks: TeamAnalyticsWeek[] = [];
        let carried = 0;
        for (const plan of weekPlans) {
          const { data } = await api.request("get", "/api/v1/teams/{id}/plans/{planId}/summary", { path: { id: teamId, planId: plan.id } });
          carried += data.carriedOut.toPlan;
          weeks.push({ week: plan.startDate, weekNumber: weekNumberOf(plan.startDate), planned: data.planned, done: data.done, current: plan.startDate <= today && today <= plan.endDate });
        }
        const title = new Map(projects.map((project) => [project.projectId, project.title]));
        const sources = dashboard.portfolio.sources;
        const mixProjects = sources.flatMap((source) => {
          if (source.kind !== "PROJECT" || !("scopeId" in source)) return [];
          return [{ projectId: source.scopeId, name: title.get(source.scopeId) ?? "", count: source.summary.completedInWindow }];
        });
        return {
          range,
          weeks,
          planned: weeks.reduce((sum, week) => sum + week.planned, 0),
          plannedDone: weeks.reduce((sum, week) => sum + week.done, 0),
          carried,
          cycleMedianDays: cycle.medianMinutes === null ? null : Math.round((cycle.medianMinutes / 1440) * 10) / 10,
          cycleSample: cycle.measuredTasks,
          capacityBooked: capacity.totals.bookedBasisPoints === null ? null : Math.round(capacity.totals.bookedBasisPoints / 100),
          mix: { team: sources.filter((source) => source.kind === "TEAM").reduce((sum, source) => sum + source.summary.completedInWindow, 0), projects: mixProjects, other: null },
          asOf: dashboard.portfolio.asOf,
        };
      }),
  };
}

// ── Team invitations (OD-4: recipient-side in-app proof) ─────────────────

/**
 * Invitations: the inviter sends (same answer for every address); the
 * recipient lists their public-safe invitations (no team, inviter, role or
 * size before accepting, so those stay null), fetches their own one-time proof
 * in the app (`POST /team-invitations/{id}/proof`) and answers with it. The
 * proof is used at once and never stored.
 */
export function createApiTeamInvitations(api: TeamsClient): TeamInvitationRepository {
  type Mine = Data<"/api/v1/team-invitations", "get">["items"][number];
  const mine = () => pageAll<Mine>(async (after) => (await api.request("get", "/api/v1/team-invitations", { query: { limit: PAGE, after } })).data);

  async function proofFor(id: string): Promise<{ proof: string; revision: number }> {
    const row = (await mine()).find((item) => item.id === id);
    if (!row) throw new RepositoryError("not-found", "Invitation not found");
    const { data } = await api.request("post", "/api/v1/team-invitations/{invitationId}/proof", { path: { invitationId: id }, header: { "If-Match": revisionTag(row.revision) }, body: {} });
    return { proof: data.proof, revision: data.revision };
  }

  return {
    send: (teamId, input) =>
      mapErrors(async () => {
        const emails = input.emails.map((email) => email.trim()).filter(Boolean);
        if (emails.length === 0 || emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) invalid("A valid email is needed");
        for (const email of emails) {
          await api.request("post", "/api/v1/teams/{id}/invitations", {
            path: { id: teamId },
            header: { "Idempotency-Key": newIdempotencyKey() },
            body: { kind: "MEMBERSHIP", memberRole: input.role.toUpperCase() as "ADMIN" | "LEAD" | "MEMBER" | "VIEWER", recipient: { email } },
          });
        }
        return { sent: emails.length };
      }),

    listMine: () =>
      mapErrors(async () =>
        (await mine())
          .filter((item) => item.contextLabel === "Team")
          .map((item) => ({ id: item.id, teamId: null, teamName: null, initials: null, inviter: null, role: null, memberCount: null, sentAt: null })),
      ),

    accept: (id) =>
      mapErrors(async () => {
        const { proof, revision } = await proofFor(id);
        const { data } = await conflictAware(() =>
          api.request("post", "/api/v1/team-invitations/{id}/accept", { path: { id }, header: { "X-Invitation-Proof": proof, "If-Match": revisionTag(revision) }, body: {} }),
        );
        const teams = await pageAll<{ id: string; scopeId: string }>(async (after) => (await api.request("get", "/api/v1/teams", { query: { limit: PAGE, after } })).data);
        const team = teams.find((entry) => entry.scopeId === data.membership.scopeId);
        if (!team) throw new RepositoryError("not-found", "Team not found");
        return { teamId: team.id };
      }),

    decline: (id) =>
      mapErrors(async () => {
        const { proof, revision } = await proofFor(id);
        await conflictAware(() =>
          api.request("post", "/api/v1/team-invitations/{id}/decline", { path: { id }, header: { "X-Invitation-Proof": proof, "If-Match": revisionTag(revision) }, body: {} }),
        );
      }),
  };
}

// ── TM-04 Week planning ──────────────────────────────────────────────────

type ApiSummary = Data<"/api/v1/teams/{id}/plans/{planId}/summary", "get">;
const FRIDAY = 5;

/**
 * Week plans over /teams/{id}/plans (kind WEEK, start = the week's Saturday),
 * plan summaries (counts, focus, publish), work items (a task's place in a
 * plan) and carry-over decisions. A week without a plan reads as an empty
 * draft; planning into it creates the WEEK plan (Lead+ on the server).
 * Assigning someone else leaves a PENDING assignment (server rule).
 */
export function createApiTeamPlans(api: TeamsClient): TeamPlanRepository {
  const plansOf = (teamId: string) => pageAll<ApiPlan>(async (after) => (await api.request("get", "/api/v1/teams/{id}/plans", { path: { id: teamId }, query: { limit: PAGE, after } })).data);
  const summaryOf = async (teamId: string, planId: string) => (await api.request("get", "/api/v1/teams/{id}/plans/{planId}/summary", { path: { id: teamId, planId } })).data;

  async function planFor(teamId: string, week: string, create: boolean): Promise<ApiPlan | null> {
    const start = weekOf(week);
    const found = (await plansOf(teamId)).find((plan) => plan.kind === "WEEK" && plan.startDate === start);
    if (found || !create) return found ?? null;
    const { data } = await api.request("post", "/api/v1/teams/{id}/plans", {
      path: { id: teamId },
      header: { "Idempotency-Key": newIdempotencyKey() },
      body: { id: newIdempotencyKey(), kind: "WEEK", title: `W${weekNumberOf(start)}`, startDate: start, endDate: addDaysToDay(start, 6), timezone: getPlannerTimeZone() },
    });
    return data;
  }

  async function weekPlan(teamId: string, week?: string): Promise<TeamWeekPlan> {
    const start = weekOf(week ?? dayOfInstant(new Date().toISOString()));
    const [plan, snap] = await Promise.all([planFor(teamId, start, false), teamWork(api, teamId, { checklists: false })]);
    const byActor = new Map(snap.members.map((member) => [member.actorId, teamPerson(member)]));
    const unplanned = snap.rows.filter((row) => row.boardState !== "DONE" && !row.items.some((item) => item.planId)).length;
    const days = Array.from({ length: 7 }, (_, index) => addDaysToDay(start, index)).filter((day) => new Date(`${day}T12:00:00Z`).getUTCDay() !== FRIDAY);
    if (!plan) {
      return { week: start, weekNumber: weekNumberOf(start), planned: 0, done: 0, days: days.map((day) => ({ day, planned: 0, done: 0 })), blocked: 0, carriedOver: 0, unplanned, focus: [], focusBy: null, focusAt: null, status: "draft", publishedAt: null, publishedBy: null };
    }
    const summary = await summaryOf(teamId, plan.id);
    const actor = (id: string | null) => (id ? (byActor.get(id) ?? { id, name: "", initials: "" }) : null);
    return {
      week: start,
      weekNumber: weekNumberOf(start),
      planned: summary.planned,
      done: summary.done,
      days: days.map((day) => {
        const entry = summary.days.find((item) => item.date === day);
        return { day, planned: entry?.scheduled ?? 0, done: entry?.completed ?? 0 };
      }),
      blocked: summary.blocked,
      carriedOver: summary.carriedIn,
      unplanned,
      focus: summary.focus,
      focusBy: actor(summary.focusByActorId),
      focusAt: summary.focusAt,
      status: summary.state === "DRAFT" ? "draft" : "published",
      publishedAt: summary.publishedAt,
      publishedBy: actor(summary.publishedByActorId),
    };
  }

  async function currentSummary(teamId: string, week: string): Promise<{ plan: ApiPlan; summary: ApiSummary }> {
    const plan = await planFor(teamId, week, false);
    if (!plan) throw new RepositoryError("not-found", "No plan for this week");
    return { plan, summary: await summaryOf(teamId, plan.id) };
  }

  return {
    week: (teamId, week) => mapErrors(() => weekPlan(teamId, week)),

    plan: (teamId, taskId, input) =>
      mapErrors(async () => {
        const snap = await teamWork(api, teamId, { checklists: false });
        const row = snap.rows.find((entry) => entry.task.id === taskId);
        if (!row) throw new RepositoryError("not-found", "Not found");
        if (row.task.revision !== input.revision) throw new RepositoryError("conflict", "Changed elsewhere");
        const item = row.items[0];
        const target = input.week === null ? null : await planFor(teamId, input.week, true);
        if (item && item.planId !== (target?.id ?? null)) {
          await conflictAware(() =>
            api.request("patch", "/api/v1/teams/{id}/work-items/{itemId}", {
              path: { id: teamId, itemId: item.id },
              header: { "If-Match": revisionTag(item.revision) },
              body: { planId: target?.id ?? null, position: item.position, sourceRevision: row.task.revision },
            }),
          );
        } else if (!item && target) {
          await api.request("post", "/api/v1/teams/{id}/work-items", {
            path: { id: teamId },
            header: { "Idempotency-Key": newIdempotencyKey() },
            body: { id: newIdempotencyKey(), target: { kind: "TASK", spaceId: row.task.spaceId, id: row.task.id }, sourceRevision: row.task.revision, planId: target.id },
          });
        }
        // Assignee: the open assignment moves to the chosen person (reassign), is removed, or is created.
        const open = snap.assignments.find((assignment) => assignment.taskId === taskId && (assignment.state === "PENDING" || assignment.state === "ACCEPTED"));
        if ((open?.assignee.accessId ?? null) !== input.assigneeId) {
          const member = input.assigneeId ? snap.members.find((entry) => entry.id === input.assigneeId && entry.state === "ACTIVE") : null;
          if (input.assigneeId && !member) invalid("Not a member of this team");
          const assignee = member ? { accessId: member.id, generation: member.generation } : null;
          if (open && assignee) {
            await conflictAware(() =>
              api.request("post", "/api/v1/teams/{id}/assignments/{assignmentId}/reassign", { path: { id: teamId, assignmentId: open.id }, header: { "If-Match": revisionTag(open.revision) }, body: { id: newIdempotencyKey(), assignee } }),
            );
          } else if (open) {
            await conflictAware(() => api.request("post", "/api/v1/teams/{id}/assignments/{assignmentId}/remove", { path: { id: teamId, assignmentId: open.id }, header: { "If-Match": revisionTag(open.revision) }, body: {} }));
          } else if (assignee) {
            await api.request("post", "/api/v1/teams/{id}/tasks/{sourceId}/assignments", { path: { id: teamId, sourceId: taskId }, header: { "Idempotency-Key": newIdempotencyKey() }, body: { id: newIdempotencyKey(), assignee } });
          }
        }
        const next = await teamWork(api, teamId);
        const updated = next.rows.find((entry) => entry.task.id === taskId);
        if (!updated) throw new RepositoryError("not-found", "Not found");
        return toTeamTask(teamId, next, updated);
      }),

    publish: (teamId, week) =>
      mapErrors(async () => {
        const plan = await planFor(teamId, week, true);
        if (plan!.state === "DRAFT") {
          await conflictAware(() => api.request("patch", "/api/v1/teams/{id}/plans/{planId}", { path: { id: teamId, planId: plan!.id }, header: { "If-Match": revisionTag(plan!.revision) }, body: { state: "ACTIVE" } }));
        }
        return weekPlan(teamId, week);
      }),

    setFocus: (teamId, week, focus) =>
      mapErrors(async () => {
        const plan = await planFor(teamId, week, true);
        const summary = await summaryOf(teamId, plan!.id);
        const lines = focus.map((line) => line.trim()).filter(Boolean).map((line) => line.slice(0, 300));
        await conflictAware(() => api.request("put", "/api/v1/teams/{id}/plans/{planId}/planning", { path: { id: teamId, planId: plan!.id }, header: { "If-Match": revisionTag(summary.revision) }, body: { focus: lines } }));
        return weekPlan(teamId, week);
      }),

    review: (teamId, week) =>
      mapErrors(async (): Promise<TeamWeekReview> => {
        const { plan, summary } = await currentSummary(teamId, week);
        const { data: accuracy } = await api.request("get", "/api/v1/teams/{id}/analytics/estimate-accuracy", {
          path: { id: teamId },
          query: { from: localInstant(plan.startDate, "00:00"), to: localInstant(addDaysToDay(plan.endDate, 1), "00:00") },
        });
        const ratio = accuracy.actualMinutes > 0 ? Math.min(100, Math.round((accuracy.estimatedMinutes / accuracy.actualMinutes) * 100)) : 0;
        return {
          week: plan.startDate,
          weekNumber: weekNumberOf(plan.startDate),
          planned: summary.planned,
          plannedDone: summary.done,
          carriedOver: summary.carriedOut.toPlan + summary.carriedOut.toBacklog,
          unplannedAdded: summary.addedAfterPublish ?? 0,
          estimateAccuracy: ratio,
          unfinished: summary.unfinished.map((item) => ({ taskId: item.taskId, title: item.title, decision: null })),
        };
      }),

    decide: (teamId, week, taskId, decision) =>
      mapErrors(async () => {
        const { plan, summary } = await currentSummary(teamId, week);
        const item = summary.unfinished.find((entry) => entry.taskId === taskId);
        if (!item) throw new RepositoryError("not-found", "Not an unfinished task of this week");
        const target = decision === "this-week" ? await planFor(teamId, dayOfInstant(new Date().toISOString()), true) : null;
        await conflictAware(() =>
          api.request("post", "/api/v1/teams/{id}/plans/{planId}/items/{itemId}/carry-over", {
            path: { id: teamId, planId: plan.id, itemId: item.itemId },
            header: { "If-Match": revisionTag(item.itemRevision) },
            body: { decision: decision === "this-week" ? "NEXT" : decision === "to-plan" ? "BACKLOG" : "CLOSE", targetPlanId: target?.id ?? null, sourceRevision: item.sourceRevision },
          }),
        );
        const review = await createApiTeamPlans(api).review(teamId, week);
        return { ...review, unfinished: review.unfinished.map((entry) => (entry.taskId === taskId ? { ...entry, decision } : entry)) };
      }),
  };
}

// ── TM-05 Backlog ────────────────────────────────────────────────────────

/** The ranked backlog: team work items outside any plan, by position; estimates in the team's unit (points or hours; unknown = 0). */
export function createApiTeamBacklog(api: TeamsClient): TeamBacklogRepository {
  type ApiItem = Data<"/api/v1/teams/{id}/work-items", "get">["items"][number];
  async function read(teamId: string) {
    const path = { id: teamId };
    const [items, points, settings, rows] = await Promise.all([
      pageAll<ApiItem>(async (after) => (await api.request("get", "/api/v1/teams/{id}/work-items", { path, query: { limit: PAGE, after } })).data),
      pageAll<Data<"/api/v1/teams/{id}/task-points", "get">["items"][number]>(async (after) => (await api.request("get", "/api/v1/teams/{id}/task-points", { path, query: { limit: PAGE, after } })).data),
      api.request("get", "/api/v1/teams/{id}/settings", { path }).then((response) => response.data),
      pageAll<ApiPlanning>(async (after) => (await api.request("get", "/api/v1/teams/{id}/task-planning", { path, query: { limit: PAGE, after } })).data),
    ]);
    const pointsOf = new Map(points.map((entry) => [entry.taskId, entry.points]));
    const minutesOf = new Map(rows.map((row) => [row.task.id, row.estimatedMinutes]));
    const backlog = items
      .filter((item) => item.planId === null && item.target.kind === "TASK" && "priority" in item.source && item.source.status !== "DONE" && item.source.status !== "CANCELED" && item.source.deletedAt === null)
      .sort((a, b) => a.position - b.position);
    const estimate = (taskId: string) => (settings.estimateUnit === "POINTS" ? (pointsOf.get(taskId) ?? 0) : Math.round(((minutesOf.get(taskId) ?? 0) / 60) * 100) / 100);
    return { backlog, list: backlog.map((item): BacklogItem => ({ taskId: item.target.id, title: item.source.title, source: { kind: "team" }, estimate: estimate(item.target.id) })) };
  }
  return {
    list: (teamId) => mapErrors(async () => (await read(teamId)).list),
    rank: (teamId, taskIds) =>
      mapErrors(async () => {
        const { backlog } = await read(teamId);
        const byTask = new Map(backlog.map((item) => [item.target.id, item]));
        const order = taskIds.map((taskId) => {
          const item = byTask.get(taskId);
          if (!item) throw new RepositoryError("not-found", "Not in the backlog");
          return { id: item.id, revision: item.revision };
        });
        await conflictAware(() => api.request("put", "/api/v1/teams/{id}/backlog/order", { path: { id: teamId }, body: { items: order } }));
        return (await read(teamId)).list;
      }),
  };
}
