"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CalendarSystem } from "@/lib/dates/format";
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
  RiskPatch,
  FileUploadInput,
} from "./project-repositories";
import { useRepositories } from "./provider";
import { RepositoryError } from "./repositories";
import { afterHydration } from "./queries";
import type {
  DependencyType,
  RiskCloseReason,
  ImportTarget,
  ProjectAccessSettings,
  ProjectGeneralPatch,
  WorkflowDraft,
  AnalyticsRange,
  GuestGrant,
  ProjectRole,
  InviteRole,
  PendingInvite,
  ScheduleChange,
  ScheduleLink,
  ScheduleMode,
  ScheduleMove,
  WorkloadPeriodUnit,
} from "./project-domain";
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

/** Tasks per status id (Flow counts). */
export function useProjectStatusCounts(projectId: string, preview: ProjectAccessOptions = {}) {
  const { projectTasks } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: scoped(projectId, "status-counts", preview.previewRole ?? null),
      queryFn: () => projectTasks.countByStatus(projectId, preview),
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
  const transition = useMutation({
    mutationFn: ({
      taskId,
      toStatusId,
      revision,
      exceedWip,
    }: {
      taskId: string;
      toStatusId: string;
      revision: number;
      exceedWip?: boolean;
    }) => projectTasks.transition(taskId, toStatusId, revision, { exceedWip }),
    onSettled: refresh,
  });
  const reorder = useMutation({
    mutationFn: (orderedIds: readonly string[]) => projectTasks.reorder(projectId, orderedIds),
    onSettled: refresh,
  });
  const fetchTask = (taskId: string) => projectTasks.get(taskId);
  return { create, update, bulkUpdate, remove, transition, reorder, fetchTask, refresh };
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

// ── Phases, milestones & schedule (PJ-08, PJ-05) ─────────────────────────

export function usePhaseRows(projectId: string) {
  const { milestones } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "phase-rows"), queryFn: () => milestones.phaseRows(projectId) }),
    hydrated,
  );
}

export function useMilestoneRows(projectId: string) {
  const { milestones } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "milestone-rows"), queryFn: () => milestones.milestoneRows(projectId) }),
    hydrated,
  );
}

export function useMilestoneRisk(projectId: string, milestoneId: string | null) {
  const { risks } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: scoped(projectId, "milestone-risk", milestoneId),
      queryFn: () => risks.byMilestone(projectId, milestoneId ?? ""),
      enabled: milestoneId !== null,
    }),
    hydrated,
  );
}

export function useAssigneeOverlaps(projectId: string, enabled = true) {
  const { schedule } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "overlaps"), queryFn: () => schedule.overlaps(projectId), enabled }),
    hydrated,
  );
}

export function useCriticalPath(projectId: string, enabled: boolean) {
  const { schedule } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "critical-path"), queryFn: () => schedule.criticalPath(projectId), enabled }),
    hydrated,
  );
}

export function useScheduleGraph(projectId: string) {
  const { schedule } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "schedule"), queryFn: () => schedule.graph(projectId) }),
    hydrated,
  );
}

/** Phase order, milestone rename, schedule preview / apply; writes refresh the project's scoped queries. */
export function useScheduleActions(projectId: string) {
  const { milestones, schedule } = useRepositories();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: projectKeys.scope(projectId) });
  const reorderPhases = useMutation({
    mutationFn: (phaseIds: readonly string[]) => milestones.reorderPhases(projectId, phaseIds),
    onSettled: refresh,
  });
  const renameMilestone = useMutation({
    mutationFn: ({ milestoneId, title, revision }: { milestoneId: string; title: string; revision: number }) =>
      milestones.updateMilestone(milestoneId, { title }, revision),
    onSettled: refresh,
  });
  const apply = useMutation({
    mutationFn: (moves: readonly ScheduleMove[]) => schedule.apply(projectId, moves),
    onSettled: refresh,
  });
  const preview = (change: ScheduleChange, mode: ScheduleMode) => schedule.preview(projectId, change, mode);
  const graph = () => schedule.graph(projectId);
  const addLink = useMutation({
    mutationFn: (input: Omit<ScheduleLink, "id">) => schedule.addLink(projectId, input),
    onSettled: refresh,
  });
  const updateLink = useMutation({
    mutationFn: ({ linkId, type, lagDays }: Pick<ScheduleLink, "type" | "lagDays"> & { linkId: string }) =>
      schedule.updateLink(projectId, linkId, { type, lagDays }),
    onSettled: refresh,
  });
  const removeLink = useMutation({
    mutationFn: (linkId: string) => schedule.removeLink(projectId, linkId),
    onSettled: refresh,
  });
  return { reorderPhases, renameMilestone, apply, preview, graph, addLink, updateLink, removeLink, refresh };
}

// ── Project calendar (PJ-07) ─────────────────────────────────────────────

export function useProjectCalendar(projectId: string, from: string, to: string, preview: ProjectAccessOptions = {}) {
  const { calendar } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: scoped(projectId, "calendar", from, to, preview.previewRole ?? null),
      queryFn: () => calendar.range(projectId, from, to, preview),
      placeholderData: keepPreviousData,
    }),
    hydrated,
  );
}

/** The current user's own untitled busy blocks (only fetched while the overlay is on). */
export function useMyBusy(from: string, to: string, enabled: boolean) {
  const { calendar } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: [...projectKeys.all, "my-busy", from, to],
      queryFn: () => calendar.myBusy(from, to),
      enabled,
    }),
    hydrated,
  );
}

// ── Risks & issues (PJ-09, PJ-16) ────────────────────────────────────────

/** The register for one segment (risks or issues), open and closed. */
export function useRiskRegister(projectId: string, kind: "risk" | "issue") {
  const { risks } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "risks", "register", kind), queryFn: () => risks.list(projectId, { kind }) }),
    hydrated,
  );
}

export function useRisk(projectId: string, riskId: string) {
  const { risks } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "risks", "detail", riskId), queryFn: () => risks.get(riskId), retry: false }),
    hydrated,
  );
}

export function useRiskHistory(projectId: string, riskId: string) {
  const { risks } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "risks", "history", riskId), queryFn: () => risks.history(riskId) }),
    hydrated,
  );
}

export function useRiskComments(projectId: string, riskId: string) {
  const { risks } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "risks", "comments", riskId), queryFn: () => risks.comments(riskId) }),
    hydrated,
  );
}

/** Risk writes (If-Match revisions); every change refreshes the project's caches (PJ-01, PJ-08 read risks too). */
export function useRiskActions(projectId: string) {
  const { risks } = useRepositories();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: projectKeys.scope(projectId) });
  return {
    update: useMutation({
      mutationFn: ({ riskId, patch, revision }: { riskId: string; patch: RiskPatch; revision: number }) =>
        risks.update(riskId, patch, revision),
      onSettled: refresh,
    }),
    setChecklistItem: useMutation({
      mutationFn: ({
        riskId,
        itemId,
        patch,
        revision,
      }: {
        riskId: string;
        itemId: string;
        patch: { done?: boolean; taskId?: string };
        revision: number;
      }) => risks.setChecklistItem(riskId, itemId, patch, revision),
      onSettled: refresh,
    }),
    close: useMutation({
      mutationFn: ({
        riskId,
        reason,
        note,
        revision,
      }: {
        riskId: string;
        reason: RiskCloseReason;
        note?: string;
        revision: number;
      }) => risks.close(riskId, { reason, note }, revision),
      onSettled: refresh,
    }),
    resolve: useMutation({
      mutationFn: ({ riskId, resolution, revision }: { riskId: string; resolution: string; revision: number }) =>
        risks.resolve(riskId, resolution, revision),
      onSettled: refresh,
    }),
    convert: useMutation({
      mutationFn: ({ riskId, revision }: { riskId: string; revision: number }) => risks.convert(riskId, revision),
      onSettled: refresh,
    }),
    addComment: useMutation({
      mutationFn: ({ riskId, body }: { riskId: string; body: string }) => risks.addComment(riskId, body),
      onSettled: refresh,
    }),
  };
}

// ── Files (PJ-10) ────────────────────────────────────────────────────────

const IN_FLIGHT = new Set(["queued", "uploading", "scanning"]);

/** The project's folders + files; polls while an upload or scan is in flight. */
export function useFileLibrary(projectId: string, preview: ProjectAccessOptions = {}) {
  const { files } = useRepositories();
  const hydrated = useIsClient();
  const role = preview.previewRole ?? null;
  return afterHydration(
    useQuery({
      queryKey: scoped(projectId, "files", role),
      queryFn: () => files.list(projectId, preview),
      refetchInterval: (query) =>
        query.state.data?.files.some((file) => IN_FLIGHT.has(file.state)) ? 500 : false,
    }),
    hydrated,
  );
}

export function useFileConfig(projectId: string) {
  const { files } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "files-config"), queryFn: () => files.config(projectId), staleTime: Infinity }),
    hydrated,
  );
}

export function useFileActions(projectId: string) {
  const { files } = useRepositories();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: scoped(projectId, "files") });
  return {
    upload: useMutation({ mutationFn: (input: FileUploadInput) => files.upload(projectId, input), onSettled: refresh }),
    cancel: useMutation({ mutationFn: (fileId: string) => files.cancel(fileId), onSettled: refresh }),
    retry: useMutation({ mutationFn: (fileId: string) => files.retry(fileId), onSettled: refresh }),
    restoreVersion: useMutation({
      mutationFn: ({ fileId, version }: { fileId: string; version: number }) => files.restoreVersion(fileId, version),
      onSettled: refresh,
    }),
    download: (fileId: string) => files.download(fileId),
  };
}

// ── Members (PJ-13) ──────────────────────────────────────────────────────

export function useMemberList(projectId: string) {
  const { members } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "member-list"), queryFn: () => members.list(projectId) }),
    hydrated,
  );
}

export function useGuestGrants(projectId: string, enabled = true) {
  const { grants } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "grants"), queryFn: () => grants.list(projectId), enabled }),
    hydrated,
  );
}

/** Membership writes; every change refreshes the project (tasks become Unassigned on remove / leave). */
export function useMemberActions(projectId: string) {
  const { members, grants } = useRepositories();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: projectKeys.scope(projectId) });
  return {
    setRole: useMutation({
      mutationFn: ({ personId, role }: { personId: string; role: Exclude<ProjectRole, "owner" | "guest"> }) =>
        members.setRole(projectId, personId, role),
      onSettled: refresh,
    }),
    remove: useMutation({ mutationFn: (personId: string) => members.remove(projectId, personId), onSettled: refresh }),
    leave: useMutation({
      mutationFn: () => members.leave(projectId),
      onSettled: () => client.invalidateQueries({ queryKey: projectKeys.all }),
    }),
    setCapacity: useMutation({
      mutationFn: ({ personId, hours }: { personId: string; hours: number | null }) =>
        members.setCapacity(projectId, personId, hours),
      onSettled: refresh,
    }),
    setGrant: useMutation({ mutationFn: (grant: GuestGrant) => grants.set(projectId, grant), onSettled: refresh }),
    removalPreview: (personId: string) => members.removalPreview(projectId, personId),
  };
}

// ── Workload (PJ-11) ─────────────────────────────────────────────────────

export function useWorkloadGrid(
  projectId: string,
  from: string,
  period: { unit: WorkloadPeriodUnit; count: number; calendar: CalendarSystem },
  preview: ProjectAccessOptions = {},
) {
  const { workload } = useRepositories();
  const hydrated = useIsClient();
  const role = preview.previewRole ?? null;
  return afterHydration(
    useQuery({
      queryKey: scoped(projectId, "workload-grid", from, period.unit, period.count, period.calendar, role),
      queryFn: () => workload.byPeriod(projectId, { from, ...period }, preview),
      retry: (count, error) => !(error instanceof RepositoryError && error.code === "forbidden") && count < 2,
    }),
    hydrated,
  );
}

// ── Analytics (PJ-12) ────────────────────────────────────────────────────

export function useAnalytics(
  projectId: string,
  range: AnalyticsRange,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  preview: ProjectAccessOptions = {},
) {
  const { reports } = useRepositories();
  const hydrated = useIsClient();
  const role = preview.previewRole ?? null;
  return afterHydration(
    useQuery({
      queryKey: scoped(projectId, "analytics", range, weekStartsOn, role),
      queryFn: () => reports.summary(projectId, { range, weekStartsOn }, preview),
    }),
    hydrated,
  );
}

// ── Settings (PJ-14) ─────────────────────────────────────────────────────

export function useWorkflowDraft(projectId: string) {
  const { workflowDrafts } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "workflow-draft"), queryFn: () => workflowDrafts.draft(projectId) }),
    hydrated,
  );
}

export function useWorkflowPreview(projectId: string, enabled: boolean) {
  const { workflowDrafts } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: scoped(projectId, "workflow-draft", "preview"),
      queryFn: () => workflowDrafts.previewPublish(projectId),
      enabled,
    }),
    hydrated,
  );
}

export function useFieldList(projectId: string) {
  const { fields } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "fields"), queryFn: () => fields.list(projectId) }),
    hydrated,
  );
}

export function useAccessSettings(projectId: string) {
  const { settings } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "access-settings"), queryFn: () => settings.access(projectId) }),
    hydrated,
  );
}

export function useOwnershipTransfer(projectId: string) {
  const { settings } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "transfer"), queryFn: () => settings.transfer(projectId) }),
    hydrated,
  );
}

export function useImportConfig(projectId: string) {
  const { imports } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: scoped(projectId, "import-config"), queryFn: () => imports.config(projectId) }),
    hydrated,
  );
}

/** Settings writes. Project-level changes (name, key, lifecycle) refresh every project query. */
export function useSettingsActions(projectId: string) {
  const { settings, workflowDrafts, fields, imports, projects } = useRepositories();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: projectKeys.scope(projectId) });
  const refreshAll = () => client.invalidateQueries({ queryKey: projectKeys.all });
  return {
    update: useMutation({ mutationFn: (patch: ProjectGeneralPatch) => settings.update(projectId, patch), onSettled: refreshAll }),
    setAccess: useMutation({
      mutationFn: (patch: Partial<ProjectAccessSettings>) => settings.setAccess(projectId, patch),
      onSettled: refresh,
    }),
    saveTemplate: useMutation({ mutationFn: () => settings.saveTemplate(projectId) }),
    archive: useMutation({ mutationFn: () => settings.archive(projectId), onSettled: refreshAll }),
    restore: useMutation({ mutationFn: () => projects.restore(projectId), onSettled: refreshAll }),
    requestTransfer: useMutation({
      mutationFn: (personId: string) => settings.requestTransfer(projectId, personId),
      onSettled: refresh,
    }),
    cancelTransfer: useMutation({ mutationFn: () => settings.cancelTransfer(projectId), onSettled: refresh }),
    confirmTransfer: useMutation({
      mutationFn: (password: string) => settings.confirmTransfer(projectId, password),
      onSettled: refreshAll,
    }),
    remove: useMutation({
      mutationFn: (confirm: { name: string; password: string }) => settings.remove(projectId, confirm),
    }),
    saveDraft: useMutation({
      mutationFn: (input: Pick<WorkflowDraft, "statuses" | "transitions">) => workflowDrafts.saveDraft(projectId, input),
      onSettled: refresh,
    }),
    discardDraft: useMutation({ mutationFn: () => workflowDrafts.discardDraft(projectId), onSettled: refresh }),
    publish: useMutation({
      mutationFn: (mapping: Readonly<Record<string, string>>) => workflowDrafts.publish(projectId, mapping),
      onSettled: refresh,
    }),
    saveFields: useMutation({
      mutationFn: (list: Parameters<typeof fields.save>[1]) => fields.save(projectId, list),
      onSettled: refresh,
    }),
    removeField: useMutation({ mutationFn: (fieldId: string) => fields.remove(projectId, fieldId), onSettled: refresh }),
    importInspect: (csv: string) => imports.inspect(projectId, csv),
    importDryRun: (csv: string, mapping: Readonly<Record<ImportTarget, number | null>>) =>
      imports.dryRun(projectId, csv, mapping),
    importCommit: useMutation({
      mutationFn: ({ csv, mapping }: { csv: string; mapping: Readonly<Record<ImportTarget, number | null>> }) =>
        imports.commit(projectId, csv, mapping),
      onSettled: refresh,
    }),
    importUndo: useMutation({ mutationFn: (batchId: string) => imports.undo(projectId, batchId), onSettled: refresh }),
  };
}
