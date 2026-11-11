"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsClient } from "@/hooks/use-is-client";
import { useRepositories } from "./provider";
import { afterHydration } from "./queries";
import { teamKeys } from "./query-keys";
import type { SetPresenceInput } from "./team-domain";
import type { TeamAccessOptions } from "./team-repositories";

/*
 * React Query hooks for Teams (Phase 3). The UI never fetches: it reads these
 * hooks over the repository seam (mock adapters only for now).
 */

export function useTeamDirectory() {
  const { teams } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: teamKeys.directory(), queryFn: () => teams.listAccessible() }), hydrated);
}

export function useMyTeamInvitations() {
  const { teamInvitations } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: teamKeys.invitations(), queryFn: () => teamInvitations.listMine() }),
    hydrated,
  );
}

/** One team's access answer + capabilities. `preview` = demo-state switch only. */
export function useTeamAccess(id: string | undefined, preview: TeamAccessOptions = {}) {
  const { teams } = useRepositories();
  const hydrated = useIsClient();
  const { previewRole, previewArchived } = preview;
  return afterHydration(
    useQuery({
      queryKey: teamKeys.access(
        id ?? "",
        previewRole || previewArchived ? `${previewRole ?? ""}:${previewArchived ? "archived" : ""}` : null,
      ),
      queryFn: () => teams.access(id!, { previewRole, previewArchived }),
      enabled: id !== undefined,
    }),
    hydrated,
  );
}

export function useRestoreTeam() {
  const { teams } = useRepositories();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => teams.restore(id),
    onSuccess: () => client.invalidateQueries({ queryKey: teamKeys.all }),
  });
}

export function useAcceptTeamInvitation() {
  const { teamInvitations } = useRepositories();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => teamInvitations.accept(id),
    onSuccess: () => client.invalidateQueries({ queryKey: teamKeys.all }),
  });
}

export function useDeclineTeamInvitation() {
  const { teamInvitations } = useRepositories();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => teamInvitations.decline(id),
    onSuccess: () => client.invalidateQueries({ queryKey: teamKeys.all }),
  });
}

/** Removal / leaving: drop every cached answer scoped to a team. */
export function useClearTeamScope() {
  const client = useQueryClient();
  return (id: string) => client.removeQueries({ queryKey: teamKeys.scope(id) });
}

/** Keys under the team's scope, so removal clears them together. */
export const teamScoped = (teamId: string, part: string, ...rest: unknown[]) => [...teamKeys.scope(teamId), part, ...rest];

// ── Presence (manual status) ─────────────────────────────────────────────

export function useTeamPresence(teamId: string | undefined) {
  const { presence } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: teamScoped(teamId ?? "", "presence"),
      queryFn: () => presence.list(teamId!),
      enabled: teamId !== undefined,
    }),
    hydrated,
  );
}

export function useMyPresence(teamId: string | undefined) {
  const { presence } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: teamScoped(teamId ?? "", "presence", "me"),
      queryFn: () => presence.mine(teamId!),
      enabled: teamId !== undefined,
    }),
    hydrated,
  );
}

export function usePresenceActions(teamId: string) {
  const { presence } = useRepositories();
  const client = useQueryClient();
  // "Same status in all my teams" touches every team's presence.
  const refresh = () => client.invalidateQueries({ queryKey: teamKeys.all });
  return {
    set: useMutation({ mutationFn: (input: SetPresenceInput) => presence.set(teamId, input), onSuccess: refresh }),
    clear: useMutation({ mutationFn: () => presence.clear(teamId), onSuccess: refresh }),
  };
}
