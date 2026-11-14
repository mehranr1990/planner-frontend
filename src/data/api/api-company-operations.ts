import { newIdempotencyKey, type ApiClientFor, type ResponseDataIn } from "@/api/client";
import { ApiHttpError } from "@/api/errors";
import type { paths } from "@/api/generated/openapi-p6-companies";
import { addDaysToDay, dayOfInstant } from "@/lib/dates/clock-time";
import { getJalaliParts } from "@/lib/dates/jalali";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import { newDate as jalaliDate } from "date-fns-jalali";
import type {
  Approval,
  AttachCandidate,
  AttachRequest,
  BudgetSummary,
  CompanyNotification,
  CompanyOverview,
  CompanyProjectRow,
  CompanyRole,
  CompanyTeamRow,
  DepartmentProgressRow,
  ResourceRequest,
  WorkProfile,
} from "../company-domain";
import type { CompanyRepository } from "../company-repositories";
import { RepositoryError } from "../repositories";
import { conflictAware, initialsOf } from "./api-project-shared";
import { invalid, mapErrors, pageAll, retryOnConflict, revisionTag } from "./api-shared";
import { localInstant } from "./api-tasks-repository";

/*
 * Companies — Session 4 operations over the 1,045-op contract:
 * - Overview: `reports/kpis` (tasks of authorized portfolio projects, company
 *   goal key results, explicit capacity, approved expenses vs active budgets)
 *   for the company or the chosen department, per-department rows from each
 *   department's KPIs, teams from `association-summaries`, budget card from
 *   `reports/finance` (company currency only). Not served (null, never
 *   invented): project health split, quarter history, teams that sent a plan,
 *   joiners / leave, goals on pace, capacity watch, pending budget changes.
 * - People: `directory` per context (+ `staff-profiles` for the supervisor),
 *   role from the root roster; edits = profile PATCH (position) + `work-details`.
 * - Projects & teams: `association-summaries` (title, lifecycle, responsible,
 *   member count) + progress / risks from `reports/portfolio` where readable.
 *   An association grants no membership: only the summary is shown.
 * - Attach: `association-candidates` → POST `associations` (the source proposes).
 * - Resource requests: `resource-requests` (configurable workflow; the server
 *   routes approval steps by role), create on the resource, withdraw.
 * - Invitations: sent by email in the chosen context; the one-time proof is
 *   never kept or shown (OD-4: delivered to the recipient by the server).
 */

type Client = ApiClientFor<paths>;
type X = "/api/v1/companies/{id}/contexts/{scopeId}";
type Data<P extends keyof paths, M extends "get" | "post" | "patch" | "put"> = ResponseDataIn<paths, P, M>;
type ApiCompany = Data<"/api/v1/companies/{id}", "get">;
type ApiDepartment = Data<"/api/v1/companies/{id}/departments", "get">["items"][number];
type ApiMember = Data<`${X}/members`, "get">["items"][number];
type ApiDirectory = Data<`${X}/directory`, "get">["items"][number];
type ApiProfile = Data<`${X}/staff-profiles/{profileId}`, "get">;
type ApiSummary = Data<`${X}/association-summaries`, "get">["items"][number];
type ApiAssociation = Data<`${X}/associations`, "get">["items"][number];
type ApiPortfolio = Data<`${X}/reports/portfolio`, "get">["projects"][number];
type ApiResource = Data<`${X}/resources`, "get">["items"][number];
type ApiResourceRequest = Data<`${X}/resource-requests`, "get">["items"][number];
type ApiInvitation = Data<`${X}/invitations`, "get">["items"][number];
type ApiNotification = Data<`${X}/notifications`, "get">["items"][number];

export interface OperationsDeps {
  read: (id: string) => Promise<{ company: ApiCompany; tag: string }>;
  structure: (id: string) => Promise<ApiDepartment[]>;
  members: (id: string, scopeId: string) => Promise<ApiMember[]>;
  roleOf: (role: ApiMember["role"]) => CompanyRole;
  approvals: (id: string) => Promise<Approval[]>;
}

interface Scope {
  scopeId: string;
  department: ApiDepartment | null;
}

const PAGE = 100;
const INVITE_ROLE: Partial<Record<CompanyRole, ApiMember["memberRole"]>> = { admin: "ORG_ADMIN", manager: "DEPT_MANAGER", lead: "TEAM_LEAD", member: "MEMBER", viewer: "VIEWER" };

const isHidden = (error: unknown) =>
  (error instanceof ApiHttpError && (error.status === 403 || error.status === 404)) ||
  (error instanceof RepositoryError && (error.code === "forbidden" || error.code === "not-found"));
/** A context the caller cannot read answers null (left out), never an invented row. */
const orNull = <T>(call: Promise<T>): Promise<T | null> =>
  call.catch((error: unknown) => {
    if (isHidden(error)) return null;
    throw error;
  });

const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** The current Jalali quarter: label ("1405 Q4") and the window from its first day to today. */
function quarterWindow() {
  const today = dayOfInstant(new Date().toISOString());
  const { year, month } = getJalaliParts(new Date(`${today}T12:00:00`));
  const q = Math.ceil(month / 3);
  return { label: `Q${q} ${year}`, query: { fromDate: iso(jalaliDate(year, (q - 1) * 3, 1)), toDate: today, timezone: getPlannerTimeZone() } };
}

const percentOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

export function createCompanyOperations(api: Client, deps: OperationsDeps): Partial<CompanyRepository> {
  async function scopes(id: string): Promise<Scope[]> {
    const [{ company }, structure] = await Promise.all([deps.read(id), deps.structure(id)]);
    return [{ scopeId: company.scopeId, department: null }, ...structure.map((department) => ({ scopeId: department.scopeId, department }))];
  }
  async function scopeOf(id: string, departmentId: string | null): Promise<Scope> {
    const all = await scopes(id);
    const scope = departmentId ? all.find((entry) => entry.department?.id === departmentId) : all[0];
    if (!scope) throw new RepositoryError("not-found", "Department not found");
    return scope;
  }

  // ── Overview ──
  const kpisOf = (id: string, scopeId: string, query: ReturnType<typeof quarterWindow>["query"]) =>
    orNull(api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/reports/kpis`, { path: { id, scopeId }, query }).then((response) => response.data));
  const summariesOf = (id: string, scopeId: string) =>
    orNull(pageAll<ApiSummary>(async (after) => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/association-summaries`, { path: { id, scopeId }, query: { limit: PAGE, after } })).data)).then(
      (rows) => rows ?? [],
    );

  async function budgetOf(id: string, scopeId: string, window: ReturnType<typeof quarterWindow>, currency: string | null): Promise<BudgetSummary | null> {
    if (!currency) return null;
    const report = await orNull(api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/reports/finance`, { path: { id, scopeId }, query: window.query }).then((response) => response.data));
    if (!report) return null;
    const lines = report.budgets.filter((budget) => !budget.archived && budget.currency === currency);
    if (!lines.length) return null;
    const sum = (key: "limit" | "spent" | "reserved" | "available") => lines.reduce((total, budget) => total + Number(budget[key]), 0);
    // Pending change requests are not part of this report.
    return { quarter: window.label, budget: sum("limit"), approved: sum("spent"), committed: sum("reserved"), left: sum("available"), pending: null };
  }

  async function overview(id: string, departmentId: string | null): Promise<CompanyOverview> {
    const window = quarterWindow();
    const all = await scopes(id);
    const scope = departmentId ? all.find((entry) => entry.department?.id === departmentId) : all[0];
    if (!scope) throw new RepositoryError("not-found", "Department not found");
    const [kpis, summaries, approvals] = await Promise.all([
      kpisOf(id, scope.scopeId, window.query),
      summariesOf(id, scope.scopeId),
      deps.approvals(id).catch(() => [] as Approval[]),
    ]);
    if (!kpis) throw new RepositoryError("forbidden", "Forbidden");
    const rowsOf = departmentId
      ? all.filter((entry) => entry.department?.kind === "UNIT" && entry.department.departmentId === departmentId)
      : all.filter((entry) => entry.department?.kind === "DEPARTMENT");
    const departments: DepartmentProgressRow[] = [];
    for (const entry of rowsOf) {
      const report = await kpisOf(id, entry.scopeId, window.query);
      if (!report || !entry.department) continue;
      departments.push({
        departmentId: entry.department.id,
        name: entry.department.title,
        progress: report.tasks.completion.basisPoints === null ? null : Math.round(report.tasks.completion.basisPoints / 100),
        // Department health is not served.
        status: null,
        capacity: percentOf(report.capacity.estimatedMinutes, report.capacity.availableMinutes),
      });
    }
    const waiting = approvals.filter((approval) => approval.forMe && approval.status === "pending");
    const oldest = waiting.reduce<string | null>((first, approval) => (first === null || approval.submittedAt < first ? approval.submittedAt : first), null);
    return {
      portfolio: { quarter: window.label, active: kpis.tasks.projectCount, onTrack: null, atRisk: null, offTrack: null, history: [] },
      kpis: {
        teams: summaries.filter((row) => row.kind === "TEAM" && row.state !== "REVOKED" && row.state !== "PENDING" && row.source?.lifecycleState === "ACTIVE").length,
        teamsSentPlan: null,
        people: kpis.capacity.memberCount,
        joinedThisQuarter: null,
        onLeave: null,
        goalsOnPace: null,
        goals: kpis.goals?.goalCount ?? null,
        goalsProgress: kpis.goals?.averageProgress ?? null,
        approvalsForMe: waiting.length,
        oldestWaitingDays: oldest === null ? null : Math.max(0, Math.floor((Date.now() - Date.parse(oldest)) / 86_400_000)),
      },
      departments,
      watch: null,
      budget: await budgetOf(id, scope.scopeId, window, kpis.expenses.currency),
    };
  }

  // ── People ──
  const profileKey = new Map<string, { scopeId: string; profileId: string }>();
  /** Person id (first seat seen, the company seat when listed) → actor: one row per person across contexts. */
  const actorOf = new Map<string, string>();
  async function staff(id: string): Promise<WorkProfile[]> {
    const all = await scopes(id);
    const roster = await deps.members(id, all[0].scopeId);
    // Keyed by actor: each context gives the same person another seat (access id).
    const people = new Map<string, WorkProfile>();
    for (const scope of all) {
      const [rows, profiles, seats] = await Promise.all([
        orNull(pageAll<ApiDirectory>(async (after) => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/directory`, { path: { id, scopeId: scope.scopeId }, query: { limit: PAGE, after } })).data)),
        orNull(pageAll<ApiProfile>(async (after) => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/staff-profiles`, { path: { id, scopeId: scope.scopeId }, query: { limit: PAGE, after } })).data)),
        scope.department ? orNull(deps.members(id, scope.scopeId)) : Promise.resolve(roster),
      ]);
      for (const row of rows ?? []) {
        const accessId = row.member.accessId;
        const actorId = (seats ?? []).find((seat) => seat.id === accessId)?.actorId ?? null;
        const key = actorId ?? accessId;
        const existing = people.get(key);
        if (existing) {
          if (scope.department && !existing.departmentIds.includes(scope.department.id)) {
            existing.departmentIds.push(scope.department.id);
            existing.departmentNames.push(scope.department.title);
          }
          continue;
        }
        profileKey.set(accessId, { scopeId: scope.scopeId, profileId: row.profileId });
        if (actorId) actorOf.set(accessId, actorId);
        // The company seat carries the person's company role.
        const member = roster.find((entry) => (actorId ? entry.actorId === actorId : entry.id === accessId));
        const supervisor = profiles?.find((profile) => profile.id === row.profileId)?.supervisor ?? null;
        const name = row.member.displayName ?? member?.displayName ?? "";
        people.set(key, {
          id: accessId,
          name,
          initials: initialsOf(name),
          position: row.position ?? "",
          departmentIds: scope.department ? [scope.department.id] : [],
          departmentNames: scope.department ? [scope.department.title] : [],
          supervisorId: supervisor?.accessId ?? null,
          supervisorName: supervisor ? (supervisor.displayName ?? "") : null,
          role: member ? deps.roleOf(member.role) : "member",
          status: member && member.state !== "ACTIVE" ? "left" : row.workStatus === "INACTIVE" ? "leave" : "active",
          manualStatus: null,
          workingOn: null,
          email: row.workEmail ?? "",
          phone: row.workPhone,
          hoursPerWeek: null,
          workHours: row.workHours ?? "",
          startedOn: null,
          location: row.workLocation ?? "",
          equipment: null,
          bookedPercent: null,
          limited: false,
        });
      }
    }
    return [...people.values()];
  }

  // ── Projects & teams (association summaries; no membership is implied) ──
  async function associated(id: string) {
    const rows: { scope: Scope; summary: ApiSummary }[] = [];
    for (const scope of await scopes(id)) for (const summary of await summariesOf(id, scope.scopeId)) rows.push({ scope, summary });
    // Live associations only; a source the caller cannot read has no summary.
    return rows.filter(({ summary }) => (summary.state === "ASSOCIATED" || summary.state === "ATTACHED" || summary.state === "ATTACH_PENDING") && summary.source !== null);
  }
  const custodyOf = (state: string): CompanyProjectRow["custody"] => (state === "ATTACHED" ? "attached" : "company");

  // ── Resources ──
  const resourceScope = new Map<string, string>();
  const requestScope = new Map<string, string>();
  async function resourcesIn(id: string, scopeId: string) {
    const list = (await orNull(pageAll<ApiResource>(async (after) => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/resources`, { path: { id, scopeId }, query: { limit: PAGE, after } })).data))) ?? [];
    for (const resource of list) resourceScope.set(resource.id, scopeId);
    return list;
  }
  const toRequest = (row: ApiResourceRequest, resources: readonly ApiResource[], scope: Scope): ResourceRequest => ({
    id: row.id,
    resourceId: row.resourceId,
    resourceName: resources.find((resource) => resource.id === row.resourceId)?.title ?? "",
    // Resources carry no asset tag.
    tag: "",
    requesterId: row.requester.accessId,
    requesterName: row.requester.displayName ?? "",
    departmentName: scope.department?.title ?? "",
    from: dayOfInstant(row.startAt),
    // Requests end at the next local midnight: the screen's last day is the day before.
    to: addDaysToDay(dayOfInstant(row.endAt), -1),
    reason: row.reason ?? "",
    status: row.state === "PENDING" ? "pending" : row.state === "APPROVED" ? "approved" : row.state === "REJECTED" ? "rejected" : "withdrawn",
    approvalId: null,
    createdAt: row.createdAt,
  });
  async function requestsIn(id: string, scope: Scope): Promise<ResourceRequest[]> {
    const rows = await orNull(
      pageAll<ApiResourceRequest>(async (after) => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/resource-requests`, { path: { id, scopeId: scope.scopeId }, query: { limit: PAGE, after } })).data),
    );
    if (!rows?.length) return [];
    const resources = await resourcesIn(id, scope.scopeId);
    return rows.map((row) => {
      requestScope.set(row.id, scope.scopeId);
      return toRequest(row, resources, scope);
    });
  }

  // ── Department transfers (same company; the person's seat moves, identity and records stay) ──
  const TRANSFER_ROLES = ["TEAM_LEAD", "MEMBER", "VIEWER"] as const;
  async function transferSeat(id: string, personId: string, fromDepartmentId: string, toDepartmentId: string) {
    if (fromDepartmentId === toDepartmentId) invalid("same-department");
    const all = await scopes(id);
    const from = all.find((scope) => scope.department?.id === fromDepartmentId);
    const to = all.find((scope) => scope.department?.id === toDepartmentId);
    if (!from || !to) throw new RepositoryError("not-found", "Department not found");
    const [roster, seats] = await Promise.all([deps.members(id, all[0].scopeId), deps.members(id, from.scopeId)]);
    const actorId = actorOf.get(personId) ?? [...roster, ...seats].find((entry) => entry.id === personId)?.actorId;
    const seat = seats.find((entry) => entry.actorId === actorId && entry.state === "ACTIVE");
    if (!actorId || !seat) throw new RepositoryError("not-found", "Person not found");
    return { from, to, seat };
  }

  // ── Notifications (the caller's own, per context) ──
  const notificationScope = new Map<string, string>();
  const toNotification = (row: ApiNotification): CompanyNotification => ({
    id: row.id,
    kind: row.kind === "KNOWLEDGE_ACK_REMINDER" ? "kb-ack-reminder" : "file-request",
    subjectId: row.subjectId,
    createdAt: row.createdAt,
    read: row.readAt !== null,
  });

  async function listNotifications(id: string): Promise<CompanyNotification[]> {
    const lists = await Promise.all(
      (await scopes(id)).map(async (scope) => {
        // A context the caller cannot open has no notifications for them.
        const rows = await orNull(pageAll<ApiNotification>(async (after) => (await api.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/notifications", { path: { id, scopeId: scope.scopeId }, query: { limit: PAGE, after } })).data));
        for (const row of rows ?? []) notificationScope.set(row.id, scope.scopeId);
        return rows ?? [];
      }),
    );
    return lists
      .flat()
      .map(toNotification)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return {
    overview: (id, departmentId) => mapErrors(() => overview(id, departmentId)),

    staff: (id) => mapErrors(() => staff(id)),

    // Position on the staff profile, contact details through `work-details` (both revisioned).
    updateWorkProfile: (id, personId, patch) =>
      mapErrors(async () => {
        if (!profileKey.has(personId)) await staff(id);
        const key = profileKey.get(personId);
        if (!key) throw new RepositoryError("not-found", "Not found");
        const path = { id, scopeId: key.scopeId, profileId: key.profileId };
        const readProfile = async () => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/staff-profiles/{profileId}`, { path })).data;
        let current = await readProfile();
        if ((current.position ?? "") !== patch.position.trim()) {
          const send = () => api.request("patch", `/api/v1/companies/{id}/contexts/{scopeId}/staff-profiles/{profileId}`, { path, header: { "If-Match": revisionTag(current.revision) }, body: { position: patch.position.trim().slice(0, 300) || null } });
          const { data } = await conflictAware(() => retryOnConflict(send, async () => (current = await readProfile())));
          current = data;
        }
        const details = () =>
          api.request("put", `/api/v1/companies/{id}/contexts/{scopeId}/staff-profiles/{profileId}/work-details`, {
            path,
            header: { "If-Match": revisionTag(current.revision) },
            body: { workPhone: patch.phone?.trim() || null, workLocation: patch.location.trim().slice(0, 200) || null, workHours: patch.workHours.trim().slice(0, 200) || null },
          });
        await conflictAware(() => retryOnConflict(details, async () => (current = await readProfile())));
        const updated = (await staff(id)).find((person) => person.id === personId);
        if (!updated) throw new RepositoryError("not-found", "Not found");
        return updated;
      }),

    projects: (id) =>
      mapErrors(async () => {
        const rows = (await associated(id)).filter(({ summary }) => summary.kind === "PROJECT");
        const reports = new Map<string, ApiPortfolio["report"]>();
        for (const scope of new Set(rows.map(({ scope }) => scope))) {
          const report = await orNull(api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/reports/portfolio`, { path: { id, scopeId: scope.scopeId }, query: quarterWindow().query }).then((response) => response.data));
          for (const project of report?.projects ?? []) reports.set(project.projectId, project.report);
        }
        return rows.map(({ scope, summary }): CompanyProjectRow => {
          const report = reports.get(summary.sourceId);
          const counted = report ? report.taskCount - report.statusCounts.CANCELED : 0;
          const title = summary.source!.title;
          return {
            id: summary.sourceId,
            name: title,
            initials: initialsOf(title),
            departmentId: scope.department?.id ?? "",
            departmentName: scope.department?.title ?? "",
            health: null,
            progress: report ? percentOf(report.statusCounts.DONE, counted) : null,
            spent: null,
            budget: null,
            custody: custodyOf(summary.state),
            lead: summary.source!.responsibleDisplayName ?? "",
            lifecycle: summary.source!.lifecycleState === "ACTIVE" ? "active" : "paused",
            nextMilestone: null,
            openRisks: report?.openRiskCount ?? 0,
            attachedAt: null,
          };
        });
      }),

    teams: (id) =>
      mapErrors(async () =>
        (await associated(id))
          .filter(({ summary }) => summary.kind === "TEAM")
          .map(({ scope, summary }): CompanyTeamRow => ({
            id: summary.sourceId,
            name: summary.source!.title,
            initials: initialsOf(summary.source!.title),
            departmentId: scope.department?.id ?? "",
            departmentName: scope.department?.title ?? "",
            lead: summary.source!.responsibleDisplayName ?? "",
            people: summary.source!.memberCount,
            planCompletion: null,
            custody: custodyOf(summary.state),
          })),
      ),

    // Proposed / attach-pending associations with the source's summary (no member list, no per-project consent).
    attachRequests: (id) =>
      mapErrors(async () => {
        const requests: AttachRequest[] = [];
        for (const scope of await scopes(id)) {
          const rows = await orNull(pageAll<ApiAssociation>(async (after) => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/associations`, { path: { id, scopeId: scope.scopeId }, query: { limit: PAGE, after } })).data));
          const pending = (rows ?? []).filter((row) => row.state === "PENDING" || row.state === "ATTACH_PENDING");
          if (!pending.length) continue;
          const summaries = await summariesOf(id, scope.scopeId);
          for (const row of pending) {
            const source = summaries.find((summary) => summary.associationId === row.id)?.source ?? null;
            requests.push({
              id: row.id,
              kind: row.kind === "TEAM" ? "team" : "project",
              subjectId: row.sourceId,
              subjectName: source?.title ?? "",
              ownerName: source?.responsibleDisplayName ?? "",
              departmentId: scope.department?.id ?? "",
              departmentName: scope.department?.title ?? "",
              members: source?.memberCount ?? 0,
              linkedProjects: [],
              status: "pending",
              requestedAt: row.createdAt,
              iAmOwner: false,
            });
          }
        }
        return requests;
      }),

    attachCandidates: (id) =>
      mapErrors(async () => {
        const { company } = await deps.read(id);
        const { data } = await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/association-candidates`, { path: { id, scopeId: company.scopeId } });
        return data.items.map((item): AttachCandidate => ({ id: `${item.kind}:${item.sourceId}`, kind: item.kind === "TEAM" ? "team" : "project", name: item.title, ownerName: "" }));
      }),

    // The caller (the source's owner) proposes the association in the chosen department; the company accepts it later.
    requestAttach: (id, candidateId, departmentId) =>
      mapErrors(async () => {
        const [kind, sourceId] = candidateId.split(":") as ["PROJECT" | "TEAM", string];
        if ((kind !== "PROJECT" && kind !== "TEAM") || !sourceId) invalid("Unknown candidate");
        const scope = await scopeOf(id, departmentId || null);
        const { data } = await api.request("post", `/api/v1/companies/{id}/contexts/{scopeId}/associations`, {
          path: { id, scopeId: scope.scopeId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { id: crypto.randomUUID(), kind, sourceId },
        });
        const summary = (await summariesOf(id, scope.scopeId)).find((row) => row.associationId === data.id)?.source ?? null;
        return {
          id: data.id,
          kind: data.kind === "TEAM" ? "team" : "project",
          subjectId: data.sourceId,
          subjectName: summary?.title ?? "",
          ownerName: summary?.responsibleDisplayName ?? "",
          departmentId: scope.department?.id ?? "",
          departmentName: scope.department?.title ?? "",
          members: summary?.memberCount ?? 0,
          linkedProjects: [],
          status: "pending",
          requestedAt: data.createdAt,
          iAmOwner: false,
        };
      }),

    resourceRequests: (id) => mapErrors(async () => (await Promise.all((await scopes(id)).map((scope) => requestsIn(id, scope)))).flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt))),

    // Whole local days: from 00:00 of the first day to 00:00 after the last.
    requestResource: (id, input) =>
      mapErrors(async () => {
        if (!input.from || !input.to || input.from > input.to) invalid("dates");
        const all = await scopes(id);
        if (!resourceScope.has(input.resourceId)) for (const scope of all) await resourcesIn(id, scope.scopeId);
        const scopeId = resourceScope.get(input.resourceId);
        const scope = all.find((entry) => entry.scopeId === scopeId);
        if (!scope) throw new RepositoryError("not-found", "Resource not found");
        const { data } = await api.request("post", `/api/v1/companies/{id}/contexts/{scopeId}/resources/{resourceId}/requests`, {
          path: { id, scopeId: scope.scopeId, resourceId: input.resourceId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { id: crypto.randomUUID(), startAt: localInstant(input.from, "00:00"), endAt: localInstant(addDaysToDay(input.to, 1), "00:00"), reason: input.reason.trim().slice(0, 2000) || null },
        });
        requestScope.set(data.id, scope.scopeId);
        return toRequest(data, await resourcesIn(id, scope.scopeId), scope);
      }),

    withdrawResourceRequest: (id, requestId) =>
      mapErrors(async () => {
        if (!requestScope.has(requestId)) for (const scope of await scopes(id)) await requestsIn(id, scope);
        const scopeId = requestScope.get(requestId);
        if (!scopeId) throw new RepositoryError("not-found", "Not found");
        const path = { id, scopeId, requestId };
        const readRequest = async () => (await api.request("get", `/api/v1/companies/{id}/contexts/{scopeId}/resource-requests/{requestId}`, { path })).data;
        let current = await readRequest();
        const send = () => api.request("post", `/api/v1/companies/{id}/contexts/{scopeId}/resource-requests/{requestId}/withdraw`, { path, header: { "If-Match": revisionTag(current.revision) }, body: {} });
        await conflictAware(() => retryOnConflict(send, async () => (current = await readRequest())));
      }),

    // Pending invitations of every context the caller may list; the rows carry no recipient email (CB-3).
    pendingInvites: (id) =>
      mapErrors(async () => {
        const [{ company }, all] = await Promise.all([deps.read(id), scopes(id)]);
        const lists = await Promise.all(
          all.map(async (scope) => {
            const rows = await orNull(pageAll<ApiInvitation>(async (after) => (await api.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/invitations", { path: { id, scopeId: scope.scopeId }, query: { limit: PAGE, after } })).data));
            return (rows ?? [])
              .filter((row) => row.state === "PENDING")
              .map((row) => ({ id: row.id, email: null, role: deps.roleOf(row.memberRole), departmentName: scope.department?.title ?? company.title }));
          }),
        );
        return lists.flat();
      }),

    previewTransfer: (id, personId, fromDepartmentId, toDepartmentId) =>
      mapErrors(async () => {
        const { from, to, seat } = await transferSeat(id, personId, fromDepartmentId, toDepartmentId);
        const { data } = await api.request("get", "/api/v1/companies/{id}/department-transfers/preview", {
          path: { id },
          query: { accessId: seat.id, fromScopeId: from.scopeId, toScopeId: to.scopeId },
        });
        const allowed = data.allowed && (TRANSFER_ROLES as readonly string[]).includes(seat.memberRole);
        return { ...data, role: data.role ? deps.roleOf(data.role as ApiMember["role"]) : null, allowed };
      }),

    // The seat's revision is the precondition; the role is kept. A 409 (changed, blocked) asks for a fresh preview.
    transferEmployee: (id, personId, fromDepartmentId, toDepartmentId) =>
      mapErrors(async () => {
        const { from, to, seat } = await transferSeat(id, personId, fromDepartmentId, toDepartmentId);
        const memberRole = TRANSFER_ROLES.find((role) => role === seat.memberRole);
        // Department managers and Org Admins move through a role change, never a transfer.
        if (!memberRole) throw new RepositoryError("conflict", "Transfer needs a role change first");
        await conflictAware(() =>
          api.request("post", "/api/v1/companies/{id}/department-transfers", {
            path: { id },
            header: { "If-Match": revisionTag(seat.revision) },
            body: { id: crypto.randomUUID(), accessId: seat.id, fromScopeId: from.scopeId, toScopeId: to.scopeId, memberRole },
          }),
        );
      }),

    notifications: (id) => mapErrors(() => listNotifications(id)),

    readNotification: (id, notificationId) =>
      mapErrors(async () => {
        if (!notificationScope.has(notificationId)) await listNotifications(id);
        const scopeId = notificationScope.get(notificationId);
        if (!scopeId) throw new RepositoryError("not-found", "Not found");
        const { data } = await api.request("post", "/api/v1/companies/{id}/contexts/{scopeId}/notifications/{notificationId}/read", { path: { id, scopeId, notificationId }, body: {} });
        return toNotification(data);
      }),

    // By email in the chosen context; the response's proof is dropped (never stored or shown to the inviter).
    invite: (id, input) =>
      mapErrors(async () => {
        const memberRole = INVITE_ROLE[input.role];
        if (!memberRole) invalid("role");
        // Position and supervisor live on the staff profile, which exists only after joining.
        if (input.position.trim() || input.supervisorId) throw new RepositoryError("unsupported", "Companies API: position and supervisor are set on the staff profile after the invitee joins");
        const scope = await scopeOf(id, input.departmentId || null);
        await api.request("post", `/api/v1/companies/{id}/contexts/{scopeId}/invitations`, {
          path: { id, scopeId: scope.scopeId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { memberRole: memberRole!, recipient: { email: input.email.trim() } },
        });
      }),
  };
}
