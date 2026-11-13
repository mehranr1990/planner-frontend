import type { PendingInvite, ProjectPerson, ProjectSummary } from "../project-domain";
import type { MemberInviteRepository, ProjectCreateRepository, ReassignRepository } from "../project-repositories";
import { invitedProjectFixtures } from "@/fixtures/projects";
import { isValidProjectKey } from "../project-key";
import { RepositoryError } from "../repositories";
import type { ProjectWorkStore } from "./mock-project-work";

/*
 * PJ-90 sheets for the mock adapter: create an independent project, invite
 * members (the answer never reveals whether an account exists), pending
 * invitations with resend / cancel (+ restore for Undo), reassign a task.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ME: ProjectPerson = { id: "me", name: "Mehran R.", initials: "MR" };

const pendingFixtures: Readonly<Record<string, readonly PendingInvite[]>> = {
  "website-redesign": [
    {
      id: "pinv-1",
      email: "nima@studio.ir",
      role: "member",
      sentAt: "2026-10-11T10:00:00+03:30",
      expiresAt: "2026-10-18T10:00:00+03:30",
    },
    {
      id: "pinv-2",
      email: "lea@mail.com",
      role: "viewer",
      sentAt: "2026-10-08T10:00:00+03:30",
      expiresAt: "2026-10-25T10:00:00+03:30",
    },
  ],
  "mobile-onboarding": [{ id: "pinv-3", email: "nima@studio.ir", role: "member", sentAt: "2026-10-11T10:00:00+03:30" }],
};

export interface MockProjectSheetsOptions {
  store: ProjectWorkStore;
  now: string;
  respond<T>(value: T): Promise<T>;
  projects: ProjectSummary[];
  recent: string[];
  canInvite(projectId: string): boolean;
  canReassign(projectId: string): boolean;
  membersOf(projectId: string): readonly ProjectPerson[];
}

export function createMockProjectSheets({
  store,
  now,
  respond,
  projects,
  recent,
  canInvite,
  canReassign,
  membersOf,
}: MockProjectSheetsOptions) {
  const pending = new Map<string, PendingInvite[]>(
    Object.entries(structuredClone(pendingFixtures)).map(([id, list]) => [id, [...list]]),
  );
  let counter = 0;

  const slug = (name: string) =>
    name
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "") || "project";

  // Keys are unique across all projects, including ones the user cannot see
  // yet (pending invitations). The backend will own this check.
  const keyTaken = (key: string) =>
    projects.some((project) => project.key === key) ||
    Object.values(invitedProjectFixtures).some((project) => project.key === key);

  const projectCreate: ProjectCreateRepository = {
    async isKeyAvailable(key) {
      return respond(!keyTaken(key));
    },
    async create({ name, key, description, startDate, endDate, template }) {
      const title = name.trim();
      if (!title) throw new RepositoryError("invalid", "Name is required");
      if (!isValidProjectKey(key)) throw new RepositoryError("invalid", "key-format");
      if (keyTaken(key)) throw new RepositoryError("invalid", "key-taken");
      if (endDate < startDate) throw new RepositoryError("invalid", "End before start");
      let id = slug(title);
      while (projects.some((project) => project.id === id)) id = `${slug(title)}-${++counter}`;
      const initials =
        title
          .split(/\s+/)
          .slice(0, 2)
          .map((word) => Array.from(word)[0] ?? "")
          .join("")
          .toLocaleUpperCase() || "P";
      const project: ProjectSummary = {
        id,
        name: title,
        key,
        initials,
        tint: "blue",
        description: description?.trim() ?? "",
        role: "owner",
        health: "on-track",
        lifecycle: "active",
        statusNote: null,
        progress: { done: 0, total: 0, percent: 0 },
        expectedPercent: 0,
        nextMilestone: null,
        startDate,
        endDate,
        members: [ME],
        memberCount: 1,
        forYou: 0,
        openHighRisks: 0,
        updatedAt: now,
      };
      void template;
      projects.unshift(project);
      recent.unshift(id);
      store.tasks.set(id, []);
      return respond(project);
    },
    async discard(projectId) {
      const index = projects.findIndex((project) => project.id === projectId && project.role === "owner");
      if (index < 0) throw new RepositoryError("not-found", `No project ${projectId}`);
      projects.splice(index, 1);
      const at = recent.indexOf(projectId);
      if (at >= 0) recent.splice(at, 1);
      return respond(undefined);
    },
  };

  const listOf = (projectId: string) => {
    let list = pending.get(projectId);
    if (!list) {
      list = [];
      pending.set(projectId, list);
    }
    return list;
  };

  const memberInvites: MemberInviteRepository = {
    listPending: (projectId) => respond(listOf(projectId)),
    async send(projectId, emails, role) {
      if (!canInvite(projectId)) throw new RepositoryError("forbidden", "Owner/Admin only");
      const clean = [...new Set(emails.map((email) => email.trim().toLocaleLowerCase()))];
      if (clean.length === 0 || clean.some((email) => !EMAIL.test(email))) {
        throw new RepositoryError("invalid", "Enter valid emails");
      }
      const list = listOf(projectId);
      const sent = clean.map((email) => {
        const existing = list.find((invite) => invite.email === email);
        if (existing) {
          existing.role = role;
          existing.sentAt = now;
          return existing;
        }
        const invite: PendingInvite = { id: `pinv-${projectId}-${++counter}`, email, role, sentAt: now };
        list.push(invite);
        return invite;
      });
      // Same answer for every email: nothing tells whether an account exists.
      return respond(sent);
    },
    async resend(projectId, inviteId) {
      const invite = listOf(projectId).find((candidate) => candidate.id === inviteId);
      if (!invite) throw new RepositoryError("not-found", `No invite ${inviteId}`);
      invite.sentAt = now;
      return respond(invite);
    },
    async cancel(projectId, inviteId) {
      const list = listOf(projectId);
      const index = list.findIndex((candidate) => candidate.id === inviteId);
      if (index < 0) throw new RepositoryError("not-found", `No invite ${inviteId}`);
      list.splice(index, 1);
      return respond(undefined);
    },
    async restore(projectId, invite) {
      const list = listOf(projectId);
      if (!list.some((candidate) => candidate.id === invite.id)) list.push(structuredClone(invite));
      return respond(undefined);
    },
  };

  const reassign: ReassignRepository = {
    async reassign(_projectId, taskId, { personId, note }) {
      const task = store.findTask(taskId);
      if (!task) throw new RepositoryError("not-found", `No task ${taskId}`);
      if (!canReassign(task.projectId)) throw new RepositoryError("forbidden", "Manager+ only");
      const person = membersOf(task.projectId).find((member) => member.id === personId);
      if (!person) throw new RepositoryError("invalid", `Not a member: ${personId}`);
      const kept = task.assignees.filter(
        (assignee) => assignee.state === "accepted" && assignee.person.id !== personId,
      );
      task.assignees = [
        ...kept,
        personId === ME.id
          ? { person, state: "accepted" as const }
          : { person, state: "pending" as const, by: ME, ...(note ? { note } : {}) },
      ];
      task.revision += 1;
      task.updatedAt = now;
      return respond(task);
    },
  };

  return { projectCreate, memberInvites, reassign };
}
