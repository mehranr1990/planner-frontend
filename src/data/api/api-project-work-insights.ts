import type { ApiClient } from "@/api/client";
import type { ProjectMember, ProjectRole, WorkloadEntry, WorkloadGrid } from "../project-domain";
import type { ReportRepository, WorkloadRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { computeAnalytics } from "../mock/mock-project-reports";
import { computeWorkloadGrid, workloadPeriods } from "../mock/mock-project-workload";
import { mapErrors } from "./api-shared";
import { accessMe, projectsClient, toProjectPerson, type ApiAccessMe, type ProjectsClient } from "./api-project-shared";
import { activeMembers, roleOf } from "./api-project-members-repository";
import { loadProjectTasks } from "./api-project-tasks-repository";

/*
 * PJ-11 workload and PJ-12 analytics in live mode, computed from authorized
 * complete data (owner gap closure 2026-11-14) with the same definitions as
 * the mock (D13 / SPEC PJ-12):
 * - Input = every task the caller can see (LIST view, all pages) with its
 *   current assignments, estimate, planned start and due day, plus the active
 *   roster. Nothing is invented: unknown capacity stays null, tasks without an
 *   estimate are counted separately, canceled tasks carry no load.
 * - `GET …/workload` is not used: it only sums explicit per-day work
 *   allocations (no editor exists) and its per-day task counts cannot be
 *   rolled up into weeks without double counting.
 * - Analytics: cycle time needs the first In progress instant, which the
 *   contract does not serve → null with sample 0. Scope per week = the current
 *   total (no task creation series), as in the mock definition.
 * - Visibility follows `access/me`: Viewers / guests are refused the grid,
 *   Members get their own row only (no Unassigned row), Manager+ everything.
 */

const RANK: Record<ProjectRole, number> = { owner: 5, admin: 4, manager: 3, member: 2, viewer: 1, guest: 0 };
const roleOfMe = (me: ApiAccessMe): ProjectRole => (me.role ? (me.role.toLowerCase() as ProjectRole) : "guest");

async function members(api: ProjectsClient, projectId: string): Promise<ProjectMember[]> {
  return (await activeMembers(api, projectId)).map((member) => ({
    person: toProjectPerson(member),
    email: "",
    role: roleOf(member)!,
    // Weekly project capacity is not served as one number (R12): unknown.
    capacityHours: null,
    openTasks: 0,
  }));
}

export function createApiProjectWorkInsights(
  client: ApiClient,
  options: { today(): string; now?(): string },
): { workload: WorkloadRepository; reports: ReportRepository } {
  const api = projectsClient(client);

  const grid = async (projectId: string, range: Parameters<WorkloadRepository["byPeriod"]>[1]): Promise<{ grid: WorkloadGrid; me: ApiAccessMe }> => {
    const [me, loaded, roster] = await Promise.all([accessMe(api, projectId), loadProjectTasks(api, projectId), members(api, projectId)]);
    if (RANK[roleOfMe(me)] < RANK.member) throw new RepositoryError("forbidden", "Members and up");
    const computed = computeWorkloadGrid({
      periods: workloadPeriods(range.from, range.unit, range.count, range.calendar),
      unit: range.unit,
      tasks: loaded.tasks,
      workflow: loaded.catalogue.workflow,
      members: roster,
      startOf: (task) => loaded.starts.get(task.id) ?? null,
    });
    const all = RANK[roleOfMe(me)] >= RANK.manager;
    return { me, grid: all ? computed : { ...computed, rows: computed.rows.filter((row) => row.person.id === me.accessId), unassigned: [] } };
  };

  const byPeriod: WorkloadRepository["byPeriod"] = (projectId, range) => mapErrors(async () => (await grid(projectId, range)).grid);

  return {
    workload: {
      byPeriod,
      byWeek: (projectId, { from, weeks }) => byPeriod(projectId, { from, unit: "week", count: weeks, calendar: "gregorian" }),
      // Overview team load: this week's estimates per member; capacity unknown (null).
      week: (projectId) =>
        mapErrors(async (): Promise<readonly WorkloadEntry[]> => {
          const me = await accessMe(api, projectId);
          if (me.scope !== "FULL" || RANK[roleOfMe(me)] < RANK.member) return [];
          const { grid: week } = await grid(projectId, { from: options.today(), unit: "week", count: 1, calendar: "gregorian" });
          return week.rows.filter((row) => (row.cells[0]?.hours ?? 0) > 0).map((row) => ({ person: row.person, hours: row.cells[0]!.hours, capacity: row.capacity }));
        }),
    },
    reports: {
      summary: (projectId, { range, weekStartsOn }) =>
        mapErrors(async () => {
          const [me, loaded, metadata] = await Promise.all([
            accessMe(api, projectId),
            loadProjectTasks(api, projectId),
            api.request("get", "/api/v1/projects/{id}/metadata", { path: { id: projectId } }).then((response) => response.data),
          ]);
          const today = options.today();
          const firstDone = loaded.tasks.reduce<string | null>((min, task) => (task.completedAt && (!min || task.completedAt < min) ? task.completedAt : min), null);
          return computeAnalytics({
            tasks: loaded.tasks,
            workflow: loaded.catalogue.workflow,
            role: roleOfMe(me),
            range,
            weekStartsOn,
            // "All time" starts at the project start day; unknown → the first completion, else this week.
            projectStart: metadata.startDate ?? firstDone?.slice(0, 10) ?? today,
            today,
            now: options.now?.() ?? new Date().toISOString(),
            selfId: me.accessId,
          });
        }),
    },
  };
}
