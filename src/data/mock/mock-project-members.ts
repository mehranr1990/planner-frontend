import { sampleGrants, sampleMembers } from "@/fixtures/project-members";
import type { GuestGrant, ProjectMember, ProjectRole, ProjectSummary } from "../project-domain";
import type { GrantRepository, MemberRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { CURRENT_USER_ID, isTaskDone, type ProjectWorkStore } from "./mock-project-work";

/*
 * PJ-13 membership + guest grants for the mock adapter (memberRepo,
 * grantRepo; invitations stay on memberInvites, PJ-90). Open-task counts
 * come from the shared task store. Removing someone (or leaving) turns
 * their open tasks Unassigned; leaving also drops the project from the
 * directory and my Personal projections. The single Owner can't be removed
 * or demoted (transfer lives in Settings › Lifecycle).
 */

const RANK: Record<ProjectRole, number> = { owner: 5, admin: 4, manager: 3, member: 2, viewer: 1, guest: 0 };

export interface MockMembersOptions {
  store: ProjectWorkStore;
  respond<T>(value: T): Promise<T>;
  find(projectId: string): ProjectSummary | undefined;
  /** The current user left: drop the project from the directory. */
  onLeave(projectId: string): void;
  /** One of my tasks left me (Personal projection disappears). */
  onUnassignedFromMe(taskId: string): void;
}

export function createMockMembers({ store, respond, find, onLeave, onUnassignedFromMe }: MockMembersOptions) {
  const people = new Map<string, Omit<ProjectMember, "openTasks">[]>(
    Object.entries(structuredClone(sampleMembers)).map(([id, list]) => [id, [...list]]),
  );
  const grants = new Map<string, GuestGrant[]>(
    Object.entries(structuredClone(sampleGrants)).map(([id, list]) => [id, [...list]]),
  );

  const openTasksOf = (projectId: string, personId: string) => {
    const workflow = store.workflow(projectId);
    return (store.tasks.get(projectId) ?? []).filter(
      (task) =>
        !isTaskDone(task, workflow) &&
        task.assignees.some((assignee) => assignee.person.id === personId && assignee.state !== "declined"),
    );
  };

  const project = (projectId: string) => {
    const found = find(projectId);
    if (!found) throw new RepositoryError("not-found", `No project ${projectId}`);
    return found;
  };

  const listOf = (projectId: string) => {
    project(projectId);
    let list = people.get(projectId);
    if (!list) {
      list = [];
      people.set(projectId, list);
    }
    return list;
  };

  const withCount = (projectId: string, member: Omit<ProjectMember, "openTasks">): ProjectMember => ({
    ...member,
    openTasks: openTasksOf(projectId, member.person.id).length,
  });

  const target = (projectId: string, personId: string) => {
    const list = listOf(projectId);
    const index = list.findIndex((member) => member.person.id === personId);
    if (index < 0) throw new RepositoryError("not-found", `No member ${personId}`);
    return { list, index, member: list[index]! };
  };

  /** SPEC Permissions: Owner/Admin manage anyone but the Owner; Managers people ranked below them ("own"). */
  const assertCanManage = (projectId: string, member: Omit<ProjectMember, "openTasks">, nextRole?: ProjectRole) => {
    const mine = project(projectId).role;
    if (member.role === "owner") throw new RepositoryError("invalid", "last-owner");
    if (project(projectId).lifecycle === "archived") throw new RepositoryError("forbidden", "Archived");
    if (RANK[mine] >= RANK.admin) return;
    const self = member.person.id === CURRENT_USER_ID;
    const junior = RANK[member.role] < RANK.manager || self;
    if (mine === "manager" && junior && (!nextRole || RANK[nextRole] < RANK.manager)) return;
    throw new RepositoryError("forbidden", "Not allowed");
  };

  const unassign = (projectId: string, personId: string) => {
    for (const task of openTasksOf(projectId, personId)) {
      task.assignees = task.assignees.filter((assignee) => assignee.person.id !== personId);
      task.revision += 1;
      if (personId === CURRENT_USER_ID) onUnassignedFromMe(task.id);
    }
  };

  const syncSummary = (projectId: string) => {
    const summary = find(projectId);
    if (!summary) return;
    const ids = new Set(listOf(projectId).map((member) => member.person.id));
    summary.members = summary.members.filter((person) => ids.has(person.id));
    summary.memberCount = summary.members.length;
  };

  const members: MemberRepository = {
    list: (projectId) => respond(listOf(projectId).map((member) => withCount(projectId, member))),
    async setRole(projectId, personId, role) {
      const { member } = target(projectId, personId);
      assertCanManage(projectId, member, role);
      if (member.role === "guest") throw new RepositoryError("invalid", "Guests keep task grants");
      member.role = role;
      return respond(withCount(projectId, member));
    },
    async removalPreview(projectId, personId) {
      target(projectId, personId);
      return respond({ openTasks: openTasksOf(projectId, personId).length });
    },
    async remove(projectId, personId) {
      const { list, index, member } = target(projectId, personId);
      assertCanManage(projectId, member);
      unassign(projectId, personId);
      list.splice(index, 1);
      grants.set(projectId, (grants.get(projectId) ?? []).filter((grant) => grant.personId !== personId));
      syncSummary(projectId);
      return respond(undefined);
    },
    async leave(projectId) {
      const { list, index, member } = target(projectId, CURRENT_USER_ID);
      if (member.role === "owner") throw new RepositoryError("invalid", "last-owner");
      unassign(projectId, CURRENT_USER_ID);
      list.splice(index, 1);
      onLeave(projectId);
      return respond(undefined);
    },
    async setCapacity(projectId, personId, hours) {
      const { member } = target(projectId, personId);
      if (RANK[project(projectId).role] < RANK.manager) throw new RepositoryError("forbidden", "Manager+ only");
      if (hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 168))
        throw new RepositoryError("invalid", "Hours per week 0–168");
      member.capacityHours = hours;
      return respond(withCount(projectId, member));
    },
  };

  const grantRepo: GrantRepository = {
    list: (projectId) => {
      project(projectId);
      return respond(grants.get(projectId) ?? []);
    },
    async set(projectId, grant) {
      if (RANK[project(projectId).role] < RANK.manager) throw new RepositoryError("forbidden", "Manager+ only");
      const { member } = target(projectId, grant.personId);
      if (member.role !== "guest") throw new RepositoryError("invalid", "Grants are for guests");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(grant.expires)) throw new RepositoryError("invalid", "Expiry day required");
      const list = grants.get(projectId) ?? [];
      const next = list.filter((candidate) => candidate.personId !== grant.personId);
      next.push(structuredClone(grant));
      grants.set(projectId, next);
      return respond(grant);
    },
  };

  return { members, grants: grantRepo };
}
