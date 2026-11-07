"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsClient } from "@/hooks/use-is-client";
import type {
  AssignmentDeclineInput,
  NewProjectInput,
  NewProjectTaskInput,
  ProjectAccessOptions,
  ProjectStatusInput,
  ProjectTaskPatch,
  ProjectTaskQuery,
  ReassignInput,
} from "./project-repositories";
import { useRepositories } from "./provider";
import { RepositoryError } from "./repositories";
import { afterHydration } from "./queries";
import type { DependencyType, InviteRole, PendingInvite } from "./project-domain";
import { projectKeys, taskKeys } from "./query-keys";

/*
 * React Query hooks for Projects (Phase 2). The UI never fetches: it reads
 * these hooks over the repository seam (mock adapters only for now).
 */

export function useProjectDirectory() {
  const { projects } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: projectKeys.directory(),
      queryFn: () => projects.listAccessible(),
    }),
    hydrated,
  );
}

export function useMyInvitations() {
  const { invitations } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: projectKeys.invitations(),
      queryFn: () => invitations.listMine(),
    }),
    hydrated,
  );
}

/** One project's access answer + capabilities. `preview` = demo-state switch only. */
export function useProjectAccess(id: string | undefined, preview: ProjectAccessOptions = {}) {
  const { projects } = useRepositories();
  const hydrated = useIsClient();
  const { previewRole, previewArchived } = preview;
  return afterHydration(
    useQuery({
      queryKey: projectKeys.access(
        id ?? "",
        previewRole || previewArchived ? `${previewRole ?? ""}:${previewArchived ? "archived" : ""}` : null,
      ),
      queryFn: () => projects.access(id!, { previewRole, previewArchived }),
      enabled: id !== undefined,
    }),
    hydrated,
  );
}

export function useSetProjectStatus(id: string) {
  const { projects } = useRepositories();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectStatusInput) => projects.setStatus(id, input),
    onSuccess: () => client.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useRestoreProject(id: string) {
  const { projects } = useRepositories();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => projects.restore(id),
    onSuccess: () => client.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useAcceptInvitation() {
  const { invitations } = useRepositories();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => invitations.accept(id),
    onSuccess: () => client.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useDeclineInvitation() {
  const { invitations } = useRepositories();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => invitations.decline(id, note),
    onSuccess: () => client.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

/** Revocation / context switch: drop every cached answer scoped to a project (SH-02 Rules). */
export function useClearProjectScope() {
  const client = useQueryClient();
  return (id: string) => client.removeQueries({ queryKey: projectKeys.scope(id) });
}

// ── Inside a project (PJ-01) ─────────────────────────────────────────────

/** Keys under the project's scope, so revocation clears them together. */
const scoped = (projectId: string, part: string, ...rest: unknown[]) => [
  ...projectKeys.scope(projectId),
  part,
  ...rest,
];

export function useProjectSummary(projectId: string) {
  const { projects } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "summary"), queryFn: () => projects.summary(projectId) }),
    hydrated,
  );
}

export function useProjectWorkflow(projectId: string) {
  const { workflows } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "workflow"), queryFn: () => workflows.published(projectId) }),
    hydrated,
  );
}

export function useProjectPhases(projectId: string) {
  const { milestones } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "phases"), queryFn: () => milestones.listPhases(projectId) }),
    hydrated,
  );
}

export function useProjectMilestones(projectId: string) {
  const { milestones } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "milestones"), queryFn: () => milestones.listMilestones(projectId) }),
    hydrated,
  );
}

export function useProjectActivity(projectId: string, limit?: number) {
  const { activity } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: scoped(projectId, "activity", limit ?? null),
      queryFn: () => activity.list(projectId, { limit }),
    }),
    hydrated,
  );
}

export function useProjectRisks(projectId: string, open?: boolean) {
  const { risks } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "risks", open ?? null), queryFn: () => risks.list(projectId, { open }) }),
    hydrated,
  );
}

export function useProjectWorkload(projectId: string, enabled = true) {
  const { workload } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "workload"), queryFn: () => workload.week(projectId), enabled }),
    hydrated,
  );
}

export function useMyProjectWork(projectId: string) {
  const { assignments } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "mine"), queryFn: () => assignments.listMine(projectId) }),
    hydrated,
  );
}

/** Accept / decline my assignment; refreshes the project scope and the directory counts. */
export function useAssignmentActions() {
  const { assignments } = useRepositories();
  const client = useQueryClient();
  // Accepting projects the task into Personal Tasks / My Calendar: refresh those too.
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: projectKeys.all }),
      client.invalidateQueries({ queryKey: taskKeys.all }),
    ]);
  const accept = useMutation({
    mutationFn: ({ taskId, revision }: { taskId: string; revision: number }) => assignments.accept(taskId, revision),
    onSettled: refresh,
  });
  const decline = useMutation({
    mutationFn: ({ taskId, ...input }: { taskId: string } & AssignmentDeclineInput) =>
      assignments.decline(taskId, input),
    onSettled: refresh,
  });
  const revertAccept = useMutation({
    mutationFn: ({ taskId, revision }: { taskId: string; revision: number }) =>
      assignments.revertAccept(taskId, revision),
    onSettled: refresh,
  });
  const remind = useMutation({ mutationFn: (taskId: string) => assignments.remind(taskId) });
  return { accept, decline, revertAccept, remind };
}

// ── Project tasks (PJ-02) ────────────────────────────────────────────────

export function useProjectTasks(projectId: string, query: ProjectTaskQuery, preview: ProjectAccessOptions = {}) {
  const { projectTasks } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: scoped(projectId, "tasks", query, preview.previewRole ?? null, preview.previewArchived ?? false),
      queryFn: () => projectTasks.list(projectId, query, preview),
      placeholderData: keepPreviousData,
    }),
    hydrated,
  );
}

export function useProjectMembers(projectId: string) {
  const { projectTasks } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "members"), queryFn: () => projectTasks.members(projectId) }),
    hydrated,
  );
}

/** Task writes; every success refreshes the project's scoped queries (lists, counts, For you, KPIs). */
export function useProjectTaskActions(projectId: string) {
  const { projectTasks } = useRepositories();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: projectKeys.scope(projectId) });
  const create = useMutation({
    mutationFn: (input: NewProjectTaskInput) => projectTasks.create(projectId, input),
    onSettled: refresh,
  });
  const update = useMutation({
    mutationFn: ({ taskId, patch, revision }: { taskId: string; patch: ProjectTaskPatch; revision: number }) =>
      projectTasks.update(taskId, patch, revision),
    onSettled: refresh,
  });
  const bulkUpdate = useMutation({
    mutationFn: ({ taskIds, patch }: { taskIds: readonly string[]; patch: ProjectTaskPatch }) =>
      projectTasks.bulkUpdate(projectId, taskIds, patch),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (taskIds: readonly string[]) => projectTasks.remove(taskIds),
    onSettled: refresh,
  });
  const fetchTask = (taskId: string) => projectTasks.get(taskId);
  return { create, update, bulkUpdate, remove, fetchTask };
}

// ── Task detail (PJ-15) ──────────────────────────────────────────────────

const detailKey = (taskId: string) => [...projectKeys.all, "task-detail", taskId];

export function useProjectTaskDetail(taskId: string, preview: ProjectAccessOptions = {}) {
  const { taskDetails } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: [...detailKey(taskId), preview.previewRole ?? null, preview.previewArchived ?? false],
      queryFn: () => taskDetails.get(taskId, preview),
      enabled: taskId !== "",
      // A deleted / unknown task will not come back: show the deleted state at once.
      retry: (count, error) => !(error instanceof RepositoryError && error.code === "not-found") && count < 2,
    }),
    hydrated,
  );
}

/** Detail writes. Calendar / acceptance changes also refresh Personal tasks (the projection). */
export function useTaskDetailActions(taskId: string) {
  const { taskDetails, comments, dependencies } = useRepositories();
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: projectKeys.all });
    void client.invalidateQueries({ queryKey: taskKeys.all });
  };
  return {
    toggleSubtask: useMutation({
      mutationFn: (subtaskId: string) => taskDetails.toggleSubtask(taskId, subtaskId),
      onSettled: refresh,
    }),
    setShowInCalendar: useMutation({
      mutationFn: (on: boolean) => taskDetails.setShowInCalendar(taskId, on),
      onSettled: refresh,
    }),
    addComment: useMutation({ mutationFn: (body: string) => comments.add(taskId, body), onSettled: refresh }),
    addDependency: useMutation({
      mutationFn: (input: { predecessorId: string; type: DependencyType; lagDays: number }) =>
        dependencies.add(taskId, input),
      onSettled: refresh,
    }),
    removeDependency: useMutation({
      mutationFn: (dependencyId: string) => dependencies.remove(taskId, dependencyId),
      onSettled: refresh,
    }),
  };
}

// ── Sheets (PJ-90) ───────────────────────────────────────────────────────

export function useCreateProject() {
  const { projectCreate } = useRepositories();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: projectKeys.all });
  return {
    create: useMutation({ mutationFn: (input: NewProjectInput) => projectCreate.create(input), onSettled: refresh }),
    discard: useMutation({ mutationFn: (projectId: string) => projectCreate.discard(projectId), onSettled: refresh }),
  };
}

/** PJ-90: is this (well-formed) project key free? Early feedback only; create re-checks. */
export function useProjectKeyAvailable(key: string, enabled: boolean) {
  const { projectCreate } = useRepositories();
  return useQuery({
    queryKey: projectKeys.keyAvailable(key),
    queryFn: () => projectCreate.isKeyAvailable(key),
    enabled,
    staleTime: 30_000,
  });
}

export function usePendingInvites(projectId: string | undefined) {
  const { memberInvites } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: scoped(projectId ?? "", "invites"),
      queryFn: () => memberInvites.listPending(projectId!),
      enabled: projectId !== undefined,
    }),
    hydrated,
  );
}

export function useInviteActions(projectId: string) {
  const { memberInvites } = useRepositories();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: scoped(projectId, "invites") });
  return {
    send: useMutation({
      mutationFn: ({ emails, role }: { emails: readonly string[]; role: InviteRole }) =>
        memberInvites.send(projectId, emails, role),
      onSettled: refresh,
    }),
    resend: useMutation({
      mutationFn: (inviteId: string) => memberInvites.resend(projectId, inviteId),
      onSettled: refresh,
    }),
    cancel: useMutation({
      mutationFn: (inviteId: string) => memberInvites.cancel(projectId, inviteId),
      onSettled: refresh,
    }),
    restore: useMutation({
      mutationFn: (invite: PendingInvite) => memberInvites.restore(projectId, invite),
      onSettled: refresh,
    }),
  };
}

export function useReassignTask(projectId: string) {
  const { reassign } = useRepositories();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, ...input }: { taskId: string } & ReassignInput) => reassign.reassign(taskId, input),
    onSettled: () => client.invalidateQueries({ queryKey: projectKeys.all }),
    meta: { projectId },
  });
}
