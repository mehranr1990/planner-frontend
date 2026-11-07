"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsClient } from "@/hooks/use-is-client";
import type { AssignmentDeclineInput, ProjectAccessOptions, ProjectStatusInput } from "./project-repositories";
import { useRepositories } from "./provider";
import { afterHydration } from "./queries";
import { projectKeys } from "./query-keys";

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
  const refresh = () => client.invalidateQueries({ queryKey: projectKeys.all });
  const accept = useMutation({
    mutationFn: ({ taskId, revision }: { taskId: string; revision: number }) => assignments.accept(taskId, revision),
    onSettled: refresh,
  });
  const decline = useMutation({
    mutationFn: ({ taskId, ...input }: { taskId: string } & AssignmentDeclineInput) =>
      assignments.decline(taskId, input),
    onSettled: refresh,
  });
  return { accept, decline };
}
