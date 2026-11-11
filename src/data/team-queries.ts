"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsClient } from "@/hooks/use-is-client";
import { useRepositories } from "./provider";
import { afterHydration } from "./queries";
import { RepositoryError } from "./repositories";
import { taskKeys, teamKeys } from "./query-keys";
import type { DeclineReason } from "./project-domain";
import type { CarryOverDecision, SetPresenceInput, TeamRsvp, TeamTaskStatus } from "./team-domain";
import type {
  NewTeamInput,
  NewTeamTaskInput,
  PlanTaskInput,
  TeamAccessOptions,
  TeamEventInput,
  TeamInviteInput,
  TeamTaskQuery,
} from "./team-repositories";

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

/** The week plan summary; `week` (Saturday) defaults to the current week. */
export function useTeamWeekPlan(teamId: string, week?: string) {
  const { teamPlans } = useRepositories();
  return useTeamQuery(teamId, "plan", () => teamPlans.week(teamId, week), true, week ?? "current");
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

// ── Team task detail (TM-15) ─────────────────────────────────────────────

export function useTeamTaskDetail(teamId: string, taskId: string, preview: TeamAccessOptions = {}) {
  const { teamTasks } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: teamScoped(teamId, "task", taskId, preview),
      queryFn: () => teamTasks.get(taskId, preview),
      // Not found (deleted, or a project task) is an answer, not a network blip.
      retry: (count, error) => !(error instanceof RepositoryError && error.code === "not-found") && count < 2,
    }),
    hydrated,
  );
}

/** Comments + the assignment machinery (Accept projects the task into Personal Tasks). */
export function useTeamTaskDetailActions(teamId: string) {
  const { teamTasks } = useRepositories();
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: teamKeys.scope(teamId) });
    // Personal Tasks show accepted team tasks as projections.
    void client.invalidateQueries({ queryKey: taskKeys.all });
  };
  return {
    addComment: useMutation({
      mutationFn: ({ taskId, body }: { taskId: string; body: string }) => teamTasks.addComment(taskId, body),
      onSuccess: refresh,
    }),
    accept: useMutation({
      mutationFn: ({ taskId, revision }: { taskId: string; revision: number }) => teamTasks.accept(taskId, revision),
      onSuccess: refresh,
    }),
    decline: useMutation({
      mutationFn: ({ taskId, ...input }: { taskId: string; reason: DeclineReason; note?: string; revision: number }) =>
        teamTasks.decline(taskId, input),
      onSuccess: refresh,
    }),
    revertAccept: useMutation({
      mutationFn: ({ taskId, revision }: { taskId: string; revision: number }) => teamTasks.revertAccept(taskId, revision),
      onSuccess: refresh,
    }),
    remind: useMutation({ mutationFn: (taskId: string) => teamTasks.remind(taskId) }),
  };
}

// ── Team sheets (TM-90) ─────────────────────────────────────────────────

export function useCreateTeam() {
  const { teams } = useRepositories();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: NewTeamInput) => teams.create(input),
    onSuccess: () => client.invalidateQueries({ queryKey: teamKeys.all }),
  });
}

export function useSendTeamInvites(teamId: string) {
  const { teamInvitations } = useRepositories();
  return useMutation({ mutationFn: (input: TeamInviteInput) => teamInvitations.send(teamId, input) });
}

// ── Team calendar (TM-03) ────────────────────────────────────────────────

export function useTeamEvents(teamId: string, from: string, to: string, preview: TeamAccessOptions = {}) {
  const { teamEvents } = useRepositories();
  return useTeamQuery(teamId, "events", () => teamEvents.range(teamId, from, to, preview), true, from, to, preview);
}

export function useTeamCalendarOverlays(teamId: string, from: string, to: string) {
  const { teamCalendar } = useRepositories();
  return useTeamQuery(teamId, "calendar-overlays", () => teamCalendar.overlays(teamId, from, to), true, from, to);
}

/** Create / edit / RSVP; every success refreshes the team's calendar (Overview card included). */
export function useTeamEventActions(teamId: string) {
  const { teamEvents } = useRepositories();
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: teamScoped(teamId, "events") });
    void client.invalidateQueries({ queryKey: teamScoped(teamId, "calendar") });
  };
  return {
    create: useMutation({ mutationFn: (input: TeamEventInput) => teamEvents.create(teamId, input), onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ eventId, input }: { eventId: string; input: TeamEventInput }) => teamEvents.update(eventId, input),
      onSuccess: refresh,
    }),
    rsvp: useMutation({
      mutationFn: ({ eventId, rsvp }: { eventId: string; rsvp: TeamRsvp }) => teamEvents.rsvp(eventId, rsvp),
      onSuccess: refresh,
    }),
  };
}

// ── Weekly planning (TM-04) ──────────────────────────────────────────────

export function useTeamUnplanned(teamId: string, preview: TeamAccessOptions = {}) {
  const { teamTasks } = useRepositories();
  return useTeamQuery(teamId, "tasks", () => teamTasks.unplanned(teamId, preview), true, "unplanned", preview);
}

export function useTeamWeekReview(teamId: string, week: string) {
  const { teamPlans } = useRepositories();
  return useTeamQuery(teamId, "review", () => teamPlans.review(teamId, week), true, week);
}

/** Plan + assign, publish, focus and carry-over decisions; every success refreshes the team's plan and work. */
export function useTeamPlanActions(teamId: string) {
  const { teamPlans } = useRepositories();
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: teamKeys.scope(teamId) });
    // Accepted assignments project into Personal Tasks.
    void client.invalidateQueries({ queryKey: taskKeys.all });
  };
  return {
    plan: useMutation({
      mutationFn: ({ taskId, ...input }: { taskId: string } & PlanTaskInput) => teamPlans.plan(teamId, taskId, input),
      onSettled: refresh,
    }),
    publish: useMutation({ mutationFn: (week: string) => teamPlans.publish(teamId, week), onSuccess: refresh }),
    setFocus: useMutation({
      mutationFn: ({ week, focus }: { week: string; focus: readonly string[] }) => teamPlans.setFocus(teamId, week, focus),
      onSuccess: refresh,
    }),
    decide: useMutation({
      mutationFn: ({ week, taskId, decision }: { week: string; taskId: string; decision: CarryOverDecision }) =>
        teamPlans.decide(teamId, week, taskId, decision),
      onSuccess: refresh,
    }),
  };
}

// ── Sprint & backlog (TM-05) ─────────────────────────────────────────────

/** Only requested when the team has Sprints on (Settings › Planning). */
export function useTeamSprint(teamId: string, enabled: boolean, preview: TeamAccessOptions = {}) {
  const { teamSprints } = useRepositories();
  return useTeamQuery(teamId, "sprint", () => teamSprints.current(teamId, preview), enabled, preview);
}

export function useTeamBacklog(teamId: string, enabled: boolean) {
  const { teamBacklog } = useRepositories();
  return useTeamQuery(teamId, "backlog", () => teamBacklog.list(teamId), enabled);
}

export function useSprintReviews(teamId: string, enabled: boolean) {
  const { teamSprints } = useRepositories();
  return useTeamQuery(teamId, "sprint-reviews", () => teamSprints.reviews(teamId), enabled);
}

export function useSprintActions(teamId: string) {
  const { teamSprints, teamBacklog } = useRepositories();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: teamKeys.scope(teamId) });
  return {
    start: useMutation({ mutationFn: (goal: string) => teamSprints.start(teamId, { goal }), onSuccess: refresh }),
    complete: useMutation({
      mutationFn: ({ sprintId, moves }: { sprintId: string; moves: Readonly<Record<string, "next" | "backlog">> }) =>
        teamSprints.complete(teamId, sprintId, moves),
      onSuccess: refresh,
    }),
    rank: useMutation({ mutationFn: (taskIds: readonly string[]) => teamBacklog.rank(teamId, taskIds), onSettled: refresh }),
  };
}

// ── Team projects (TM-06) ────────────────────────────────────────────────

export function useTeamLinkRequests(teamId: string) {
  const { projectAssociations } = useRepositories();
  return useTeamQuery(teamId, "link-requests", () => projectAssociations.requests(teamId));
}

export function useProjectAssociationActions(teamId: string) {
  const { projectAssociations } = useRepositories();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: teamKeys.all });
  return {
    request: useMutation({ mutationFn: (projectId: string) => projectAssociations.request(teamId, projectId), onSuccess: refresh }),
    unlink: useMutation({ mutationFn: (projectId: string) => projectAssociations.unlink(teamId, projectId), onSuccess: refresh }),
  };
}
