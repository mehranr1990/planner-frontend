import type { ApiClient } from "@/api/client";
import { addDaysToDay, dayOfInstant, diffDays, instantAt, weekdayOfDay } from "@/lib/dates/clock-time";
import type { ProjectKpis, ProjectMember, ProjectPerson, ProjectRole } from "../project-domain";
import type { MemberRepository, ProjectRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { invalid, mapErrors, pageAll, retryOnConflict, revisionTag } from "./api-shared";
import {
  accessMe,
  conflictAware,
  isOpenTask,
  liveOnly,
  projectRoster,
  projectsClient,
  projectViewItems,
  toProjectPerson,
  type ApiProjectMember,
  type ProjectsClient,
  type ProjectsData,
} from "./api-project-shared";

/*
 * Members and the status-card KPIs over the members / dashboard read models.
 * - A person's seam id is the membership id (the contract's "access id": task
 *   assignments name their recipient by it). No email, avatar or weekly
 *   capacity is served: email is "", capacity null.
 * - `openTasks` is counted from the open tasks' live assignments (one read
 *   per open task; the API has no per-member count).
 * - `leave`: the caller's own membership comes from `access/me`; the owner
 *   leaves only through an ownership handover. Weekly capacity is refused (the
 *   API keeps explicit per-day records, unknown = null).
 */

type ApiAssignment = ProjectsData<"/api/v1/projects/{projectId}/tasks/{taskId}/assignments", "get">["items"][number];
type ApiMilestone = ProjectsData<"/api/v1/projects/{id}/components/{kind}", "get">["items"][number];
type ApiRegisterItem = ProjectsData<"/api/v1/projects/{projectId}/register-items", "get">["items"][number];

const PAGE = 100;
const ASSIGNMENT_READS = 8;

export const roleOf = (member: ApiProjectMember): ProjectRole | null => {
  const role = member.role ?? member.memberRole;
  return typeof role === "string" ? (role.toLowerCase() as ProjectRole) : null;
};

/** Active members with a known role, in the server's order. */
export const activeMembers = async (api: ProjectsClient, projectId: string): Promise<ApiProjectMember[]> =>
  (await projectRoster(api, projectId)).filter((member) => member.state === "ACTIVE" && roleOf(member) !== null);

export const projectPeople = async (api: ProjectsClient, projectId: string): Promise<ProjectPerson[]> => (await activeMembers(api, projectId)).map(toProjectPerson);

/** Open tasks per access id: live (not ended, not declined) assignments of OPEN / IN_PROGRESS tasks. */
async function openTaskCounts(api: ProjectsClient, projectId: string): Promise<Map<string, number>> {
  const open = (await projectViewItems(api, projectId)).filter(isOpenTask);
  const counts = new Map<string, number>();
  for (let at = 0; at < open.length; at += ASSIGNMENT_READS) {
    const lists = await Promise.all(
      open.slice(at, at + ASSIGNMENT_READS).map((item) =>
        pageAll<ApiAssignment>(
          async (after) =>
            (await api.request("get", "/api/v1/projects/{projectId}/tasks/{taskId}/assignments", { path: { projectId, taskId: item.task.id }, query: { limit: PAGE, after } })).data,
        ),
      ),
    );
    for (const list of lists) {
      const people = new Set(list.filter((assignment) => !assignment.endedAt && assignment.decision !== "DECLINED").map((assignment) => assignment.recipientAccessId));
      for (const accessId of people) counts.set(accessId, (counts.get(accessId) ?? 0) + 1);
    }
  }
  return counts;
}

const toMember = (member: ApiProjectMember, openTasks: number): ProjectMember => ({
  person: toProjectPerson(member),
  email: "",
  role: roleOf(member)!,
  capacityHours: null,
  openTasks,
});

export function createApiProjectMemberRepository(client: ApiClient): MemberRepository {
  const api = projectsClient(client);

  const find = async (projectId: string, personId: string): Promise<ApiProjectMember> => {
    const found = (await activeMembers(api, projectId)).find((member) => member.id === personId);
    if (!found) throw new RepositoryError("not-found", "Not found");
    return found;
  };

  /** PATCH needs the state and the role together; the ETag is the quoted membership revision. */
  const patch = async (projectId: string, personId: string, body: (current: ApiProjectMember) => { state: "ACTIVE" | "REVOKED"; memberRole: "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER" }) => {
    let current = await find(projectId, personId);
    const send = async () =>
      (
        await api.request("patch", "/api/v1/spaces/{spaceId}/memberships/{id}", {
          path: { spaceId: current.spaceId, id: current.id },
          header: { "If-Match": revisionTag(current.revision) },
          body: body(current),
        })
      ).data;
    const saved = await conflictAware(() => retryOnConflict(send, async () => (current = await find(projectId, personId))));
    return { ...current, ...saved };
  };

  return liveOnly<MemberRepository>("capacity is kept as explicit per-day records (unknown = null), not one weekly number", {
    leave: (projectId) =>
      mapErrors(async () => {
        const me = await accessMe(api, projectId);
        if (me.role === "OWNER") invalid("last-owner");
        let current = await find(projectId, me.accessId);
        const send = () =>
          api.request("post", "/api/v1/spaces/{spaceId}/leave", { path: { spaceId: current.spaceId }, header: { "If-Match": revisionTag(current.revision) }, body: {} });
        await conflictAware(() => retryOnConflict(send, async () => (current = await find(projectId, me.accessId))));
      }),


    list: (projectId) =>
      mapErrors(async () => {
        const [members, counts] = await Promise.all([activeMembers(api, projectId), openTaskCounts(api, projectId)]);
        return members.map((member) => toMember(member, counts.get(member.id) ?? 0));
      }),

    setRole: (projectId, personId, role) =>
      mapErrors(async () => {
        const saved = await patch(projectId, personId, () => ({ state: "ACTIVE", memberRole: role.toUpperCase() as "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER" }));
        return toMember(saved, (await openTaskCounts(api, projectId)).get(personId) ?? 0);
      }),

    removalPreview: (projectId, personId) =>
      mapErrors(async () => {
        await find(projectId, personId);
        return { openTasks: (await openTaskCounts(api, projectId)).get(personId) ?? 0 };
      }),

    remove: (projectId, personId) =>
      mapErrors(async () => {
        await patch(projectId, personId, (current) => {
          // The owner leaves only through an ownership handover.
          if (roleOf(current) === "owner" || !current.memberRole) invalid("last-owner");
          return { state: "REVOKED", memberRole: current.memberRole };
        });
      }),
  });
}

/** `projects.summary`: the PJ-01 KPIs. Everything else on `projects` needs the caller's role (refused). */
export function createApiProjectSummary(client: ApiClient, options: { today(): string }): Pick<ProjectRepository, "summary"> {
  const api = projectsClient(client);
  return {
    summary: (projectId) =>
      mapErrors(async (): Promise<ProjectKpis> => {
        const today = options.today();
        // Iran week (Sat–Fri), like the mock's KPI week.
        const weekStart = addDaysToDay(today, -((weekdayOfDay(today) + 1) % 7));
        const weekEnd = addDaysToDay(weekStart, 6);
        const [dashboard, milestones, risks, items] = await Promise.all([
          api.request("get", "/api/v1/projects/{id}/dashboard", { path: { id: projectId }, query: { fromAt: instantAt(weekStart, 0), toAt: instantAt(addDaysToDay(weekEnd, 1), 0) } }),
          pageAll<ApiMilestone>(
            async (after) => (await api.request("get", "/api/v1/projects/{id}/components/{kind}", { path: { id: projectId, kind: "milestones" }, query: { limit: PAGE, after } })).data,
          ),
          pageAll<ApiRegisterItem>(
            async (after) => (await api.request("get", "/api/v1/projects/{projectId}/register-items", { path: { projectId }, query: { kind: "RISK", limit: PAGE, after } })).data,
          ),
          projectViewItems(api, projectId),
        ]);
        const { report } = dashboard.data;
        const dueDays = items.filter(isOpenTask).flatMap((item) => (item.schedule.dueAt ? [dayOfInstant(item.schedule.dueAt)] : []));
        const next = milestones
          .flatMap((milestone) => (!milestone.completed && milestone.targetDate ? [{ id: milestone.id, title: milestone.title, due: milestone.targetDate.slice(0, 10) }] : []))
          .sort((a, b) => a.due.localeCompare(b.due))[0];
        return {
          milestonesDone: milestones.filter((milestone) => milestone.completed).length,
          milestonesTotal: milestones.length,
          nextMilestone: next ?? null,
          overdueTasks: report.overdueTaskCount,
          oldestOverdueDays: dueDays.reduce((max, due) => (due < today ? Math.max(max, diffDays(due, today)) : max), 0),
          openRisks: report.openRiskCount,
          highRisks: risks.filter(
            (risk) => !risk.retiredAt && (risk.status === "OPEN" || risk.status === "MITIGATING") && (risk.severity === "HIGH" || risk.severity === "CRITICAL"),
          ).length,
          dueThisWeek: dueDays.filter((due) => due >= weekStart && due <= weekEnd).length,
          openTasks: report.statusCounts.OPEN + report.statusCounts.IN_PROGRESS,
        };
      }),
  };
}
