"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, use, useCallback, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { AccessBanner, AccessBannerAction, pickAccessBanner } from "@/components/feedback/access-banner";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { CompanyCapabilities, CompanyPersonRef, CompanySummary } from "@/data/company-domain";
import {
  useAcceptCompanyInvitation,
  useCompanyAccess,
  useDeclineCompanyInvitation,
  useRestoreCompany,
} from "@/data/company-queries";
import { companyHref } from "@/features/navigation/contexts";
import { getCompanyIdFromPathname } from "@/features/navigation/paths";
import { DemoStateSwitch } from "@/features/projects/demo-state-switch";
import { useProjectFormat } from "@/features/projects/format";
import { useOnline } from "@/features/projects/project-gate";
import {
  companyDemoAccessOptions,
  companyDemoStates,
  parseCompanyDemoState,
  setCompanyDemoState,
  type CompanyDemoState,
} from "./demo-state";
import { useCompanyLabels } from "./labels";

/*
 * Every /companies/[id]/… route renders inside this gate (SH-02 + CS-01
 * company states): loading, error, unauthenticated, not available
 * (forbidden = not found), invite pending, left the company — or it
 * provides the company to the page. It also owns the department scope
 * (header chip, CS-01 C3): it narrows data the viewer may already see and
 * never widens access; kept per company for the tab session.
 *
 * Mock mode: `?state=<id>` forces any state or previews a role.
 */

interface CompanyContextValue {
  company: CompanySummary;
  capabilities: CompanyCapabilities;
  me: CompanyPersonRef;
  myDepartmentIds: string[];
  demo: CompanyDemoState | null;
  /** The department the viewer narrowed to, or null = all they may see. */
  departmentId: string | null;
  setDepartmentId: (id: string | null) => void;
  refetch: () => void;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function useCompany(): CompanyContextValue {
  const value = use(CompanyContext);
  if (!value) throw new Error("useCompany must be used inside <CompanyGate>");
  return value;
}

/** Tests and previews: provide a company without the gate. */
export const CompanyContextProvider = CompanyContext.Provider;

const DEMO_ERROR_REF = "7F3A-41";
const scopeKey = (id: string) => `company-scope:${id}`;

/** Department scope per company: kept in memory and the tab's sessionStorage (when available). */
const scopeMemory = new Map<string, string | null>();
const scopeListeners = new Set<() => void>();

function readScope(companyId: string): string | null {
  if (scopeMemory.has(companyId)) return scopeMemory.get(companyId) ?? null;
  try {
    return window.sessionStorage.getItem(scopeKey(companyId));
  } catch {
    return null;
  }
}

function subscribeScope(listener: () => void) {
  scopeListeners.add(listener);
  return () => scopeListeners.delete(listener);
}

function useDepartmentScope(companyId: string | undefined) {
  const value = useSyncExternalStore(
    subscribeScope,
    () => (companyId ? readScope(companyId) : null),
    () => null,
  );
  const set = useCallback(
    (next: string | null) => {
      if (!companyId) return;
      scopeMemory.set(companyId, next);
      try {
        if (next) window.sessionStorage.setItem(scopeKey(companyId), next);
        else window.sessionStorage.removeItem(scopeKey(companyId));
      } catch {
        // Storage unavailable: the scope lasts for this page session only.
      }
      for (const listener of scopeListeners) listener();
    },
    [companyId],
  );
  return [value, set] as const;
}

export function CompanyGate({ children }: { children: ReactNode }) {
  const t = useTranslations("Access.states");
  const tCompany = useTranslations("Company");
  const labels = useCompanyLabels();
  const router = useRouter();
  const pathname = usePathname();
  const id = getCompanyIdFromPathname(pathname);
  const demo = parseCompanyDemoState(useSearchParams().get("state"));
  const access = useCompanyAccess(id, companyDemoAccessOptions(demo));
  const accept = useAcceptCompanyInvitation();
  const decline = useDeclineCompanyInvitation();
  const [departmentId, setDepartmentId] = useDepartmentScope(id);
  const answer = access.data;

  useEffect(() => {
    setCompanyDemoState(demo);
    return () => setCompanyDemoState(null);
  }, [demo]);

  const myCompanies = (
    <Link href="/companies" className={buttonVariants()}>
      {t("companyNotAvailable.action")}
    </Link>
  );

  let content: ReactNode;
  if (demo === "loading" || access.isPending) {
    content = <AccessLoading onRetry={() => void access.refetch()} />;
  } else if (demo === "error" || access.isError) {
    content = (
      <AccessState
        kind="error"
        errorRef={demo === "error" ? DEMO_ERROR_REF : undefined}
        primaryAction={<Button onClick={() => void access.refetch()}>{t("error.action")}</Button>}
      />
    );
  } else if (demo === "unauthenticated") {
    content = (
      <AccessState
        kind="unauthenticated"
        primaryAction={
          <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`} className={buttonVariants()}>
            {t("unauthenticated.action")}
          </Link>
        }
      />
    );
  } else if (demo === "left" || answer?.status === "left") {
    content = (
      <AccessState
        kind="company-left"
        primaryAction={
          <Link href="/companies" className={buttonVariants()}>
            {t("companyLeft.action")}
          </Link>
        }
      />
    );
  } else if (demo === "not-available" || answer?.status === "not-available") {
    content = <AccessState kind="company-not-available" primaryAction={myCompanies} />;
  } else if (demo === "invite-pending" || answer?.status === "invite-pending") {
    const invitation = answer?.status === "invite-pending" ? answer.invitation : null;
    content = invitation ? (
      <AccessState
        kind="company-invite"
        values={{
          company: invitation.companyName,
          inviter: invitation.inviterName,
          role: labels.role(invitation.role),
          department: invitation.departmentName ? ` · ${invitation.departmentName}` : "",
        }}
        primaryAction={
          <Button
            disabled={accept.isPending}
            onClick={() =>
              accept.mutate(invitation.id, {
                onSuccess: ({ companyId }) => {
                  toast({ title: tCompany("joined", { company: invitation.companyName }) });
                  router.replace(companyHref(companyId));
                },
              })
            }
          >
            {t("companyInvite.accept")}
          </Button>
        }
        secondaryAction={
          <Button
            variant="secondary"
            disabled={decline.isPending}
            onClick={() => decline.mutate(invitation.id, { onSuccess: () => router.replace("/companies") })}
          >
            {t("companyInvite.decline")}
          </Button>
        }
      />
    ) : (
      <AccessState kind="company-not-available" primaryAction={myCompanies} />
    );
  } else if (answer?.status === "ok") {
    content = (
      <CompanyContext
        value={{
          company: answer.company,
          capabilities: answer.capabilities,
          me: answer.me,
          myDepartmentIds: answer.myDepartmentIds,
          demo,
          departmentId,
          setDepartmentId,
          refetch: () => void access.refetch(),
        }}
      >
        {children}
      </CompanyContext>
    );
  } else {
    content = <AccessState kind="company-not-available" primaryAction={myCompanies} />;
  }

  return (
    <div data-scope="company" className="flex min-w-0 flex-col gap-4">
      {content}
      <DemoStateSwitch value={demo} states={companyDemoStates} />
    </div>
  );
}

/**
 * The one banner for the current company, directly under the page header:
 * offline › archived (Restore for Owner / Org Admin) › viewer (read only).
 */
export function CompanyBanner({ className }: { className?: string }) {
  const { company, capabilities, demo, refetch } = useCompany();
  const online = useOnline();
  const format = useProjectFormat();
  const t = useTranslations("Access.banners");
  const restore = useRestoreCompany();
  const kind = pickAccessBanner({
    offline: demo === "offline" || !online,
    "company-archived": company.lifecycle === "archived",
    "company-read-only": company.role === "viewer",
  });
  if (!kind) return null;
  let action: ReactNode = null;
  if (kind === "offline") action = <AccessBannerAction onClick={refetch}>{t("retry")}</AccessBannerAction>;
  if (kind === "company-archived" && capabilities.openSettings && demo !== "archived") {
    action = (
      <AccessBannerAction disabled={restore.isPending} onClick={() => restore.mutate(company.id)}>
        {t("restore")}
      </AccessBannerAction>
    );
  }
  return (
    <AccessBanner
      kind={kind}
      values={{ date: company.lifecycleAt ? format.day(company.lifecycleAt) : "" }}
      action={action}
      className={className}
    />
  );
}

/** Whether the viewer may act (not archived, not a viewer). Read-only states keep every write hidden. */
export function useCompanyWritable(): boolean {
  const { company } = useCompany();
  return company.lifecycle === "active" && company.role !== "viewer";
}
