"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsClient } from "@/hooks/use-is-client";
import { useRepositories } from "./provider";
import { afterHydration } from "./queries";
import { teamKeys } from "./query-keys";
import type { SetPresenceInput, TeamTaskStatus } from "./team-domain";
import type { NewTeamTaskInput, TeamAccessOptions, TeamTaskQuery } from "./team-repositories";

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

// ── Inside a team (TM-01) ────────────────────────────────────────────────

function useTeamQuery<T>(teamId: string, part: string, fn: () => Promise<T>, enabled = true, ...rest: unknown[]) {
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: teamScoped(teamId, part, ...rest), queryFn: fn, enabled }), hydrated);
}

export function useTeamMembers(teamId: string) {
  const { teams } = useRepositories();
  return useTeamQuery(teamId, "members", () => teams.members(teamId));
}

export function useTeamProjects(teamId: string) {
  const { teams } = useRepositories();
  return useTeamQuery(teamId, "projects", () => teams.projects(teamId));
}

export function useTeamWeekPlan(teamId: string) {
  const { teamPlans } = useRepositories();
  return useTeamQuery(teamId, "plan", () => teamPlans.week(teamId));
}

/** This week's booking; only requested when the viewer may see it. */
export function useTeamCapacity(teamId: string, enabled: boolean) {
  const { teamCapacity } = useRepositories();
  return useTeamQuery(teamId, "capacity", () => teamCapacity.week(teamId), enabled);
}

export function useTeamCalendarRange(teamId: string, from: string, to: string) {
  const { teamCalendar } = useRepositories();
  return useTeamQuery(teamId, "calendar", () => teamCalendar.range(teamId, from, to), true, from, to);
}

export function useTeamActivity(teamId: string, limit?: number) {
  const { teamActivity } = useRepositories();
  return useTeamQuery(teamId, "activity", () => teamActivity.list(teamId, limit), true, limit);
}

export function useTeamCheckinSummary(teamId: string) {
  const { teamCheckins } = useRepositories();
  return useTeamQuery(teamId, "checkins", () => teamCheckins.summary(teamId));
}

export function useTeamRecognition(teamId: string, limit?: number) {
  const { teamRecognition } = useRepositories();
  return useTeamQuery(teamId, "recognition", () => teamRecognition.recent(teamId, limit), true, limit);
}

export function useTeamTasks(teamId: string, query: TeamTaskQuery = {}, preview: TeamAccessOptions = {}) {
  const { teamTasks } = useRepositories();
  return useTeamQuery(teamId, "tasks", () => teamTasks.list(teamId, query, preview), true, query, preview);
}

/** Team task writes; every success refreshes the team's task lists (and the plan/overview counts). */
export function useTeamTaskActions(teamId: string) {
  const { teamTasks } = useRepositories();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: teamKeys.scope(teamId) });
  return {
    create: useMutation({ mutationFn: (input: NewTeamTaskInput) => teamTasks.create(teamId, input), onSuccess: refresh }),
    setStatus: useMutation({
      mutationFn: ({ taskId, status, revision }: { taskId: string; status: TeamTaskStatus; revision: number }) =>
        teamTasks.setStatus(taskId, status, revision),
      onSettled: refresh,
    }),
    remove: useMutation({ mutationFn: (taskId: string) => teamTasks.remove(taskId), onSuccess: refresh }),
  };
}
