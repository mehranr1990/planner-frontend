"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsClient } from "@/hooks/use-is-client";
import type { CompanyRole } from "./company-domain";
import { useCompanyRepository } from "./company-provider";
import type { CompanyAccessOptions, CompanyRepository, NewCompanyInput } from "./company-repositories";
import { afterHydration } from "./queries";

/*
 * React Query hooks for Companies (Phase 4 mock). Every key starts with
 * ["companies"] and, inside a company, carries its id (one custody scope);
 * mutations refresh that company's queries only.
 */

export const companyKeys = {
  all: ["companies"] as const,
  directory: () => [...companyKeys.all, "directory"] as const,
  invitations: () => [...companyKeys.all, "invitations"] as const,
  access: (id: string, preview: string | null) => [...companyKeys.all, "access", id, preview] as const,
  scope: (id: string) => [...companyKeys.all, "scope", id] as const,
  item: (id: string, ...rest: readonly unknown[]) => [...companyKeys.scope(id), ...rest] as const,
};

function useScoped<T>(id: string | undefined, key: readonly unknown[], fn: (id: string) => Promise<T>, enabled = true) {
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: companyKeys.item(id ?? "", ...key),
      queryFn: () => fn(id!),
      enabled: id !== undefined && enabled,
    }),
    hydrated,
  );
}

/** A mutation inside one company; refreshes that company's queries (and the directory counts). */
function useScopedMutation<TVars, TResult>(id: string, fn: (vars: TVars) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: companyKeys.scope(id) }),
        client.invalidateQueries({ queryKey: companyKeys.directory() }),
        client.invalidateQueries({ queryKey: [...companyKeys.all, "access", id] }),
      ]);
    },
  });
}

export function useCompanyDirectory() {
  const repo = useCompanyRepository();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: companyKeys.directory(), queryFn: () => repo.list() }), hydrated);
}

export function useCompanyInvitations() {
  const repo = useCompanyRepository();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: companyKeys.invitations(), queryFn: () => repo.invitations() }), hydrated);
}

export function useCompanyAccess(id: string | undefined, preview: CompanyAccessOptions = {}) {
  const repo = useCompanyRepository();
  const hydrated = useIsClient();
  const { previewRole, previewArchived } = preview;
  return afterHydration(
    useQuery({
      queryKey: companyKeys.access(id ?? "", previewRole || previewArchived ? `${previewRole ?? ""}:${previewArchived ? "a" : ""}` : null),
      queryFn: () => repo.access(id!, { previewRole, previewArchived }),
      enabled: id !== undefined,
    }),
    hydrated,
  );
}

function useDirectoryMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => client.invalidateQueries({ queryKey: companyKeys.all }) });
}

export function useCreateCompany() {
  const repo = useCompanyRepository();
  return useDirectoryMutation((input: NewCompanyInput) => repo.create(input));
}

export function useAcceptCompanyInvitation() {
  const repo = useCompanyRepository();
  return useDirectoryMutation((invitationId: string) => repo.acceptInvitation(invitationId));
}

export function useDeclineCompanyInvitation() {
  const repo = useCompanyRepository();
  return useDirectoryMutation((invitationId: string) => repo.declineInvitation(invitationId));
}

export function useRestoreCompany() {
  const repo = useCompanyRepository();
  return useDirectoryMutation((id: string) => repo.restore(id));
}

/* ── reads inside one company ── */

export function useCompanyOverview(id: string, departmentId: string | null, role: CompanyRole) {
  const repo = useCompanyRepository();
  return useScoped(id, ["overview", departmentId, role], (cid) => repo.overview(cid, departmentId, role));
}
export function useDepartments(id: string | undefined) {
  const repo = useCompanyRepository();
  return useScoped(id, ["departments"], (cid) => repo.departments(cid));
}
export function useEffectivePolicies(id: string, departmentId: string | undefined) {
  const repo = useCompanyRepository();
  return useScoped(id, ["policies", departmentId], (cid) => repo.effectivePolicies(cid, departmentId!), departmentId !== undefined);
}
export function useMovePreview(id: string, departmentId: string | undefined, parentId: string | null) {
  const repo = useCompanyRepository();
  return useScoped(id, ["move", departmentId, parentId], (cid) => repo.previewMove(cid, departmentId!, parentId), departmentId !== undefined);
}
export function useStaff(id: string | undefined, role: CompanyRole) {
  const repo = useCompanyRepository();
  return useScoped(id, ["staff", role], (cid) => repo.staff(cid, role));
}
export function usePendingCompanyInvites(id: string, enabled: boolean) {
  const repo = useCompanyRepository();
  return useScoped(id, ["invites"], (cid) => repo.pendingInvites(cid), enabled);
}
export function useCompanyProjects(id: string, role: CompanyRole) {
  const repo = useCompanyRepository();
  return useScoped(id, ["projects", role], (cid) => repo.projects(cid, role));
}
export function useCompanyTeams(id: string) {
  const repo = useCompanyRepository();
  return useScoped(id, ["teams"], (cid) => repo.teams(cid));
}
export function useAttachRequests(id: string) {
  const repo = useCompanyRepository();
  return useScoped(id, ["attach"], (cid) => repo.attachRequests(cid));
}
export function useAttachCandidates(id: string, enabled: boolean) {
  const repo = useCompanyRepository();
  return useScoped(id, ["attach-candidates"], (cid) => repo.attachCandidates(cid), enabled);
}
export function useCompanyGoals(id: string) {
  const repo = useCompanyRepository();
  return useScoped(id, ["goals"], (cid) => repo.goals(cid));
}
export function useResources(id: string) {
  const repo = useCompanyRepository();
  return useScoped(id, ["resources"], (cid) => repo.resources(cid));
}
export function useResourceRequests(id: string) {
  const repo = useCompanyRepository();
  return useScoped(id, ["resource-requests"], (cid) => repo.resourceRequests(cid));
}
export function useRooms(id: string, day: string) {
  const repo = useCompanyRepository();
  return useScoped(id, ["rooms", day], (cid) => repo.rooms(cid, day));
}
export function useCapacity(id: string, enabled: boolean) {
  const repo = useCompanyRepository();
  return useScoped(id, ["capacity"], (cid) => repo.capacity(cid), enabled);
}
export function useKbFolders(id: string) {
  const repo = useCompanyRepository();
  return useScoped(id, ["kb-folders"], (cid) => repo.kbFolders(cid));
}
export function useKbPages(id: string, folderId: string | undefined) {
  const repo = useCompanyRepository();
  return useScoped(id, ["kb-pages", folderId], (cid) => repo.kbPages(cid, folderId!), folderId !== undefined);
}
export function useKbPage(id: string, pageId: string | undefined) {
  const repo = useCompanyRepository();
  return useScoped(id, ["kb-page", pageId], (cid) => repo.kbPage(cid, pageId!), pageId !== undefined);
}
export function useKbVersionBody(id: string, pageId: string, version: number | null) {
  const repo = useCompanyRepository();
  return useScoped(id, ["kb-version", pageId, version], (cid) => repo.kbVersionBody(cid, pageId, version!), version !== null);
}
export function useKbSearch(id: string, query: string) {
  const repo = useCompanyRepository();
  return useScoped(id, ["kb-search", query], (cid) => repo.kbSearch(cid, query), query.trim().length > 0);
}
export function useExpenses(id: string | undefined, enabled = true) {
  const repo = useCompanyRepository();
  return useScoped(id, ["expenses"], (cid) => repo.expenses(cid), enabled);
}
export function useApprovals(id: string | undefined, enabled = true) {
  const repo = useCompanyRepository();
  return useScoped(id, ["approvals"], (cid) => repo.approvals(cid), enabled);
}
export function useApprovalHistory(id: string) {
  const repo = useCompanyRepository();
  return useScoped(id, ["approval-history"], (cid) => repo.approvalHistory(cid));
}
export function useChains(id: string) {
  const repo = useCompanyRepository();
  return useScoped(id, ["chains"], (cid) => repo.chains(cid));
}
export function useBudgets(id: string, enabled = true) {
  const repo = useCompanyRepository();
  return useScoped(id, ["budgets"], (cid) => repo.budgets(cid), enabled);
}
export function useReimbursements(id: string) {
  const repo = useCompanyRepository();
  return useScoped(id, ["reimbursements"], (cid) => repo.reimbursements(cid));
}
export function usePaymentRuns(id: string) {
  const repo = useCompanyRepository();
  return useScoped(id, ["runs"], (cid) => repo.paymentRuns(cid));
}
export function useEmployeeFile(id: string, personId: string) {
  const repo = useCompanyRepository();
  return useScoped(id, ["file", personId], (cid) => repo.employeeFile(cid, personId));
}
export function useCompanyReports(id: string, departmentId: string | null) {
  const repo = useCompanyRepository();
  return useScoped(id, ["reports", departmentId], (cid) => repo.reports(cid, departmentId));
}
export function useCompanyExports(id: string, enabled: boolean) {
  const repo = useCompanyRepository();
  return useScoped(id, ["exports"], (cid) => repo.exports(cid), enabled);
}
export function useAuditLog(id: string, enabled: boolean) {
  const repo = useCompanyRepository();
  return useScoped(id, ["audit"], (cid) => repo.audit(cid), enabled);
}
export function useCompanySettings(id: string, enabled = true) {
  const repo = useCompanyRepository();
  return useScoped(id, ["settings"], (cid) => repo.settings(cid), enabled);
}

/* ── writes inside one company ── */

/**
 * One write inside a company: `run(repo, companyId, vars)`. Refreshes that
 * company's queries (and the directory counts) when it settles.
 */
export function useCompanyMutation<TVars = void, TResult = unknown>(
  id: string,
  run: (repo: CompanyRepository, companyId: string, vars: TVars) => Promise<TResult>,
) {
  const repo = useCompanyRepository();
  return useScopedMutation(id, (vars: TVars) => run(repo, id, vars));
}
