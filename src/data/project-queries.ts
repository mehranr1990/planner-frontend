"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsClient } from "@/hooks/use-is-client";
import type { ProjectAccessOptions, ProjectStatusInput } from "./project-repositories";
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
